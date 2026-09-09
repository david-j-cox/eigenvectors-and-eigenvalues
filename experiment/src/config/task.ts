// ============================================================
// Task configuration.
//
// Every number here is a design parameter, and the ones that
// matter most were set by simulation against the previous
// study's data rather than by convention. See
// docs/behavioral-dynamics-program.md for the derivations.
// ============================================================

import type { ColorSpec, ContingencySpec, EngineConfig } from '../engine/types';
import { DEFAULT_ENGINE_CONFIG } from '../engine/types';

export const EXPERIMENT_VERSION = 'eigen-dynamics-1.0.0';

/**
 * Colours are paired with a pattern so the discrimination never rests on hue
 * alone, which also keeps the task usable for colour-vision-deficient
 * participants without changing the design.
 */
export const COLORS: Record<string, ColorSpec> = {
  green: { id: 'green', hex: '#2E7D5B', pattern: 'plain', label: 'Green' },
  blue: { id: 'blue', hex: '#2E5C8A', pattern: 'stripes', label: 'Blue' },
  red: { id: 'red', hex: '#96382F', pattern: 'dots', label: 'Red' },
};

export const NEUTRAL_COLOR: ColorSpec = {
  id: 'green',
  hex: '#4A4A4A',
  pattern: 'plain',
  label: 'Practice',
};

/**
 * Concurrent VI pairs.
 *
 * The three contingencies are matched on *total* programmed reinforcement rate
 * (1/viA + 1/viB = 0.625 reinforcers/s in every case) and differ only in how
 * that rate is distributed. Without this constraint a "symmetric" context is
 * also a leaner context, and any difference in its dynamics could be a
 * response to reduced richness rather than to changed distribution.
 */
export const CONTINGENCIES: Record<string, ContingencySpec> = {
  A_rich: { id: 'A_rich', viAMs: 1000, viBMs: 4000, label: 'A-rich (VI 1s / VI 4s)' },
  B_rich: { id: 'B_rich', viAMs: 4000, viBMs: 1000, label: 'B-rich (VI 4s / VI 1s)' },
  symmetric: {
    id: 'symmetric',
    viAMs: 1600,
    viBMs: 1600,
    label: 'Symmetric (VI 1.6s / VI 1.6s)',
  },
};

export interface DesignConfig {
  /** Responses in the practice block, under the symmetric contingency. */
  practiceResponses: number;
  /** Responses per block. Chosen so a block yields whole state bins. */
  blockResponses: number;
  /** State bin used by the analysis; blockResponses should be a multiple. */
  stateBinResponses: number;
  /**
   * Exposures to each colour within each reversal stage. Together with
   * blockResponses this sets transitions per operator estimate, which is the
   * quantity that decides whether the replication test can succeed at all.
   */
  exposuresPerColorPerStage: number;
  /** Number of reversal stages. Three gives an ABA design. */
  nStages: number;
  /** Blocks in the dedicated perturbation part. */
  perturbationBlocks: number;
  /**
   * Responses per block in the perturbation part. Longer than a reversal block
   * so that two perturbations plus their recovery windows fit inside one block:
   * hosting them in fewer, longer blocks wastes fewer boundary transitions than
   * spreading them over many short ones.
   */
  perturbationBlockResponses: number;
  nExtinctionPerturbations: number;
  nReversalPerturbations: number;
  perturbationDurationResponses: number;
  /** Responses that must follow a perturbation inside its own block. */
  minRecoveryResponses: number;
  /** Blocks that must separate two perturbations. */
  minRecoveryBlocks: number;
}

/**
 * Defaults sized from the design simulation in reanalysis/.
 *
 * 100 responses per block is 10 state bins, so 9 within-block transitions; the
 * transition lost at each block boundary is why larger blocks are more
 * efficient per response, and 4 exposures per colour per stage is the smallest
 * number that still makes "repeated returns to the same context" meaningful.
 * Each colour x contingency x stage cell therefore yields 400 responses and 36
 * within-block transitions, and pooling the two stages that share a mapping
 * (1 and 3) gives 72 for the cell as a whole.
 *
 * At 36 transitions a same-operator pair separates from a different-operator
 * pair with AUC ~0.73 for a single participant. Since AUC is exactly the
 * probability that one participant orders the comparison correctly, a sign
 * test across 45 participants detects that departure from chance with about
 * 90% power, so the group-level directional claims are well supported while a
 * confident per-individual claim is not. Reaching AUC 0.82 needs 60
 * transitions per cell, which is roughly eight more minutes of responding.
 *
 * The trade is deliberate rather than hidden: raise exposuresPerColorPerStage
 * if the pilot shows participants responding faster than 2/s, or if a longer
 * session proves acceptable.
 */
export const DEFAULT_DESIGN: DesignConfig = {
  practiceResponses: 60,
  blockResponses: 100,
  stateBinResponses: 10,
  exposuresPerColorPerStage: 4,
  nStages: 3,
  perturbationBlocks: 5,
  perturbationBlockResponses: 200,
  nExtinctionPerturbations: 4,
  nReversalPerturbations: 4,
  perturbationDurationResponses: 8,
  minRecoveryResponses: 30,
  minRecoveryBlocks: 0,
};

/**
 * The primary state vector for the analysis, logged here so the task and the
 * analysis cannot drift apart.
 *
 * Mean log ICI is deliberately excluded from the primary state. In the
 * previous dataset it is the least noisy coordinate but it loads similarly on
 * the dominant mode in every context, so including it makes all contexts look
 * alike and dilutes exactly the differences this study is testing for. Dropping
 * it raises single-participant discrimination from AUC 0.79 to 0.86 at 80
 * transitions. Switch rate is the noisiest coordinate and is nonetheless kept,
 * because dropping it is the single most damaging change of all: it carries
 * most of what distinguishes one context's dynamics from another.
 *
 * ICI is still logged per response and analysed as a 4-D sensitivity check.
 */
export const PRIMARY_STATE_COORDINATES = [
  'choice_prop_A',
  'reward_rate',
  'switch_rate',
] as const;

/**
 * Time guard. If a participant responds slowly enough that the session would
 * run long, blocks are dropped from the END of the perturbation part only.
 * That part degrades gracefully -- fewer perturbations, same design -- whereas
 * trimming a reversal stage would silently unbalance the comparison the study
 * exists to make.
 */
export const SESSION_TIME_GUARD = {
  softCapMs: 30 * 60 * 1000,
  droppablePart: 'perturbation' as const,
};

// Mutable so scripts can vary one parameter for a design comparison; the task
// itself never reassigns it.
export const ENGINE: EngineConfig = {
  ...DEFAULT_ENGINE_CONFIG,
  // The changeover delay exists to stop the switch response itself from being
  // adventitiously reinforced, and one response plus 750 ms is enough for that.
  // Longer values are counterproductive here: simulated sessions showed a 2 s
  // delay leaving 40% of responses ineligible for a participant switching every
  // seven responses, which halves obtained reinforcement and starves the
  // reward-rate coordinate that carries the dominant mode.
  codMs: 750,
  codResponses: 1,
  responseCooldownMs: 150,
  pointsPerReinforcer: 1,
};

/**
 * Reinforcement density is the parameter most likely to need adjusting after
 * the pilot. In the previous dataset the reward-rate coordinate carried the
 * dominant eigenvector for 73% of participants, so if reinforcement is too
 * sparse the leading mode is measured almost entirely as noise. This is the
 * acceptance threshold for the pilot.
 */
export const PILOT_TARGETS = {
  /** Mean reinforcers per 10-response state bin. */
  minRewardsPerBin: 2.5,
  /** Sampling noise as a share of between-bin variance, per coordinate. */
  maxNoiseRatio: 0.5,
  minResponsesPerSecond: 1.2,
  maxSessionMinutes: 32,
};

export const COMPLETION_CODE =
  (import.meta as { env?: Record<string, string> }).env?.VITE_COMPLETION_CODE ?? 'CHANGEME';
