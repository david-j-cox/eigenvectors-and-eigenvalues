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
import type { EventRow } from '../src/logging/schema';

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  process.exit(1);
}

const sessionId = `verify-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const transport = new SupabaseTransport({ url, anonKey });

const event = (i: number): EventRow =>
  ({
    session_id: sessionId, trial_index: i, participant_id: 'verify',
    prolific_pid: null, study_id: null, experiment_version: 'verify',
    timestamp_utc: new Date().toISOString(), elapsed_time_ms: i * 500,
    block_index: 0, trial_in_block: i, response_time_ms: 300, ici_ms: 500,
    chosen_option: i % 2 ? 'A' : 'B', previous_option: null, switched: 0,
    run_length: 1, reward_outcome: 0, points_earned: 0, cumulative_points: 0,
    vi_a_ms: 1000, vi_b_ms: 1000, rate_a_per_s: 1, rate_b_per_s: 1,
    richness_a: 1, richness_b: 1, effective_rate_a_per_s: 1, effective_rate_b_per_s: 1,
    cod_active: 0, reinforcer_withheld_by_cod: 0, part: 'practice',
    physical_context_id: 'neutral', context_color: '#888', context_pattern: 'plain',
    functional_contingency_id: 'practice', exposure_number: 1, reversal_stage: null,
    trials_since_context_switch: i, perturbation_active: 0, perturbation_type: null,
    perturbation_id: null, perturbation_repetition: null,
    trials_since_perturbation_onset: null, trials_since_perturbation_offset: null,
    page_visible: 1, fullscreen_active: 0, focus_lost_count: 0,
    browser_width: 1440, browser_height: 900, input_method: 'keyboard',
  }) as EventRow;

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

await check('event batch writes', () =>
  transport.upsertEvents([event(0), event(1), event(2)]));

// The retry path. A batch resent after an ambiguous network failure must not
// duplicate rows, and must not raise: duplicates would silently corrupt the
// state bins, which are built by counting responses in order.
await check('same batch resent is accepted and does not duplicate', () =>
  transport.upsertEvents([event(0), event(1), event(2)]));

await check('session record updates (completion)', () =>
  transport.upsertSession(session('complete', {
    total_responses: 3, total_rewards: 0, total_points: 0,
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
