import { describe, expect, it } from 'vitest';
import { CalibratedHumanAgent, simulateSession } from '../../src/engine/simulate';
import calibration from '../../src/engine/human_calibration.json';

/**
 * The calibrated agent exists so that claims about the changeover delay and
 * about depletion rest on human switching statistics rather than on parameters
 * chosen to make a number look reasonable. That only holds if the agent
 * actually reproduces those statistics, which is what these tests check.
 *
 * Targets come from the 60 participants in the previous study.
 */
/**
 * Per-condition targets. Switching depends on the schedule in force, so an
 * agent drawn from one pool must be checked against that pool's numbers, not
 * against an average across conditions that describes no condition at all.
 */
const HUMAN = {
  asymmetric: {
    switchRate: 0.161,
    pSwitchAfterReward: 0.105,
    pSwitchAfterNone: 0.250,
    meanRun: 6.07,
    responsesPerSecond: 2.87,
  },
  lean: {
    switchRate: 0.230,
    pSwitchAfterReward: 0.134,
    pSwitchAfterNone: 0.294,
    meanRun: 4.11,
    responsesPerSecond: 2.90,
  },
} as const;

function runSample(n: number, pool: 'asymmetric' | 'lean' = 'asymmetric') {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const agent = new CalibratedHumanAgent(i, pool);
    const { outcomes, durationMs } = simulateSession(`cal-${pool}-${i}`, agent);
    const usable = outcomes.filter((o) => !o.perturbationActive);
    const afterReward = usable.filter((_, k) => k > 0 && usable[k - 1].rewardOutcome === 1);
    const afterNone = usable.filter((_, k) => k > 0 && usable[k - 1].rewardOutcome === 0);
    const switches = usable.filter((o) => o.switched).length;
    rows.push({
      switchRate: switches / usable.length,
      pSwitchAfterReward:
        afterReward.filter((o) => o.switched).length / Math.max(afterReward.length, 1),
      pSwitchAfterNone:
        afterNone.filter((o) => o.switched).length / Math.max(afterNone.length, 1),
      meanRun: usable.length / Math.max(switches, 1),
      responsesPerSecond: outcomes.length / (durationMs / 1000),
    });
  }
  return rows;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

describe('CalibratedHumanAgent', () => {
  it('draws its parameters from the pool it was given', () => {
    expect(Object.keys(calibration.pools)).toContain('asymmetric');
    expect(calibration.pools.asymmetric.source_phases).toEqual([2, 3]);
    expect(calibration.pools.lean.source_phases).toEqual([4]);

    const a = new CalibratedHumanAgent(0, 'asymmetric');
    expect(a.logIciMean).toBe(calibration.pools.asymmetric.participants[0].log_ici_mean);
  });

  it('keeps the two pools distinct rather than collapsing to one responder set', () => {
    // The lean condition produced more switching than the asymmetric one. An
    // agent that ignored the pool would erase the difference the design has to
    // be robust to.
    expect(calibration.pools.lean.median_p_switch_after_none).toBeGreaterThan(
      calibration.pools.asymmetric.median_p_switch_after_none,
    );
  });

  for (const pool of ['asymmetric', 'lean'] as const) {
    describe(`pool: ${pool}`, () => {
      const sample = runSample(20, pool);
      const target = HUMAN[pool];

      it('reproduces that condition\'s switch rate', () => {
        const got = median(sample.map((r) => r.switchRate));
        expect(got).toBeGreaterThan(target.switchRate * 0.5);
        expect(got).toBeLessThan(target.switchRate * 2.0);
      });

      it('reproduces the win-stay / lose-shift asymmetry', () => {
        const afterReward = median(sample.map((r) => r.pSwitchAfterReward));
        const afterNone = median(sample.map((r) => r.pSwitchAfterNone));
        // The direction is what matters for a changeover delay: an agent that
        // switched just as readily after reinforcement would spend a quite
        // different amount of time inside the delay.
        expect(afterNone).toBeGreaterThan(afterReward);
        expect(afterReward).toBeLessThan(target.pSwitchAfterReward * 2.5);
        expect(afterNone).toBeLessThan(target.pSwitchAfterNone * 2.5);
      });

      it('produces run lengths in the right range', () => {
        const got = median(sample.map((r) => r.meanRun));
        expect(got).toBeGreaterThan(target.meanRun * 0.4);
        expect(got).toBeLessThan(target.meanRun * 4);
      });

      it('responds at the rate real participants did', () => {
        const got = median(sample.map((r) => r.responsesPerSecond));
        expect(got).toBeGreaterThan(target.responsesPerSecond * 0.7);
        expect(got).toBeLessThan(target.responsesPerSecond * 1.3);
      });

      it('spans the between-participant range', () => {
        const rates = sample.map((r) => r.switchRate).sort((a, b) => a - b);
        expect(rates[rates.length - 1] - rates[0]).toBeGreaterThan(0.03);
      });
    });
  }
});
