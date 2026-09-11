import { describe, expect, it } from 'vitest';
import { Session } from '../../src/engine/session';
import { buildSessionPlan } from '../../src/engine/plan';
import {
  CalibratedHumanAgent,
  MatchingAgent,
  RandomAgent,
  simulateSession,
} from '../../src/engine/simulate';
import { DEFAULT_DESIGN, ENGINE, PILOT_TARGETS } from '../../src/config/task';

describe('Session response handling', () => {
  it('rejects responses inside the cooldown so blocks stay response-exact', () => {
    const session = new Session(buildSessionPlan('s'), ENGINE);
    expect(session.respond('A', 0)).not.toBeNull();
    expect(session.respond('A', ENGINE.responseCooldownMs - 1)).toBeNull();
    expect(session.respond('A', ENGINE.responseCooldownMs)).not.toBeNull();
  });

  it('marks a switch and restarts the run length', () => {
    const session = new Session(buildSessionPlan('s'), ENGINE);
    session.respond('A', 0);
    const second = session.respond('A', 1000)!;
    expect(second.switched).toBe(false);
    expect(second.runLength).toBe(2);

    const third = session.respond('B', 2000)!;
    expect(third.switched).toBe(true);
    expect(third.runLength).toBe(1);
  });

  it('withholds reinforcement during the changeover delay', () => {
    const session = new Session(buildSessionPlan('s'), ENGINE);
    // Work one side long enough for the other to be reliably baited.
    for (let t = 0; t < 40; t++) session.respond('A', t * 500);
    const afterSwitch = session.respond('B', 40 * 500)!;
    expect(afterSwitch.codActive).toBe(true);
    expect(afterSwitch.rewardOutcome).toBe(0);
  });
});

describe('full simulated sessions', () => {
  // A responder carrying one real participant's switching statistics and
  // response timing. The behavioral assertions below are only meaningful
  // against a responder that could plausibly be a participant; MatchingAgent
  // and RandomAgent appear further down as deliberately degenerate cases.
  const result = simulateSession('sim-seed-1', new CalibratedHumanAgent(3));

  it('completes every planned response exactly once', () => {
    const planned = result.plan.blocks.reduce((s, b) => s + b.targetResponses, 0);
    expect(result.outcomes).toHaveLength(planned);
  });

  it('numbers trials contiguously', () => {
    result.outcomes.forEach((o, i) => expect(o.trialIndex).toBe(i));
  });

  it('gives every block exactly its target number of responses', () => {
    for (const block of result.plan.blocks) {
      const inBlock = result.outcomes.filter((o) => o.blockIndex === block.index);
      expect(inBlock).toHaveLength(block.targetResponses);
      expect(inBlock.map((o) => o.trialInBlock)).toEqual(
        Array.from({ length: block.targetResponses }, (_, i) => i),
      );
    }
  });

  it('applies each perturbation for exactly its programmed duration', () => {
    for (const p of result.plan.perturbations) {
      const active = result.outcomes.filter((o) => o.perturbationId === p.id);
      expect(active).toHaveLength(p.durationResponses);
      expect(active[0].trialInBlock).toBe(p.onsetResponseInBlock);
      expect(active.map((o) => o.trialsSincePerturbationOnset)).toEqual(
        Array.from({ length: p.durationResponses }, (_, i) => i),
      );
    }
  });

  it('delivers no reinforcement during extinction', () => {
    const ext = result.outcomes.filter((o) => o.perturbationType === 'extinction');
    expect(ext.length).toBeGreaterThan(0);
    expect(ext.every((o) => o.rewardOutcome === 0)).toBe(true);
  });

  it('keeps cumulative points consistent with per-response earnings', () => {
    let running = 0;
    for (const o of result.outcomes) {
      running += o.pointsEarned;
      expect(o.cumulativePoints).toBe(running);
    }
  });

  it('produces reinforcement dense enough for the reward-rate coordinate', () => {
    // Checked across a sample rather than on one responder: reinforcement
    // density varies with how a participant allocates, so a single simulated
    // participant sitting below the target says nothing about the schedule.
    const perBin: number[] = [];
    for (let i = 0; i < 12; i++) {
      const run = simulateSession(`density-${i}`, new CalibratedHumanAgent(i));
      const usable = run.outcomes.filter((o) => !o.perturbationActive);
      perBin.push(
        (usable.filter((o) => o.rewardOutcome === 1).length / usable.length) *
          DEFAULT_DESIGN.stateBinResponses,
      );
    }
    const median = [...perBin].sort((a, b) => a - b)[6];
    expect(median).toBeGreaterThan(PILOT_TARGETS.minRewardsPerBin);
  });

  it('produces choice allocation that tracks the arranged contingency', () => {
    const share = (contingency: string) => {
      const os = result.outcomes.filter(
        (o) =>
          result.plan.blocks[o.blockIndex].contingency === contingency &&
          !o.perturbationActive,
      );
      return os.filter((o) => o.chosenOption === 'A').length / os.length;
    };
    expect(share('A_rich')).toBeGreaterThan(share('B_rich'));
  });

  it('maintains switching rather than collapsing to exclusive preference', () => {
    const switches = result.outcomes.filter((o) => o.switched).length;
    const rate = switches / result.outcomes.length;
    // A degenerate switch rate would leave that state coordinate with no
    // variance to estimate dynamics from.
    expect(rate).toBeGreaterThan(0.02);
    expect(rate).toBeLessThan(0.6);
  });

  it('is reproducible from the seed', () => {
    const again = simulateSession('sim-seed-1', new CalibratedHumanAgent(3));
    expect(again.outcomes.map((o) => o.rewardOutcome)).toEqual(
      result.outcomes.map((o) => o.rewardOutcome),
    );
  });

  it('holds up under degenerate responders too', () => {
    // Neither of these tracks the accumulating setups on the neglected
    // alternative, so neither allocates sensibly. The procedure must still run
    // to completion and log every response.
    for (const agent of [new RandomAgent(), new MatchingAgent(0.9)]) {
      const run = simulateSession('sim-seed-2', agent, 500);
      const planned = run.plan.blocks.reduce((s, b) => s + b.targetResponses, 0);
      expect(run.outcomes).toHaveLength(planned);
    }
  });

  it('tracks the contingency more strongly than a responder that ignores setups', () => {
    const allocationGap = (run: ReturnType<typeof simulateSession>) => {
      const share = (contingency: string) => {
        const os = run.outcomes.filter(
          (o) =>
            run.plan.blocks[o.blockIndex].contingency === contingency &&
            !o.perturbationActive,
        );
        return os.filter((o) => o.chosenOption === 'A').length / os.length;
      };
      return share('A_rich') - share('B_rich');
    };

    const calibrated = allocationGap(result);
    const degenerate = allocationGap(
      simulateSession('sim-seed-1', new MatchingAgent(0.9), 500),
    );
    expect(calibrated).toBeGreaterThan(degenerate);
  });
});

describe('concurrent VI mode', () => {
  // The alternative schedule, kept because it is the behavior-analytic
  // standard even though the depleting-patch mode is the default here.
  const vi = simulateSession(
    'vi-seed', new CalibratedHumanAgent(3), 500, undefined, { scheduleMode: 'vi' },
  );

  it('logs the programmed intervals, matching the plan outside perturbations', () => {
    for (const o of vi.outcomes) {
      if (o.perturbationActive) continue;
      const block = vi.plan.blocks[o.blockIndex];
      expect(o.viAMs).toBe(block.viAMs);
      expect(o.viBMs).toBe(block.viBMs);
    }
  });

  it('swaps the intervals during a contingency reversal', () => {
    for (const p of vi.plan.perturbations) {
      if (p.type !== 'contingency_reversal') continue;
      const block = vi.plan.blocks[p.blockIndex];
      const during = vi.outcomes.filter((o) => o.perturbationId === p.id);
      expect(during.every((o) => o.viAMs === block.viBMs)).toBe(true);
      expect(during.every((o) => o.viBMs === block.viAMs)).toBe(true);
    }
  });

  it('restores the block schedule once a perturbation ends', () => {
    for (const p of vi.plan.perturbations) {
      const block = vi.plan.blocks[p.blockIndex];
      const after = vi.outcomes.find(
        (o) =>
          o.blockIndex === p.blockIndex &&
          o.trialInBlock === p.onsetResponseInBlock + p.durationResponses,
      );
      expect(after).toBeDefined();
      expect(after!.perturbationActive).toBe(false);
      expect(after!.viAMs).toBe(block.viAMs);
    }
  });

  it('delivers no reinforcement during extinction', () => {
    const ext = vi.outcomes.filter((o) => o.perturbationType === 'extinction');
    expect(ext.length).toBeGreaterThan(0);
    expect(ext.every((o) => o.rewardOutcome === 0)).toBe(true);
  });
});

describe('depleting-patch mode', () => {
  // The default mode. Its own session, so this block does not depend on a
  // constant declared inside another describe.
  const result = simulateSession('patch-seed', new CalibratedHumanAgent(3));

  it('keeps latent values inside [0, 1]', () => {
    for (const o of result.outcomes) {
      expect(o.richnessA).toBeGreaterThanOrEqual(0);
      expect(o.richnessA).toBeLessThanOrEqual(1);
      expect(o.richnessB).toBeGreaterThanOrEqual(0);
      expect(o.richnessB).toBeLessThanOrEqual(1);
    }
  });

  it('depletes the harvested alternative and restores the neglected one', () => {
    // Within a run on one side, that side's latent value should fall while the
    // other recovers. This is the mechanism the whole schedule choice rests on.
    const runs: Array<[number, number]> = [];
    for (let i = 1; i < result.outcomes.length; i++) {
      const prev = result.outcomes[i - 1];
      const cur = result.outcomes[i];
      if (cur.blockIndex !== prev.blockIndex || cur.switched) continue;
      if (cur.chosenOption !== 'A') continue;
      runs.push([cur.richnessA - prev.richnessA, cur.richnessB - prev.richnessB]);
    }
    expect(runs.length).toBeGreaterThan(100);
    const meanChosen = runs.reduce((s, r) => s + r[0], 0) / runs.length;
    const meanOther = runs.reduce((s, r) => s + r[1], 0) / runs.length;
    expect(meanChosen).toBeLessThan(0);
    expect(meanOther).toBeGreaterThan(0);
  });

  it('gives the richer alternative a higher latent value on average', () => {
    const inCell = (contingency: string) =>
      result.outcomes.filter(
        (o) =>
          result.plan.blocks[o.blockIndex].contingency === contingency &&
          !o.perturbationActive,
      );
    const mean = (os: typeof result.outcomes, f: (o: (typeof os)[0]) => number) =>
      os.reduce((s, o) => s + f(o), 0) / os.length;

    const aRich = inCell('A_rich');
    expect(mean(aRich, (o) => o.richnessA)).toBeGreaterThan(
      mean(aRich, (o) => o.richnessB),
    );
  });

  it('restores recovery after a perturbation ends, so the system can recover', () => {
    // Extinction zeroes both latent values and suspends recovery. If that
    // suspension outlived the perturbation the alternatives would stay dead for
    // the rest of the block, and the recovery the perturbation exists to
    // measure could never occur.
    for (const p of result.plan.perturbations) {
      if (p.type !== 'extinction') continue;
      const offset = p.onsetResponseInBlock + p.durationResponses;
      const after = result.outcomes.filter(
        (o) =>
          o.blockIndex === p.blockIndex &&
          o.trialInBlock >= offset &&
          o.trialInBlock < offset + 25,
      );
      expect(after.length).toBeGreaterThan(5);
      const recovered = Math.max(...after.map((o) => Math.max(o.richnessA, o.richnessB)));
      expect(recovered).toBeGreaterThan(0.2);
    }
  });

  it('delivers reinforcement again after extinction ends', () => {
    const postExtinction = result.outcomes.filter(
      (o) =>
        o.trialsSincePerturbationOffset !== null &&
        o.trialsSincePerturbationOffset >= 5 &&
        o.trialsSincePerturbationOffset < 40 &&
        !o.perturbationActive,
    );
    expect(postExtinction.length).toBeGreaterThan(20);
    expect(postExtinction.some((o) => o.rewardOutcome === 1)).toBe(true);
  });

  it('drives latent values to zero during extinction', () => {
    const ext = result.outcomes.filter((o) => o.perturbationType === 'extinction');
    expect(ext.length).toBeGreaterThan(0);
    expect(ext.every((o) => o.rewardOutcome === 0)).toBe(true);
    // The last response of an extinction period must find both alternatives
    // fully depleted, not merely unreinforced by chance.
    const late = ext.filter((o) => (o.trialsSincePerturbationOnset ?? 0) >= 3);
    expect(late.every((o) => o.richnessA === 0 && o.richnessB === 0)).toBe(true);
  });
});
