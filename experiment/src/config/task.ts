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
  neutral: { id: 'neutral', hex: '#4A4A4A', pattern: 'plain', label: 'Practice' },
};

/**
 * The practice background.
 *
 * A desaturated grey that is not one of the signalled contexts, so participants
 * do not meet a context before the task proper begins. It is a first-class
 * entry in COLORS rather than a display-only constant: the practice block logs
 * `physical_context_id: "neutral"`, and if the two were allowed to disagree the
 * event file would record a context the participant never saw.
 */
export const NEUTRAL_COLOR: ColorSpec = COLORS.neutral;

/**
 * The three contingencies.
 *
 * Both schedule modes are parameterised, and both hold total programmed
 * reinforcement constant across the three contexts: the VI rates sum to
 * 1.25/s in every case, and the recovery rates sum to 0.34/s. Without that
 * constraint a "symmetric" context is also a leaner one, and any difference in
 * its dynamics could be a response to reduced richness rather than to changed
 * distribution.
 *
 * The recovery rates are the previous study's phase 1-3 values, so a context
 * here is the same manipulation that study used, and operators estimated from
 * the two datasets are directly comparable.
 */
export const CONTINGENCIES: Record<string, ContingencySpec> = {
  A_rich: {
    id: 'A_rich',
    viAMs: 1000,
    viBMs: 4000,
    recoveryAPerS: 0.24,
    recoveryBPerS: 0.10,
    label: 'A-rich',
  },
  B_rich: {
    id: 'B_rich',
    viAMs: 4000,
    viBMs: 1000,
    recoveryAPerS: 0.10,
    recoveryBPerS: 0.24,
    label: 'B-rich',
  },
  symmetric: {
    id: 'symmetric',
    viAMs: 1600,
    viBMs: 1600,
    recoveryAPerS: 0.17,
    recoveryBPerS: 0.17,
    label: 'Symmetric',
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
  /**
   * Number of reversal stages. Four gives ABAB.
   *
   * Three (ABA) was the original choice, on the reasoning that returning to the
   * first mapping breaks the confound between "different contingency" and
   * "later in the session". It does, but it is not enough. ABA contains one
   * A-to-B transition and one B-to-A transition, so neither is replicated
   * within a participant and a single odd reversal cannot be distinguished from
   * a real one.
   *
   * ABA is also unbalanced in a way that is easy to miss: the first mapping is
   * in force for two stages and the reversed mapping for one, so every reversed
   * cell is estimated from half the data of its counterpart. The weakest cell
   * sets what the design can claim, and under ABA it was the reversed one.
   *
   * ABAB fixes both. Each mapping holds for two stages, so all four
   * colour x contingency cells get equal data, and the A-to-B transition occurs
   * twice.
   */
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
 * efficient per response.
 *
 * Four exposures per colour per stage gives each cell 400 responses and 36
 * within-block transitions per stage. Under ABAB every colour x contingency
 * cell occurs in two stages, so each pools to 72 -- and unlike the earlier ABA
 * arrangement, all four cells get the same amount rather than the reversed ones
 * getting half.
 *
 * That evenness is what matters, because the weakest cell sets what the design
 * can claim. ABA with five exposures gave 90 transitions to the original
 * mapping and 45 to the reversed one; ABAB with four gives 72 to every cell, so
 * the binding constraint improves from 45 to 72 even though the per-stage
 * figure drops.
 *
 * At 72 transitions a same-operator pair separates from a different-operator
 * pair with AUC ~0.82 for a single participant. Since AUC is exactly the
 * probability that one participant orders the comparison correctly, a sign test
 * across 45 participants detects that departure from chance with better than
 * 99% power.
 */
export const DEFAULT_DESIGN: DesignConfig = {
  practiceResponses: 60,
  blockResponses: 100,
  stateBinResponses: 10,
  exposuresPerColorPerStage: 4,
  nStages: 4,
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
  // adventitiously reinforced. The response requirement alone achieves that;
  // the 500 ms is there so a fast double-tap cannot satisfy it instantly.
  //
  // The duration is short because it is expensive. Responders calibrated to the
  // previous study's 60 participants -- switching on ~22% of responses at 2.8
  // responses per second -- lose reinforcement steeply as it lengthens:
  //
  //     no COD      3.24 reinforcers per 10-response bin
  //     500 ms      2.21
  //     750 ms      2.04
  //     2000 ms     1.26   (72% of responses ineligible)
  //
  // A 2 s delay exceeds the average human run of ~5 responses, so a participant
  // would spend most of the task unable to earn anything.
  //
  // What this cannot tell us is the COD's effect on behaviour, since the
  // calibrated agent's switching is fixed by measured conditional
  // probabilities and barely responds to it. Whether 500 ms is long enough to
  // suppress adventitious reinforcement of changeovers is a question for the
  // pilot, not for the simulation.
  codMs: 500,
  codResponses: 1,
  responseCooldownMs: 150,
  pointsPerReinforcer: 1,
};

/**
 * Pilot acceptance thresholds.
 *
 * These are the single source of truth: `analysis/pilot_targets.json` is
 * generated from this object by `scripts/export_targets.ts`, so the task and
 * the diagnostics cannot drift into disagreeing about what counts as
 * acceptable. Change them here, then regenerate.
 *
 * `minRewardsPerBin` is a regression floor, not a sufficiency criterion.
 * Responders calibrated to the previous study's participants obtain a median
 * of about 2.2 reinforcers per 10-response bin under this schedule, so 2.0
 * passes ordinary variation while catching a schedule or changeover-delay
 * change that materially reduces reinforcement. What actually decides whether
 * the reward-rate coordinate is usable is `maxNoiseRatio`, which this design
 * does not currently meet -- see docs.
 */
export const PILOT_TARGETS = {
  /** Mean reinforcers per 10-response state bin. */
  minRewardsPerBin: 2.0,
  /** Sampling noise as a share of between-bin variance, per coordinate. */
  maxNoiseRatio: 0.6,
  minResponsesPerSecond: 1.2,
  maxSessionMinutes: 32,
  minTransitionsPerCell: 40,
  minFracBeatingPersistence: 0.7,
  minSwitchRate: 0.02,
  maxSwitchRate: 0.45,
};

export const COMPLETION_CODE =
  (import.meta as { env?: Record<string, string> }).env?.VITE_COMPLETION_CODE ?? 'CHANGEME';
