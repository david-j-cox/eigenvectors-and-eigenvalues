import { describe, expect, it } from 'vitest';

import { createRng } from '../utils/rng';
import { MNC_CONFIG, N_COMPOUNDS, DIMENSIONS } from '../config/mnc';
import {
  advanceDecision,
  allCompounds,
  buildTrial,
  compoundFromIndex,
  compoundToIndex,
  contextTargets,
  dimensionMatchCounts,
  disparity,
  scoreChoice,
  type Compound,
} from './mnc';

describe('compound encoding', () => {
  it('round-trips every compound', () => {
    for (let i = 0; i < N_COMPOUNDS; i++) {
      expect(compoundToIndex(compoundFromIndex(i))).toBe(i);
    }
  });

  it('enumerates 16 distinct compounds of 4 bits', () => {
    const all = allCompounds();
    expect(all).toHaveLength(16);
    expect(new Set(all.map(compoundToIndex)).size).toBe(16);
    all.forEach((c) => expect(c).toHaveLength(DIMENSIONS.length));
  });

  it('rejects out-of-range indices rather than wrapping', () => {
    expect(() => compoundFromIndex(16)).toThrow(RangeError);
    expect(() => compoundFromIndex(-1)).toThrow(RangeError);
  });

  it('counts disparity per dimension', () => {
    const a = compoundFromIndex(0b0000);
    expect(disparity(a, compoundFromIndex(0b0000))).toBe(0);
    expect(disparity(a, compoundFromIndex(0b0001))).toBe(1);
    expect(disparity(a, compoundFromIndex(0b1111))).toBe(4);
  });
});

describe('trial construction', () => {
  const target = compoundFromIndex(0b0101);

  it('always includes the target exactly once, with distinct alternatives', () => {
    const rnd = createRng('trial-structure');
    for (let i = 0; i < 300; i++) {
      const t = buildTrial(target, rnd);
      expect(t.alternatives).toHaveLength(MNC_CONFIG.alternativesPerTrial);
      const idx = t.alternatives.map(compoundToIndex);
      expect(new Set(idx).size).toBe(idx.length);
      expect(idx.filter((x) => x === compoundToIndex(target))).toHaveLength(1);
    }
  });

  it('reports the position the target is actually in', () => {
    const rnd = createRng('trial-position');
    for (let i = 0; i < 300; i++) {
      const t = buildTrial(target, rnd);
      expect(compoundToIndex(t.alternatives[t.targetPosition])).toBe(
        compoundToIndex(target),
      );
    }
  });

  it('puts the target in every position, not just the first', () => {
    // Guards the position shuffle. Without it the target is always index 0
    // and a participant could score perfectly while ignoring the stimuli.
    const rnd = createRng('trial-spread');
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) seen.add(buildTrial(target, rnd).targetPosition);
    expect(seen.size).toBe(MNC_CONFIG.alternativesPerTrial);
  });

  it('counts alternatives matching the target on each dimension', () => {
    const t = {
      alternatives: [
        compoundFromIndex(0b0000), // matches target 0b0000 on all
        compoundFromIndex(0b0001),
        compoundFromIndex(0b0011),
        compoundFromIndex(0b0111),
      ] as Compound[],
      targetPosition: 0,
    };
    // dimension 0: values 0,1,1,1 -> 1 match. dim1: 0,0,1,1 -> 2. dim2: 0,0,0,1 -> 3.
    // dim3: 0,0,0,0 -> 4 (uninformative on this trial).
    expect(dimensionMatchCounts(t, compoundFromIndex(0b0000))).toEqual([1, 2, 3, 4]);
  });
});

describe('scoring', () => {
  const target = compoundFromIndex(0b1010);

  it('is correct only when every dimension matches', () => {
    const rnd = createRng('score');
    const trial = { alternatives: [target, compoundFromIndex(0b1011)], targetPosition: 0 };
    expect(scoreChoice(trial, target, 0, 'deterministic', rnd).correct).toBe(true);
    // one dimension wrong is still wrong: that is what "necessary" means
    const near = scoreChoice(trial, target, 1, 'deterministic', rnd);
    expect(near.correct).toBe(false);
    expect(near.errorDisparity).toBe(1);
    expect(near.matched.filter(Boolean)).toHaveLength(3);
  });

  it('deterministic pays every correct choice and no incorrect one', () => {
    const rnd = createRng('det');
    const trial = { alternatives: [target, compoundFromIndex(0b0101)], targetPosition: 0 };
    for (let i = 0; i < 200; i++) {
      expect(scoreChoice(trial, target, 0, 'deterministic', rnd).rewarded).toBe(true);
      expect(scoreChoice(trial, target, 1, 'deterministic', rnd).rewarded).toBe(false);
    }
  });

  it('probabilistic pays correct more often than incorrect, and both sometimes', () => {
    const rnd = createRng('prob');
    const trial = { alternatives: [target, compoundFromIndex(0b0101)], targetPosition: 0 };
    let hitC = 0;
    let hitE = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      if (scoreChoice(trial, target, 0, 'probabilistic', rnd).rewarded) hitC++;
      if (scoreChoice(trial, target, 1, 'probabilistic', rnd).rewarded) hitE++;
    }
    expect(hitC / N).toBeGreaterThan(0.75);
    expect(hitC / N).toBeLessThan(0.85);
    // errors must sometimes pay -- that is the whole point of this arm
    expect(hitE / N).toBeGreaterThan(0.15);
    expect(hitE / N).toBeLessThan(0.25);
  });
});

describe('advancing between contexts', () => {
  const perfect = (n: number) => Array.from({ length: n }, () => true);

  it('holds a participant for the minimum even when scoring perfectly', () => {
    const n = MNC_CONFIG.minTrialsPerContext - 1;
    expect(advanceDecision(perfect(n), n).advance).toBe(false);
  });

  it('advances on criterion once the minimum is met', () => {
    const n = MNC_CONFIG.minTrialsPerContext;
    const d = advanceDecision(perfect(n), n);
    expect(d.advance).toBe(true);
    expect(d.reason).toBe('criterion');
  });

  it('does not advance below criterion', () => {
    const n = 40;
    const poor = Array.from({ length: n }, (_, i) => i % 4 === 0); // 25%, chance
    expect(advanceDecision(poor, n).advance).toBe(false);
  });

  it('advances on the cap even at chance, so one context cannot eat the session', () => {
    const n = MNC_CONFIG.maxTrialsPerContext;
    const poor = Array.from({ length: n }, (_, i) => i % 4 === 0);
    const d = advanceDecision(poor, n);
    expect(d.advance).toBe(true);
    expect(d.reason).toBe('cap');
  });
});

describe('context targets', () => {
  it('changes at least two dimensions between successive contexts', () => {
    // A one-dimension change would let the previous rule carry over almost
    // intact, so the next context would measure retention, not acquisition.
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const ts = contextTargets(seed, 8);
      for (let i = 1; i < ts.length; i++) {
        expect(disparity(ts[i], ts[i - 1])).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('is reproducible from the seed', () => {
    expect(contextTargets('same', 6).map(compoundToIndex)).toEqual(
      contextTargets('same', 6).map(compoundToIndex),
    );
    expect(contextTargets('one', 6).map(compoundToIndex)).not.toEqual(
      contextTargets('two', 6).map(compoundToIndex),
    );
  });
});
