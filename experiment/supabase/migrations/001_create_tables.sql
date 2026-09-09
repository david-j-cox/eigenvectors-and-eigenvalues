-- ============================================================
-- Tables for the behavioral dynamics task.
--
-- The session record stores the randomization seed and the full
-- resolved plan. Together with the experiment version those make
-- every schedule reconstructible after the fact, so an analysis
-- can verify that the reinforcement a participant actually
-- received matches what was programmed rather than taking the
-- event log's word for it.
-- ============================================================

create table if not exists dynamics_sessions (
  session_id            text primary key,
  participant_id        text not null,
  prolific_pid          text,
  study_id              text,
  prolific_session_id   text,
  experiment_version    text not null,

  seed                  text not null,
  color_to_contingency  jsonb not null,
  block_plan            jsonb not null,
  perturbation_plan     jsonb not null,
  engine_config         jsonb not null,
  design_config         jsonb not null,

  started_at            timestamptz not null default now(),
  ended_at              timestamptz,
  total_responses       integer,
  total_rewards         integer,
  total_points          integer,
  completion_status     text not null default 'in_progress',
  completion_code       text,

  browser_width         integer,
  browser_height        integer,
  user_agent            text,
  is_test_session       boolean not null default false,

  updated_at            timestamptz not null default now()
);

create table if not exists dynamics_events (
  session_id            text not null,
  trial_index           integer not null,

  participant_id        text not null,
  prolific_pid          text,
  study_id              text,
  experiment_version    text not null,

  timestamp_utc         timestamptz not null,
  elapsed_time_ms       integer not null,
  block_index           integer not null,
  trial_in_block        integer not null,
  response_time_ms      integer,
  ici_ms                integer,

  chosen_option         text not null,
  previous_option       text,
  switched              smallint not null,
  run_length            integer not null,

  reward_outcome        smallint not null,
  points_earned         integer not null,
  cumulative_points     integer not null,
  vi_a_ms               integer not null,
  vi_b_ms               integer not null,
  rate_a_per_s          double precision,
  rate_b_per_s          double precision,
  richness_a            double precision,
  richness_b            double precision,
  effective_rate_a_per_s double precision,
  effective_rate_b_per_s double precision,
  cod_active            smallint not null,
  reinforcer_withheld_by_cod smallint not null,

  part                  text not null,
  physical_context_id   text not null,
  context_color         text not null,
  context_pattern       text not null,
  functional_contingency_id text not null,
  exposure_number       integer not null,
  reversal_stage        integer,
  trials_since_context_switch integer not null,

  perturbation_active   smallint not null,
  perturbation_type     text,
  perturbation_id       text,
  perturbation_repetition integer,
  trials_since_perturbation_onset integer,
  trials_since_perturbation_offset integer,

  page_visible          smallint not null,
  fullscreen_active     smallint not null,
  focus_lost_count      integer not null,
  browser_width         integer,
  browser_height        integer,
  input_method          text,

  -- The upsert key. Without it a retried batch after an ambiguous network
  -- failure would insert duplicate trials, and duplicates silently corrupt the
  -- state bins, which are built by counting responses in order.
  primary key (session_id, trial_index)
);

create index if not exists dynamics_events_participant_idx
  on dynamics_events (participant_id, trial_index);
create index if not exists dynamics_events_block_idx
  on dynamics_events (session_id, block_index, trial_in_block);
