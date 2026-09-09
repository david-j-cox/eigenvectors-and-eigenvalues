// ============================================================
// Deterministic, auditable pseudorandom number generation.
//
// Every randomized feature of a session -- colour-to-contingency
// mapping, block order, perturbation placement, VI intervals --
// derives from the participant's seed. Given the seed and the
// experiment version, the entire schedule is reconstructible
// after the fact, which is what makes the logged schedule
// verifiable rather than merely recorded.
// ============================================================

/** Mulberry32. Small state, good equidistribution, exactly reproducible. */
export function createRng(seed: string | number): () => number {
  let s = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Derive an independent stream from a base seed.
 *
 * Separate streams keep one randomized feature from shifting another: changing
 * the number of perturbations must not renumber the block order, or two
 * sessions with the same seed would no longer be comparable.
 */
export function deriveSeed(baseSeed: string, stream: string): string {
  return `${baseSeed}::${stream}`;
}

export function randomChoice<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Fisher-Yates, returning a new array. */
export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Random integer in [lo, hi]. */
export function randInt(lo: number, hi: number, rng: () => number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}
