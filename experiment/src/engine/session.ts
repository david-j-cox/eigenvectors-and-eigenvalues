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
  createPatchState,
  createCodState,
  createViState,
  harvestPatch,
  isCodActive,
  probabilityAsIntervalMs,
  recoverPatches,
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
import type { PatchState } from './schedule';
import { CONTINGENCIES } from '../config/task';

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
  private patchA: PatchState;
  private patchB: PatchState;
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
    const spec = CONTINGENCIES[first.contingency];
    this.patchA = createPatchState(
      spec.recoveryAPerResponse, cfg.patch.depletionPerResponse, cfg.patch.startingValue,
    );
    this.patchB = createPatchState(
      spec.recoveryBPerResponse, cfg.patch.depletionPerResponse, cfg.patch.startingValue,
    );
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

    const dtSeconds =
      this.lastResponseAtMs === -Infinity
        ? 0
        : (nowMs - this.lastResponseAtMs) / 1000;
    const chosenIsA = side === 'A';

    const switched = this.previousOption !== null && this.previousOption !== side;
    if (switched) {
      this.cod = startCod(side, nowMs, this.cfg.codMs, this.cfg.codResponses);
    }
    const codBlocking = isCodActive(this.cod, nowMs);
    // The changeover response itself counts toward the response requirement.
    this.cod = tickCod(this.cod);

    let delivered: boolean;
    let withheldByCod: boolean;

    if (this.cfg.scheduleMode === 'depleting_probability') {
      // Both alternatives recover over the interval since the previous
      // response; the chosen one is then read and depleted.
      const recovered = recoverPatches(this.patchA, this.patchB);
      this.patchA = recovered.a;
      this.patchB = recovered.b;
      this.applyPerturbationToPatches(eff);

      const harvest = harvestPatch(
        chosenIsA ? this.patchA : this.patchB,
        this.rng,
        codBlocking,
      );
      if (chosenIsA) this.patchA = harvest.patch;
      else this.patchB = harvest.patch;

      delivered = harvest.delivered;
      withheldByCod = harvest.withheldByCod;
    } else {
      this.viA = retargetVi(this.viA, eff.viAMs, nowMs, this.rng, this.cfg);
      this.viB = retargetVi(this.viB, eff.viBMs, nowMs, this.rng, this.cfg);

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

      const target = side === 'A' ? this.viA : this.viB;
      const result = collect(target, nowMs, codBlocking);
      if (side === 'A') this.viA = result.vi;
      else this.viB = result.vi;
      delivered = result.delivered;
      withheldByCod = result.withheldByCod;
    }

    const points = delivered ? this.cfg.pointsPerReinforcer : 0;
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

      rewardOutcome: delivered ? 1 : 0,
      pointsEarned: points,
      cumulativePoints: this.cumulativePoints,

      responseTimeMs: ici,
      iciMs: ici,
      elapsedMs: nowMs,

      // Under the patch schedule these carry the latent values as equivalent
      // intervals, so a single pair of columns describes the arranged
      // reinforcement in either mode and the analysis need not branch.
      viAMs:
        this.cfg.scheduleMode === 'depleting_probability'
          ? probabilityAsIntervalMs(this.patchA.value, 350)
          : eff.viAMs,
      viBMs:
        this.cfg.scheduleMode === 'depleting_probability'
          ? probabilityAsIntervalMs(this.patchB.value, 350)
          : eff.viBMs,
      richnessA:
        this.cfg.scheduleMode === 'depleting_probability'
          ? this.patchA.value
          : this.viA.richness,
      richnessB:
        this.cfg.scheduleMode === 'depleting_probability'
          ? this.patchB.value
          : this.viB.richness,

      codActive: codBlocking,
      reinforcerWithheldByCod: withheldByCod,

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
    const spec = CONTINGENCIES[next.contingency];
    this.patchA = createPatchState(
      spec.recoveryAPerResponse, this.cfg.patch.depletionPerResponse, this.cfg.patch.startingValue,
    );
    this.patchB = createPatchState(
      spec.recoveryBPerResponse, this.cfg.patch.depletionPerResponse, this.cfg.patch.startingValue,
    );
  }

  /**
   * Express a perturbation in patch terms.
   *
   * Extinction sets both latent values to zero and holds them there by removing
   * recovery; a contingency reversal swaps the two recovery rates. The
   * perturbation engine still describes everything as a schedule override -- this
   * only translates that override into the currency this mode uses.
   */
  private applyPerturbationToPatches(eff: {
    viAMs: number;
    viBMs: number;
    perturbation: unknown;
  }): void {
    const block = this.currentBlock();
    if (!block) return;
    const spec = CONTINGENCIES[block.contingency];

    // Reset to the block's own rates on every response, before applying any
    // override. Without this an override is permanent: extinction would set
    // recovery to zero and nothing would ever restore it, so the alternatives
    // would stay dead for the remainder of the block and the recovery the
    // perturbation exists to measure could never happen.
    let recoveryA = spec.recoveryAPerResponse;
    let recoveryB = spec.recoveryBPerResponse;

    if (eff.perturbation) {
      if (!Number.isFinite(eff.viAMs) && !Number.isFinite(eff.viBMs)) {
        // Extinction: both alternatives are emptied and held there.
        this.patchA = { ...this.patchA, value: 0, recoveryPerResponse: 0 };
        this.patchB = { ...this.patchB, value: 0, recoveryPerResponse: 0 };
        return;
      }
      // A reversal swaps which alternative restores faster.
      if (eff.viAMs === block.viBMs && eff.viBMs === block.viAMs) {
        recoveryA = spec.recoveryBPerResponse;
        recoveryB = spec.recoveryAPerResponse;
      }
    }

    this.patchA = { ...this.patchA, recoveryPerResponse: recoveryA };
    this.patchB = { ...this.patchB, recoveryPerResponse: recoveryB };
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
