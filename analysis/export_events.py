#!/usr/bin/env python3
"""
Pull collected sessions out of Supabase into the CSV the analysis reads.

    export SUPABASE_URL=https://<project>.supabase.co
    export SUPABASE_SERVICE_ROLE_KEY=...        # never the anon key
    python3 export_events.py --out data/pilot_events.csv

The service-role key is required because the tables have no select policy: the
anon key that ships in the participant's page can insert and update but cannot
read anything back, which is what stops one participant downloading another's
data. Reads therefore happen here, with a key that never leaves your machine.

The event table's columns are exactly those the simulation writes, so the CSV
this produces goes straight into run_pilot_diagnostics.py and
run_state_selection.py with no renaming.
"""

import argparse
import os
import sys
from pathlib import Path

import pandas as pd
import requests

HERE = Path(__file__).resolve().parent
PAGE = 1000  # PostgREST's default ceiling on rows per request


def fetch_all(url: str, key: str, table: str, order: str) -> pd.DataFrame:
    """Page through a table. PostgREST caps a response at 1000 rows, and a
    silently truncated export would drop trials off the end of a session and
    corrupt every state bin built from them."""
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    }
    frames, offset = [], 0
    while True:
        r = requests.get(
            f"{url}/rest/v1/{table}",
            headers={**headers, "Range-Unit": "items",
                     "Range": f"{offset}-{offset + PAGE - 1}"},
            params={"select": "*", "order": order},
            timeout=60,
        )
        if r.status_code not in (200, 206):
            sys.exit(f"{table}: HTTP {r.status_code} -- {r.text[:300]}")
        rows = r.json()
        if not rows:
            break
        frames.append(pd.DataFrame(rows))
        if len(rows) < PAGE:
            break
        offset += PAGE
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(HERE / "data" / "pilot_events.csv"))
    ap.add_argument("--sessions-out", default=None,
                    help="also write the session records (default: alongside --out)")
    ap.add_argument("--include-test", action="store_true",
                    help="keep sessions flagged is_test_session")
    ap.add_argument("--include-incomplete", action="store_true",
                    help="keep sessions that never reached the end screen")
    args = ap.parse_args()

    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.")

    sessions = fetch_all(url, key, "dynamics_sessions", "started_at.asc")
    events = fetch_all(url, key, "dynamics_events", "session_id.asc,trial_index.asc")
    if events.empty:
        sys.exit("No events found. Has anyone run the task yet?")

    # Drop test and incomplete sessions here rather than in the analysis, so the
    # acceptance checks always run on exactly the data a real pilot produced.
    keep = set(sessions["session_id"])
    if not sessions.empty:
        if not args.include_test:
            keep &= set(sessions.loc[~sessions["is_test_session"].fillna(False), "session_id"])
        if not args.include_incomplete:
            keep &= set(sessions.loc[sessions["completion_status"] == "complete", "session_id"])
        dropped = events["session_id"].nunique() - len(keep & set(events["session_id"]))
        events = events[events["session_id"].isin(keep)]
        if dropped:
            print(f"  excluded {dropped} session(s) as test or incomplete "
                  f"(--include-test / --include-incomplete to keep)")

    if events.empty:
        sys.exit("Every session was excluded as test or incomplete.")

    events = events.sort_values(["session_id", "trial_index"]).reset_index(drop=True)

    # Drop the redundant encodings of the schedule state.
    #
    # Under the depleting-probability schedule the arranged reinforcement IS
    # richness_a and richness_b: the probability that a response on that
    # alternative pays. The six columns below are that same number re-expressed
    # so the log could serve a concurrent-VI mode without the analysis
    # branching. They carry no information richness does not:
    #
    #     vi_k_ms            = 350 / richness_k
    #     rate_k_per_s       = richness_k / 0.35      (corr with richness: 1.000000)
    #     effective_rate_k   = 2.857 * richness_k^2
    #
    # The last is also wrong here -- it applies the VI formula to a probability
    # and ends up squaring it -- which went unnoticed precisely because nothing
    # reads these. Keeping them in an analysis frame invites a singular design
    # matrix. They stay in the database, which is the record of what was
    # collected; this is the working copy.
    REDUNDANT = [
        "vi_a_ms", "vi_b_ms",
        "rate_a_per_s", "rate_b_per_s",
        "effective_rate_a_per_s", "effective_rate_b_per_s",
    ]
    dropped = [c for c in REDUNDANT if c in events.columns]
    if dropped:
        events = events.drop(columns=dropped)
        print(f"  dropped {len(dropped)} redundant schedule columns "
              f"(recoverable from richness_a/richness_b)")

    # A duplicated (session_id, trial_index) should be impossible -- it is the
    # table's primary key -- so if one appears the assumption that trial_index
    # orders a session has broken, and the bins would be wrong rather than noisy.
    dupes = events.duplicated(["session_id", "trial_index"]).sum()
    if dupes:
        sys.exit(f"{dupes} duplicated (session_id, trial_index) rows; refusing to write.")

    # Canonical names. The alternatives are the left and right panels, reached
    # with F and J; the task logs them as A and B, which collides with the ABAB
    # condition labels and describes nothing the participant did. The reversal
    # part is two conditions experienced twice, so reversal_stage's 1-4 become
    # A1, B1, A2, B2.
    events = events.replace({
        "chosen_option": {"A": "left", "B": "right"},
        "previous_option": {"A": "left", "B": "right"},
        "functional_contingency_id": {"A_rich": "left_rich", "B_rich": "right_rich"},
        "reversal_stage": {1: "A1", 2: "B1", 3: "A2", 4: "B2"},
    })
    events = events.rename(columns={"richness_a": "richness_left",
                                    "richness_b": "richness_right",
                                    "reversal_stage": "condition"})

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    events.to_csv(out, index=False)

    sess_out = Path(args.sessions_out) if args.sessions_out else out.with_name(
        out.stem + "_sessions.csv")
    if not sessions.empty:
        sessions[sessions["session_id"].isin(events["session_id"])].to_csv(
            sess_out, index=False)

    print(f"\n{len(events):,} events from {events['session_id'].nunique()} session(s)")
    print(f"  -> {out}")
    print(f"  -> {sess_out}")
    per = events.groupby("participant_id").size().sort_values(ascending=False)
    print("\nresponses per participant:")
    for pid, n in per.items():
        flag = "" if n >= 4000 else "   <- short, check completion_status"
        print(f"  {pid:<28} {n:>6,}{flag}")
    print(f"\nNext:\n  python3 run_pilot_diagnostics.py --events {out}"
          f"\n  python3 run_state_selection.py   --events {out}")


if __name__ == "__main__":
    main()
