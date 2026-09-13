"""
Per-dimension control in the MNC task, estimated from the whole choice set.

The obvious measure -- did the chosen compound match the winner on dimension d,
against the chance rate implied by how many alternatives carried the winner's
value -- is WRONG for version 1.1.0, and the way it fails is quiet. A
participant who chooses correctly has chosen the winner, and the winner matches
itself on every dimension, so a chooser reading only the relevant dimensions
still scores a large positive "lift" on the irrelevant ones. Checked against
the real trial generator with a ground-truth chooser, the raw measure gave
+50% on relevant dimensions and +37% on irrelevant ones: no separation.

What identifies control is the alternatives NOT chosen. A conditional logit
over the four alternatives,

    P(choose j) proportional to exp( SUM_d beta_d * 1[alt_j matches winner on d] )

estimates beta_d from variation across the whole choice set. Against the same
ground-truth chooser this separates arranged relevant from arranged irrelevant
at every accuracy below ceiling -- 0.83 against 0.22 at the 45% accuracy these
participants actually show -- and fails only at 100%, where a perfect chooser
provides nothing to identify which dimensions they used. Errors carry the
information, which is a second reason the probabilistic arm is not optional.

    python3 analysis/run_mnc_control.py [--events analysis/data/mnc_pilot_live.csv]
"""

from __future__ import annotations

import argparse
import ast
from pathlib import Path

import numpy as np
import pandas as pd

DIMS = ["shape", "size", "orientation", "hue"]
N_DIM = len(DIMS)


def compound(i: int) -> list[int]:
    """Compound index -> one bit per dimension, matching the task's encoding."""
    return [(int(i) >> d) & 1 for d in range(N_DIM)]


def parse_alts(v) -> list[int]:
    if isinstance(v, str):
        return [int(x) for x in ast.literal_eval(v.replace("{", "[").replace("}", "]"))]
    return list(v)


def fit_conditional_logit(X: np.ndarray, y: np.ndarray, iters=600, lr=0.5,
                          ridge=1e-3) -> np.ndarray:
    """X: (trials, alternatives, dims) of match indicators. y: chosen index."""
    b = np.zeros(X.shape[2])
    n = len(y)
    for _ in range(iters):
        u = X @ b
        p = np.exp(u - u.max(1, keepdims=True))
        p /= p.sum(1, keepdims=True)
        grad = X[np.arange(n), y].sum(0) - (p[:, :, None] * X).sum((0, 1))
        b += lr * (grad / n - ridge * b)
    return b


def design(g: pd.DataFrame):
    X, y = [], []
    for _, r in g.iterrows():
        alts = parse_alts(r.alternatives)
        if len(alts) != 4:
            continue
        win = compound(alts[int(r.target_position)])
        X.append([[1.0 if compound(a)[d] == win[d] else 0.0 for d in range(N_DIM)]
                  for a in alts])
        y.append(int(r.chosen_position))
    return np.array(X), np.array(y)


def spread_vs_null(X, y, n_null=400, seed=0):
    """Is the spread of betas across dimensions more than chance?

    The null is "every dimension controls choice equally". It is built by
    permuting the dimension columns independently within each trial, which
    destroys which dimension is which while leaving the choice set, the number
    of alternatives and the participant's actual choices untouched.
    """
    rng = np.random.default_rng(seed)
    obs = fit_conditional_logit(X, y)
    obs_spread = obs.max() - obs.min()
    null = []
    for _ in range(n_null):
        Xp = X.copy()
        for i in range(len(Xp)):
            Xp[i] = Xp[i][:, rng.permutation(X.shape[2])]
        b = fit_conditional_logit(Xp, y, iters=250)
        null.append(b.max() - b.min())
    return obs, obs_spread, float(np.quantile(null, 0.95))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--events", default="analysis/data/mnc_pilot_live.csv")
    a = ap.parse_args()
    d = pd.read_csv(a.events)
    d = d[d.is_test == 0] if "is_test" in d else d
    # a participant who reloaded contributes two sessions; keep the longer
    k = d.groupby(["prolific_pid", "session_id"]).size().reset_index(name="n")
    k = k.sort_values("n").groupby("prolific_pid").tail(1)
    d = d.merge(k[["prolific_pid", "session_id"]], on=["prolific_pid", "session_id"])
    d["pid"] = d.prolific_pid.str[:8]

    has_rel = "rel_shape" in d.columns and d.rel_shape.notna().any()
    ver = d.experiment_version.unique()
    print(f"{d.pid.nunique()} participants, {len(d)} trials, version(s) {list(ver)}")
    print(f"relevance recorded: {has_rel}\n")

    print(f"  {'pid':<10}{'n':>5}{'acc':>6}   " + "".join(f"{x:>12}" for x in DIMS)
          + f"{'spread':>9}{'null95':>9}  verdict")
    print("  " + "-" * 100)
    rows = []
    for pid, g in d.groupby("pid"):
        X, y = design(g)
        if len(y) < 40:
            continue
        b, spread, p95 = spread_vs_null(X, y)
        beats = spread > p95
        rows.append(dict(pid=pid, n=len(y), acc=g.correct.mean(),
                         spread=spread, null_p95=p95, beats_null=beats,
                         **dict(zip(DIMS, b))))
        print(f"  {pid:<10}{len(y):>5}{100*g.correct.mean():>5.0f}%   "
              + "".join(f"{v:>12.2f}" for v in b)
              + f"{spread:>9.2f}{p95:>9.2f}  {'DIFFERS' if beats else 'within null'}")

    r = pd.DataFrame(rows)
    if has_rel:
        print("\n  beta by arranged role (the comparison this design exists for):")
        rel, irr = [], []
        for pid, g in d.groupby("pid"):
            for rset, gg in g.groupby("relevant_dims"):
                if len(gg) < 30:
                    continue
                X, y = design(gg)
                b = fit_conditional_logit(X, y)
                for i, dim in enumerate(DIMS):
                    (rel if dim in str(rset).split("|") else irr).append(b[i])
        if rel and irr:
            print(f"    relevant   mean {np.mean(rel):+.2f}  (n={len(rel)})")
            print(f"    irrelevant mean {np.mean(irr):+.2f}  (n={len(irr)})")
    else:
        print("\n  Version 1.0.0: every dimension was relevant, so there is no")
        print("  role contrast to draw. All four betas should be positive, and")
        print("  that is a check on the estimator, not a finding.")
        print(f"    betas positive: "
              f"{int((r[DIMS] > 0).sum().sum())} of {len(r)*len(DIMS)}")
    print(f"\n  participants whose dimensions differ beyond their own null: "
          f"{int(r.beats_null.sum())} of {len(r)}")

    out = Path("analysis/outputs/final/mnc_control.csv")
    out.parent.mkdir(parents=True, exist_ok=True)
    r.to_csv(out, index=False)
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
