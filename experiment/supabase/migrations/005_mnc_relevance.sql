-- ============================================================
-- Record which dimensions actually mattered.
--
-- In 1.0.0 every dimension had to match, so relevance was a
-- constant and needed no column. It is now the manipulation:
-- only some dimensions determine which compound pays, and which
-- ones they are changes with the context. Without these columns
-- an analysis cannot tell a dimension that was being ignored
-- from one that carried nothing to attend to, which is the whole
-- comparison.
--
-- Added nullable so the 1.0.0 rows already in the table stay
-- valid and readable; they are distinguished by
-- experiment_version rather than by these being null.
-- ============================================================

alter table public.mnc_events
  add column if not exists relevant_dims     text,
  add column if not exists rel_shape         smallint,
  add column if not exists rel_size          smallint,
  add column if not exists rel_orientation   smallint,
  add column if not exists rel_hue           smallint;

comment on column public.mnc_events.relevant_dims is
  'Pipe-separated dimension ids that determined the answer in this context. '
  'Null for experiment_version 1.0.0, where every dimension was relevant.';
