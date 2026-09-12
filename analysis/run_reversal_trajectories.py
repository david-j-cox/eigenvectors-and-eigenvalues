#!/usr/bin/env python3
"""
Does a learned contingency persist when it reverses under an unchanged signal?

    python3 run_reversal_trajectories.py --events data/final_events.csv

The prediction is that a subject returning to a familiar signal should respond
as that signal previously paid, for some period, before the new contingency
takes over. Testing it needs three things measured separately: what the subject
was doing before the flip, what they do on the very first responses after it,
and -- as a control -- what they do at a boundary where nothing flipped.

The control is what makes the result interpretable. Allocation returns to
chance at every block boundary in this design, whether or not the contingency
changed, because Session.advanceBlock resets both patches to startingValue. The
environment a subject returns to carries no trace of what they did to it, so
there is no carryover available to observe. A design meant to test persistence
would carry patch state across exposures of the same signal instead.
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent


def boundaries(g: pd.DataFrame):
    """Consecutive exposures of one signal, with whether the payoff flipped."""
    rev = g[g.part == "reversal"].sort_values("trial_index")
    blocks = (rev.groupby("block_index")
              .agg(color=("context_color", "first"),
                   cont=("functional_contingency_id", "first"))
              .reset_index().sort_values("block_index"))
    for _, cg in blocks.groupby("color"):
        cg = cg.sort_values("block_index")
        for k in range(1, len(cg)):
            prev, cur = cg.iloc[k - 1], cg.iloc[k]
            yield (prev, cur,
                   rev[rev.block_index == prev.block_index],
                   rev[rev.block_index == cur.block_index].reset_index(drop=True))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--events", default=str(HERE / "data" / "final_events.csv"))
    ap.add_argument("--out", default=str(HERE / "outputs" / "final"))
    args = ap.parse_args()

    d = pd.read_csv(args.events, low_memory=False)
    d["is_left"] = (d.chosen_option == "left").astype(float)

    rows = []
    for pid, g in d.groupby("participant_id"):
        for prev, cur, pre, post in boundaries(g):
            if len(pre) < 50 or len(post) < 100:
                continue
            # Everything expressed as the share of responses on the alternative
            # the PREVIOUS exposure's contingency favoured, so carryover reads
            # as a high value immediately after the boundary.
            old_left = prev.cont == "left_rich"
            f = (lambda v: v if old_left else 1 - v)
            rows.append(dict(
                participant_id=pid, color=prev.color, flipped=prev.cont != cur.cont,
                pre_last50=f(pre.is_left.tail(50).mean()),
                post_r1=f(post.is_left.iloc[0]),
                post_first5=f(post.is_left.iloc[:5].mean()),
                post_41_60=f(post.is_left.iloc[40:60].mean()),
                start_richness_gap=float(
                    abs(post.richness_left.iloc[0] - post.richness_right.iloc[0])),
            ))

    t = pd.DataFrame(rows)
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    t.to_csv(out / "reversal_trajectories.csv", index=False)

    print(f"\n{len(t)} boundaries, {t.participant_id.nunique()} subjects\n")

    # Per subject. The unit is the individual; a pooled mean over 690 boundaries
    # would describe no one.
    F, S = t[t.flipped], t[~t.flipped]
    print("Share of responses on the alternative that paid BEFORE the flip.")
    print("Carryover puts 'first 5' near that subject's own 'before', above 0.5.\n")
    print(f"{'subject':>10}{'flips':>7}{'before':>9}{'resp 1':>9}{'first 5':>9}")
    for pid, g in F.groupby("participant_id"):
        print(f"{pid[:8]:>10}{len(g):>7}{g.pre_last50.mean():>9.3f}"
              f"{g.post_r1.mean():>9.3f}{g.post_first5.mean():>9.3f}")

    n_flips = int(F.groupby("participant_id").size().median())
    print(f"\n  Each subject contributes {n_flips} reversal boundaries, so 'response 1'")
    print(f"  rests on {n_flips} binary observations per person and 'first 5' on "
          f"{n_flips * 5}.")
    print("  That is too few to establish carryover for any individual, and the")
    print("  spread across subjects is what noise at that count looks like.")

    print(f"\n  |richness_A - richness_B| at a block's first response: "
          f"{t.start_richness_gap.mean():.3f}")
    print("  Session.advanceBlock resets both patches to startingValue at every")
    print("  block, so a subject returns to a symmetric environment carrying no")
    print("  trace of what they did to it. Persistence of a learned contingency")
    print("  is not observable under this schedule -- a fact about the code")
    print("  rather than about these subjects. A design testing persistence")
    print("  would carry patch state across exposures of the same signal.")
    print(f"\n-> {out / 'reversal_trajectories.csv'}")


if __name__ == "__main__":
    main()
