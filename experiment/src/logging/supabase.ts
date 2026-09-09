// ============================================================
// Supabase transport.
//
// Writes are inserts-or-updates keyed on (session_id, trial_index)
// so that a retried batch is idempotent.
//
// No call here chains .select(). That is load-bearing rather than
// stylistic: supabase-js sends Prefer: return=minimal when nothing
// is selected, which lets the anon key write without any select
// policy on the table. Adding .select() would require granting
// reads to a key that ships in the page, and with it the ability
// to download every participant's data.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Transport } from './logger';
import type { EventRow } from './schema';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  eventsTable?: string;
  sessionsTable?: string;
}

export class SupabaseTransport implements Transport {
  private readonly client: SupabaseClient;
  private readonly eventsTable: string;
  private readonly sessionsTable: string;

  constructor(cfg: SupabaseConfig) {
    if (!cfg.url || !cfg.anonKey) {
      throw new Error('Supabase URL and anon key are required');
    }
    this.client = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false },
    });
    this.eventsTable = cfg.eventsTable ?? 'dynamics_events';
    this.sessionsTable = cfg.sessionsTable ?? 'dynamics_sessions';
  }

  async upsertEvents(rows: EventRow[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.client
      .from(this.eventsTable)
      .upsert(rows, { onConflict: 'session_id,trial_index' });
    if (error) throw new Error(`event upsert failed: ${error.message}`);
  }

  async upsertSession(record: Record<string, unknown>): Promise<void> {
    const { error } = await this.client
      .from(this.sessionsTable)
      .upsert(record, { onConflict: 'session_id' });
    if (error) throw new Error(`session upsert failed: ${error.message}`);
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
