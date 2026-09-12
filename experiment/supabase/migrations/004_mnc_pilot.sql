-- ============================================================
-- Multiple Necessary Cues pilot: its own table and its own
-- writer function.
--
-- A separate table rather than extra columns on dynamics_events.
-- The two tasks share no trial structure -- one is a two-
-- alternative free-operant choice, the other a forced choice
-- among four compound stimuli -- so folding them together would
-- leave most columns null in most rows and make every query
-- filter on task first.
--
-- The access pattern is the one migration 003 established and
-- for the same reason: the anon key in the page cannot reach the
-- table, only a SECURITY DEFINER function that inserts into it.
-- See 003 for why a SELECT policy is not an option.
-- ============================================================

create table if not exists public.mnc_events (
  participant_id      text        not null,
  prolific_pid        text,
  study_id            text,
  session_id          text        not null,
  experiment_version  text        not null,
  is_test             smallint    not null default 0,

  arm                 text        not null,
  timestamp_utc       timestamptz not null,
  elapsed_ms          integer     not null,
  response_time_ms    integer     not null,

  trial_index         integer     not null,
  context_index       integer     not null,
  trial_in_context    integer     not null,

  context_color       text        not null,
  target_index        smallint    not null,
  target_label        text        not null,

  alternatives        smallint[]  not null,
  target_position     smallint    not null,
  chosen_position     smallint    not null,
  chosen_index        smallint    not null,
  chosen_label        text        not null,

  correct             smallint    not null,
  rewarded            smallint    not null,
  points_total        integer     not null,
  error_disparity     smallint    not null,

  match_shape         smallint    not null,
  match_size          smallint    not null,
  match_orientation   smallint    not null,
  match_brightness    smallint    not null,

  navail_shape        smallint    not null,
  navail_size         smallint    not null,
  navail_orientation  smallint    not null,
  navail_brightness   smallint    not null,

  advanced_after      text,

  -- One row per trial per session. Makes a retried batch idempotent.
  primary key (session_id, trial_index)
);

alter table public.mnc_events enable row level security;

create index if not exists mnc_events_participant_idx
  on public.mnc_events (participant_id, trial_index);

-- ---------------------------------------------------------- writer --
-- Events are immutable once written, so a retry after an ambiguous
-- network failure resends identical rows and DO NOTHING is the whole
-- of what idempotency requires. Returns the count actually inserted,
-- which is less than the batch on a retry; that is the quiet expected
-- case, not an error.
create or replace function public.log_mnc_events(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer;
begin
  with incoming as (
    select * from jsonb_populate_recordset(null::public.mnc_events, p_rows)
  ),
  ins as (
    insert into public.mnc_events
    select * from incoming
    on conflict (session_id, trial_index) do nothing
    returning 1
  )
  select count(*) into inserted from ins;
  return inserted;
end;
$$;

revoke all on function public.log_mnc_events(jsonb) from public;
grant execute on function public.log_mnc_events(jsonb) to anon;
revoke all on table public.mnc_events from anon;
