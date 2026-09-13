"""
Does the 1.1.0 design yield enough data per relevant set to be analysable?

The estimator has to be fitted within a relevant set, because relevance is what
changes between contexts. With four dimensions taken two at a time there are
six possible sets, so a participant's trials are divided six ways before any
model is fitted. Whether that leaves enough is an arithmetic question answered
by the pace the five collected participants actually set, not by assumption.

    python3 analysis/run_design_projection.py
"""

from __future__ import annotations

import sys
from itertools import combinations
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dynalysis import mnc  # noqa: E402

MIN_PER_FIT = 30          # dynalysis.mnc.dimension_control's threshold
# Must match MNC_CONFIG.relevantSets in src/config/mnc.ts. Three of the six
# possible pairs are used; see the comment there for why.
N_SETS = 3
N_POSSIBLE = len(list(combinations(range(4), 2)))


def main() -> None:
    d = mnc.load("analysis/data/mnc_pilot_live.csv")
    s = mnc.session_summary(d)

    print("Observed, from the five collected participants (version 1.0.0):\n")
    print(f"  trials per 3-minute session   median {s.trials.median():.0f}  "
          f"range {s.trials.min()}-{s.trials.max()}")
    ctx_len = d.groupby(["pid", "context_index"]).size()
    print(f"  trials per context            median {ctx_len.median():.0f}  "
          f"range {ctx_len.min()}-{ctx_len.max()}")
    print(f"  contexts per session          median {s.contexts.median():.0f}  "
          f"range {s.contexts.min()}-{s.contexts.max()}")

    print(f"\nThe 1.1.0 analysis divides a session by relevant set. Using all")
    print(f"{N_POSSIBLE} possible sets none of these participants reaches the")
    print(f"{MIN_PER_FIT}-trial minimum; the design uses {N_SETS}. At the observed")
    print("trial counts that gives:\n")
    print(f"  {'trials/session':>15}{'per relevant set':>19}{'fits possible':>16}")
    for n in sorted(s.trials):
        per = n / N_SETS
        print(f"  {n:>15}{per:>19.0f}{'yes' if per >= MIN_PER_FIT else 'NO':>16}")
    med_per = s.trials.median() / N_SETS
    print(f"\n  median: {med_per:.0f} trials per relevant set against a "
          f"{MIN_PER_FIT}-trial minimum")

    print("\nAnd 1.1.0 should run FASTER, not slower: two dimensions to find")
    print("rather than four, advancing on 4 of 5 rather than 8 of 10. More")
    print("contexts in the same time means the same trials split even further.")

    need = MIN_PER_FIT * N_SETS
    print(f"\n  trials needed for one fit per set: {need}")
    rate = (d.groupby('pid').size() / (d.groupby('pid').elapsed_ms.max()/60000))
    print(f"  observed rate: {rate.median():.0f} trials/min "
          f"(range {rate.min():.0f}-{rate.max():.0f})")
    print(f"  -> {need/rate.median():.1f} min at the median rate, "
          f"{need/rate.min():.1f} min for the slowest")

    print("\nWhat was rejected, and why:")
    print(f"  all {N_POSSIBLE} sets at 3 min   -> "
          f"{s.trials.median()/N_POSSIBLE:.0f} trials/set; below the minimum for "
          f"every participant observed")
    print(f"  all {N_POSSIBLE} sets, longer     -> "
          f"{MIN_PER_FIT*N_POSSIBLE/rate.median():.1f} min at the median rate and "
          f"{MIN_PER_FIT*N_POSSIBLE/rate.min():.1f} for the slowest; more than doubles cost")
    print(f"  a lower fit threshold    -> weaker per-set estimates, and the "
          f"validation was run at {MIN_PER_FIT}+; it would have to be rerun at any "
          f"new floor")


if __name__ == "__main__":
    main()
