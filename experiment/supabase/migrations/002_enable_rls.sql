-- ============================================================
-- SUPERSEDED BY 003. The policies this migration creates cannot
-- store a row: Postgres consults the SELECT policy when resolving
-- `INSERT ... ON CONFLICT`, so with no SELECT policy every write
-- the task makes is rejected, including writes of brand-new rows.
-- The reasoning below about `Prefer: return=minimal` is wrong --
-- it addresses reading results back, not the conflict lookup.
-- Kept for history; 003 drops these policies and moves writes into
-- SECURITY DEFINER functions. Run all three in order.
-- ============================================================

-- ============================================================
-- Row-level security.
--
-- The browser holds only the anon key, so its policies decide what
-- a participant's client can do. It may insert rows and update them
-- for the idempotent upsert, and it has no select policy at all, so
-- it cannot read anything back. Granting select would let anyone
-- holding the anon key -- which ships in the page -- download every
-- participant's data.
--
-- This works because the client sends its upserts with
-- Prefer: return=minimal (supabase-js does this whenever .select()
-- is not chained onto the call). An upsert that asks for the
-- inserted rows back WOULD need a select policy, which is why
-- SupabaseTransport never chains .select().
-- ============================================================

alter table dynamics_sessions enable row level security;
alter table dynamics_events enable row level security;

create policy dynamics_sessions_insert on dynamics_sessions
  for insert to anon with check (true);

create policy dynamics_sessions_update on dynamics_sessions
  for update to anon using (true) with check (true);

create policy dynamics_events_insert on dynamics_events
  for insert to anon with check (true);

create policy dynamics_events_update on dynamics_events
  for update to anon using (true) with check (true);

-- Deliberately no select policy on either table. Analysis reads use the
-- service role key from a server or notebook, never the anon key.
