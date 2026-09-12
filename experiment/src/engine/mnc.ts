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
 * Build one trial: the target plus three distinct distractors.
 *
 * Distractors are drawn uniformly from the 15 non-target compounds rather
 * than stratified by disparity. Stratifying would fix the chance baseline
 * per dimension at a constant, which reads as tidier, but it also makes the
 * distractor set predictable from the target -- and a participant who learns
 * the distractor rule can exclude alternatives without attending to the
 * dimensions at all. Uniform sampling keeps the baseline varying trial to
 * trial, which is why it is logged per trial rather than assumed.
 */
export function buildTrial(target: Compound, rnd: () => number): Trial {
  const targetIdx = compoundToIndex(target);
  const pool = Array.from({ length: N_COMPOUNDS }, (_, i) => i).filter(
    (i) => i !== targetIdx,
  );
  // partial Fisher-Yates: only as many draws as we need
  const need = MNC_CONFIG.alternativesPerTrial - 1;
  for (let i = 0; i < need; i++) {
    const j = i + Math.floor(rnd() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const alts = [target, ...pool.slice(0, need).map(compoundFromIndex)];

  // shuffle positions so the target is not always first
  for (let i = alts.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [alts[i], alts[j]] = [alts[j], alts[i]];
  }
  const targetPosition = alts.findIndex((a) => compoundToIndex(a) === targetIdx);
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
  target: Compound,
  chosenPosition: number,
  arm: Arm,
  rnd: () => number,
): ChoiceRecord {
  const chosen = trial.alternatives[chosenPosition];
  if (!chosen) throw new RangeError(`no alternative at position ${chosenPosition}`);
  const correct = compoundToIndex(chosen) === compoundToIndex(target);
  const spec = ARMS[arm];
  const p = correct ? spec.pReinforceCorrect : spec.pReinforceError;
  return {
    correct,
    rewarded: rnd() < p,
    matched: DIMENSIONS.map((_, d) => chosen[d] === target[d]),
    matchCounts: dimensionMatchCounts(trial, target),
    errorDisparity: disparity(chosen, target),
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
 * The sequence of targets a participant will meet, one per context.
 *
 * Successive targets are forced to differ on at least two dimensions. A
 * one-dimension change would let a participant carry the previous rule almost
 * intact, so the new context would measure retention rather than acquisition,
 * and acquisition is the part that has any dynamics in it.
 */
export function contextTargets(seed: string, n: number): Compound[] {
  const rnd = createRng(seed);
  const out: Compound[] = [];
  let prev: Compound | null = null;
  for (let k = 0; k < n; k++) {
    let pick: Compound;
    let guard = 0;
    do {
      pick = compoundFromIndex(Math.floor(rnd() * N_COMPOUNDS));
      guard++;
    } while (prev && disparity(pick, prev) < 2 && guard < 100);
    out.push(pick);
    prev = pick;
  }
  return out;
}

export { N_DIMENSIONS };
