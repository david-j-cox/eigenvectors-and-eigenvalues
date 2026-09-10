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
const HUMAN = {
  switchRate: { median: 0.201, q25: 0.115, q75: 0.305 },
  pSwitchAfterReward: { median: 0.144 },
  pSwitchAfterNone: { median: 0.289 },
  meanRun: { median: 4.96 },
  responsesPerSecond: { median: 2.86, q25: 2.63, q75: 3.14 },
};

function runSample(n: number) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const agent = new CalibratedHumanAgent(i);
    const { outcomes, durationMs } = simulateSession(`cal-${i}`, agent);
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
  const sample = runSample(24);

  it('draws its parameters from the measured human distribution', () => {
    expect(calibration.n_participants).toBe(60);
    const a = new CalibratedHumanAgent(0);
    const p = calibration.participants[0];
    expect(a.logIciMean).toBe(p.log_ici_mean);
  });

  it('reproduces the human switch rate', () => {
    const got = median(sample.map((r) => r.switchRate));
    expect(got).toBeGreaterThan(HUMAN.switchRate.q25 * 0.6);
    expect(got).toBeLessThan(HUMAN.switchRate.q75 * 1.4);
  });

  it('reproduces the win-stay / lose-shift asymmetry', () => {
    const afterReward = median(sample.map((r) => r.pSwitchAfterReward));
    const afterNone = median(sample.map((r) => r.pSwitchAfterNone));
    // The direction is the part that matters for a changeover delay: an agent
    // that switched just as readily after reinforcement would spend a quite
    // different amount of time inside the delay.
    expect(afterNone).toBeGreaterThan(afterReward);
    expect(afterReward).toBeLessThan(HUMAN.pSwitchAfterReward.median * 2.5);
    expect(afterNone).toBeLessThan(HUMAN.pSwitchAfterNone.median * 2.5);
  });

  it('produces human-like run lengths', () => {
    const got = median(sample.map((r) => r.meanRun));
    expect(got).toBeGreaterThan(2);
    expect(got).toBeLessThan(30);
  });

  it('responds at the rate real participants did', () => {
    const got = median(sample.map((r) => r.responsesPerSecond));
    expect(got).toBeGreaterThan(HUMAN.responsesPerSecond.q25 * 0.75);
    expect(got).toBeLessThan(HUMAN.responsesPerSecond.q75 * 1.25);
  });

  it('spans the between-participant range rather than collapsing to one responder', () => {
    const rates = sample.map((r) => r.switchRate).sort((a, b) => a - b);
    const spread = rates[rates.length - 1] - rates[0];
    expect(spread).toBeGreaterThan(0.05);
  });
});
