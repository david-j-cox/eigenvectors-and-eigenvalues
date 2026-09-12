"""
Is the dominant eigenvector interpretable once the bin stops filtering?

Study 1 could not answer its own eigenvector question. Comparing two operators
by the cosine between their dominant eigenvectors is only meaningful against a
reference: how similar are two INDEPENDENT estimates of the SAME operator, at
the same sample size? At the 10-response bin that reference was so wide it
admitted almost anything, and the comparison was abandoned.

The bin is an analytic choice, not an experimental one, so this can be asked
again of the data already collected. Splitting each phase in half gives two
independent estimates of one operator, which fixes the floor empirically; the
A1-vs-A2 and B1-vs-B2 comparisons are then read against it.

    python3 analysis/run_eigenvector_floor.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dynalysis import adapt, states as S              # noqa: E402
from dynalysis.eigen import abs_cosine, dominant_vector   # noqa: E402
from dynalysis.operators import fit_operator          # noqa: E402

EVENTS = Path("analysis/data/final_events.csv")
PHASES = ["A1", "B1", "A2", "B2"]


def phase_transitions(raw_g, b):
    prep = adapt.add_primitives(adapt.prepare(raw_g))
    st = S.build_states(prep, b, context_col="context_segment")
    tr = S.build_transitions(st, context_col="context_segment")
    m = tr.context_t.str.split("|", expand=True)
    return tr.assign(cond=m[2])


def main() -> None:
    raw = adapt.load_new_events(EVENTS)
    rows = []

    for b in (3, 5, 10):
        for pid, g_raw in raw.groupby("participant_id"):
            tr = phase_transitions(g_raw, b)
            ops, halves = {}, {}
            for c in PHASES:
                gg = tr[tr.cond == c].sort_values("transition_order")
                if len(gg) < 24:
                    continue
                A, _ = fit_operator(gg, alpha=1.0)
                ops[c] = A
                h = len(gg) // 2
                try:
                    A1, _ = fit_operator(gg.iloc[:h], alpha=1.0)
                    A2, _ = fit_operator(gg.iloc[h:], alpha=1.0)
                    halves[c] = (A1, A2, h)
                except Exception:
                    pass

            # floor: two independent estimates of the SAME operator
            for c, (A1, A2, h) in halves.items():
                rows.append({"bin": b, "participant_id": pid, "kind": "same",
                             "pair": c, "n": h,
                             "cos": abs_cosine(dominant_vector(A1),
                                               dominant_vector(A2))})
            # the comparisons of interest, same condition seen twice
            for c1, c2 in (("A1", "A2"), ("B1", "B2")):
                if c1 in ops and c2 in ops:
                    n = min((tr.cond == c1).sum(), (tr.cond == c2).sum())
                    rows.append({"bin": b, "participant_id": pid,
                                 "kind": "replication", "pair": f"{c1}v{c2}",
                                 "n": int(n),
                                 "cos": abs_cosine(dominant_vector(ops[c1]),
                                                   dominant_vector(ops[c2]))})
            # and the contrast that SHOULD differ, if anything does
            for c1, c2 in (("A1", "B1"), ("A2", "B2")):
                if c1 in ops and c2 in ops:
                    n = min((tr.cond == c1).sum(), (tr.cond == c2).sum())
                    rows.append({"bin": b, "participant_id": pid,
                                 "kind": "across", "pair": f"{c1}v{c2}",
                                 "n": int(n),
                                 "cos": abs_cosine(dominant_vector(ops[c1]),
                                                   dominant_vector(ops[c2]))})

    d = pd.DataFrame(rows)
    print("Cosine between dominant eigenvectors. 'same' is the floor: two")
    print("independent halves of ONE phase, so one operator estimated twice.\n")
    print(f"  {'bin':>4}{'kind':>13}{'n/est':>8}{'median':>9}"
          f"{'5th pct':>10}{'95th pct':>10}")
    print("  " + "-" * 54)
    for b, gb in d.groupby("bin"):
        for k in ("same", "replication", "across"):
            g = gb[gb.kind == k]
            if not len(g):
                continue
            print(f"  {b:>4}{k:>13}{g.n.median():>8.0f}{g.cos.median():>9.3f}"
                  f"{g.cos.quantile(.05):>10.3f}{g.cos.quantile(.95):>10.3f}")
        print()

    print("Is the floor narrow enough for the comparison to say anything?")
    for b, gb in d.groupby("bin"):
        f = gb[gb.kind == "same"].cos
        width = f.quantile(.95) - f.quantile(.05)
        rep = gb[gb.kind == "replication"].cos.median()
        acr = gb[gb.kind == "across"].cos.median()
        below = (gb[gb.kind == "across"].cos < f.quantile(.05)).mean()
        print(f"  bin {b:>2}: floor 90% interval width {width:.3f}   "
              f"replication {rep:.3f}   across-condition {acr:.3f}   "
              f"across below floor: {below:.0%}")

    out = Path("analysis/outputs/final/eigenvector_floor.csv")
    out.parent.mkdir(parents=True, exist_ok=True)
    d.to_csv(out, index=False)
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
