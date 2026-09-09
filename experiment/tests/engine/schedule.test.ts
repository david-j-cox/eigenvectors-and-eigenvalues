import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/utils/rng';
import {
  EXTINCTION_MS,
  applyDepletion,
  collect,
  effectiveIntervalMs,
  createCodState,
  createViState,
  drawInterval,
  isCodActive,
  retargetVi,
  startCod,
  tickCod,
  updateBaiting,
} from '../../src/engine/schedule';
import { DEFAULT_ENGINE_CONFIG } from '../../src/engine/types';

const cfg = DEFAULT_ENGINE_CONFIG;

describe('drawInterval', () => {
  it('averages close to the programmed mean', () => {
    const rng = createRng('vi');
    const n = 20000;
    let total = 0;
    for (let i = 0; i < n; i++) total += drawInterval(4000, rng, cfg);
    // Clamping at 0.1x and 3x pulls the mean slightly below the nominal value.
    expect(total / n).toBeGreaterThan(3200);
    expect(total / n).toBeLessThan(4200);
  });

  it('clamps to the configured multiples of the mean', () => {
    const rng = createRng('vi');
    for (let i = 0; i < 5000; i++) {
      const v = drawInterval(4000, rng, cfg);
      expect(v).toBeGreaterThanOrEqual(400);
      expect(v).toBeLessThanOrEqual(12000);
    }
  });

  it('treats an infinite mean as extinction', () => {
    expect(drawInterval(EXTINCTION_MS, createRng('x'), cfg)).toBe(EXTINCTION_MS);
  });
});

describe('baiting', () => {
  it('sets up a reinforcer once the interval elapses and keeps it until collected', () => {
    const rng = createRng('b');
    let vi = createViState(1000, 0, rng, cfg);
    vi = updateBaiting(vi, vi.nextBaitAtMs + 1, rng, cfg);
    expect(vi.baited).toBe(true);

    // Time passing does not discard a pending setup.
    vi = updateBaiting(vi, vi.nextBaitAtMs + 100000, rng, cfg);
    expect(vi.baited).toBe(true);
  });

  it('never baits under extinction', () => {
    const rng = createRng('b');
    let vi = createViState(EXTINCTION_MS, 0, rng, cfg);
    vi = updateBaiting(vi, 1e9, rng, cfg);
    expect(vi.baited).toBe(false);
  });
});

describe('collect', () => {
  it('delivers a baited reinforcer and clears the setup', () => {
    const rng = createRng('c');
    let vi = createViState(1000, 0, rng, cfg);
    vi = updateBaiting(vi, vi.nextBaitAtMs + 1, rng, cfg);
    const r = collect(vi, 5000, false);
    expect(r.delivered).toBe(true);
    expect(r.vi.baited).toBe(false);
  });

  it('withholds during a COD but does not discard the reinforcer', () => {
    const rng = createRng('c');
    let vi = createViState(1000, 0, rng, cfg);
    vi = updateBaiting(vi, vi.nextBaitAtMs + 1, rng, cfg);
    const blocked = collect(vi, 5000, true);
    expect(blocked.delivered).toBe(false);
    expect(blocked.withheldByCod).toBe(true);
    expect(blocked.vi.baited).toBe(true);

    const later = collect(blocked.vi, 9000, false);
    expect(later.delivered).toBe(true);
  });
});

describe('COD', () => {
  it('stays active until both the time and the response requirement are met', () => {
    let cod = startCod('A', 1000, 2000, 2);
    expect(isCodActive(cod, 1500)).toBe(true);

    // Time has elapsed but the response requirement has not been satisfied.
    expect(isCodActive(cod, 3000)).toBe(true);

    cod = tickCod(cod);
    expect(isCodActive(cod, 3000)).toBe(true);
    cod = tickCod(cod);
    expect(isCodActive(cod, 3000)).toBe(false);
  });

  it('stays active while responses are met but time has not elapsed', () => {
    let cod = startCod('A', 1000, 2000, 1);
    cod = tickCod(cod);
    expect(cod.responsesRemaining).toBe(0);
    expect(isCodActive(cod, 1500)).toBe(true);
    expect(isCodActive(cod, 3500)).toBe(false);
  });

  it('does not tick below zero', () => {
    let cod = startCod('A', 0, 0, 1);
    cod = tickCod(cod);
    cod = tickCod(cod);
    expect(cod.responsesRemaining).toBe(0);
  });

  it('is inactive before any changeover', () => {
    expect(isCodActive(createCodState(), 0)).toBe(false);
  });
});

describe('retargetVi', () => {
  it('rescales the pending setup rather than granting or delaying one', () => {
    const rng = createRng('r');
    const vi = { intervalMs: 4000, richness: 1, baited: false, nextBaitAtMs: 4000, lastReinforcerAtMs: 0 };
    const out = retargetVi(vi, 2000, 0, rng, cfg);
    // Half the mean interval, so half the remaining wait.
    expect(out.nextBaitAtMs).toBeCloseTo(2000, 5);
    expect(out.intervalMs).toBe(2000);
  });

  it('cancels a pending setup when moving to extinction', () => {
    const rng = createRng('r');
    const vi = { intervalMs: 4000, richness: 1, baited: true, nextBaitAtMs: 4000, lastReinforcerAtMs: 0 };
    const out = retargetVi(vi, EXTINCTION_MS, 0, rng, cfg);
    expect(out.baited).toBe(false);
    expect(out.nextBaitAtMs).toBe(Infinity);
  });

  it('restarts scheduling when leaving extinction', () => {
    const rng = createRng('r');
    const vi = { intervalMs: EXTINCTION_MS, richness: 1, baited: false, nextBaitAtMs: Infinity, lastReinforcerAtMs: 0 };
    const out = retargetVi(vi, 2000, 1000, rng, cfg);
    expect(Number.isFinite(out.nextBaitAtMs)).toBe(true);
    expect(out.nextBaitAtMs).toBeGreaterThan(1000);
  });

  it('is a no-op when the interval is unchanged', () => {
    const rng = createRng('r');
    const vi = createViState(4000, 0, rng, cfg);
    expect(retargetVi(vi, 4000, 500, rng, cfg)).toBe(vi);
  });
});

describe('depletion', () => {
  const withDepletion = {
    ...cfg,
    depletion: { enabled: true, perResponse: 0.1, recoveryPerS: 0.05, minRichness: 0.2 },
  };

  it('leans the harvested alternative and enriches the neglected one', () => {
    const rng = createRng('d');
    const a = createViState(2000, 0, rng, withDepletion);
    const b = { ...createViState(2000, 0, rng, withDepletion), richness: 0.5 };

    const out = applyDepletion(a, b, 2, withDepletion);
    expect(out.chosen.richness).toBeLessThan(1);
    // The neglected alternative recovered over the same two seconds.
    expect(out.other.richness).toBeCloseTo(0.6, 5);
  });

  it('never depletes an alternative below the floor', () => {
    const rng = createRng('d');
    let a = createViState(2000, 0, rng, withDepletion);
    const b = createViState(2000, 0, rng, withDepletion);
    for (let i = 0; i < 500; i++) {
      a = applyDepletion(a, b, 0, withDepletion).chosen;
    }
    expect(a.richness).toBeCloseTo(withDepletion.depletion.minRichness, 5);
  });

  it('never enriches past the programmed schedule', () => {
    const rng = createRng('d');
    const a = createViState(2000, 0, rng, withDepletion);
    const b = { ...createViState(2000, 0, rng, withDepletion), richness: 0.9 };
    expect(applyDepletion(a, b, 1000, withDepletion).other.richness).toBe(1);
  });

  it('lengthens the effective interval as richness falls', () => {
    const rng = createRng('d');
    const vi = { ...createViState(2000, 0, rng, withDepletion), richness: 0.5 };
    expect(effectiveIntervalMs(vi)).toBeCloseTo(4000, 5);
  });

  it('does nothing when disabled', () => {
    const off = { ...cfg, depletion: { ...cfg.depletion, enabled: false } };
    const rng = createRng('d');
    const a = createViState(2000, 0, rng, off);
    const b = createViState(2000, 0, rng, off);
    const out = applyDepletion(a, b, 5, off);
    expect(out.chosen.richness).toBe(1);
    expect(out.other.richness).toBe(1);
  });
});
