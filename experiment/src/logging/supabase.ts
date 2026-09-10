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
}

export class SupabaseTransport implements Transport {
  private readonly client: SupabaseClient;
  private readonly logEventsFn: string;
  private readonly saveSessionFn: string;

  constructor(cfg: SupabaseConfig) {
    if (!cfg.url || !cfg.anonKey) {
      throw new Error('Supabase URL and anon key are required');
    }
    this.client = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false },
    });
    this.logEventsFn = cfg.logEventsFn ?? 'log_events';
    this.saveSessionFn = cfg.saveSessionFn ?? 'save_session';
  }

  async upsertEvents(rows: EventRow[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.client.rpc(this.logEventsFn, { p_rows: rows });
    if (error) throw new Error(`event write failed: ${error.message}`);
  }

  async upsertSession(record: Record<string, unknown>): Promise<void> {
    const { error } = await this.client.rpc(this.saveSessionFn, { p_record: record });
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
