#!/usr/bin/env tsx
/**
 * Re-test the two parameter choices that simulated sessions decided, using
 * responders calibrated to real human switching statistics rather than to
 * hand-chosen values.
 *
 * Both questions -- how long the changeover delay should be, and whether to
 * deplete the alternatives -- turn on how often a participant changes over and
 * how fast they respond. Those are exactly the quantities
 * `human_calibration.json` supplies, so this sweep is the version of the
 * earlier comparison that is anchored to behaviour rather than to a guess.
 *
 * Usage: npx tsx scripts/parameter_sweep.ts [--n 24]
 */

import { CalibratedHumanAgent, simulateSession } from '../src/engine/simulate';
import { ENGINE } from '../src/config/task';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const N = Number(arg('n', '24'));
const BIN = 10;

interface Row {
  rewardsPerBin: number;
  switchRate: number;
  codBlockedShare: number;
  responsesPerSecond: number;
  minutes: number;
}

function run(label: string): Row {
  const rows: Row[] = [];
  for (let i = 0; i < N; i++) {
    const { outcomes, durationMs } = simulateSession(
      `sweep-${label}-${i}`,
      new CalibratedHumanAgent(i),
    );
    const usable = outcomes.filter((o) => !o.perturbationActive);
    rows.push({
      rewardsPerBin: (usable.filter((o) => o.rewardOutcome === 1).length / usable.length) * BIN,
      switchRate: usable.filter((o) => o.switched).length / usable.length,
      codBlockedShare: usable.filter((o) => o.codActive).length / usable.length,
      responsesPerSecond: outcomes.length / (durationMs / 1000),
      minutes: durationMs / 60000,
    });
  }
  const med = (f: (r: Row) => number) => {
    const s = rows.map(f).sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  return {
    rewardsPerBin: med((r) => r.rewardsPerBin),
    switchRate: med((r) => r.switchRate),
    codBlockedShare: med((r) => r.codBlockedShare),
    responsesPerSecond: med((r) => r.responsesPerSecond),
    minutes: med((r) => r.minutes),
  };
}

function show(label: string, r: Row) {
  console.log(
    `${label.padEnd(30)} rewards/bin=${r.rewardsPerBin.toFixed(2)}  ` +
      `switch=${r.switchRate.toFixed(3)}  in-COD=${(r.codBlockedShare * 100).toFixed(0)}%  ` +
      `resp/s=${r.responsesPerSecond.toFixed(2)}  min=${r.minutes.toFixed(1)}`,
  );
}

const originalCod = { ms: ENGINE.codMs, responses: ENGINE.codResponses };
const originalDepletion = { ...ENGINE.depletion };

console.log(`Calibrated responders, n=${N}. Medians across simulated participants.\n`);

console.log('--- changeover delay ---');
for (const [ms, responses] of [
  [0, 0], [500, 1], [750, 1], [1000, 1], [1500, 1], [2000, 1], [2000, 2], [3000, 2],
] as const) {
  ENGINE.codMs = ms;
  ENGINE.codResponses = responses;
  show(`COD ${ms}ms + ${responses} resp`, run(`cod-${ms}-${responses}`));
}
ENGINE.codMs = originalCod.ms;
ENGINE.codResponses = originalCod.responses;

console.log('\n--- depletion ---');
for (const [enabled, perResponse, recoveryPerS, minRichness] of [
  [false, 0, 0, 1],
  [true, 0.06, 0.09, 0.15],
  [true, 0.15, 0.2, 0.08],
  [true, 0.25, 0.3, 0.05],
  [true, 0.4, 0.45, 0.03],
] as const) {
  ENGINE.depletion = { enabled, perResponse, recoveryPerS, minRichness };
  const label = enabled ? `deplete ${perResponse} / rec ${recoveryPerS}` : 'stationary (no depletion)';
  show(label, run(`dep-${perResponse}`));
}
ENGINE.depletion = originalDepletion;
