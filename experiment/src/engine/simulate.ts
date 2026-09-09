// ============================================================
// Simulated participants.
//
// Used by the tests and by the pilot-check script to run whole
// sessions without a browser. The point is not to model human
// choice accurately but to exercise the procedure hard enough
// that schedule, perturbation, and logging errors surface before
// a real participant ever sees the task.
// ============================================================

import { Session } from './session';
import { buildSessionPlan } from './plan';
import { createRng } from '../utils/rng';
import { ENGINE, DEFAULT_DESIGN } from '../config/task';
import type { DesignConfig } from '../config/task';
import type { ResponseOutcome, Side } from './types';

export interface SimAgent {
  /** Choose a side given the reinforcement history so far. */
  choose(lastOutcome: ResponseOutcome | null, rng: () => number): Side;
}

/**
 * A melioration agent.
 *
 * It tracks the local reinforcement rate obtained on each alternative and
 * switches with a probability that rises both with the other side's relative
 * richness and with how long the current side has gone unreinforced. That
 * second term matters: under concurrent VI schedules a reinforcer set up on the
 * neglected alternative keeps waiting, so a responder that never leaves loses
 * most of the lean schedule's deliveries. An agent without lose-shift pressure
 * locks onto one side and makes the task look far leaner than a participant
 * would actually find it.
 *
 * This is a behavioural stand-in for pilot data, not a theory of choice. Its
 * only job is to exercise the procedure with runs, changeovers, and near-
 * matching allocation of roughly the right magnitude.
 */
export class MeliorationAgent implements SimAgent {
  private localRate = { A: 0.2, B: 0.2 };
  private last: Side = 'A';
  private unreinforcedRun = 0;

  constructor(
    private readonly learningRate = 0.15,
    /** Weight on the difference in local reinforcement rates. */
    private readonly gain = 6,
    /** Weight on how long the current side has gone unreinforced. */
    private readonly lapse = 0.12,
    /** Baseline reluctance to change over, standing in for the COD cost. */
    private readonly stayBias = 3.2,
    /**
     * Ceiling on the unreinforced-run term. Without it a lean patch drives
     * switching upward without limit, which produces an agent that changes over
     * on most responses -- behaviour no participant shows under these schedules,
     * and which would make the simulated data useless as a design check.
     */
    private readonly lapseCap = 12,
  ) {}

  choose(lastOutcome: ResponseOutcome | null, rng: () => number): Side {
    if (lastOutcome) {
      const side = lastOutcome.chosenOption;
      this.localRate[side] +=
        this.learningRate * (lastOutcome.rewardOutcome - this.localRate[side]);
      this.last = side;
      this.unreinforcedRun =
        lastOutcome.rewardOutcome === 1 ? 0 : this.unreinforcedRun + 1;
    }

    const other: Side = this.last === 'A' ? 'B' : 'A';
    const pressure =
      this.gain * (this.localRate[other] - this.localRate[this.last]) +
      this.lapse * Math.min(this.unreinforcedRun, this.lapseCap) -
      this.stayBias;
    const pSwitch = 1 / (1 + Math.exp(-pressure));

    return rng() < pSwitch ? other : this.last;
  }
}

/**
 * Allocates in proportion to cumulative reinforcement with a fixed stay bias.
 *
 * Kept as a deliberately poor responder: it does not respond to the lean
 * schedule's accumulating setups, so it is a useful worst case for checking
 * that the procedure survives degenerate behaviour.
 */
export class MatchingAgent implements SimAgent {
  private rewards = { A: 1, B: 1 };
  private last: Side = 'A';
  constructor(private readonly stayBias = 0.75) {}

  choose(lastOutcome: ResponseOutcome | null, rng: () => number): Side {
    if (lastOutcome) {
      this.rewards[lastOutcome.chosenOption] += lastOutcome.rewardOutcome;
      this.last = lastOutcome.chosenOption;
    }
    const pA = this.rewards.A / (this.rewards.A + this.rewards.B);
    // Blend proportional allocation with a tendency to repeat the last choice.
    const p = this.stayBias * (this.last === 'A' ? 1 : 0) + (1 - this.stayBias) * pA;
    return rng() < p ? 'A' : 'B';
  }
}

/** Chooses at random; useful as a floor case for schedule integrity checks. */
export class RandomAgent implements SimAgent {
  choose(_last: ResponseOutcome | null, rng: () => number): Side {
    return rng() < 0.5 ? 'A' : 'B';
  }
}

export interface SimResult {
  outcomes: ResponseOutcome[];
  durationMs: number;
  plan: ReturnType<typeof buildSessionPlan>;
}

/**
 * Run a whole session.
 *
 * Inter-response times are drawn around `meanIciMs` so that the VI schedules
 * are exercised in real time rather than collapsed to a single instant, which
 * is what makes reinforcement rates in the simulation comparable to those a
 * participant would actually obtain.
 */
export function simulateSession(
  seed: string,
  agent: SimAgent = new MeliorationAgent(),
  meanIciMs = 500,
  design: DesignConfig = DEFAULT_DESIGN,
): SimResult {
  const plan = buildSessionPlan(seed, design);
  const session = new Session(plan, ENGINE);
  const rng = createRng(`${seed}::sim`);

  const outcomes: ResponseOutcome[] = [];
  let now = 0;
  let last: ResponseOutcome | null = null;
  let guard = 0;
  const maxSteps = 200000;

  while (!session.snapshot().finished && guard++ < maxSteps) {
    now += Math.max(ENGINE.responseCooldownMs, -meanIciMs * Math.log(1 - rng()));
    const side = agent.choose(last, rng);
    const outcome = session.respond(side, now);
    if (outcome) {
      outcomes.push(outcome);
      last = outcome;
    }
  }

  return { outcomes, durationMs: now, plan };
}
