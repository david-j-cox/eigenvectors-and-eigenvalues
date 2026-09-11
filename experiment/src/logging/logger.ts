// ============================================================
// Event logging with checkpointing and disconnect recovery.
//
// Responses are buffered locally and flushed in batches. Nothing
// waits for the end of the session: a participant who closes the
// tab at minute twenty must still leave twenty minutes of usable
// data behind, and for a study whose unit of analysis is the
// individual, a partial session is worth far more than nothing.
//
// Every write is an upsert keyed on (session_id, trial_index), so
// a retried batch after a dropped connection cannot duplicate
// trials -- and duplicate trials would silently corrupt the state
// bins, which are built by counting responses in order.
// ============================================================

import type { EventRow } from './schema';
import { EVENT_COLUMNS } from './schema';

export interface Transport {
  /** Upsert a batch of events. Must be idempotent on (session_id, trial_index). */
  upsertEvents(rows: EventRow[]): Promise<void>;
  /** Write or update the session-level record. */
  upsertSession(record: Record<string, unknown>): Promise<void>;
}

export interface LoggerOptions {
  batchSize?: number;
  flushIntervalMs?: number;
  maxRetries?: number;
  /** Persist unflushed events here so a refresh does not lose them. */
  storageKey?: string;
  /** Treat a batch in flight longer than this as abandoned. */
  stallMs?: number;
  /** Consecutive failed flushes before a batch is set aside. */
  quarantineAfter?: number;
}

const DEFAULTS = {
  batchSize: 25,
  flushIntervalMs: 5000,
  maxRetries: 4,
  // Longer than the transport's own timeout plus its retry backoff, so this
  // only fires when that mechanism has itself failed to return.
  stallMs: 120_000,
  // Consecutive failed flushes before a batch is set aside. Each flush already
  // makes maxRetries attempts, so this is a persistent refusal, not a blip.
  quarantineAfter: 3,
};

export class EventLogger {
  private buffer: EventRow[] = [];
  private inFlight = false;
  /**
   * When the in-flight batch started.
   *
   * `inFlight` is cleared in a finally block, which runs only if the promise
   * settles. A request that neither resolves nor rejects therefore latches the
   * flag forever, and since every later flush returns early on it, logging
   * stops for the rest of the session in silence. That is what cost two of
   * three participants in the third pilot most of their events. The transport
   * now times out, and this is the second line of defense: a batch in flight
   * for longer than any timeout can legitimately take is treated as abandoned.
   */
  private inFlightSince = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly opts: Required<Omit<LoggerOptions, 'storageKey'>> & {
    storageKey: string | null;
  };

  /** Every event ever logged, kept for the local download fallback. */
  private readonly all: EventRow[] = [];
  /** Batches the server has repeatedly refused; kept out of the retry queue. */
  private readonly quarantined: EventRow[] = [];
  private failures = 0;

  constructor(private readonly transport: Transport, options: LoggerOptions = {}) {
    this.opts = {
      batchSize: options.batchSize ?? DEFAULTS.batchSize,
      flushIntervalMs: options.flushIntervalMs ?? DEFAULTS.flushIntervalMs,
      maxRetries: options.maxRetries ?? DEFAULTS.maxRetries,
      stallMs: options.stallMs ?? DEFAULTS.stallMs,
      quarantineAfter: options.quarantineAfter ?? DEFAULTS.quarantineAfter,
      storageKey: options.storageKey ?? null,
    };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, this.opts.flushIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  log(row: EventRow): void {
    this.buffer.push(row);
    this.all.push(row);
    this.persistLocally();
    if (this.buffer.length >= this.opts.batchSize) void this.flush();
  }

  /**
   * Send everything buffered.
   *
   * On failure the batch goes back to the front of the buffer rather than
   * being dropped, so a transient outage delays delivery instead of losing
   * trials. Concurrent calls are ignored while one is in flight, which is what
   * keeps a slow network from interleaving two copies of the same batch.
   */
  async flush(): Promise<boolean> {
    if (this.inFlight && Date.now() - this.inFlightSince > this.opts.stallMs) {
      // Abandoned: let this call take over rather than wait on it forever.
      console.warn('event upload stalled; retrying');
      this.inFlight = false;
    }
    if (this.inFlight || this.buffer.length === 0) return true;
    this.inFlight = true;
    this.inFlightSince = Date.now();
    const batch = this.buffer.splice(0, this.buffer.length);

    let succeeded = false;
    try {
      await this.withRetry(() => this.transport.upsertEvents(batch));
      this.failures = 0;
      this.persistLocally();
      succeeded = true;
      return true;
    } catch (err) {
      this.failures++;
      if (this.failures >= this.opts.quarantineAfter) {
        // The batch is not merely undeliverable now, it has failed repeatedly.
        // A row the server will never accept -- a value out of range for its
        // column, say -- would otherwise sit at the front of the buffer and
        // block every response behind it for the rest of the session. Set it
        // aside so the remainder still uploads. Quarantined rows stay in the
        // local download, so nothing is lost that the participant cannot send.
        this.quarantined.push(...batch);
        this.failures = 0;
        console.warn(
          `dropping ${batch.length} events from the upload queue after ` +
            `${this.opts.quarantineAfter} failures; they remain in the local export`,
          err,
        );
      } else {
        this.buffer.unshift(...batch);
      }
      return false;
    } finally {
      this.inFlight = false;
      // Responses logged while this batch was in flight would otherwise wait
      // for the next timer tick; on a slow connection that lets the buffer grow
      // across a whole block. Chaining only after success matters: chaining
      // after a failure would spin against a transport that is already down,
      // so a failed batch waits for the timer instead.
      if (succeeded && this.buffer.length >= this.opts.batchSize) void this.flush();
    }
  }

  private async withRetry(fn: () => Promise<void>): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.opts.maxRetries; attempt++) {
      try {
        await fn();
        return;
      } catch (err) {
        lastError = err;
        // Exponential backoff, so a server under load is not hammered by every
        // participant retrying in lockstep.
        const delay = Math.min(8000, 250 * 2 ** attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError;
  }

  /** Unflushed events survive a refresh here and are replayed on restore. */
  private persistLocally(): void {
    if (!this.opts.storageKey || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.opts.storageKey, JSON.stringify(this.buffer));
    } catch {
      // A full or disabled local store must never interrupt the task; the
      // in-memory buffer and the periodic flush still carry the data.
    }
  }

  /**
   * Write the session record.
   *
   * Deliberately swallows its error. The session record is valuable for
   * reproducibility but the events are the data, and a participant who is
   * mid-task should never be interrupted because a metadata write failed.
   * Returns whether it landed, so a caller that cares can check.
   */
  async saveSession(record: Record<string, unknown>): Promise<boolean> {
    try {
      await this.transport.upsertSession(record);
      return true;
    } catch (err) {
      console.warn('session record upsert failed', err);
      return false;
    }
  }

  restorePending(): void {
    if (!this.opts.storageKey || typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.opts.storageKey);
      if (!raw) return;
      const rows = JSON.parse(raw) as EventRow[];
      if (Array.isArray(rows) && rows.length) this.buffer.unshift(...rows);
    } catch {
      // Corrupt local state is discarded rather than allowed to block startup.
    }
  }

  get pendingCount(): number {
    return this.buffer.length + this.quarantined.length;
  }

  /** Events the server refused; they are still in the local export. */
  get quarantinedCount(): number {
    return this.quarantined.length;
  }

  get consecutiveFailures(): number {
    return this.failures;
  }

  get loggedCount(): number {
    return this.all.length;
  }

  /** Last-resort export so a participant can send data if uploads never land. */
  toCsv(): string {
    const cell = (v: unknown) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [
      EVENT_COLUMNS.join(','),
      ...this.all.map((r) => EVENT_COLUMNS.map((c) => cell(r[c])).join(',')),
    ].join('\n');
  }
}

/** Collects events in memory only; used for local development and tests. */
export class MemoryTransport implements Transport {
  readonly events: EventRow[] = [];
  session: Record<string, unknown> | null = null;
  /** Set to make the next N calls fail, for exercising the retry path. */
  failuresRemaining = 0;

  async upsertEvents(rows: EventRow[]): Promise<void> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining--;
      throw new Error('simulated transport failure');
    }
    for (const row of rows) {
      const i = this.events.findIndex(
        (e) => e.session_id === row.session_id && e.trial_index === row.trial_index,
      );
      if (i >= 0) this.events[i] = row;
      else this.events.push(row);
    }
  }

  async upsertSession(record: Record<string, unknown>): Promise<void> {
    this.session = record;
  }
}
