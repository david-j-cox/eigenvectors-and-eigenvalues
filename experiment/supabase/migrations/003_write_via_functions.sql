-- ============================================================
-- Writes go through functions, not through the tables.
--
-- 002 gave the anon role INSERT and UPDATE policies and no SELECT
-- policy, on the reasoning that a client which never chains
-- .select() needs no read access. That reasoning was wrong, and
-- the configuration it produced could not store a single row.
--
-- Postgres evaluates `INSERT ... ON CONFLICT` against the SELECT
-- policy as well, because it has to look for the conflicting row
-- before it can decide between inserting and updating. With no
-- SELECT policy that lookup fails, and the statement is rejected
-- as an RLS violation -- even when the row is new and nothing
-- conflicts. Every event the task logs is written that way, so
-- nothing would have been stored at all. A plain UPDATE fails
-- more quietly still: it matches zero rows and reports success,
-- so the session record would simply never have been completed.
--
-- Adding a SELECT policy would fix the write path by handing every
-- participant the ability to read every other participant's data,
-- which is the one thing 002 exists to prevent.
--
-- So the anon role loses direct access to the tables entirely and
-- is granted EXECUTE on two functions instead. They are SECURITY
-- DEFINER, so they act with the owner's rights and RLS does not
-- apply to them; the anon role still cannot read, and now cannot
-- reach the tables at all except through these two entry points.
-- ============================================================

-- ---------------------------------------------------------- events --
-- Events are immutable once written: a row records what happened on
-- one response. A retried batch after an ambiguous network failure
-- therefore carries rows identical to those already stored, and DO
-- NOTHING is the whole of what idempotency requires here. It also
-- avoids restating all 49 columns in a DO UPDATE clause that would
-- only ever assign a value to itself.
create or replace function public.log_events(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'log_events expects a JSON array';
  end if;

  insert into public.dynamics_events
  select * from jsonb_populate_recordset(null::public.dynamics_events, p_rows)
  on conflict (session_id, trial_index) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- -------------------------------------------------------- sessions --
-- The session record is written twice: once at the start and once at
-- the end with the totals. Only the fields the client actually sends
-- are updated, so `started_at` keeps the value it was given on the
-- first write rather than being reset by a payload that omits it.
create or replace function public.save_session(p_record jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `insert ... select *` names every column, so a column the client omits is
  -- inserted as an explicit NULL and its DEFAULT never fires. started_at is
  -- NOT NULL DEFAULT now() and is never sent, so the default is supplied here.
  -- p_record is concatenated second and therefore wins over anything defaulted,
  -- and started_at is absent from the DO UPDATE list below, so the value from
  -- the first write survives the second.
  insert into public.dynamics_sessions
  select * from jsonb_populate_record(
    null::public.dynamics_sessions,
    jsonb_build_object('started_at', to_jsonb(now())) || p_record
  )
  on conflict (session_id) do update set
    participant_id       = excluded.participant_id,
    prolific_pid         = excluded.prolific_pid,
    study_id             = excluded.study_id,
    prolific_session_id  = excluded.prolific_session_id,
    experiment_version   = excluded.experiment_version,
    seed                 = excluded.seed,
    color_to_contingency = excluded.color_to_contingency,
    block_plan           = excluded.block_plan,
    perturbation_plan    = excluded.perturbation_plan,
    engine_config        = excluded.engine_config,
    design_config        = excluded.design_config,
    ended_at             = excluded.ended_at,
    total_responses      = excluded.total_responses,
    total_rewards        = excluded.total_rewards,
    total_points         = excluded.total_points,
    completion_status    = excluded.completion_status,
    completion_code      = excluded.completion_code,
    browser_width        = excluded.browser_width,
    browser_height       = excluded.browser_height,
    user_agent           = excluded.user_agent,
    is_test_session      = excluded.is_test_session,
    updated_at           = excluded.updated_at;
end;
$$;

-- ------------------------------------------------------ privileges --
-- The policies from 002 are dropped rather than left in place. They
-- cannot grant working access -- that is the bug this migration
-- exists to fix -- and leaving them would suggest the tables are
-- reachable directly when they are not.
drop policy if exists dynamics_sessions_insert on public.dynamics_sessions;
drop policy if exists dynamics_sessions_update on public.dynamics_sessions;
drop policy if exists dynamics_events_insert   on public.dynamics_events;
drop policy if exists dynamics_events_update   on public.dynamics_events;

-- RLS stays enabled. With no policies it denies everything, which is
-- the correct posture for a role that should never touch these tables
-- directly, and it is a second line of defense behind the revokes.
alter table public.dynamics_events   enable row level security;
alter table public.dynamics_sessions enable row level security;

revoke all on public.dynamics_events   from anon, authenticated;
revoke all on public.dynamics_sessions from anon, authenticated;

-- Only the two entry points, and only for the browser's role.
revoke all on function public.log_events(jsonb)   from public;
revoke all on function public.save_session(jsonb) from public;
grant execute on function public.log_events(jsonb)   to anon;
grant execute on function public.save_session(jsonb) to anon;
