#!/usr/bin/env python3
"""
Choose the state bin per participant instead of fixing it at 10.

    python3 run_bin_selection.py --events data/pilot_events.csv

Reports, for each participant, the smallest bin at which every state coordinate
reaches the target noise ratio, which coordinates carry no signal for them, and
whether measurement or the design is the binding constraint.
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dynalysis.binsize import choose_bin, half_life_responses  # noqa: E402

HERE = Path(__file__).resolve().parent

COORDS = {
    "is_left": True,
    "reward_outcome": True,
    "switched": True,
    "logici": False,
}
PRETTY = {"is_left": "choice P(left)", "reward_outcome": "reward rate",
          "switched": "switch rate", "logici": "mean log ICI"}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--events", default=str(HERE / "data" / "pilot_events.csv"))
    ap.add_argument("--target-noise", type=float, default=0.5)
    ap.add_argument("--min-transitions", type=int, default=40)
    ap.add_argument("--out", default=str(HERE / "outputs" / "bin_selection.csv"))
    args = ap.parse_args()

    d = pd.read_csv(args.events, low_memory=False)
    d["is_left"] = (d.chosen_option == "left").astype(float)
    d["logici"] = np.log(d.ici_ms.clip(lower=1))

    rows = []
    print(f"\nTarget noise ratio {args.target_noise}; probe bin 10; "
          f"floor {args.min_transitions} transitions per cell\n")
    for pid, g in d.groupby("participant_id"):
        g = g.sort_values("trial_index")
        cell = int(g[g.part == "reversal"]
                   .groupby(["context_color", "functional_contingency_id"]).size().min())
        ch = choose_bin(g, COORDS, target_noise=args.target_noise,
                        min_transitions=args.min_transitions,
                        cell_responses=cell, participant=str(pid))

        print(f"{pid[:8]}   bin = {ch.bin_size}   "
              f"transitions/cell = {ch.transitions_weakest_cell}   "
              f"limited by {ch.limited_by}")
        for f in ch.coordinates:
            mark = "  " if f.usable else " <- no signal, dropped"
            need = "inf" if not np.isfinite(f.min_bin) else f"{f.min_bin:.1f}"
            print(f"     {PRETTY[f.name]:>14}  needs bin {need:>6}  "
                  f"observed/floor {f.signal_ratio:>5.2f}x{mark}")
            rows.append(dict(participant_id=pid, coordinate=f.name,
                             min_bin=f.min_bin, signal_ratio=f.signal_ratio,
                             usable=f.usable, chosen_bin=ch.bin_size,
                             transitions=ch.transitions_weakest_cell,
                             limited_by=ch.limited_by))
        print()

    out = Path(args.out); out.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(out, index=False)
    print(f"-> {out}")

    print("\nEigenvalues fitted at different bins are compared per response:")
    print("  a mode with |lambda| = 0.6 at bin 8 and one with |lambda| = 0.45 at bin 15")
    print(f"  have half-lives of {half_life_responses(0.6, 8):.1f} and "
          f"{half_life_responses(0.45, 15):.1f} responses -- the comparable quantity.")


if __name__ == "__main__":
    main()
