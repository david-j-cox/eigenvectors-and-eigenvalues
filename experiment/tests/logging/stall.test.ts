import { describe, expect, it, vi } from 'vitest';

import { EventLogger, type Transport } from '../../src/logging/logger';
import type { EventRow } from '../../src/logging/schema';

/**
 * A request that hangs must not stop logging for the rest of the session.
 *
 * This is the failure that cost two of three participants in the third pilot
 * most of their events: uploads succeeded for the first few minutes and then
 * stopped dead, with no gaps, while the session record -- written through a
 * different call -- saved correctly at the end. `inFlight` is cleared in a
 * finally block, so a promise that never settles latches it, and every later
 * flush returns early on that flag.
 *
 * A failing transport was already covered. A hanging one was not, and the
 * difference is the whole bug.
 */
const row = (i: number): EventRow => ({ session_id: 's', trial_index: i } as unknown as EventRow);

class HangingTransport implements Transport {
  hangNext = false;
  readonly delivered: EventRow[] = [];
  async upsertEvents(rows: EventRow[]): Promise<void> {
    if (this.hangNext) {
      this.hangNext = false;
      return new Promise<void>(() => {});   // never settles
    }
    this.delivered.push(...rows);
  }
  async upsertSession(): Promise<void> {}
}

describe('a hung upload does not wedge the logger', () => {
  it('keeps delivering after a request that never settles', async () => {
    vi.useFakeTimers();
    const transport = new HangingTransport();
    const logger = new EventLogger(transport, { batchSize: 5, stallMs: 60_000 });

    transport.hangNext = true;
    for (let i = 0; i < 5; i++) logger.log(row(i));
    void logger.flush();                    // this one hangs forever
    await vi.advanceTimersByTimeAsync(1);
    expect(transport.delivered).toHaveLength(0);

    // Without the watchdog every later flush returns early on inFlight and
    // nothing is ever delivered again.
    for (let i = 5; i < 10; i++) logger.log(row(i));
    await vi.advanceTimersByTimeAsync(61_000);
    await logger.flush();

    expect(transport.delivered.length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it('still refuses to run two flushes at once while one is healthy', async () => {
    const transport = new HangingTransport();
    const logger = new EventLogger(transport, { batchSize: 100, stallMs: 60_000 });
    for (let i = 0; i < 10; i++) logger.log(row(i));
    await Promise.all([logger.flush(), logger.flush(), logger.flush()]);
    // Ten rows, delivered once, not three times.
    expect(transport.delivered).toHaveLength(10);
  });
});

describe('a batch the server will never accept', () => {
  class AlwaysRefuses implements Transport {
    attempts = 0;
    readonly delivered: EventRow[] = [];
    poison = true;
    async upsertEvents(rows: EventRow[]): Promise<void> {
      this.attempts++;
      if (this.poison && rows.some((r) => (r as unknown as { bad?: boolean }).bad)) {
        throw new Error('value out of range for type integer');
      }
      this.delivered.push(...rows);
    }
    async upsertSession(): Promise<void> {}
  }

  it('is set aside so the responses behind it still upload', async () => {
    const transport = new AlwaysRefuses();
    const logger = new EventLogger(transport, {
      batchSize: 1000, maxRetries: 0, quarantineAfter: 2,
    });

    // One unwritable row, then a block of good ones.
    logger.log({ session_id: 's', trial_index: 0, bad: true } as unknown as EventRow);
    for (let i = 1; i < 20; i++) logger.log(row(i));

    // Repeated flushes: the poisoned batch is refused, then quarantined.
    await logger.flush();
    await logger.flush();
    await logger.flush();

    expect(logger.quarantinedCount).toBeGreaterThan(0);

    // The point: new responses after the poison still get through.
    for (let i = 20; i < 30; i++) logger.log(row(i));
    await logger.flush();
    expect(transport.delivered.length).toBeGreaterThan(0);
  });
});
