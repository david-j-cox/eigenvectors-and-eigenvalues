import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/utils/rng';
import {
  assignMapping,
  balancedSequence,
  perturbationOnset,
  placePerturbations,
} from '../../src/engine/randomization';

describe('balancedSequence', () => {
  const items = ['green', 'blue', 'red'] as const;

  it('never repeats an item immediately', () => {
    for (let seed = 0; seed < 200; seed++) {
      const seq = balancedSequence(items, 6, createRng(seed));
      for (let i = 1; i < seq.length; i++) {
        expect(seq[i]).not.toBe(seq[i - 1]);
      }
    }
  });

  it('uses each item exactly `repeats` times', () => {
    const seq = balancedSequence(items, 6, createRng('x'));
    for (const it of items) {
      expect(seq.filter((s) => s === it)).toHaveLength(6);
    }
  });

  it('balances every item across the three thirds', () => {
    for (let seed = 0; seed < 50; seed++) {
      const seq = balancedSequence(items, 6, createRng(seed));
      const third = seq.length / 3;
      for (let t = 0; t < 3; t++) {
        const slice = seq.slice(t * third, (t + 1) * third);
        for (const it of items) {
          expect(slice.filter((s) => s === it)).toHaveLength(2);
        }
      }
    }
  });

  it('refuses a repeat count that cannot balance across thirds', () => {
    expect(() => balancedSequence(items, 5, createRng('x'))).toThrow(/divisible by 3/);
  });
});

describe('assignMapping', () => {
  it('is a bijection', () => {
    const m = assignMapping(['green', 'blue'] as const, ['A_rich', 'B_rich'] as const, createRng('s'));
    expect(new Set(Object.values(m)).size).toBe(2);
  });

  it('varies across participants', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const m = assignMapping(['green', 'blue'] as const, ['A_rich', 'B_rich'] as const, createRng(`p${i}`));
      seen.add(JSON.stringify(m));
    }
    expect(seen.size).toBe(2);
  });
});

describe('placePerturbations', () => {
  it('respects the minimum block separation', () => {
    const hosts = Array.from({ length: 10 }, (_, i) => i + 1);
    const picked = placePerturbations(hosts, 4, 1, createRng('s'));
    expect(picked).toHaveLength(4);
    for (let i = 1; i < picked.length; i++) {
      expect(picked[i] - picked[i - 1]).toBeGreaterThan(1);
    }
  });

  it('throws rather than silently under-placing', () => {
    expect(() => placePerturbations([1, 2, 3], 3, 2, createRng('s'))).toThrow(/cannot place/);
  });
});

describe('perturbationOnset', () => {
  it('leaves room for the perturbation and its recovery window', () => {
    for (let seed = 0; seed < 100; seed++) {
      const onset = perturbationOnset(100, 8, 30, createRng(seed));
      expect(onset).toBeGreaterThanOrEqual(25);
      expect(onset + 8 + 30).toBeLessThanOrEqual(100);
    }
  });

  it('throws when the block is too short', () => {
    expect(() => perturbationOnset(30, 8, 30, createRng('s'))).toThrow(/too short/);
  });
});
