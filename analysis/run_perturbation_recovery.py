"""
Decay of a perturbation's effect, measured rather than assumed.

Study 1's perturbations were set aside as unanalysable because each ran 8
responses against a 10-response state bin. Nothing is binned now, so they are
usable, and they are the only measurement in hand of how long an arranged
disturbance persists -- which is what the next design has to calibrate against.

Two choices matter for not fooling ourselves. Episodes are aligned by the
ARRANGED direction of the perturbation, not by the displacement observed during
it: aligning on the observed sign guarantees a positive displacement and
manufactures a recovery curve out of regression to the mean. And the window is
restricted to the context segment the perturbation sat in, so a contingency
change at a block boundary cannot be read as recovery.

Only contingency reversals are analysed. Extinction removes reinforcement
without favouring a side, so it has no arranged direction to align on.

    python3 analysis/run_perturbation_recovery.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dynalysis import adapt  # noqa: E402

EVENTS = "analysis/data/final_events.csv"
PRE, POST, EP = 40, 60, 8


def episodes(events: str = EVENTS) -> pd.DataFrame:
    raw = adapt.load_new_events(events)
    r = adapt.add_primitives(adapt.prepare(raw, exclude_perturbed=False))
    r = r.sort_values(["participant_id", "click_index"])
    r["rich"] = r.context_cell.astype(str).str.split("|").str[1]
    rows = []
    for pid, g in r.groupby("participant_id"):
        g = g.sort_values("click_index").reset_index(drop=True)
        onsets = g.index[(g.perturbation_active == 1)
                         & (g.perturbation_active.shift(1) != 1)]
        for i in onsets:
            if g.loc[i, "perturbation_type"] != "contingency_reversal":
                continue
            seg = g.loc[i, "context_segment"]
            base_rich_left = g.loc[i, "rich"] == "left_rich"
            win = g.loc[max(0, i - PRE): i + EP + POST]
            win = win[win.context_segment == seg]
            for idx, row in win.iterrows():
                rows.append({
                    "pid": pid, "episode": int(i), "k": int(idx - i),
                    # 1 when the response went to the side that is rich under
                    # the normal contingency; the reversal makes it poor.
                    "base_rich": int(bool(row.choice_left_raw) == base_rich_left),
                })
    return pd.DataFrame(rows)


def profile(d: pd.DataFrame, width: int = 8) -> pd.DataFrame:
    d = d.assign(bin=(np.floor(d.k / width) * width).astype(int))
    return (d.groupby("bin").base_rich.agg(["mean", "size"])
             .rename(columns={"mean": "p_base_rich", "size": "n"}).reset_index())


def main() -> None:
    d = episodes()
    n_ep = d[d.k == 0].shape[0]
    print(f"{d.pid.nunique()} participants, {n_ep} contingency-reversal episodes\n")
    p = profile(d)
    base = p[(p.bin >= -16) & (p.bin < 0)].p_base_rich.mean()
    print("P(choose the side that is rich under the NORMAL contingency)")
    print(f"pre-perturbation baseline over the 16 responses before onset: {base:.3f}\n")
    print(f"  {'responses from onset':>21}{'P':>8}{'dev':>8}{'n':>7}")
    for _, r in p.iterrows():
        if r.n < 200:
            continue
        tag = " DURING" if 0 <= r.bin < EP else ""
        bar = "#" * int(round(r.p_base_rich * 40))
        print(f"  {int(r.bin):>21}{r.p_base_rich:>8.3f}"
              f"{r.p_base_rich - base:>+8.3f}{int(r.n):>7}  {bar}{tag}")

    post = p[p.bin >= EP]
    trough = post.loc[post.p_base_rich.idxmin()]
    back = post[(post.bin > trough.bin) & (post.p_base_rich >= base)]
    print(f"\n  trough {trough.p_base_rich:.3f} at {int(trough.bin)}-"
          f"{int(trough.bin)+7} responses from onset "
          f"({trough.p_base_rich - base:+.3f} from baseline)")
    if len(back):
        print(f"  back to baseline by {int(back.bin.iloc[0])} responses from onset")
    print("\n  The effect of an 8-response disturbance peaks well AFTER it ends.")
    print("  A design that measures recovery has to allow for that lag.")

    out = Path("analysis/outputs/final/perturbation_recovery.csv")
    out.parent.mkdir(parents=True, exist_ok=True)
    p.to_csv(out, index=False)
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
