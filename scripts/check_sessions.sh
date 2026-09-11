#!/usr/bin/env bash
# Per-session integrity, run while data is still recoverable.
#
# The third pilot lost 7,519 responses because a row the database refused
# blocked every batch behind it, and nothing said so until analysis. Two
# participants still had their download and could send it; that only worked
# because they were asked within the day. This is the check that makes the
# asking possible.
set -euo pipefail
PW=$(security find-generic-password -a supabase-eigen -s supabase-db-password -w)
PGPASSWORD="$PW" psql "postgresql://postgres@db.hieaojwgcpkndmnhvbig.supabase.co:5432/postgres" -X <<'SQL'
\pset border 2
select
  s.participant_id,
  s.completion_status                                        as status,
  s.total_responses                                          as claimed,
  (select count(*) from dynamics_events e
    where e.session_id = s.session_id)                       as stored,
  (select max(trial_index) + 1 - count(*) from dynamics_events e
    where e.session_id = s.session_id)                       as gaps,
  case
    when s.completion_status <> 'complete'            then 'incomplete'
    when s.total_responses is null                    then 'no total'
    when s.total_responses <> (select count(*) from dynamics_events e
                                where e.session_id = s.session_id) then 'ROWS MISSING'
    else 'ok'
  end                                                        as verdict
from dynamics_sessions s
where s.is_test_session = false
order by s.started_at desc
limit 20;
SQL
