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
export type ContextColorId = 'green' | 'blue' | 'red' | 'neutral';

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
  /** Concurrent-VI parameters, used when scheduleMode is 'vi'. */
  viAMs: number;
  viBMs: number;
  /**
   * Depleting-patch parameters, used when scheduleMode is
   * 'depleting_probability'. Recovery rate is what the context manipulates:
   * an A-rich context restores option A faster than option B.
   */
  recoveryAPerResponse: number;
  recoveryBPerResponse: number;
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
  /**
   * Which reinforcement schedule the task arranges.
   *
   * 'depleting_probability' reproduces the previous study's mechanism and is
   * the default; see the note on ScheduleMode.
   */
  scheduleMode: ScheduleMode;
  patch: PatchConfig;
}

/**
 * 'vi' arranges concurrent variable-interval schedules with a changeover
 * delay -- the behaviour-analytic standard, and the schedule under which
 * accumulating setups on the neglected alternative make exclusive preference
 * costly.
 *
 * 'depleting_probability' arranges the previous study's depleting patches,
 * where each alternative's latent value is its reinforcement probability.
 *
 * The choice is not stylistic. An interval schedule is rate-limiting: obtained
 * reinforcement is set by the programmed rate and barely moves, so the
 * reward-rate coordinate of the state vector has a true between-bin SD of 0.047
 * against 0.280 in the previous study. Dropping that coordinate is not an
 * option either -- on the previous study's real data it is worth more than any
 * other single coordinate. So the schedule that sustains switching by one
 * mechanism destroys the measurement the analysis depends on, and the schedule
 * that produced the original result preserves it.
 */
export type ScheduleMode = 'vi' | 'depleting_probability';

export interface PatchConfig {
  /** Value lost each time an alternative is harvested. */
  depletionPerResponse: number;
  /** Latent value both alternatives start each block at. */
  startingValue: number;
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
  scheduleMode: 'depleting_probability',
  patch: {
    // The previous study's values: 0.12 lost per response against recovery
    // rates near 0.2/s, so an alternative is worked down in roughly eight
    // responses and restored in about five seconds. That ratio is what made
    // reward rate move faster than choice could track, which is what gave the
    // coordinate its variance.
    depletionPerResponse: 0.12,
    startingValue: 0.7,
  },
  depletion: {
    // Off by default. Depletion was implemented and then measured against a
    // stationary schedule using responders calibrated to the previous study's
    // 60 participants. It lowered obtained reinforcement at every strength
    // tested and never improved the reward-rate coordinate it was meant to
    // rescue:
    //
    //     stationary          1.96 reinforcers per 10-response bin
    //     deplete 0.06        1.58
    //     deplete 0.25        1.17
    //     deplete 0.40        1.00
    //
    // The reason is behavioural rather than arithmetic: a responder that leaves
    // an alternative when it stops paying stabilises its own obtained rate, so
    // depletion removes reinforcement without adding the swings in reward rate
    // that made that coordinate informative in the previous study. There, the
    // patches emptied in about eight responses -- faster than choice could
    // track -- which is what produced those swings.
    //
    // The mechanism is kept because a future comparison may want it, and
    // because settling this on real behaviour rather than on simulated
    // responders is a reasonable thing for the pilot to do.
    enabled: false,
    perResponse: 0.06,
    recoveryPerS: 0.09,
    minRichness: 0.15,
  },
};
