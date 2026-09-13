"""
The incumbent measures against the decay measurement, on identical responses.

The introduction claims that log d and matching sensitivity express influence
as a magnitude and cannot represent persistence. That is a claim about what the
measures can do, and it is testable here: compute all of them on the same
responses and ask whether the incumbent tracks magnitude, whether it tracks
persistence, and whether it can resolve a difference in persistence between two
variables matched on magnitude.

    python3 analysis/run_measure_comparison.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dynalysis import operator_task as ot  # noqa: E402

OUT = Path("analysis/outputs/figures")
INK, MUTED, GRID = "#1B211F", "#8A928E", "#DDE2DF"
APP, AVR = "#B8860B", "#96382F"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9,
                     "axes.edgecolor": MUTED, "axes.spines.top": False,
                     "axes.spines.right": False, "figure.facecolor": "white"})


def collect() -> pd.DataFrame:
    d = ot.load("analysis/data/operator_pilot.csv")
    rows = []
    for pid in sorted(d.pid.unique()):
        g = d[d.pid == pid]
        if len(g) < 300:
            continue
        ms = ot.matching_sensitivity(g)
        k, _ = ot.select_order(g)
        fit = ot.fit_operator(g, k)
        for kind, col in (("appetitive", APP), ("aversive", AVR)):
            ld = ot.log_d(g, kind)
            f = ot.decay_fit(ot.stimulus_persistence(g, kind))
            if ld is None or f is None:
                continue
            good = f["r2"] > 0.2 and f["decays"] and np.isfinite(f["half_life"])
            rows.append({
                "pid": pid, "kind": kind, "colour": col,
                "n_events": ld["n"], "log_d": ld["log_d"], "log_d_se": ld["se"],
                "magnitude": f["magnitude"], "abs_mag": abs(f["magnitude"]),
                "half_life": f["half_life"] if good else np.nan,
                "fit_r2": f["r2"],
                "matching_a": ms["sensitivity"] if ms else np.nan,
                "operator_half_life": fit["half_life"] if fit else np.nan,
            })
    return pd.DataFrame(rows)


def main() -> None:
    t = collect()
    OUT.mkdir(parents=True, exist_ok=True)

    fig, ax = plt.subplots(1, 3, figsize=(12, 3.8))

    # 1. does log d track magnitude?
    a = ax[0]
    for _, r in t.iterrows():
        a.errorbar(r.abs_mag, abs(r.log_d), yerr=1.96 * r.log_d_se, fmt="o",
                   color=r.colour, ms=6, capsize=2, lw=1, alpha=.9)
    ok = t.dropna(subset=["abs_mag", "log_d"])
    if len(ok) > 2:
        rr = np.corrcoef(ok.abs_mag, ok.log_d.abs())[0, 1]
        a.set_title(f"log d against magnitude   r = {rr:+.2f}",
                    fontsize=9.5, loc="left")
    a.set_xlabel("magnitude added at lag 1 (matched control)")
    a.set_ylabel("|log d|  with 95% CI")

    # 2. does log d track persistence? it should not
    a = ax[1]
    sub = t.dropna(subset=["half_life"])
    for _, r in sub.iterrows():
        a.errorbar(r.half_life, abs(r.log_d), yerr=1.96 * r.log_d_se, fmt="o",
                   color=r.colour, ms=6, capsize=2, lw=1, alpha=.9)
        a.annotate(r.pid[:4], (r.half_life, abs(r.log_d)), fontsize=6.5,
                   xytext=(5, 3), textcoords="offset points", color=MUTED)
    if len(sub) > 2:
        rr = np.corrcoef(sub.half_life, sub.log_d.abs())[0, 1]
        a.set_title(f"log d against persistence   r = {rr:+.2f}   (n = {len(sub)})",
                    fontsize=9.5, loc="left")
    a.set_xlabel("half-life of the effect (responses)")
    a.set_ylabel("|log d|  with 95% CI")

    # 3. what the incumbent cannot separate
    a = ax[2]
    a.axhline(0, color=GRID, lw=1)
    labels, diffs, errs, cols = [], [], [], []
    for pid, g2 in t.groupby("pid"):
        if len(g2) != 2:
            continue
        ap = g2[g2.kind == "appetitive"].iloc[0]
        av = g2[g2.kind == "aversive"].iloc[0]
        labels.append(pid[:4])
        diffs.append(abs(ap.log_d) - abs(av.log_d))
        errs.append(1.96 * float(np.hypot(ap.log_d_se, av.log_d_se)))
        both = not np.isnan(ap.half_life) and not np.isnan(av.half_life)
        cols.append(INK if both else MUTED)
    y = np.arange(len(labels))
    a.barh(y, diffs, xerr=errs, color=cols, height=.55, alpha=.85,
           error_kw={"lw": 1, "capsize": 2})
    a.set_yticks(y)
    a.set_yticklabels(labels, fontsize=7.5)
    a.set_xlabel("|log d| appetitive − |log d| aversive, 95% CI")
    a.set_title("Difference in magnitude the incumbent reports",
                fontsize=9.5, loc="left")

    fig.tight_layout()
    fig.savefig(OUT / "measure_comparison.png", dpi=160)
    plt.close(fig)

    pd.set_option("display.width", 200)
    print(t[["pid", "kind", "n_events", "log_d", "log_d_se", "magnitude",
             "half_life", "fit_r2", "matching_a"]]
          .to_string(index=False, float_format=lambda v: f"{v:+.3f}", na_rep="  --"))
    sub = t.dropna(subset=["half_life"])
    print(f"\n  effects with a fitted half-life: {len(sub)} of {len(t)}")
    if len(sub) > 2:
        print(f"  corr(|log d|, magnitude) = "
              f"{np.corrcoef(t.abs_mag, t.log_d.abs())[0,1]:+.2f}")
        print(f"  corr(|log d|, half-life) = "
              f"{np.corrcoef(sub.half_life, sub.log_d.abs())[0,1]:+.2f}")
    t.to_csv("analysis/outputs/final/measure_comparison.csv", index=False)
    print("\nwrote analysis/outputs/figures/measure_comparison.png")


if __name__ == "__main__":
    main()
