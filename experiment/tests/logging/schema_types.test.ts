import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildSessionPlan } from '../../src/engine/plan';
import { Session } from '../../src/engine/session';
import { toEventRow } from '../../src/logging/schema';
import { ENGINE, EXPERIMENT_VERSION } from '../../src/config/task';

/**
 * Every value must satisfy the column type it is about to be written into.
 *
 * The unit suite logs through a MemoryTransport, which accepts anything, so a
 * type mismatch between an event row and its column is invisible here and shows
 * up only as a rejected insert against the real database. That happened: the
 * depleting-patch schedule made the effective interval `intervalMs / richness`,
 * vi_a_ms stopped being whole, and Postgres refused every row of a pilot
 * session with `invalid input syntax for type integer: "500.00000000000006"`.
 *
 * The integer columns are read out of the migration rather than listed here, so
 * adding one to the schema brings it under this check automatically.
 */
const migration = readFileSync(
  fileURLToPath(new URL('../../supabase/migrations/001_create_tables.sql', import.meta.url)),
  'utf8',
);

const eventsDdl = migration.slice(
  migration.indexOf('create table if not exists dynamics_events'),
);

const integerColumns = [...eventsDdl.matchAll(/^\s{2}([a-z_]+)\s+(?:integer|smallint)\b/gm)]
  .map((m) => m[1]);

describe('event rows match their column types', () => {
  it('found the integer columns in the migration', () => {
    expect(integerColumns.length).toBeGreaterThan(10);
    expect(integerColumns).toContain('vi_a_ms');
  });

  it('writes whole numbers into every integer column', () => {
    const plan = buildSessionPlan(`typecheck::${EXPERIMENT_VERSION}`);
    const session = new Session(plan, ENGINE);
    const identity = {
      participantId: 'typecheck', prolificPid: null, studyId: null,
      prolificSessionId: null, sessionId: 'typecheck', experimentVersion: EXPERIMENT_VERSION,
    };
    const quality = {
      pageVisible: true, fullscreenActive: false, focusLostCount: 0,
      browserWidth: 1440, browserHeight: 900, inputMethod: 'keyboard' as const,
    };

    // Long enough to reach the depleting patches and the perturbations, which is
    // where the non-integer values came from.
    const offenders = new Map<string, unknown>();
    let t = 0;
    for (let i = 0; i < 3000; i++) {
      t += 350;
      const block = session.currentBlock();
      const outcome = session.respond(i % 3 === 0 ? 'A' : 'B', t);
      if (!outcome || !block) continue;
      const row = toEventRow(outcome, block, plan, identity, quality, 0) as unknown as Record<string, unknown>;
      for (const col of integerColumns) {
        const v = row[col];
        if (v === null || v === undefined) continue;
        if (typeof v !== 'number' || !Number.isInteger(v)) offenders.set(col, v);
      }
    }
    expect([...offenders.entries()]).toEqual([]);
  });
});
