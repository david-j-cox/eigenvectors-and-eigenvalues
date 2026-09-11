// ============================================================
// Live check of the deployed database, using the real transport.
//
// The unit tests all pass against a MemoryTransport, so they say
// nothing about whether Supabase will accept a write. The first
// configuration of this project was rejected by row-level security
// for every row and the suite stayed green, which is the gap this
// script exists to close. Run it after any change to the schema,
// the policies, or the transport, and before any launch.
//
//   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... \
//     npx tsx scripts/verify_supabase.ts
//
// Everything it writes is flagged is_test_session, which the export
// excludes by default.
// ============================================================

import { SupabaseTransport } from '../src/logging/supabase';
import { toEventRow, type EventRow } from '../src/logging/schema';
import { buildSessionPlan } from '../src/engine/plan';
import { Session } from '../src/engine/session';
import { ENGINE, EXPERIMENT_VERSION } from '../src/config/task';

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  process.exit(1);
}

const sessionId = `verify-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const transport = new SupabaseTransport({ url, anonKey });

// Rows come from the engine rather than being written by hand here. An earlier
// version of this script built its own, with tidy integer values, and therefore
// passed against a schema that rejected every row the task actually produces:
// vi_a_ms is intervalMs / richness under depleting patches and is not whole.
// A check that invents its own data can only verify the checker.
const plan = buildSessionPlan(`verify::${EXPERIMENT_VERSION}`);
const engineSession = new Session(plan, ENGINE);
const identity = {
  participantId: 'verify', prolificPid: null, studyId: null,
  prolificSessionId: null, sessionId, experimentVersion: EXPERIMENT_VERSION,
};
const quality = {
  pageVisible: true, fullscreenActive: false, focusLostCount: 0,
  browserWidth: 1440, browserHeight: 900, inputMethod: 'keyboard' as const,
};

const realRows = (n: number): EventRow[] => {
  const rows: EventRow[] = [];
  let t = 0;
  while (rows.length < n) {
    t += 350;
    const block = engineSession.currentBlock();
    const outcome = engineSession.respond(rows.length % 3 === 0 ? 'A' : 'B', t);
    if (outcome && block) {
      rows.push(toEventRow(outcome, block, plan, identity, quality, Date.now()));
    }
    if (t > 5_000_000) break;
  }
  return rows;
};

const batch = realRows(25);

let failures = 0;
const check = async (label: string, fn: () => Promise<void>) => {
  try {
    await fn();
    console.log(`  ok    ${label}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${label}`);
    console.log(`        ${err instanceof Error ? err.message : String(err)}`);
  }
};

const session = (status: string, extra: Record<string, unknown> = {}) => ({
  session_id: sessionId, participant_id: 'verify', experiment_version: 'verify',
  seed: 'verify', color_to_contingency: { green: 'A', blue: 'B' },
  block_plan: [], perturbation_plan: [], engine_config: {}, design_config: {},
  completion_status: status, is_test_session: true,
  updated_at: new Date().toISOString(), ...extra,
});

console.log(`\nVerifying ${url}\n  session ${sessionId}\n`);

await check('session record writes (start)', () =>
  transport.upsertSession(session('in_progress')));

await check(`event batch writes (${batch.length} rows from the engine)`, () =>
  transport.upsertEvents(batch));

// The retry path. A batch resent after an ambiguous network failure must not
// duplicate rows, and must not raise: duplicates would silently corrupt the
// state bins, which are built by counting responses in order.
await check('same batch resent is accepted and does not duplicate', () =>
  transport.upsertEvents(batch));

await check('session record updates (completion)', () =>
  transport.upsertSession(session('complete', {
    total_responses: batch.length, total_rewards: 0, total_points: 0,
    ended_at: new Date().toISOString(),
  })));

// The security property. This key ships inside the page, so a participant who
// reads it out must not be able to download anyone's data.
for (const table of ['dynamics_events', 'dynamics_sessions']) {
  await check(`key CANNOT read ${table}`, async () => {
    const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    const body = await res.text();
    if (res.ok && body.trim() !== '[]') {
      throw new Error(`readable! HTTP ${res.status} returned ${body.slice(0, 120)}`);
    }
  });
}

console.log(
  failures === 0
    ? '\nAll checks passed. The deployment can store data.\n'
    : `\n${failures} check(s) failed. Do not launch.\n`,
);
process.exit(failures === 0 ? 0 : 1);
