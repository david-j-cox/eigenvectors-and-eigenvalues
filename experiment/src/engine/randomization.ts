// ============================================================
// Deterministic construction of a participant's schedule.
//
// Two constraints matter for the analysis and are enforced here
// rather than hoped for:
//
//   1. No context repeats immediately. A repeat would produce a
//      "transition" that is really just a continuation, inflating
//      apparent within-context stability.
//   2. Every context appears equally often in the early, middle,
//      and late thirds. Otherwise an early-vs-late operator
//      comparison confounds context with time in session.
// ============================================================

import { randInt, shuffle } from '../utils/rng';

/**
 * Order `repeats` copies of each item so that no item repeats immediately and
 * each third of the sequence contains an equal share of every item.
 *
 * Throws if `repeats` is not divisible by 3, because silently unbalancing the
 * thirds would break the early/late comparison in a way no downstream check
 * would catch.
 */
export function balancedSequence<T>(
  items: readonly T[],
  repeats: number,
  rng: () => number,
): T[] {
  if (repeats % 3 !== 0) {
    throw new Error(
      `repeats must be divisible by 3 to balance across thirds, got ${repeats}`,
    );
  }
  const perThird = repeats / 3;
  const out: T[] = [];

  for (let third = 0; third < 3; third++) {
    const counts = new Map<T, number>(items.map((it) => [it, perThird]));
    // The previous item carries across the boundary between thirds, so the
    // no-repeat rule holds for the whole sequence rather than within each block.
    let prev: T | null = out.length ? out[out.length - 1] : null;

    let remaining = perThird * items.length;
    while (remaining > 0) {
      const pick = pickNext(counts, prev, remaining, rng);
      out.push(pick);
      counts.set(pick, counts.get(pick)! - 1);
      prev = pick;
      remaining--;
    }
  }

  return out;
}

/**
 * Choose the next item, avoiding both an immediate repeat and any choice that
 * would strand an item with more copies left than there are non-adjacent slots.
 *
 * In `remaining` slots with no two adjacent, one item can occupy at most
 * ceil(remaining / 2) of them, and it can only reach that many by taking the
 * slot being filled right now. So an item holding more than
 * floor(remaining / 2) copies has to be placed immediately; deferring it makes
 * the rest of the sequence impossible. At most one item can ever be in that
 * position, so placing it is never a choice between two forced items.
 */
function pickNext<T>(
  counts: Map<T, number>,
  prev: T | null,
  remaining: number,
  rng: () => number,
): T {
  const available = [...counts.entries()].filter(([, n]) => n > 0);
  const limit = Math.floor(remaining / 2);

  const forced = available.filter(([, n]) => n > limit);
  if (forced.length > 1) {
    throw new Error('two items both require immediate placement; counts are infeasible');
  }
  if (forced.length === 1) {
    const [item] = forced[0];
    if (item === prev) {
      throw new Error('sequence is infeasible: the forced item repeats the previous one');
    }
    return item;
  }

  const valid = available.filter(([it]) => it !== prev);
  if (!valid.length) {
    throw new Error('no item can follow without repeating');
  }
  return valid[Math.floor(rng() * valid.length)][0];
}

/**
 * Order blocks that alternate between two contexts without ever repeating,
 * used for the reversal part where only two colours are in play.
 *
 * `avoidFirst` carries the previous stage's final colour across the stage
 * boundary. Without it the alternation restarts freely and can repeat a colour
 * at the seam, which would produce a "context transition" that is really a
 * continuation and inflate apparent within-context stability.
 */
export function alternatingPairs<T>(
  a: T,
  b: T,
  total: number,
  rng: () => number,
  avoidFirst?: T | null,
): T[] {
  let startWithA = rng() < 0.5;
  if (avoidFirst === a) startWithA = false;
  else if (avoidFirst === b) startWithA = true;
  return Array.from({ length: total }, (_, i) =>
    (i % 2 === 0) === startWithA ? a : b,
  );
}

/**
 * Randomly pair physical colours with arranged contingencies.
 *
 * Counterbalanced per participant so that any dynamical difference between,
 * say, green and blue in the group cannot be an artifact of green always
 * carrying the same schedule.
 */
export function assignMapping<C extends string, K extends string>(
  colors: readonly C[],
  contingencies: readonly K[],
  rng: () => number,
): Record<C, K> {
  if (colors.length !== contingencies.length) {
    throw new Error('colors and contingencies must be the same length');
  }
  const shuffled = shuffle(contingencies, rng);
  const out = {} as Record<C, K>;
  colors.forEach((c, i) => {
    out[c] = shuffled[i];
  });
  return out;
}

/**
 * Place perturbation onsets within a run of blocks.
 *
 * Onsets are jittered inside each host block rather than fixed, so a
 * participant cannot come to anticipate them, and every perturbation is
 * separated by at least `minRecoveryBlocks` blocks so that recovery from one
 * is complete before the next begins.
 */
export function placePerturbations(
  hostBlockIndices: readonly number[],
  nPerturbations: number,
  minRecoveryBlocks: number,
  rng: () => number,
): number[] {
  const chosen: number[] = [];
  const candidates = shuffle(hostBlockIndices, rng);

  for (const idx of candidates) {
    if (chosen.length >= nPerturbations) break;
    if (chosen.every((c) => Math.abs(c - idx) > minRecoveryBlocks)) {
      chosen.push(idx);
    }
  }

  if (chosen.length < nPerturbations) {
    throw new Error(
      `cannot place ${nPerturbations} perturbations in ${hostBlockIndices.length} ` +
        `blocks with a ${minRecoveryBlocks}-block minimum separation`,
    );
  }
  return chosen.sort((a, b) => a - b);
}

/** Jittered onset within a block, leaving room for the perturbation and recovery. */
export function perturbationOnset(
  blockResponses: number,
  durationResponses: number,
  minRecoveryResponses: number,
  rng: () => number,
): number {
  const earliest = Math.floor(blockResponses * 0.25);
  const latest = blockResponses - durationResponses - minRecoveryResponses;
  if (latest <= earliest) {
    throw new Error(
      `block of ${blockResponses} responses is too short for a ` +
        `${durationResponses}-response perturbation plus ` +
        `${minRecoveryResponses} responses of recovery`,
    );
  }
  return randInt(earliest, latest, rng);
}
