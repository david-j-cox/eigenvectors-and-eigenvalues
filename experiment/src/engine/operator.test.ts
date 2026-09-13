import { describe, expect, it } from 'vitest';

import { createRng } from '../utils/rng';
import { OPERATOR_CONFIG as C } from '../config/operator';
import { buildSession, scoreResponse, type ResponseSlot } from './operator';

const SEEDS = ['p1', 'p2', 'p3', 'p4', 'p5'];
const sessions = SEEDS.map((s) => buildSession(s));

describe('session structure', () => {
  it('generates one slot per response, practice first', () => {
    for (const s of sessions) {
      expect(s).toHaveLength(C.totalResponses);
      expect(s.filter((x) => x.isPractice)).toHaveLength(C.practiceResponses);
      expect(s.slice(0, C.practiceResponses).every((x) => x.isPractice)).toBe(true);
    }
  });

  it('reverses the favoured panel at every block boundary', () => {
    // Each boundary must be a reversal; a boundary that repeated the previous
    // state would not be a replication of anything.
    for (const s of sessions) {
      const byBlock = new Map<number, string>();
      for (const x of s) {
        if (x.block >= 0) byBlock.set(x.block, x.blockRich);
      }
      const blocks = [...byBlock.keys()].sort((a, b) => a - b);
      for (let i = 1; i < blocks.length; i++) {
        expect(byBlock.get(blocks[i])).not.toBe(byBlock.get(blocks[i - 1]));
      }
    }
  });

  it('holds the favoured panel constant within a block', () => {
    for (const s of sessions) {
      const seen = new Map<number, Set<string>>();
      for (const x of s) {
        if (x.block < 0) continue;
        if (!seen.has(x.block)) seen.set(x.block, new Set());
        seen.get(x.block)!.add(x.blockRich);
      }
      for (const [, set] of seen) expect(set.size).toBe(1);
    }
  });
});

describe('perturbations', () => {
  const runs = (s: ResponseSlot[]) => {
    const out: { start: number; len: number; block: number }[] = [];
    let i = 0;
    while (i < s.length) {
      if (!s[i].perturbationActive) { i++; continue; }
      const start = i;
      while (i < s.length && s[i].perturbationActive) i++;
      out.push({ start, len: i - start, block: s[start].block });
    }
    return out;
  };

  it('lasts exactly the configured number of responses', () => {
    for (const s of sessions) {
      for (const r of runs(s)) expect(r.len).toBe(C.perturbationResponses);
    }
  });

  it('falls entirely within one block', () => {
    for (const s of sessions) {
      for (const r of runs(s)) {
        const blocks = new Set(
          s.slice(r.start, r.start + r.len).map((x) => x.block),
        );
        expect(blocks.size).toBe(1);
      }
    }
  });

  it('reverses the favoured panel while active and restores it after', () => {
    for (const s of sessions) {
      for (const x of s) {
        if (x.block < 0) continue;
        if (x.perturbationActive) expect(x.effectiveRich).not.toBe(x.blockRich);
        else expect(x.effectiveRich).toBe(x.blockRich);
      }
    }
  });

  it('leaves the recovery window free of momentary stimuli', () => {
    // The return has to be observed without further disturbance; a stimulus
    // inside the window would perturb the very decay being measured.
    for (const s of sessions) {
      for (const x of s) {
        const inWindow = x.perturbationActive
          || (x.sincePerturbation !== null
              && x.sincePerturbation < C.perturbationRecovery);
        if (inWindow) expect(x.stimulus).toBe('none');
      }
    }
  });

  it('fits the recovery window inside the block that holds it', () => {
    for (const s of sessions) {
      for (const r of runs(s)) {
        const end = r.start + r.len + C.perturbationRecovery - 1;
        expect(s[Math.min(end, s.length - 1)].block).toBe(r.block);
      }
    }
  });
});

describe('momentary stimuli', () => {
  const gaps = (s: ResponseSlot[], kind: 'appetitive' | 'aversive') => {
    const at = s.map((x, i) => (x.stimulus === kind ? i : -1)).filter((i) => i >= 0);
    return at.slice(1).map((v, i) => v - at[i]);
  };

  it('never occurs closer together than the floor', () => {
    // Without the floor, successive occurrences land inside one another's
    // recovery windows and no lag beyond the mean gap is interpretable.
    for (const s of sessions) {
      for (const kind of ['appetitive', 'aversive'] as const) {
        for (const g of gaps(s, kind)) {
          expect(g).toBeGreaterThanOrEqual(C.minStimulusGap);
        }
      }
    }
  });

  it('occurs often enough to estimate from', () => {
    for (const s of sessions) {
      for (const kind of ['appetitive', 'aversive'] as const) {
        const n = s.filter((x) => x.stimulus === kind).length;
        expect(n).toBeGreaterThan(40);
      }
    }
  });

  it('never shows both kinds on the same response', () => {
    for (const s of sessions) {
      for (const x of s) {
        if (x.stimulus !== 'none') expect(x.stimulusSide).not.toBeNull();
      }
    }
  });

  it('is only partially congruent with the favoured panel', () => {
    // Uncorrelated, a stimulus has no discriminative function; perfectly
    // correlated, its column carries no variance the block state does not.
    const rate = (kind: 'appetitive' | 'aversive') => {
      let hit = 0, tot = 0;
      for (const s of sessions) {
        for (const x of s) {
          if (x.stimulus !== kind || x.block < 0) continue;
          tot++;
          if (x.stimulusSide === x.blockRich) hit++;
        }
      }
      return hit / tot;
    };
    expect(rate('appetitive')).toBeGreaterThan(0.45);
    expect(rate('appetitive')).toBeLessThan(0.75);
    expect(rate('aversive')).toBeGreaterThan(0.25);
    expect(rate('aversive')).toBeLessThan(0.55);
    expect(rate('appetitive')).toBeGreaterThan(rate('aversive'));
  });
});

describe('reinforcement probabilities', () => {
  it('matches the state on ordinary responses', () => {
    for (const s of sessions) {
      for (const x of s) {
        if (x.stimulus !== 'none') continue;
        if (x.effectiveRich === 'left') {
          expect(x.pLeft).toBeCloseTo(C.pRich);
          expect(x.pRight).toBeCloseTo(C.pLean);
        } else if (x.effectiveRich === 'right') {
          expect(x.pRight).toBeCloseTo(C.pRich);
          expect(x.pLeft).toBeCloseTo(C.pLean);
        } else {
          expect(x.pLeft).toBeCloseTo(C.pNeutral);
          expect(x.pRight).toBeCloseTo(C.pNeutral);
        }
      }
    }
  });

  it('is superseded by an appetitive stimulus for that response only', () => {
    for (const s of sessions) {
      for (const x of s) {
        if (x.stimulus !== 'appetitive') continue;
        const signalled = x.stimulusSide === 'left' ? x.pLeft : x.pRight;
        const other = x.stimulusSide === 'left' ? x.pRight : x.pLeft;
        expect(signalled).toBeCloseTo(C.pAppetitiveSignalled);
        expect(other).toBeCloseTo(C.pAppetitiveOther);
      }
    }
  });

  it('is unchanged by an aversive stimulus', () => {
    for (const s of sessions) {
      for (const x of s) {
        if (x.stimulus !== 'aversive') continue;
        const expected = x.effectiveRich === 'left'
          ? [C.pRich, C.pLean]
          : x.effectiveRich === 'right' ? [C.pLean, C.pRich]
          : [C.pNeutral, C.pNeutral];
        expect(x.pLeft).toBeCloseTo(expected[0]);
        expect(x.pRight).toBeCloseTo(expected[1]);
      }
    }
  });
});

describe('scoring', () => {
  it('subtracts a point for choosing the aversive panel', () => {
    const rnd = createRng('score');
    const slot = sessions[0].find((x) => x.stimulus === 'aversive')!;
    const o = scoreResponse(slot, slot.stimulusSide!, rnd);
    expect(o.pointsDelta).toBe(-C.aversiveCost);
    expect(o.rewarded).toBe(false);
  });

  it('pays the unmarked panel normally on an aversive response', () => {
    const rnd = createRng('score2');
    const slot = sessions[0].find((x) => x.stimulus === 'aversive')!;
    const other = slot.stimulusSide === 'left' ? 'right' : 'left';
    let paid = 0;
    for (let i = 0; i < 3000; i++) {
      if (scoreResponse(slot, other, rnd).rewarded) paid++;
    }
    const expected = other === 'left' ? slot.pLeft : slot.pRight;
    expect(paid / 3000).toBeGreaterThan(expected - 0.05);
    expect(paid / 3000).toBeLessThan(expected + 0.05);
  });

  it('pays at the slot probability on ordinary responses', () => {
    const rnd = createRng('score3');
    const slot = sessions[0].find(
      (x) => x.stimulus === 'none' && x.effectiveRich === 'left' && !x.isPractice,
    )!;
    let paid = 0;
    for (let i = 0; i < 4000; i++) {
      if (scoreResponse(slot, 'left', rnd).rewarded) paid++;
    }
    expect(paid / 4000).toBeGreaterThan(C.pRich - 0.04);
    expect(paid / 4000).toBeLessThan(C.pRich + 0.04);
  });
});
