import { describe, expect, it } from 'vitest';

import { createRng } from '../utils/rng';
import { MNC_CONFIG, N_COMPOUNDS, DIMENSIONS } from '../config/mnc';
import {
  advanceDecision,
  allCompounds,
  buildTrial,
  compoundFromIndex,
  compoundToIndex,
  contextSpecs,

  disparity,
  paysUnder,
  scoreChoice,
  type Compound,
  type ContextSpec,
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
  const spec: ContextSpec = { relevant: [0, 3], values: [1, 0, 0, 1] };

  it('offers exactly one compound that pays', () => {
    const rnd = createRng('one-winner');
    for (let i = 0; i < 500; i++) {
      const t = buildTrial(spec, rnd);
      expect(t.alternatives).toHaveLength(MNC_CONFIG.alternativesPerTrial);
      expect(t.alternatives.filter((a) => paysUnder(spec, a))).toHaveLength(1);
      expect(paysUnder(spec, t.alternatives[t.targetPosition])).toBe(true);
    }
  });

  it('shows four distinct compounds', () => {
    const rnd = createRng('distinct');
    for (let i = 0; i < 300; i++) {
      const idx = buildTrial(spec, rnd).alternatives.map(compoundToIndex);
      expect(new Set(idx).size).toBe(idx.length);
    }
  });

  it('puts the winner in every position', () => {
    const rnd = createRng('spread');
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(buildTrial(spec, rnd).targetPosition);
    expect(seen.size).toBe(MNC_CONFIG.alternativesPerTrial);
  });

  it('leaves the winner\'s IRRELEVANT dimensions at chance', () => {
    // The load-bearing property of the whole design. If the winning compound
    // carried a predictable value on an irrelevant dimension, that dimension
    // would be learnable after all and there would be no contrast to measure.
    const rnd = createRng('irrelevant-are-random');
    const counts = [0, 0, 0, 0];
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const t = buildTrial(spec, rnd);
      const w = t.alternatives[t.targetPosition];
      w.forEach((v, d) => { if (v === 1) counts[d]++; });
    }
    // relevant dimensions are pinned by the rule
    expect(counts[0]).toBe(N);  // values[0] = 1
    expect(counts[3]).toBe(N);  // values[3] = 1
    // irrelevant ones must be coin flips
    for (const d of [1, 2]) {
      expect(counts[d] / N).toBeGreaterThan(0.45);
      expect(counts[d] / N).toBeLessThan(0.55);
    }
  });
});

describe('scoring depends only on the relevant dimensions', () => {
  const spec: ContextSpec = { relevant: [0, 3], values: [1, 0, 0, 1] };

  it('pays a compound that matches the rule whatever its other values', () => {
    const rnd = createRng('rule-only');
    // both differ on the irrelevant dimensions 1 and 2, both satisfy 0 and 3
    const a: Compound = [1, 0, 0, 1];
    const b: Compound = [1, 1, 1, 1];
    expect(paysUnder(spec, a)).toBe(true);
    expect(paysUnder(spec, b)).toBe(true);
    const trial = { alternatives: [a, [0, 0, 0, 1] as Compound], targetPosition: 0 };
    expect(scoreChoice(trial, spec, 0, 'deterministic', rnd).correct).toBe(true);
    expect(scoreChoice(trial, spec, 1, 'deterministic', rnd).correct).toBe(false);
  });

  it('an agent reading only the relevant dimensions is always right', () => {
    const rnd = createRng('perfect-agent');
    for (let i = 0; i < 400; i++) {
      const t = buildTrial(spec, rnd);
      const pick = t.alternatives.findIndex((alt) =>
        spec.relevant.every((d) => alt[d] === spec.values[d]),
      );
      expect(scoreChoice(t, spec, pick, 'deterministic', rnd).correct).toBe(true);
    }
  });

  it('an agent reading only an IRRELEVANT dimension scores at chance', () => {
    // If this rose above chance the manipulation would be broken: attending to
    // a dimension that carries nothing would still pay.
    const rnd = createRng('decoy-agent');
    let hits = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const t = buildTrial(spec, rnd);
      // always choose the alternative whose dimension 1 reads 0
      const pick = Math.max(0, t.alternatives.findIndex((a) => a[1] === 0));
      if (scoreChoice(t, spec, pick, 'deterministic', rnd).correct) hits++;
    }
    expect(hits / N).toBeGreaterThan(0.18);
    expect(hits / N).toBeLessThan(0.34);
  });

  it('deterministic pays every correct choice and no incorrect one', () => {
    const rnd = createRng('det');
    const trial = { alternatives: [[1, 0, 0, 1] as Compound, [0, 0, 0, 0] as Compound],
                    targetPosition: 0 };
    for (let i = 0; i < 150; i++) {
      expect(scoreChoice(trial, spec, 0, 'deterministic', rnd).rewarded).toBe(true);
      expect(scoreChoice(trial, spec, 1, 'deterministic', rnd).rewarded).toBe(false);
    }
  });

  it('probabilistic pays correct more often, and pays errors sometimes', () => {
    const rnd = createRng('prob');
    const trial = { alternatives: [[1, 0, 0, 1] as Compound, [0, 0, 0, 0] as Compound],
                    targetPosition: 0 };
    let c = 0, e = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      if (scoreChoice(trial, spec, 0, 'probabilistic', rnd).rewarded) c++;
      if (scoreChoice(trial, spec, 1, 'probabilistic', rnd).rewarded) e++;
    }
    expect(c / N).toBeGreaterThan(0.75);
    expect(c / N).toBeLessThan(0.85);
    expect(e / N).toBeGreaterThan(0.15);
    expect(e / N).toBeLessThan(0.25);
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

  it('does not advance below criterion, at any length short of the cap', () => {
    // Sweep rather than pick one length: a single n can silently coincide with
    // maxTrialsPerContext and pass for the wrong reason, which is what happened
    // when the cap was retuned.
    for (let n = MNC_CONFIG.minTrialsPerContext; n < MNC_CONFIG.maxTrialsPerContext; n++) {
      const poor = Array.from({ length: n }, (_, i) => i % 4 === 0); // 25%, chance
      expect(advanceDecision(poor, n)).toEqual({ advance: false, reason: null });
    }
  });

  it('advances for the stated reason, not merely at the right time', () => {
    const n = MNC_CONFIG.maxTrialsPerContext;
    const poor = Array.from({ length: n }, (_, i) => i % 4 === 0);
    expect(advanceDecision(poor, n).reason).toBe('cap');
    expect(advanceDecision(perfect(n), MNC_CONFIG.minTrialsPerContext).reason)
      .toBe('criterion');
  });

  it('advances on the cap even at chance, so one context cannot eat the session', () => {
    const n = MNC_CONFIG.maxTrialsPerContext;
    const poor = Array.from({ length: n }, (_, i) => i % 4 === 0);
    const d = advanceDecision(poor, n);
    expect(d.advance).toBe(true);
    expect(d.reason).toBe('cap');
  });
});

describe('context specs', () => {
  it('makes exactly the configured number of dimensions relevant', () => {
    for (const seed of ['a', 'b', 'c']) {
      for (const s of contextSpecs(seed, 40)) {
        expect(s.relevant).toHaveLength(MNC_CONFIG.relevantPerContext);
        expect(new Set(s.relevant).size).toBe(s.relevant.length);
      }
    }
  });

  it('changes WHICH dimensions are relevant between successive contexts', () => {
    // Keeping the same pair and only changing the values would let the old
    // rule carry over, so the next context would measure retention.
    for (const seed of ['a', 'b', 'c', 'd']) {
      const ss = contextSpecs(seed, 40);
      for (let i = 1; i < ss.length; i++) {
        expect(ss[i].relevant.join()).not.toBe(ss[i - 1].relevant.join());
      }
    }
  });

  it('lets every dimension serve as its own control', () => {
    // The paired comparison only exists if each dimension is relevant in some
    // contexts and irrelevant in others. A dimension present in every allowed
    // set would never be a control for itself, and one present in none would
    // never be measured.
    const sets = MNC_CONFIG.relevantSets;
    for (let d = 0; d < 4; d++) {
      const inSome = sets.some((s) => s.includes(d));
      const outOfSome = sets.some((s) => !s.includes(d));
      expect(inSome, `dimension ${d} is never relevant`).toBe(true);
      expect(outOfSome, `dimension ${d} is always relevant`).toBe(true);
    }
  });

  it('draws only from the allowed sets', () => {
    const allowed = new Set(MNC_CONFIG.relevantSets.map((s) => [...s].sort().join()));
    for (const s of contextSpecs('allowed', 60)) {
      expect(allowed.has(s.relevant.join())).toBe(true);
    }
  });

  it('gives every dimension a turn at being relevant and irrelevant', () => {
    // This is what makes the comparison paired within a dimension instead of
    // confounded with which dimension it happens to be.
    const ss = contextSpecs('coverage', 60);
    for (let d = 0; d < 4; d++) {
      const share = ss.filter((s) => s.relevant.includes(d)).length / ss.length;
      expect(share).toBeGreaterThan(0.25);
      expect(share).toBeLessThan(0.75);
    }
  });

  it('is reproducible from the seed', () => {
    const a = contextSpecs('same', 10).map((s) => s.relevant.join() + s.values.join());
    const b = contextSpecs('same', 10).map((s) => s.relevant.join() + s.values.join());
    expect(a).toEqual(b);
    expect(a).not.toEqual(
      contextSpecs('other', 10).map((s) => s.relevant.join() + s.values.join()),
    );
  });
});
