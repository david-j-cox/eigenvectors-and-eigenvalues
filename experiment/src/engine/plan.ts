// ============================================================
// Build a participant's complete session plan from a seed.
//
// The session is one continuous procedure, not three studies run
// back to back. Every block does double duty:
//
//   * Repeated exposures to a color x contingency cell give the
//     replication test (does the same operator recur?).
//   * Reversing the color-contingency mapping between stages
//     gives the physical-vs-functional test.
//   * Returning to the original mapping in stage 3 breaks the
//     confound between "different contingency" and "later in the
//     session" that a single reversal cannot avoid: with only one
//     reversal, every same-color/different-contingency
//     comparison is also an early-vs-late comparison, and the two
//     explanations cannot be separated.
//
// Perturbations live in their own final part so they do not
// contaminate the stage-3 estimates the replication test depends
// on.
// ============================================================

import { createRng, deriveSeed, shuffle } from '../utils/rng';
import {
  alternatingPairs,
  assignMapping,
  perturbationOnset,
  placePerturbations,
} from './randomization';
import type {
  Block,
  ContingencyId,
  ContextColorId,
  Perturbation,
  PerturbationType,
  SessionPlan,
} from './types';
import { CONTINGENCIES, DEFAULT_DESIGN, EXPERIMENT_VERSION } from '../config/task';
import type { DesignConfig } from '../config/task';

/** The reversal part uses two colors; the third is held out for the
 *  perturbation part so its baseline is never a reversed cell. */
const REVERSAL_COLORS: ContextColorId[] = ['green', 'blue'];
const PERTURBATION_COLOR: ContextColorId = 'red';

export function buildSessionPlan(
  seed: string,
  design: DesignConfig = DEFAULT_DESIGN,
): SessionPlan {
  const mappingRng = createRng(deriveSeed(seed, 'mapping'));
  const orderRng = createRng(deriveSeed(seed, 'order'));
  const perturbRng = createRng(deriveSeed(seed, 'perturbation'));

  // Which color arranges which contingency in stage 1. Stage 2 swaps them,
  // stage 3 restores stage 1.
  const baseMapping = assignMapping(
    REVERSAL_COLORS,
    ['A_rich', 'B_rich'] as ContingencyId[],
    mappingRng,
  );

  const blocks: Block[] = [];
  const reversalBlockIndices: number[] = [];
  const exposureCounts = new Map<string, number>();

  const nextExposure = (color: ContextColorId, contingency: ContingencyId) => {
    const key = `${color}::${contingency}`;
    const n = (exposureCounts.get(key) ?? 0) + 1;
    exposureCounts.set(key, n);
    return n;
  };

  // ---------------------------------------------------------- practice ---
  blocks.push({
    index: 0,
    part: 'practice',
    color: 'neutral',
    contingency: 'symmetric',
    viAMs: CONTINGENCIES.symmetric.viAMs,
    viBMs: CONTINGENCIES.symmetric.viBMs,
    targetResponses: design.practiceResponses,
    exposureNumber: 0,
    reversalStage: null,
  });

  // ------------------------------------------------- reversal stages ---
  const blocksPerStage = design.exposuresPerColorPerStage * REVERSAL_COLORS.length;

  for (let stage = 1; stage <= design.nStages; stage++) {
    // Odd stages use the base mapping, even stages the reversal. With three
    // stages this is A-B-A, so each cell recurs after a long separation.
    const reversed = stage % 2 === 0;
    if (stage > 1) reversalBlockIndices.push(blocks.length);

    const lastColor =
      blocks.length && blocks[blocks.length - 1].part === 'reversal'
        ? blocks[blocks.length - 1].color
        : null;
    const order = alternatingPairs(
      REVERSAL_COLORS[0],
      REVERSAL_COLORS[1],
      blocksPerStage,
      orderRng,
      lastColor,
    );

    for (const color of order) {
      const other = REVERSAL_COLORS.find((c) => c !== color)!;
      const contingency = reversed ? baseMapping[other] : baseMapping[color];
      const spec = CONTINGENCIES[contingency];
      blocks.push({
        index: blocks.length,
        part: 'reversal',
        color,
        contingency,
        viAMs: spec.viAMs,
        viBMs: spec.viBMs,
        targetResponses: design.blockResponses,
        exposureNumber: nextExposure(color, contingency),
        reversalStage: stage,
      });
    }
  }

  // ------------------------------------------- perturbation baseline ---
  // A single color and contingency held constant, so the pre-perturbation
  // operator is estimated from an unambiguous local environment.
  const perturbContingency = baseMapping[REVERSAL_COLORS[0]];
  const perturbSpec = CONTINGENCIES[perturbContingency];
  const perturbBlockStart = blocks.length;

  for (let i = 0; i < design.perturbationBlocks; i++) {
    blocks.push({
      index: blocks.length,
      part: 'perturbation',
      color: PERTURBATION_COLOR,
      contingency: perturbContingency,
      viAMs: perturbSpec.viAMs,
      viBMs: perturbSpec.viBMs,
      targetResponses: design.perturbationBlockResponses,
      exposureNumber: nextExposure(PERTURBATION_COLOR, perturbContingency),
      reversalStage: null,
    });
  }

  const perturbations = buildPerturbations(
    perturbBlockStart,
    design,
    perturbRng,
  );

  return {
    experimentVersion: EXPERIMENT_VERSION,
    seed,
    colorToContingency: baseMapping,
    blocks,
    perturbations,
    reversalBlockIndices,
  };
}

/**
 * Distribute perturbations over the baseline blocks.
 *
 * The first block is left undisturbed so every perturbation has a full block of
 * unperturbed behavior before it, and types are interleaved rather than
 * blocked so repetition number is not confounded with type.
 *
 * Within a block, each perturbation gets its own non-overlapping window and is
 * jittered inside it. Partitioning first and jittering second is what
 * guarantees separation: jittering two onsets independently across the whole
 * block cannot.
 */
function buildPerturbations(
  blockStart: number,
  design: DesignConfig,
  rng: () => number,
): Perturbation[] {
  const total = design.nExtinctionPerturbations + design.nReversalPerturbations;
  const hostBlocks = Array.from(
    { length: design.perturbationBlocks - 1 },
    (_, i) => blockStart + 1 + i,
  );
  if (hostBlocks.length === 0) {
    throw new Error('the perturbation part needs at least two blocks');
  }

  const perBlock = Math.ceil(total / hostBlocks.length);

  // A window must hold a lead-in, the perturbation itself, and its recovery.
  const windowSize = Math.floor(design.perturbationBlockResponses / perBlock);
  const required =
    design.perturbationDurationResponses + design.minRecoveryResponses;
  if (windowSize < required + 4) {
    throw new Error(
      `${perBlock} perturbations per block of ${design.perturbationBlockResponses} ` +
        `responses leaves ${windowSize} per window, which cannot hold a ` +
        `${design.perturbationDurationResponses}-response perturbation plus ` +
        `${design.minRecoveryResponses} responses of recovery`,
    );
  }

  const types: PerturbationType[] = shuffle(
    [
      ...Array<PerturbationType>(design.nExtinctionPerturbations).fill('extinction'),
      ...Array<PerturbationType>(design.nReversalPerturbations).fill(
        'contingency_reversal',
      ),
    ],
    rng,
  );

  // Assign perturbations to (block, window) slots, spreading across blocks
  // before filling a second window in any of them.
  const slots: Array<{ blockIndex: number; window: number }> = [];
  for (let w = 0; w < perBlock; w++) {
    const order = placePerturbations(
      hostBlocks,
      Math.min(hostBlocks.length, total - slots.length),
      design.minRecoveryBlocks,
      rng,
    );
    slots.push(...order.map((blockIndex) => ({ blockIndex, window: w })));
    if (slots.length >= total) break;
  }

  const repetition = new Map<PerturbationType, number>();

  return slots.slice(0, total).map((slot, i) => {
    const type = types[i];
    const rep = (repetition.get(type) ?? 0) + 1;
    repetition.set(type, rep);

    const onset =
      slot.window * windowSize +
      perturbationOnset(
        windowSize,
        design.perturbationDurationResponses,
        design.minRecoveryResponses,
        rng,
      );

    return {
      id: `pert_${String(i + 1).padStart(2, '0')}_${type}`,
      type,
      blockIndex: slot.blockIndex,
      onsetResponseInBlock: onset,
      durationResponses: design.perturbationDurationResponses,
      repetitionNumber: rep,
    };
  });
}

/** Total responses the plan requires, for timing estimates. */
export function plannedResponses(plan: SessionPlan): number {
  return plan.blocks.reduce((sum, b) => sum + b.targetResponses, 0);
}
