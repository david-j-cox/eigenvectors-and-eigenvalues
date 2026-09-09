#!/usr/bin/env tsx
/**
 * Simulate whole sessions and export them in the real event schema.
 *
 * This closes the loop between the design simulation in reanalysis/ and the
 * task as actually built: the exported CSV goes through the same state
 * construction and noise diagnostics as real data, so a design that cannot
 * support the analysis is caught here rather than after data collection.
 *
 * Usage:
 *   npx tsx scripts/pilot_check.ts [--n 20] [--ici 500] [--out PATH]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { MatchingAgent, MeliorationAgent, RandomAgent, simulateSession } from '../src/engine/simulate';
import { toCsv, toEventRow } from '../src/logging/schema';
import type { EventRow } from '../src/logging/schema';
import { EXPERIMENT_VERSION, DEFAULT_DESIGN, ENGINE } from '../src/config/task';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const nSessions = Number(arg('n', '20'));
const meanIci = Number(arg('ici', '500'));
const outPath = resolve(process.cwd(), arg('out', '../analysis/data/simulated_events.csv'));
// Depletion is on by default; --no-depletion produces the stationary-VI
// comparison used to justify keeping it.
const depletionOff = process.argv.includes('--no-depletion');
ENGINE.depletion = {
  ...ENGINE.depletion,
  enabled: !depletionOff,
  perResponse: Number(arg('deplete', String(ENGINE.depletion.perResponse))),
  recoveryPerS: Number(arg('recover', String(ENGINE.depletion.recoveryPerS))),
  minRichness: Number(arg('min-richness', String(ENGINE.depletion.minRichness))),
};

const rows: EventRow[] = [];
const summaries: string[] = [];

for (let i = 0; i < nSessions; i++) {
  const seed = `sim-participant-${String(i + 1).padStart(3, '0')}`;
  // Mix agent types and response rates so the diagnostics are not tuned to one
  // idealized responder.
  // Mostly melioration agents with varied parameters, plus one degenerate
  // responder of each kind so the diagnostics see the worst cases too.
  const agent =
    i % 10 === 0
      ? new RandomAgent()
      : i % 10 === 5
        ? new MatchingAgent(0.9)
        : new MeliorationAgent(0.1 + 0.1 * ((i % 3) / 3), 5 + 2 * ((i % 4) / 4), 0.04 + 0.04 * ((i % 5) / 5), 1.8 + 0.8 * ((i % 3) / 3));
  const ici = meanIci * (0.7 + 0.6 * ((i % 7) / 7));

  const { outcomes, durationMs, plan } = simulateSession(seed, agent, ici);
  const startedAt = Date.now();

  for (const o of outcomes) {
    rows.push(
      toEventRow(
        o,
        plan.blocks[o.blockIndex],
        plan,
        {
          participantId: seed,
          prolificPid: null,
          studyId: null,
          prolificSessionId: null,
          sessionId: `${seed}-session`,
          experimentVersion: EXPERIMENT_VERSION,
        },
        {
          pageVisible: true,
          fullscreenActive: true,
          focusLostCount: 0,
          browserWidth: 1440,
          browserHeight: 900,
          inputMethod: 'keyboard',
        },
        startedAt,
      ),
    );
  }

  const rewards = outcomes.filter((o) => o.rewardOutcome === 1).length;
  const switches = outcomes.filter((o) => o.switched).length;
  summaries.push(
    `${seed}  responses=${outcomes.length}  minutes=${(durationMs / 60000).toFixed(1)}  ` +
      `rewards/bin=${((rewards / outcomes.length) * DEFAULT_DESIGN.stateBinResponses).toFixed(2)}  ` +
      `switch_rate=${(switches / outcomes.length).toFixed(3)}  ` +
      `resp/s=${(outcomes.length / (durationMs / 1000)).toFixed(2)}`,
  );
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, toCsv(rows), 'utf-8');

console.log(summaries.join('\n'));
console.log(
  `\nWrote ${rows.length.toLocaleString()} events for ${nSessions} sessions to ${outPath}`,
);
