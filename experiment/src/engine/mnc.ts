// ============================================================
// The Multiple Necessary Cues engine.
//
// A compound is four binary dimension values. Exactly one compound
// pays in a given context; a choice is correct only if it matches
// the target on every dimension, which is what makes the cues
// "necessary" in Vyazovska, Teng and Wasserman's (2014) sense.
//
// The per-dimension record on every trial is the point of the whole
// thing. For each dimension we log whether the chosen compound
// matched the target on it, AND how many of the four alternatives
// matched -- because the second number is the chance baseline for
// the first. Without it a dimension that happened to be uninformative
// on a trial (all four alternatives sharing the target's value)
// would look like perfect control.
// ============================================================

import { createRng } from '../utils/rng';
import {
  DIMENSIONS,
  MNC_CONFIG,
  N_COMPOUNDS,
  N_DIMENSIONS,
  type Arm,
  ARMS,
  type DimId,
} from '../config/mnc';

/** A compound, as one bit per dimension in DIMENSIONS order. */
export type Compound = readonly (0 | 1)[];

export function compoundFromIndex(i: number): Compound {
  if (!Number.isInteger(i) || i < 0 || i >= N_COMPOUNDS) {
    throw new RangeError(`compound index ${i} out of range`);
  }
  return DIMENSIONS.map((_, d) => ((i >> d) & 1) as 0 | 1);
}

export function compoundToIndex(c: Compound): number {
  return c.reduce<number>((acc, bit, d) => acc | (bit << d), 0);
}

export function allCompounds(): Compound[] {
  return Array.from({ length: N_COMPOUNDS }, (_, i) => compoundFromIndex(i));
}

/** Number of dimensions on which two compounds differ. */
export function disparity(a: Compound, b: Compound): number {
  return a.reduce<number>((n, bit, d) => n + (bit === b[d] ? 0 : 1), 0);
}

export function describe(c: Compound): Record<DimId, string> {
  const out = {} as Record<DimId, string>;
  DIMENSIONS.forEach((dim, d) => {
    out[dim.id] = dim.values[c[d]];
  });
  return out;
}

export interface Trial {
  /** Position order as shown. Index 0..3 of the on-screen alternatives. */
  alternatives: Compound[];
  /** Which on-screen position holds the target. */
  targetPosition: number;
}

/**
 * Build one trial: exactly one compound that pays, and three that do not.
 *
 * The paying compound takes the required values on the relevant dimensions and
 * random values everywhere else -- which is the whole point. An irrelevant
 * dimension's value on the winning alternative is a coin flip, so a
 * participant who attends to it gains nothing, and the per-dimension match
 * rate for it should sit at chance rather than above it.
 *
 * Distractors differ from the rule on at least one relevant dimension, so
 * there is never more than one right answer, and their irrelevant values are
 * drawn independently too.
 */
export function buildTrial(spec: ContextSpec, rnd: () => number): Trial {
  const draw = (): Compound => DIMENSIONS.map(() => (rnd() < 0.5 ? 0 : 1) as 0 | 1);

  const winner = draw().map((v, d) =>
    spec.relevant.includes(d) ? spec.values[d] : v,
  ) as Compound;

  const alts: Compound[] = [winner];
  let guard = 0;
  while (alts.length < MNC_CONFIG.alternativesPerTrial && guard < 1000) {
    guard++;
    const cand = draw();
    if (paysUnder(spec, cand)) continue; // would be a second right answer
    if (alts.some((a) => compoundToIndex(a) === compoundToIndex(cand))) continue;
    alts.push(cand);
  }

  for (let i = alts.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [alts[i], alts[j]] = [alts[j], alts[i]];
  }
  const targetPosition = alts.findIndex((a) => paysUnder(spec, a));
  return { alternatives: alts, targetPosition };
}

/**
 * How many of a trial's alternatives carry the target's value on each
 * dimension. A count equal to the number of alternatives means the dimension
 * did not discriminate on this trial and carries no information about whether
 * the participant attended to it.
 */
export function dimensionMatchCounts(trial: Trial, target: Compound): number[] {
  return DIMENSIONS.map((_, d) =>
    trial.alternatives.reduce((n, alt) => n + (alt[d] === target[d] ? 1 : 0), 0),
  );
}

export interface ChoiceRecord {
  correct: boolean;
  rewarded: boolean;
  /** Per dimension, whether the chosen compound matched the target. */
  matched: boolean[];
  /** Per dimension, how many alternatives matched the target (chance baseline). */
  matchCounts: number[];
  /** How many dimensions the choice got wrong. 0 when correct. */
  errorDisparity: number;
}

export function scoreChoice(
  trial: Trial,
  spec: ContextSpec,
  chosenPosition: number,
  arm: Arm,
  rnd: () => number,
): ChoiceRecord {
  const chosen = trial.alternatives[chosenPosition];
  if (!chosen) throw new RangeError(`no alternative at position ${chosenPosition}`);
  const winner = trial.alternatives[trial.targetPosition];
  const correct = paysUnder(spec, chosen);
  const p = ARMS[arm][correct ? 'pReinforceCorrect' : 'pReinforceError'];
  return {
    correct,
    rewarded: rnd() < p,
    // Matching is scored against the winning compound on every dimension,
    // relevant or not. On an irrelevant dimension the winner's value was a
    // coin flip, so matching it is chance by construction -- which is exactly
    // the prediction being tested, and why this is not restricted to the
    // relevant dimensions.
    matched: DIMENSIONS.map((_, d) => chosen[d] === winner[d]),
    matchCounts: dimensionMatchCounts(trial, winner),
    errorDisparity: spec.relevant.filter((d) => chosen[d] !== spec.values[d]).length,
  };
}

/**
 * Whether to move on to the next context.
 *
 * Criterion with a cap. A participant who finds the rule should not spend the
 * rest of the session re-demonstrating it, and a participant who never finds
 * it must not consume the whole session in one context -- either outcome
 * leaves no within-subject comparison across contexts. Which of the two fired
 * is returned so the analysis never has to guess.
 */
export function advanceDecision(
  recentCorrect: boolean[],
  trialsInContext: number,
): { advance: boolean; reason: 'criterion' | 'cap' | null } {
  if (trialsInContext >= MNC_CONFIG.maxTrialsPerContext) {
    return { advance: true, reason: 'cap' };
  }
  if (trialsInContext < MNC_CONFIG.minTrialsPerContext) {
    return { advance: false, reason: null };
  }
  const w = recentCorrect.slice(-MNC_CONFIG.criterionWindow);
  if (w.length < MNC_CONFIG.criterionWindow) return { advance: false, reason: null };
  const hits = w.filter(Boolean).length;
  return hits >= MNC_CONFIG.criterionCorrect
    ? { advance: true, reason: 'criterion' }
    : { advance: false, reason: null };
}

/**
 * What a participant meets in each context: which dimensions matter, and what
 * values they have to take.
 *
 * Successive contexts are forced to differ in their relevant SET, not merely
 * in the values. Changing only the values while keeping the same two
 * dimensions relevant would let a participant carry most of the previous rule
 * forward, and the next context would measure retention rather than
 * acquisition.
 *
 * The relevant set is drawn so that every dimension takes a turn: across a run
 * of contexts each of the four is relevant roughly half the time, which is
 * what makes the relevant-versus-irrelevant comparison paired within a
 * dimension rather than confounded with which dimension it is.
 */
export interface ContextSpec {
  /** Indices into DIMENSIONS that determine which compound pays. */
  relevant: number[];
  /** Required value on each relevant dimension; entries for irrelevant
   *  dimensions are present but carry nothing. */
  values: (0 | 1)[];
}

export function contextSpecs(seed: string, n: number): ContextSpec[] {
  const rnd = createRng(seed);
  const sets = MNC_CONFIG.relevantSets;
  const out: ContextSpec[] = [];
  let prev: number[] | null = null;
  for (let c = 0; c < n; c++) {
    let rel: readonly number[];
    let guard = 0;
    do {
      rel = sets[Math.floor(rnd() * sets.length)];
      guard++;
      // With only three sets to draw from, insisting on a different one each
      // time is cheap and keeps a participant from meeting the same rule twice
      // in a row, which would measure retention rather than acquisition.
    } while (prev && rel.join() === prev.join() && guard < 100);
    out.push({
      relevant: [...rel].sort((a, b) => a - b),
      values: DIMENSIONS.map(() => (rnd() < 0.5 ? 0 : 1) as 0 | 1),
    });
    prev = [...rel];
  }
  return out;
}

/** Does this compound satisfy the context's rule? */
export function paysUnder(spec: ContextSpec, c: Compound): boolean {
  return spec.relevant.every((d) => c[d] === spec.values[d]);
}

export { N_DIMENSIONS };