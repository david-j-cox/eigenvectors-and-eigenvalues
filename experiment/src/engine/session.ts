// ============================================================
// The session state machine.
//
// One object owns the whole procedure: which block is running,
// what the schedules are doing, and what each response produced.
// It is deliberately free of any DOM or React dependency so the
// procedure can be tested, and a whole session simulated, without
// a browser.
// ============================================================

import { createRng, deriveSeed } from '../utils/rng';
import {
  applyDepletion,
  collect,
  createCodState,
  createViState,
  isCodActive,
  retargetVi,
  startCod,
  tickCod,
  updateBaiting,
} from './schedule';
import {
  effectiveSchedule,
  trialsSinceOffset,
  trialsSinceOnset,
} from './perturbation';
import type {
  Block,
  CodState,
  EngineConfig,
  ResponseOutcome,
  SessionPlan,
  Side,
  ViState,
} from './types';

export interface SessionSnapshot {
  blockIndex: number;
  block: Block | null;
  trialInBlock: number;
  trialIndex: number;
  cumulativePoints: number;
  finished: boolean;
  /** True while a changeover delay is suppressing reinforcement. */
  codActive: boolean;
}

export class Session {
  readonly plan: SessionPlan;
  private readonly cfg: EngineConfig;
  private readonly rng: () => number;

  private blockIndex = 0;
  private trialInBlock = 0;
  private trialIndex = 0;
  private cumulativePoints = 0;
  private finished = false;

  private viA: ViState;
  private viB: ViState;
  private cod: CodState = createCodState();

  private previousOption: Side | null = null;
  private runLength = 0;
  private lastResponseAtMs = -Infinity;
  private blockStartedAtMs = 0;

  /** Running counts used only to decide which option a pulse should enrich. */
  private recentA = 0;
  private recentB = 0;

  constructor(plan: SessionPlan, cfg: EngineConfig, startMs = 0) {
    this.plan = plan;
    this.cfg = cfg;
    // Schedule intervals draw from their own stream so that changing the
    // number of blocks does not shift the reinforcement sequence.
    this.rng = createRng(deriveSeed(plan.seed, 'schedule'));

    const first = plan.blocks[0];
    this.viA = createViState(first.viAMs, startMs, this.rng, cfg);
    this.viB = createViState(first.viBMs, startMs, this.rng, cfg);
    this.blockStartedAtMs = startMs;
  }

  snapshot(): SessionSnapshot {
    return {
      blockIndex: this.blockIndex,
      block: this.currentBlock(),
      trialInBlock: this.trialInBlock,
      trialIndex: this.trialIndex,
      cumulativePoints: this.cumulativePoints,
      finished: this.finished,
      codActive: this.cod.active,
    };
  }

  currentBlock(): Block | null {
    return this.finished ? null : this.plan.blocks[this.blockIndex] ?? null;
  }

  /** Whether enough time has passed since the last counted response. */
  accepts(nowMs: number): boolean {
    if (this.finished) return false;
    return nowMs - this.lastResponseAtMs >= this.cfg.responseCooldownMs;
  }

  /**
   * Process one response.
   *
   * Returns null when the response is rejected -- too soon after the previous
   * one, or after the session has ended. A rejected response is not a trial and
   * must not be logged as one, or the response-count-defined blocks would drift
   * out of step with the plan.
   */
  respond(side: Side, nowMs: number): ResponseOutcome | null {
    if (!this.accepts(nowMs)) return null;
    const block = this.currentBlock();
    if (!block) return null;

    const preferred = this.recentA === this.recentB
      ? this.previousOption
      : this.recentA > this.recentB
        ? 'A'
        : 'B';

    // The schedule for THIS response, including any perturbation override.
    const eff = effectiveSchedule(
      block,
      this.plan.perturbations,
      this.trialInBlock,
      preferred,
    );
    this.viA = retargetVi(this.viA, eff.viAMs, nowMs, this.rng, this.cfg);
    this.viB = retargetVi(this.viB, eff.viBMs, nowMs, this.rng, this.cfg);

    // Depletion and recovery are applied for the interval since the previous
    // response, before baiting, so this response is scored against the
    // richness that time away has already restored.
    const dtSeconds =
      this.lastResponseAtMs === -Infinity
        ? 0
        : (nowMs - this.lastResponseAtMs) / 1000;
    const chosenIsA = side === 'A';
    const depleted = applyDepletion(
      chosenIsA ? this.viA : this.viB,
      chosenIsA ? this.viB : this.viA,
      dtSeconds,
      this.cfg,
    );
    this.viA = chosenIsA ? depleted.chosen : depleted.other;
    this.viB = chosenIsA ? depleted.other : depleted.chosen;

    // Bait before collecting, so a reinforcer that came due during the
    // inter-response interval is available to this response.
    this.viA = updateBaiting(this.viA, nowMs, this.rng, this.cfg);
    this.viB = updateBaiting(this.viB, nowMs, this.rng, this.cfg);

    const switched = this.previousOption !== null && this.previousOption !== side;
    if (switched) {
      this.cod = startCod(side, nowMs, this.cfg.codMs, this.cfg.codResponses);
    }
    const codBlocking = isCodActive(this.cod, nowMs);
    // The changeover response itself counts toward the response requirement.
    this.cod = tickCod(this.cod);

    const target = side === 'A' ? this.viA : this.viB;
    const result = collect(target, nowMs, codBlocking);
    if (side === 'A') this.viA = result.vi;
    else this.viB = result.vi;

    const points = result.delivered ? this.cfg.pointsPerReinforcer : 0;
    this.cumulativePoints += points;

    this.runLength = switched || this.previousOption === null ? 1 : this.runLength + 1;
    const ici = this.lastResponseAtMs === -Infinity ? 0 : nowMs - this.lastResponseAtMs;

    const outcome: ResponseOutcome = {
      trialIndex: this.trialIndex,
      blockIndex: this.blockIndex,
      trialInBlock: this.trialInBlock,

      chosenOption: side,
      previousOption: this.previousOption,
      switched,
      runLength: this.runLength,

      rewardOutcome: result.delivered ? 1 : 0,
      pointsEarned: points,
      cumulativePoints: this.cumulativePoints,

      responseTimeMs: ici,
      iciMs: ici,
      elapsedMs: nowMs,

      viAMs: eff.viAMs,
      viBMs: eff.viBMs,
      richnessA: this.viA.richness,
      richnessB: this.viB.richness,

      codActive: codBlocking,
      reinforcerWithheldByCod: result.withheldByCod,

      perturbationActive: eff.perturbation !== null,
      perturbationId: eff.perturbation?.id ?? null,
      perturbationType: eff.perturbation?.type ?? null,
      trialsSincePerturbationOnset: trialsSinceOnset(eff.perturbation, this.trialInBlock),
      trialsSincePerturbationOffset: trialsSinceOffset(
        this.plan.perturbations,
        this.blockIndex,
        this.trialInBlock,
      ),

      trialsSinceContextSwitch: this.trialInBlock,
    };

    if (side === 'A') this.recentA++;
    else this.recentB++;
    this.previousOption = side;
    this.lastResponseAtMs = nowMs;
    this.trialIndex++;
    this.trialInBlock++;

    if (this.trialInBlock >= block.targetResponses) this.advanceBlock(nowMs);

    return outcome;
  }

  /**
   * Move to the next block.
   *
   * Both schedules are rebuilt rather than carried over: a reinforcer set up
   * under the previous contingency would otherwise be collected under the new
   * one, putting a reinforcer in the record that the new schedule never
   * arranged.
   */
  private advanceBlock(nowMs: number): void {
    this.blockIndex++;
    this.trialInBlock = 0;
    this.recentA = 0;
    this.recentB = 0;
    this.previousOption = null;
    this.runLength = 0;
    this.cod = createCodState();
    this.blockStartedAtMs = nowMs;

    const next = this.currentBlock();
    if (!next) {
      this.finished = true;
      return;
    }
    this.viA = createViState(next.viAMs, nowMs, this.rng, this.cfg);
    this.viB = createViState(next.viBMs, nowMs, this.rng, this.cfg);
  }

  /** Elapsed time in the current block, for the UI only. */
  blockElapsedMs(nowMs: number): number {
    return nowMs - this.blockStartedAtMs;
  }

  /**
   * Drop trailing blocks of the given part, used by the session time guard.
   *
   * Only ever called for the perturbation part: that part loses perturbations
   * gracefully, whereas trimming a reversal stage would unbalance the design.
   */
  dropTrailingBlocks(part: Block['part'], keepAtLeast: number): number {
    const droppable = this.plan.blocks.filter(
      (b) => b.part === part && b.index > this.blockIndex,
    );
    const toDrop = Math.max(0, droppable.length - keepAtLeast);
    if (toDrop === 0) return 0;

    const dropFrom = this.plan.blocks.length - toDrop;
    this.plan.blocks.splice(dropFrom, toDrop);
    return toDrop;
  }
}
