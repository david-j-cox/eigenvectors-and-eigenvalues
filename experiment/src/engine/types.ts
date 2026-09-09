// ============================================================
// Core domain types for the behavioral dynamics task.
//
// The task is a concurrent-operants two-alternative choice
// procedure. Blocks are defined by a target number of responses
// rather than by elapsed time, because every downstream estimate
// is a per-response state transition and a time-defined block
// yields an unpredictable number of them.
// ============================================================

export type Side = 'A' | 'B';

/** Which reinforcement contingency is arranged, independent of how it looks. */
export type ContingencyId = 'A_rich' | 'B_rich' | 'symmetric';

/** Which background the participant sees, independent of what it arranges. */
export type ContextColorId = 'green' | 'blue' | 'red';

/** The three parts of the integrated session. */
export type PartId = 'practice' | 'replication' | 'reversal' | 'perturbation';

export interface ColorSpec {
  id: ContextColorId;
  /** Exact value logged with every event so context is recoverable from raw data. */
  hex: string;
  /** Paired with colour so the discrimination does not rest on hue alone. */
  pattern: 'plain' | 'stripes' | 'dots';
  label: string;
}

export interface ContingencySpec {
  id: ContingencyId;
  viAMs: number;
  viBMs: number;
  label: string;
}

/** One block: a run of responses under one colour and one contingency. */
export interface Block {
  index: number;
  part: PartId;
  color: ContextColorId;
  contingency: ContingencyId;
  viAMs: number;
  viBMs: number;
  targetResponses: number;
  /** 1-based count of how many times this colour x contingency cell has occurred. */
  exposureNumber: number;
  /** Reversal stage for the reversal part; null elsewhere. */
  reversalStage: number | null;
}

export type PerturbationType =
  | 'extinction'
  | 'contingency_reversal'
  | 'alternative_pulse'
  | 'rich_pulse';

/**
 * A perturbation is a temporary override of the block's schedule, expressed
 * purely as data. Adding a new type means adding a case to `applyPerturbation`,
 * never touching block sequencing or response handling.
 */
export interface Perturbation {
  id: string;
  type: PerturbationType;
  /** Block this perturbation occurs in. */
  blockIndex: number;
  /** Responses into the block at which the perturbation begins. */
  onsetResponseInBlock: number;
  /** Length of the perturbation in responses. */
  durationResponses: number;
  /** Ordinal repetition of this type within the session, for reliability analyses. */
  repetitionNumber: number;
}

export interface SessionPlan {
  experimentVersion: string;
  seed: string;
  /** The randomized mapping from physical colour to arranged contingency. */
  colorToContingency: Record<string, ContingencyId>;
  blocks: Block[];
  perturbations: Perturbation[];
  /** Block index at which each reversal takes effect, for the reversal part. */
  reversalBlockIndices: number[];
}

// ---------------------------------------------------------- schedule state --

export interface ViState {
  /** Programmed mean interval; Infinity means the alternative is on extinction. */
  intervalMs: number;
  /**
   * Current richness in (0, 1]. The effective mean interval is
   * `intervalMs / richness`, so richness 1 is the programmed schedule and
   * lower values are leaner. Held at 1 when depletion is disabled.
   */
  richness: number;
  /** A reinforcer is set up and waiting to be collected. */
  baited: boolean;
  nextBaitAtMs: number;
  lastReinforcerAtMs: number;
}

export interface CodState {
  active: boolean;
  /** Side the participant switched to, which starts the delay. */
  side: Side | null;
  startedAtMs: number;
  durationMs: number;
  /** Responses still required on the new side before reinforcement resumes. */
  responsesRemaining: number;
}

// ------------------------------------------------------------- event record --

export interface ResponseOutcome {
  trialIndex: number;
  blockIndex: number;
  trialInBlock: number;

  chosenOption: Side;
  previousOption: Side | null;
  switched: boolean;
  runLength: number;

  rewardOutcome: 0 | 1;
  pointsEarned: number;
  cumulativePoints: number;

  responseTimeMs: number;
  iciMs: number;
  elapsedMs: number;

  /** Programmed schedule in force at the moment of the response, after any
   *  perturbation override. These are what the analysis validates against. */
  viAMs: number;
  viBMs: number;
  /** Depletion state at the moment of the response; 1 when depletion is off. */
  richnessA: number;
  richnessB: number;

  codActive: boolean;
  reinforcerWithheldByCod: boolean;

  perturbationActive: boolean;
  perturbationId: string | null;
  perturbationType: PerturbationType | null;
  trialsSincePerturbationOnset: number | null;
  trialsSincePerturbationOffset: number | null;

  trialsSinceContextSwitch: number;
}

export interface EngineConfig {
  /** Minimum interval between counted responses; filters accidental double-clicks. */
  responseCooldownMs: number;
  /**
   * Changeover delay, expressed as both a time and a response requirement;
   * reinforcement resumes only once both are satisfied.
   *
   * A purely time-based COD makes obtained reinforcement a hidden function of
   * how fast a participant happens to click: at two responses per second a 2 s
   * COD costs four responses, and a participant who changes over often can be
   * left almost permanently ineligible. Pairing it with a response count bounds
   * that cost for fast and slow responders alike.
   */
  codMs: number;
  codResponses: number;
  pointsPerReinforcer: number;
  /** Exponential VI intervals are clamped to these multiples of the mean. */
  viMinMultiple: number;
  viMaxMultiple: number;
  depletion: DepletionConfig;
}

/**
 * Depletion and recovery of each alternative's richness.
 *
 * A stationary concurrent VI holds obtained reinforcement rate roughly constant
 * within a block, which leaves the reward-rate coordinate of the state vector
 * with almost no genuine between-bin variance to measure -- it becomes mostly
 * binomial sampling noise. The previous study's dominant eigenvector loaded on
 * reward rate precisely because its depleting patches made that variable move.
 *
 * Depletion restores that movement while keeping the interval structure that
 * makes changing over worthwhile: harvesting an alternative lengthens its
 * interval, and neglecting one shortens it back toward the programmed value.
 */
export interface DepletionConfig {
  enabled: boolean;
  /** Multiplicative loss of richness per response to that alternative. */
  perResponse: number;
  /** Richness regained per second, applied to both alternatives. */
  recoveryPerS: number;
  /** Floor on richness, so a harvested alternative never becomes extinction. */
  minRichness: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  responseCooldownMs: 150,
  codMs: 1000,
  codResponses: 2,
  pointsPerReinforcer: 1,
  viMinMultiple: 0.1,
  viMaxMultiple: 3.0,
  depletion: {
    // Off by default. Depletion was implemented and measured against a
    // stationary schedule on simulated sessions; it lowered obtained
    // reinforcement and made the reward-rate coordinate noisier at every
    // strength tested, because a melioration-like responder simply leaves a
    // depleting alternative and thereby stabilises its own obtained rate. The
    // mechanism is kept because it is what the previous study used and a future
    // comparison may want it, but it is not the default here.
    enabled: false,
    perResponse: 0.06,
    recoveryPerS: 0.09,
    minRichness: 0.15,
  },
};
