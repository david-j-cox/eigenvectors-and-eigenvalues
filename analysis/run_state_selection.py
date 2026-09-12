#!/usr/bin/env python3
"""
Choose the state vector, using the same criterion that chose it for the
previous study.

The criterion is discrimination: how well the dominant eigenvector separates
two estimates of the same operator from two estimates of genuinely different
ones. A coordinate earns its place by making that separation better, not by
being individually low-noise -- the least noisy coordinate in the previous
dataset was also the one whose removal helped most.

IMPORTANT: run this on REAL data. On simulated sessions it is close to
meaningless, and running it there produced a wrong answer once already.

A simulated responder's context-specific dynamics are whatever its author gave
it. The agent calibrated to human switching statistics has almost none -- its
changeover probabilities are fixed constants, so its transition operator barely
differs between contexts -- and every candidate state scores near chance
against it. A hand-tuned melioration agent scored much higher, but only because
its own adaptation rule was context-dependent by construction. Neither number
is about the state vector; both are about the agent.

What simulation legitimately sizes is the estimator: how many transitions are
needed before two estimates of a KNOWN operator can be told apart. That lives
in `reanalysis/run_design_sim.py` and simulates from operators fitted to real
participants, which is why its answers are usable and these are not.

Usage:
    python run_state_selection.py [--events PATH] [--bin 10] [--quick]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from dynalysis import adapt, design_simulation as D, eigen as E, states as S  # noqa: E402
import dynalysis.states as ST  # noqa: E402

N_GRID = (15, 20, 30, 36, 50, 80)

VARIANTS = {
    "4D_full": ["choice_prop_left", "reward_rate", "switch_rate", "mean_log_ici"],
    "3D_no_ici": ["choice_prop_left", "reward_rate", "switch_rate"],
    "3D_no_switch": ["choice_prop_left", "reward_rate", "mean_log_ici"],
    "2D_choice_switch": ["choice_prop_left", "switch_rate"],
    "2D_choice_reward": ["choice_prop_left", "reward_rate"],
}


def ingredients(g: pd.DataFrame, cols: list[str], bin_clicks: int, alpha: float):
    from sklearn.linear_model import Ridge
    from sklearn.preprocessing import StandardScaler

    xc = [f"{c}_t" for c in cols]
    yc = [f"{c}_next" for c in cols]

    scaler = StandardScaler().fit(g[xc].to_numpy())
    X, Y = scaler.transform(g[xc].to_numpy()), scaler.transform(g[yc].to_numpy())
    A = Ridge(alpha=alpha, fit_intercept=True).fit(X, Y).coef_
    Q = np.cov(Y - X @ A.T, rowvar=False)

    original = ST.STATE_COLS[:]
    ST.STATE_COLS[:] = cols
    try:
        Sigma = E.measurement_noise_cov(g, scaler, bin_clicks)
    finally:
        ST.STATE_COLS[:] = original

    ops = {}
    for ctx, gc in g.groupby("context_t"):
        if len(gc) < 12:
            continue
        Xc = scaler.transform(gc[xc].to_numpy())
        Yc = scaler.transform(gc[yc].to_numpy())
        ops[ctx] = Ridge(alpha=alpha, fit_intercept=True).fit(Xc, Yc).coef_

    if len(ops) < 2:
        return None
    keys = sorted(ops)
    a, b = max(
        ((p, q) for i, p in enumerate(keys) for q in keys[i + 1:]),
        key=lambda pr: np.linalg.norm(ops[pr[0]] - ops[pr[1]]),
    )
    return ops[a], ops[b], Q, Sigma


def md_table(df: pd.DataFrame) -> list[str]:
    cols = list(df.columns)
    rows = ["| " + " | ".join(str(c) for c in cols) + " |",
            "|" + "|".join("---" for _ in cols) + "|"]
    for _, r in df.iterrows():
        rows.append("| " + " | ".join(
            f"{r[c]:.3f}" if isinstance(r[c], (float, np.floating)) else str(r[c])
            for c in cols
        ) + " |")
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--events", default=str(HERE / "data" / "sim_stationary.csv"))
    ap.add_argument("--bin", type=int, default=10)
    ap.add_argument("--out", default=str(HERE / "outputs"))
    ap.add_argument("--quick", action="store_true")
    args = ap.parse_args()

    n_rep = 60 if args.quick else 250
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    raw = adapt.load_new_events(args.events)
    prepared = adapt.add_primitives(adapt.prepare(raw))
    st = S.build_states(prepared, args.bin, context_col="context_segment")
    tr = S.build_transitions(st, context_col="context_segment")
    cell = tr["context_t"].astype(str).str.rsplit("|", n=1).str[0]
    tr = tr.assign(context_t=cell, context_next=cell)

    frames, noise_rows = [], []
    for i, (pid, g) in enumerate(tr.groupby("participant_id"), 1):
        print(f"  [{i}] {pid}", flush=True)
        for name, cols in VARIANTS.items():
            ing = ingredients(g, cols, args.bin, alpha=1.0)
            if ing is None:
                continue
            A, A_diff, Q, Sigma = ing
            d = D.discrimination(
                A, A_diff, Q, N_GRID, Sigma_obs=Sigma, n_rep=n_rep, seed=1000 + i
            )
            d["variant"] = name
            frames.append(d)

        for c in VARIANTS["4D_full"]:
            vals = g[f"{c}_t"].to_numpy(float)
            n = g["n_clicks_t"].to_numpy(float)
            noise = (
                np.var(vals, ddof=1) / args.bin
                if c == "mean_log_ici"
                else float(np.mean(vals * (1 - vals) / np.maximum(n, 1)))
            )
            total = float(np.var(vals, ddof=1))
            noise_rows.append({"coordinate": c, "noise_ratio": noise / total})

    res = pd.concat(frames, ignore_index=True)
    summary = (
        res.groupby(["variant", "n_transitions"], as_index=False)
        .median(numeric_only=True).round(3)
    )
    summary.to_csv(out_dir / "state_selection.csv", index=False)

    pivot = (
        summary.pivot_table(index="n_transitions", columns="variant", values="auc")
        .round(3).reset_index()
    )
    noise = (
        pd.DataFrame(noise_rows).groupby("coordinate", as_index=False)
        .median(numeric_only=True).round(3)
    )

    at_design = summary.loc[summary["n_transitions"] == 36]
    best = at_design.loc[at_design["auc"].idxmax(), "variant"] if len(at_design) else "n/a"

    lines = [
        "# State selection for the new task",
        "",
        f"Events: `{args.events}`  ",
        f"Bin: {args.bin} responses. AUC for separating same-operator from "
        "different-operator pairs, median across participants.",
        "",
        *md_table(pivot),
        "",
        f"At the 36 transitions per cell the design delivers, the best state is "
        f"**{best}**.",
        "",
        "## Sampling noise per coordinate",
        "",
        *md_table(noise),
        "",
        "Noise ratio alone does not decide inclusion. A coordinate can be noisy "
        "and still earn its place by carrying context-discriminative variance, "
        "and a quiet coordinate can hurt by loading similarly in every context "
        "and diluting the differences under test.",
        "",
    ]
    (out_dir / "state_selection.md").write_text("\n".join(lines), encoding="utf-8")
    print(pivot.to_string(index=False))
    print()
    print(noise.to_string(index=False))


if __name__ == "__main__":
    main()
