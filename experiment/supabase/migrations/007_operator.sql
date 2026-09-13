-- ============================================================
-- Free-operant operator-estimation procedure: its own table and
-- writer function, following the access pattern migration 003
-- established. The anon key in the page cannot reach the table,
-- only a SECURITY DEFINER function that inserts into it.
--
-- A separate table rather than columns on an existing one: this
-- procedure shares no trial structure with the others, so folding
-- them together would leave most columns null in most rows.
-- ============================================================

create table if not exists public.operator_events (
  participant_id                text        not null,
  prolific_pid                  text,
  study_id                      text,
  session_id                    text        not null,
  experiment_version            text        not null,
  is_test                       smallint    not null default 0,

  timestamp_utc                 timestamptz not null,
  elapsed_ms                    integer     not null,
  response_time_ms              integer     not null,
  trial_index                   integer     not null,

  block_index                   integer     not null,
  index_in_block                integer     not null,
  is_practice                   smallint    not null,

  block_rich                    text        not null,
  effective_rich                text        not null,
  perturbation_active           smallint    not null,
  responses_since_perturbation  integer,

  stimulus                      text        not null,
  stimulus_side                 text,
  stimulus_congruent            smallint,

  p_left                        real        not null,
  p_right                       real        not null,

  chosen_side                   text        not null,
  previous_side                 text,
  switched                      smallint    not null,
  chose_rich                    smallint    not null,
  chose_stimulus_side           smallint,

  rewarded                      smallint    not null,
  points_delta                  integer     not null,
  points_total                  integer     not null,
  p_used                        real        not null,

  -- One row per response per session; makes a retried batch idempotent.
  primary key (session_id, trial_index)
);

alter table public.operator_events enable row level security;

create index if not exists operator_events_participant_idx
  on public.operator_events (participant_id, trial_index);

create or replace function public.log_operator_events(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer;
begin
  with incoming as (
    select * from jsonb_populate_recordset(null::public.operator_events, p_rows)
  ),
  ins as (
    insert into public.operator_events
    select * from incoming
    on conflict (session_id, trial_index) do nothing
    returning 1
  )
  select count(*) into inserted from ins;
  return inserted;
end;
$$;

revoke all on function public.log_operator_events(jsonb) from public;
grant execute on function public.log_operator_events(jsonb) to anon;
revoke all on table public.operator_events from anon;
