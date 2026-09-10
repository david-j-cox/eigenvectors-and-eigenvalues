#!/usr/bin/env python3
"""
Does the state vector need all four coordinates?

Switch rate is the noise-dominated coordinate in the existing data and it
carries the dominant mode for only a small minority of participants. Dropping
it takes the operator from 16 free parameters to 9, which should lower the
sample size the replication test needs. This script measures whether that
trade is worth making, using each participant's own operator and noise.

Outputs reanalysis/outputs/state_dimension_comparison.csv and a short summary.

Usage:
    python run_state_dim.py [--bin 10] [--n-participants 20] [--quick]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from dynalysis import design_simulation as D  # noqa: E402
from dynalysis import eigen as E  # noqa: E402
from dynalysis import operators as O  # noqa: E402
from dynalysis import states as S  # noqa: E402
from run_reanalysis import DEFAULT_EVENTS, md_table   # noqa: E402

N_GRID = (10, 15, 20, 30, 40, 60, 80)

# Variants with and without the obtained-reward coordinate.
#
# Under an interval schedule obtained reinforcement is rate-limited by the
# schedule rather than by behaviour, so that coordinate carries almost no
# between-bin variance in the new task. The question these variants answer is
# whether it was earning its place even in the previous task, where it did vary,
# or whether a purely behavioural state does as well.
VARIANTS = {
    "4D_full": ["choice_prop_A", "reward_rate", "switch_rate", "mean_log_ici"],
    "3D_no_switch": ["choice_prop_A", "reward_rate", "mean_log_ici"],
    "3D_no_ici": ["choice_prop_A", "reward_rate", "switch_rate"],
    "3D_no_reward": ["choice_prop_A", "switch_rate", "mean_log_ici"],
    "2D_choice_switch": ["choice_prop_A", "switch_rate"],
    "2D_choice_reward": ["choice_prop_A", "reward_rate"],
}


def ingredients(g: pd.DataFrame, cols: list[str], bin_clicks: int, alpha: float):
    """Operator, process noise and observation noise restricted to `cols`."""
    xc = [f"{c}_t" for c in cols]
    yc = [f"{c}_next" for c in cols]

    from sklearn.linear_model import Ridge
    from sklearn.preprocessing import StandardScaler

    scaler = StandardScaler().fit(g[xc].to_numpy())
    X, Y = scaler.transform(g[xc].to_numpy()), scaler.transform(g[yc].to_numpy())
    A = Ridge(alpha=alpha, fit_intercept=True).fit(X, Y).coef_
    Q = np.cov(Y - X @ A.T, rowvar=False)

    idx = [S.STATE_COLS.index(c) for c in cols]
    Sigma_full = E.measurement_noise_cov(g, _pad_scaler(scaler, cols), bin_clicks)
    Sigma = Sigma_full[np.ix_(range(len(cols)), range(len(cols)))]

    # Two operators from the most dissimilar pair of contexts, for the
    # same-vs-different discrimination test.
    ctx_ops = {}
    for ctx, gc in g.groupby("context_t"):
        if len(gc) < 12:
            continue
        Xc = scaler.transform(gc[xc].to_numpy())
        Yc = scaler.transform(gc[yc].to_numpy())
        ctx_ops[ctx] = Ridge(alpha=alpha, fit_intercept=True).fit(Xc, Yc).coef_

    A_same, A_diff = A, None
    if len(ctx_ops) >= 2:
        keys = sorted(ctx_ops)
        a, b = max(
            ((p, q) for i, p in enumerate(keys) for q in keys[i + 1:]),
            key=lambda pr: np.linalg.norm(ctx_ops[pr[0]] - ctx_ops[pr[1]]),
        )
        A_same, A_diff = ctx_ops[a], ctx_ops[b]

    del idx
    return A_same, A_diff, Q, Sigma


class _pad_scaler:
    """Adapter so measurement_noise_cov sees the coordinates it expects.

    ``measurement_noise_cov`` iterates over the full STATE_COLS list; this
    exposes a ``scale_`` of the right length by filling unused coordinates with
    a harmless 1.0, then the caller slices out the block it asked for.
    """

    def __init__(self, scaler, cols):
        scale = np.ones(len(S.STATE_COLS))
        for i, c in enumerate(cols):
            scale[i] = scaler.scale_[i]
        self.scale_ = scale


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--events", default=str(DEFAULT_EVENTS))
    ap.add_argument("--bin", type=int, default=10)
    ap.add_argument("--n-participants", type=int, default=20)
    ap.add_argument("--out", default=str(HERE / "outputs"))
    ap.add_argument("--quick", action="store_true")
    args = ap.parse_args()

    n_rep = 60 if args.quick else 250
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    raw = S.load_events(args.events)
    tr_all = S.build_transitions(S.build_states(raw, args.bin))

    rng = np.random.default_rng(20260909)
    pids = sorted(tr_all["participant_id"].unique())
    if len(pids) > args.n_participants:
        pids = list(rng.choice(pids, size=args.n_participants, replace=False))

    frames = []
    for i, pid in enumerate(pids, 1):
        g = tr_all[tr_all["participant_id"] == pid]
        if len(g) < 30:
            continue
        print(f"  [{i}/{len(pids)}] {pid}", flush=True)
        for name, cols in VARIANTS.items():
            A, A_diff, Q, Sigma = ingredients(g, cols, args.bin, alpha=1.0)
            if A_diff is None:
                continue
            d = D.discrimination(
                A, A_diff, Q, N_GRID, Sigma_obs=Sigma, n_rep=n_rep,
                seed=20260909 + i,
            )
            d["variant"] = name
            d["n_params"] = len(cols) ** 2
            frames.append(d)

    res = pd.concat(frames, ignore_index=True)
    summary = (
        res.groupby(["variant", "n_params", "n_transitions"], as_index=False)
        .median(numeric_only=True)
        .round(3)
    )
    summary.to_csv(out_dir / "state_dimension_comparison.csv", index=False)

    pivot = summary.pivot_table(
        index="n_transitions", columns="variant", values="auc"
    ).round(3).reset_index()

    lines = [
        "# Does the state vector need all four coordinates?",
        "",
        f"State bin: {args.bin} responses. AUC for distinguishing same-operator "
        f"from different-operator pairs, median across "
        f"{res['variant'].groupby(res['variant']).size().min() // len(N_GRID)} "
        "participants.",
        "",
        *md_table(pivot),
        "",
        "Reaching AUC 0.80 requires, in transitions per operator estimate:",
        "",
        "| State | Free parameters | Transitions for AUC 0.80 | Responses per estimate |",
        "|---|---|---|---|",
    ]
    for name in VARIANTS:
        sub = summary.loc[summary["variant"] == name].sort_values("n_transitions")
        hit = sub.loc[sub["auc"] >= 0.80, "n_transitions"]
        n = int(hit.iloc[0]) if len(hit) else None
        lines.append(
            f"| {name} | {len(VARIANTS[name]) ** 2} | "
            f"{n if n else 'not reached in grid'} | "
            f"{D.responses_needed(n, args.bin) if n else '-'} |"
        )

    (out_dir / "state_dimension_summary.md").write_text("\n".join(lines), encoding="utf-8")
    print(pivot.to_string(index=False))


if __name__ == "__main__":
    main()
