// ============================================================
// Supabase transport.
//
// Writes go through two database functions rather than through the
// tables. The key in the page cannot reach the tables at all: it
// holds EXECUTE on log_events and save_session and nothing else.
//
// Writing to the tables directly does not work, and the reason is
// worth recording. An anon role with INSERT and UPDATE policies but
// no SELECT policy cannot run `INSERT ... ON CONFLICT`, because
// Postgres consults the SELECT policy when it looks for the
// conflicting row -- so the statement is rejected even when the row
// is new and nothing conflicts. Granting the SELECT policy that
// would fix it would also let any participant read every other
// participant's data. See migration 003.
//
// log_events returns the number of rows actually inserted, which is
// less than the batch size when a retry re-sends rows already
// stored. That is the expected quiet case, not an error.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Transport } from './logger';
import type { EventRow } from './schema';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  logEventsFn?: string;
  saveSessionFn?: string;
  /** Abort a request that has not answered within this long. */
  timeoutMs?: number;
}

/**
 * Reject a request that never answers.
 *
 * fetch has no timeout of its own, so a connection that stalls without closing
 * leaves the promise pending forever. That is not hypothetical: two of three
 * participants in the third pilot uploaded events for the first few minutes and
 * then nothing for the rest of a full session, while their session records --
 * written through a different call -- saved correctly at the end. A request
 * that hangs must fail so the retry path can run.
 */
async function withTimeout<T>(
  work: (signal: AbortSignal) => PromiseLike<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await Promise.resolve(work(controller.signal));
  } finally {
    clearTimeout(timer);
  }
}

export class SupabaseTransport implements Transport {
  private readonly client: SupabaseClient;
  private readonly logEventsFn: string;
  private readonly saveSessionFn: string;
  private readonly timeoutMs: number;

  constructor(cfg: SupabaseConfig) {
    if (!cfg.url || !cfg.anonKey) {
      throw new Error('Supabase URL and anon key are required');
    }
    this.client = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false },
    });
    this.logEventsFn = cfg.logEventsFn ?? 'log_events';
    this.saveSessionFn = cfg.saveSessionFn ?? 'save_session';
    // Generous: a 4,000-row batch takes about 2.6 s against this project, so
    // this bounds a stall without cutting off a large but healthy upload.
    this.timeoutMs = cfg.timeoutMs ?? 30_000;
  }

  async upsertEvents(rows: EventRow[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await withTimeout<{ error: { message: string } | null }>(
      (signal) => this.client.rpc(this.logEventsFn, { p_rows: rows }).abortSignal(signal),
      this.timeoutMs,
    );
    if (error) throw new Error(`event write failed: ${error.message}`);
  }

  async upsertSession(record: Record<string, unknown>): Promise<void> {
    const { error } = await withTimeout<{ error: { message: string } | null }>(
      (signal) => this.client.rpc(this.saveSessionFn, { p_record: record }).abortSignal(signal),
      this.timeoutMs,
    );
    if (error) throw new Error(`session write failed: ${error.message}`);
  }
}

/** Build a transport from Vite environment variables, or null if unconfigured. */
export function transportFromEnv(): SupabaseTransport | null {
  const env = (import.meta as { env?: Record<string, string> }).env ?? {};
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) return null;
  return new SupabaseTransport({
    url: env.VITE_SUPABASE_URL,
    anonKey: env.VITE_SUPABASE_ANON_KEY,
  });
}
