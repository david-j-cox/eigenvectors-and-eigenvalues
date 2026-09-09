import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventLogger, MemoryTransport } from '../../src/logging/logger';
import { toEventRow } from '../../src/logging/schema';
import type { EventRow } from '../../src/logging/schema';
import { buildSessionPlan } from '../../src/engine/plan';
import { simulateSession } from '../../src/engine/simulate';
import { EXPERIMENT_VERSION } from '../../src/config/task';

const plan = buildSessionPlan('log-seed');
const { outcomes } = simulateSession('log-seed');

function row(i: number): EventRow {
  const o = outcomes[i];
  return toEventRow(
    o,
    plan.blocks[o.blockIndex],
    plan,
    {
      participantId: 'p1', prolificPid: null, studyId: null,
      prolificSessionId: null, sessionId: 's1',
      experimentVersion: EXPERIMENT_VERSION,
    },
    {
      pageVisible: true, fullscreenActive: true, focusLostCount: 0,
      browserWidth: 1440, browserHeight: 900, inputMethod: 'keyboard',
    },
    0,
  );
}

describe('EventLogger', () => {
  let transport: MemoryTransport;
  let logger: EventLogger;

  beforeEach(() => {
    transport = new MemoryTransport();
    logger = new EventLogger(transport, { batchSize: 10, maxRetries: 2 });
  });

  it('flushes automatically once the batch size is reached', async () => {
    for (let i = 0; i < 10; i++) logger.log(row(i));
    await vi.waitFor(() => expect(transport.events).toHaveLength(10));
    expect(logger.pendingCount).toBe(0);
  });

  it('does not wait for the end of the session to send anything', async () => {
    for (let i = 0; i < 25; i++) logger.log(row(i));
    await vi.waitFor(() => expect(transport.events.length).toBeGreaterThanOrEqual(20), {
      timeout: 5000,
    });
  });

  it('keeps events buffered when the transport fails, rather than dropping them', async () => {
    transport.failuresRemaining = 99;
    for (let i = 0; i < 10; i++) logger.log(row(i));
    await vi.waitFor(() => expect(logger.consecutiveFailures).toBeGreaterThan(0), {
      timeout: 5000,
    });
    expect(transport.events).toHaveLength(0);
    expect(logger.pendingCount).toBe(10);

    // Once the transport recovers, the same events are delivered.
    transport.failuresRemaining = 0;
    await logger.flush();
    expect(transport.events).toHaveLength(10);
  });

  it('recovers after transient failures within the retry budget', async () => {
    transport.failuresRemaining = 2;
    for (let i = 0; i < 10; i++) logger.log(row(i));
    await vi.waitFor(() => expect(transport.events).toHaveLength(10), { timeout: 5000 });
  });

  it('never duplicates a trial when a batch is retried', async () => {
    for (let i = 0; i < 10; i++) logger.log(row(i));
    await logger.flush();
    // Replay the same batch, as a retry after an ambiguous network failure would.
    await transport.upsertEvents(Array.from({ length: 10 }, (_, i) => row(i)));

    expect(transport.events).toHaveLength(10);
    const keys = transport.events.map((e) => `${e.session_id}:${e.trial_index}`);
    expect(new Set(keys).size).toBe(10);
  });

  it('exports every logged event, including ones still unsent', async () => {
    transport.failuresRemaining = 99;
    for (let i = 0; i < 5; i++) logger.log(row(i));
    const csv = logger.toCsv();
    expect(csv.split('\n')).toHaveLength(6); // header plus five rows
    expect(logger.loggedCount).toBe(5);
  });

  it('is a no-op to flush when nothing is buffered', async () => {
    expect(await logger.flush()).toBe(true);
    expect(transport.events).toHaveLength(0);
  });
});
