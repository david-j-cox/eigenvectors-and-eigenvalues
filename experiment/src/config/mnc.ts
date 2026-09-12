// ============================================================
// Multiple Necessary Cues, adapted for a short human session.
//
// The stimulus structure is Vyazovska, Teng and Wasserman (2014):
// four separable binary dimensions crossed into 16 compounds, with
// reinforcement contingent on ALL FOUR being correct. That is what
// forces control to divide across dimensions rather than settle on
// one.
//
// Two things had to change for humans.
//
// Their task is go/no-go with a 1-in-16 S+ base rate, which they
// could afford because criterion took 800 to 5,440 trials. Three
// minutes buys roughly 180, so a 1-in-16 base rate would give about
// 11 S+ presentations and a failure to acquire would be a sampling
// artifact rather than a result. Here every trial is a forced choice
// among four compounds, one of which is the S+, so every trial is
// informative and chance is 25%.
//
// And a deterministic four-way conjunction is a rule, which humans
// extract in a few dozen trials and then sit at ceiling -- where
// there is no graded control left to measure and nothing for a
// covariance structure to decompose. The probabilistic arm follows
// Gomes-Ng, Cowie and Elliffe (2023) in reinforcing correct choices
// with p < 1 AND reinforcing errors with p > 0, which is what makes
// the rule genuinely unlearnable-to-perfection rather than merely
// noisy. Whether that actually holds responding off ceiling is the
// question this pilot exists to answer.
// ============================================================

export type DimId = 'shape' | 'size' | 'orientation' | 'hue';

export interface DimensionSpec {
  id: DimId;
  label: string;
  /** The two values. Index 0 and 1 are arbitrary labels, not correct/incorrect. */
  values: [string, string];
}

/** Four dimensions, chosen to be separable and equally nameable. */
export const DIMENSIONS: DimensionSpec[] = [
  { id: 'shape', label: 'Shape', values: ['circle', 'square'] },
  { id: 'size', label: 'Size', values: ['large', 'small'] },
  { id: 'orientation', label: 'Line', values: ['horizontal', 'vertical'] },
  // Blue against orange, from the Okabe-Ito palette. A light/dark grey pair
  // was tried first and was not reliably discriminable; these two separate
  // under protanopia, deuteranopia and tritanopia alike, which a
  // lightness contrast does not.
  { id: 'hue', label: 'Colour', values: ['blue', 'orange'] },
];

export const N_DIMENSIONS = DIMENSIONS.length;
export const N_COMPOUNDS = 2 ** N_DIMENSIONS;

/** Which arm a participant is in. */
export type Arm = 'deterministic' | 'probabilistic';

export interface ArmSpec {
  /** P(point | chose the S+ compound). */
  pReinforceCorrect: number;
  /** P(point | chose any other compound). Nonzero is what prevents ceiling. */
  pReinforceError: number;
}

export const ARMS: Record<Arm, ArmSpec> = {
  // "Like the pigeons": the contingency is perfect, so the rule is exactly
  // learnable and performance should climb to ceiling and stay there.
  deterministic: { pReinforceCorrect: 1.0, pReinforceError: 0.0 },
  // Correct is still four times better than incorrect, so the S+ remains
  // clearly worth finding, but no policy earns a point every time and errors
  // are sometimes paid. These values are a judgment call, not a measurement.
  probabilistic: { pReinforceCorrect: 0.8, pReinforceError: 0.2 },
};

export const MNC_CONFIG = {
  /** Alternatives shown per trial. One is always the S+. */
  alternativesPerTrial: 4,

  /** Task duration, excluding consent and instructions. */
  taskMs: 3 * 60 * 1000,

  // --- advancement to the next context ---
  //
  // The first pilot run settles these. That participant reached chance on the
  // first trial of a context, 75% by the second, and 100% from the sixth
  // onward -- a new four-way conjunction took about five trials to find. Under
  // the original 8-of-10 criterion with a 12-trial minimum, roughly half of
  // every context was spent at ceiling re-demonstrating a rule already found,
  // and the whole 50-trial session produced nine errors.
  //
  // Acquisition is where the dynamics are, so the design should buy as many
  // acquisitions as the time allows rather than long tails after each.
  /** A participant must complete at least this many trials before advancing. */
  minTrialsPerContext: 6,
  /** Advance on this many correct out of the last `criterionWindow`. */
  criterionCorrect: 4,
  criterionWindow: 5,
  /** Advance regardless after this many trials. Also bounds how long a
   *  participant who never finds the rule can spend on one context. */
  maxTrialsPerContext: 40,

  /** Feedback shown after each choice, in ms. Short: the session is 3 minutes. */
  feedbackMs: 350,

  /** Background colors signalling which compound currently pays. Distinct
   *  hues, all dark enough to carry both the dark and light stimulus values. */
  contextColors: [
    '#1F3A5F', '#4A2C4D', '#1E4438', '#5A3A1E',
    '#3B2E5A', '#14434A', '#5A2330', '#2E4020',
  ],
} as const;
