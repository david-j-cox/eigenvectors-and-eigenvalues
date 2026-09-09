import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed, shuffle } from '../../src/utils/rng';

describe('createRng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng('participant-123');
    const b = createRng('participant-123');
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = createRng('p1');
    const b = createRng('p2');
    expect(a()).not.toBe(b());
  });

  it('stays within [0, 1)', () => {
    const rng = createRng(42);
    for (let i = 0; i < 5000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('gives independent streams per derived name', () => {
    const base = 'seed';
    const a = createRng(deriveSeed(base, 'order'));
    const b = createRng(deriveSeed(base, 'perturbation'));
    expect(a()).not.toBe(b());
  });
});

describe('shuffle', () => {
  it('preserves the multiset', () => {
    const rng = createRng('s');
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(input, rng);
    expect(out.slice().sort()).toEqual(input.slice().sort());
  });

  it('does not mutate its input', () => {
    const rng = createRng('s');
    const input = [1, 2, 3];
    shuffle(input, rng);
    expect(input).toEqual([1, 2, 3]);
  });
});
