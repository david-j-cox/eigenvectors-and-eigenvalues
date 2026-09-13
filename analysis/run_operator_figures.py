"""
Figures for the operator pilot. One page per participant, plus a summary.

Single-subject throughout: every panel shows one participant's data, and the
summary plots each participant as a point rather than a mean with error bars.

    python3 analysis/run_operator_figures.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dynalysis import operator_task as ot  # noqa: E402

OUT = Path("analysis/outputs/figures")
INK, MUTED, GRID = "#1B211F", "#8A928E", "#DDE2DF"
APP, AVR, BLK = "#B8860B", "#96382F", "#2E5C8A"

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 9,
    "axes.edgecolor": MUTED, "axes.labelcolor": INK, "text.color": INK,
    "xtick.color": MUTED, "ytick.color": MUTED,
    "axes.spines.top": False, "axes.spines.right": False,
    "figure.facecolor": "white", "axes.facecolor": "white",
})


def participant_page(g, pid, fit) -> plt.Figure:
    fig, ax = plt.subplots(2, 2, figsize=(10, 7.2))
    fig.suptitle(f"Participant {pid}   ·   {len(g)} responses   ·   "
                 f"{g.block_index.nunique()} blocks   ·   "
                 f"switch rate {g.switched.mean():.2f}",
                 fontsize=11, y=0.98)

    # --- 1. block transition time course ---
    a = ax[0, 0]
    prof = ot.transition_profile(g)
    if len(prof):
        a.axvline(0, color=MUTED, lw=1, ls="--")
        a.axhline(0.5, color=GRID, lw=1)
        a.plot(prof.k, prof.p, color=BLK, lw=1.4)
        a.fill_between(prof.k, 0.5, prof.p, color=BLK, alpha=.12)
    tr = ot.transitions(g)
    n_ok = int(tr.moved_as_arranged.sum()) if len(tr) else 0
    a.set_title(f"Reinforcement reversal  ·  moved as arranged {n_ok}/{len(tr)}",
                fontsize=9.5, loc="left")
    a.set_xlabel("responses from block boundary")
    a.set_ylabel("P(choose newly rich panel)")
    a.set_ylim(0, 1)

    # --- 2. what the stimulus adds over a matched unmarked response ---
    a = ax[0, 1]
    a.axhline(0, color=GRID, lw=1)
    for kind, col in (("appetitive", APP), ("aversive", AVR)):
        pr = ot.stimulus_persistence(g, kind)
        if pr.empty:
            continue
        a.plot(pr.k, pr.added, color=col, lw=1.4, marker="o", ms=3,
               label=kind)
        f = ot.decay_fit(pr)
        if f and f["decays"] and f["r2"] > 0.2 and np.isfinite(f["half_life"]):
            kk = np.linspace(1, pr.k.max(), 60)
            a.plot(kk, f["magnitude"] * np.exp(-np.log(2) * (kk - 1) / f["half_life"]),
                   color=col, lw=1, ls=":", alpha=.9)
            a.annotate(f"t½ = {f['half_life']:.1f}",
                       (pr.k.max(), f["magnitude"] * 0.25),
                       fontsize=7.5, color=col, ha="right")
    a.set_title("What the stimulus adds over a matched unmarked response",
                fontsize=9.5, loc="left")
    a.set_xlabel("responses after the stimulus")
    a.set_ylabel("added P(choose marked panel)")
    a.legend(frameon=False, fontsize=8)

    # --- 3. the correction itself, so it can be inspected ---
    a = ax[1, 0]
    pr = ot.stimulus_persistence(g, "appetitive")
    if not pr.empty:
        a.plot(pr.k, pr.p_marked, color=APP, lw=1.4, marker="o", ms=3,
               label="after a gold border")
        a.plot(pr.k, pr.p_control, color=MUTED, lw=1.4, ls="--", marker="o",
               ms=3, label="matched unmarked response")
        a.fill_between(pr.k, pr.p_control, pr.p_marked, color=APP, alpha=.15)
    a.set_title("Why the control is needed: stickiness vs the stimulus",
                fontsize=9.5, loc="left")
    a.set_xlabel("responses after the stimulus")
    a.set_ylabel("P(choose the marked panel)")
    a.set_ylim(0, 1)
    a.legend(frameon=False, fontsize=8)

    # --- 4. perturbation recovery ---
    a = ax[1, 1]
    pp = ot.perturbation_profile(g)
    if len(pp):
        a.axvspan(0, 8, color=MUTED, alpha=.13, lw=0)
        a.axhline(0.5, color=GRID, lw=1)
        a.plot(pp.k, pp.p, color=INK, lw=1.4)
        a.text(4, 0.03, "inverted", ha="center", fontsize=7.5, color=MUTED)
    hl = fit["half_life"] if fit and fit["stable"] else None
    a.set_title("Perturbation  ·  "
                + (f"operator half-life {hl:.1f} responses" if hl else "unstable fit"),
                fontsize=9.5, loc="left")
    a.set_xlabel("responses from perturbation onset")
    a.set_ylabel("P(choose panel the block favours)")
    a.set_ylim(0, 1)

    fig.tight_layout(rect=(0, 0, 1, 0.955))
    return fig


def summary_page(rows) -> plt.Figure:
    fig, ax = plt.subplots(1, 3, figsize=(11.5, 3.6))

    # magnitude of each variable's influence, per participant
    a = ax[0]
    x = np.arange(len(rows))
    a.axhline(0, color=GRID, lw=1)
    a.bar(x - .22, [r["B"]["appetitive"] for r in rows], width=.2, color=APP,
          label="appetitive")
    a.bar(x, [r["B"]["aversive"] for r in rows], width=.2, color=AVR,
          label="aversive")
    a.bar(x + .22, [r["B"]["block_rich"] for r in rows], width=.2, color=BLK,
          label="reinforcement")
    a.set_xticks(x)
    a.set_xticklabels([r["pid"] for r in rows], rotation=45, ha="right", fontsize=7)
    a.set_ylabel("coefficient in B")
    a.set_title("Influence of each variable, per participant",
                fontsize=9.5, loc="left")
    a.legend(frameon=False, fontsize=8)

    # magnitude against half-life -- the comparison the study exists for.
    # Open markers are fits the exponential does not describe (r2 < .2); their
    # half-life is not a measurement and is drawn at the ceiling.
    a = ax[1]
    CEIL = 14
    for r in rows:
        for key, col in (("app", APP), ("avr", AVR)):
            f = r[f"{key}_fit"]
            if f is None:
                continue
            good = f["r2"] > 0.2 and f["decays"] and np.isfinite(f["half_life"])
            y = min(f["half_life"], CEIL) if good else CEIL
            a.scatter(abs(f["magnitude"]), y, s=52, zorder=4,
                      facecolor=col if good else "white", edgecolor=col,
                      linewidth=1.4)
            if good:
                a.annotate(r["pid"][:4], (abs(f["magnitude"]), y), fontsize=6.5,
                           xytext=(5, 2), textcoords="offset points", color=MUTED)
    a.axhline(CEIL, color=GRID, lw=1, ls=":")
    a.text(0.02, CEIL - 0.6, "no decay within 12 responses", fontsize=7,
           color=MUTED)
    a.set_xlabel("magnitude added at lag 1")
    a.set_ylabel("half-life (responses)")
    a.set_ylim(0, CEIL + 1)
    a.set_title("Magnitude against persistence  ·  filled = exponential fits",
                fontsize=9.5, loc="left")

    # operator half-life per participant
    a = ax[2]
    hl = [r["half_life"] for r in rows]
    a.barh(np.arange(len(rows)), hl, color=INK, alpha=.75, height=.55)
    a.set_yticks(np.arange(len(rows)))
    a.set_yticklabels([r["pid"] for r in rows], fontsize=7)
    a.set_xlabel("half-life of the dominant mode (responses)")
    a.set_title("Operator persistence, per participant", fontsize=9.5, loc="left")

    fig.tight_layout()
    return fig


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    d = ot.load("analysis/data/operator_pilot.csv")
    sz = d.groupby(["pid", "session_id"]).size().reset_index(name="n")
    keep = sz.sort_values("n").groupby("pid").tail(1)
    d = d.merge(keep[["pid", "session_id"]], on=["pid", "session_id"])

    rows = []
    for pid in sorted(d.pid.unique()):
        g = d[d.pid == pid].sort_values("trial_index").reset_index(drop=True)
        if len(g) < 300:
            continue
        k, _ = ot.select_order(g)
        fit = ot.fit_operator(g, k)
        fig = participant_page(g, pid, fit)
        fig.savefig(OUT / f"operator_{pid}.png", dpi=160)
        plt.close(fig)
        rows.append({
            "pid": pid, "B": fit["B"], "half_life": fit["half_life"],
            "app_fit": ot.decay_fit(ot.stimulus_persistence(g, "appetitive")),
            "avr_fit": ot.decay_fit(ot.stimulus_persistence(g, "aversive")),
        })
        print(f"  wrote operator_{pid}.png")

    fig = summary_page(rows)
    fig.savefig(OUT / "operator_summary.png", dpi=160)
    plt.close(fig)
    print(f"  wrote operator_summary.png")


if __name__ == "__main__":
    main()
