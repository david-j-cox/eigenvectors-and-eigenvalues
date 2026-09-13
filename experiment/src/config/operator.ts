// ============================================================
// Free-operant two-alternative procedure for estimating transition
// operators with several concurrent environmental variables.
//
// Three variables are manipulated: the pair of reinforcement
// probabilities (unsignalled, changing at block boundaries), a
// momentary appetitive stimulus, and a momentary aversive stimulus.
// Parameters below follow from measurements on the previous study in
// this program rather than from convention; each is justified where
// it is set.
// ============================================================

export const OPERATOR_CONFIG = {
  // --- reinforcement ---
  //
  // Probabilities are properties of the schedule state and do not depend on
  // recent allocation. Nothing depletes. Under a depleting schedule,
  // allocating toward the richer alternative reduces its yield, so responding
  // returns toward indifference whether or not anything was learned, and any
  // decay rate estimated from it is confounded with the schedule's own
  // restoring force. This study is about decay rates.
  pNeutral: 0.25,
  pRich: 0.45,
  pLean: 0.10,

  // --- momentary appetitive stimulus ---
  /** Probabilities that supersede the block state on the response the gold
   *  border is shown for, and for that response only. */
  pAppetitiveSignalled: 0.60,
  pAppetitiveOther: 0.05,
  /** Proportion of appetitive stimuli that appear on the panel the block
   *  state favours. Partial correlation is what makes both the stimulus and
   *  the reinforcement probability separately estimable: a stimulus
   *  uncorrelated with reinforcement acquires no discriminative function, and
   *  one perfectly correlated with it contributes no independent variance. */
  appetitiveCongruence: 0.60,

  // --- momentary aversive stimulus ---
  /** A response to the red-bordered panel subtracts this many points. */
  aversiveCost: 1,
  /** Set opposite to the appetitive congruence so the two signalled variables
   *  are not collinear with each other. */
  aversiveCongruence: 0.40,

  // --- scheduling of momentary stimuli ---
  //
  // A fixed per-response probability would place successive occurrences inside
  // one another's recovery windows, and no lag beyond the mean interval could
  // be interpreted. The floor guarantees every occurrence is followed by at
  // least `minStimulusGap` responses free of that stimulus type, which is the
  // window its decay is read from. The cost is a rate near 5% rather than 20%,
  // so magnitude rests on fewer observations; the question concerns decay.
  minStimulusGap: 15,
  meanStimulusGap: 20,

  // --- blocks ---
  //
  // In the previous study an unsignalled reversal of the reinforcement
  // contingency displaced allocation maximally 16-23 responses after onset and
  // returned to baseline by 24-32. A 100-response block therefore holds the
  // whole transition plus about 68 responses at the new steady state. Shorter
  // blocks yield more transitions but end before allocation settles, so each
  // magnitude is underestimated; longer blocks estimate magnitude better and
  // yield too few transitions to time.
  blockResponses: 100,

  // --- perturbations ---
  /** Reinforcement probabilities are reversed for exactly this many responses
   *  and then restored, with no change to the display. */
  perturbationResponses: 8,
  /** Responses after a perturbation during which the block state is held and
   *  no momentary stimulus is scheduled, so the return is observed undisturbed.
   *  The previous study's effect peaked 16-23 responses after onset, so a
   *  window shorter than this would miss the peak entirely. */
  perturbationRecovery: 40,
  /** Perturbations per block. Placed to fall entirely inside a block. */
  perturbationsPerBlock: 1,

  // --- session ---
  totalResponses: 2400,
  maxSessionMs: 28 * 60 * 1000,
  /** Unreinforced warm-up at neutral probabilities, excluded from analysis. */
  practiceResponses: 40,

  // --- display ---
  feedbackMs: 260,
  panelColor: '#C9CDD2',
  appetitiveBorder: '#D9A400',
  aversiveBorder: '#8C2F27',
  background: '#14181C',
} as const;

export type RichSide = 'left' | 'right' | 'neutral';
export type StimulusKind = 'none' | 'appetitive' | 'aversive';
