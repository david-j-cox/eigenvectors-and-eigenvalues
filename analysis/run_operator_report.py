"""
Per-participant report for the operator-estimation procedure.

Each participant is analysed independently; nothing pools across them and
nothing averages across the replications within one. All computation lives in
dynalysis/operator_task.py.

    python3 analysis/run_operator_report.py
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dynalysis import operator_task as ot  # noqa: E402


def bar(p: float, base: float = 0.5, width: int = 26) -> str:
    n = int(round((p - base) * width * 2))
    return ("·" * 0) + ("+" * n if n > 0 else "-" * -n)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--events", default="analysis/data/operator_pilot.csv")
    ap.add_argument("--min-responses", type=int, default=300)
    a = ap.parse_args()

    d = ot.load(a.events)
    # a participant who reloaded contributes two sessions; analyse the longer,
    # since the two are not independent of one another
    sizes = d.groupby(["pid", "session_id"]).size().reset_index(name="n")
    keep = sizes.sort_values("n").groupby("pid").tail(1)
    d = d.merge(keep[["pid", "session_id"]], on=["pid", "session_id"])

    for pid in sorted(d.pid.unique()):
        g = d[d.pid == pid].sort_values("trial_index").reset_index(drop=True)
        if len(g) < a.min_responses:
            continue
        print("=" * 74)
        print(f"PARTICIPANT {pid}   {len(g)} responses, "
              f"{g.elapsed_ms.max()/60000:.1f} min, "
              f"{g.block_index.nunique()} blocks")
        print("=" * 74)

        print(f"\n  integrity: {ot.check(g)}")
        print(f"  overall P(left) {g.chosen_side.eq('left').mean():.3f}   "
              f"switch rate {g.switched.mean():.3f}   "
              f"reinforced {g.rewarded.mean():.3f}")

        # ---- block transitions ----
        tr = ot.transitions(g)
        if len(tr):
            k = int(tr.moved_as_arranged.sum())
            print(f"\n  BLOCK TRANSITIONS (each an independent replication)")
            print(f"    moved toward the newly rich panel: {k} of {len(tr)}")
            print(f"    median displacement {tr.displacement.median():+.3f}   "
                  f"IQR [{tr.displacement.quantile(.25):+.3f}, {tr.displacement.quantile(.75):+.3f}]")
            prof = ot.transition_profile(g)
            if len(prof):
                print(f"    time course, P(choose newly rich panel):")
                for lo in range(-32, 40, 8):
                    s = prof[(prof.k >= lo) & (prof.k < lo + 8)]
                    if len(s) < 4:
                        continue
                    p = float(np.average(s.p, weights=s.n))
                    print(f"      {lo:>4} to {lo+7:<4} {p:.3f}  {bar(p)}")

        # ---- momentary stimuli ----
        print(f"\n  MOMENTARY STIMULI  (lag 0 is the marked response; later lags")
        print(f"  are persistence, since the arrangement has already ended)")
        for kind in ("appetitive", "aversive"):
            e = ot.stimulus_effect(g, kind)
            if e is None:
                print(f"    {kind}: too few events")
                continue
            print(f"    {kind}: {e['n_events']} events, base rate {e['base']:.3f}")
            pr = e["profile"]
            for _, r in pr.iterrows():
                if r.k > 8 or r.n < 10:
                    continue
                tag = "  <- arranged" if r.k == 0 else ""
                print(f"      lag {int(r.k):<2} n={int(r.n):<4} P={r.p:.3f} "
                      f"dev={r.dev:+.3f}  {bar(r.p, e['base'])}{tag}")
            print(f"      decays below a quarter of lag 0 by lag "
                  f"{e['lags_to_quarter'] if e['lags_to_quarter'] is not None else '>15'}")

        # ---- perturbations ----
        pp = ot.perturbation_profile(g)
        if len(pp):
            print(f"\n  PERTURBATIONS (8 responses with the block state inverted)")
            print(f"    P(choose the panel the BLOCK favours):")
            for lo in range(-16, 48, 8):
                s = pp[(pp.k >= lo) & (pp.k < lo + 8)]
                if len(s) < 4:
                    continue
                p = float(np.average(s.p, weights=s.n))
                tag = "  DURING" if 0 <= lo < 8 else ""
                print(f"      {lo:>4} to {lo+7:<4} {p:.3f}  {bar(p)}{tag}")
        print()


if __name__ == "__main__":
    main()
