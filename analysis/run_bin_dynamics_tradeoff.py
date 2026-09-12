"""
The state bin was sized to control sampling noise, and that choice decided the
dynamics question before it was asked.

Study 1 chose a 10-response bin from a noise criterion: a state coordinate is a
proportion over a handful of responses, so it carries binomial sampling noise,
and the noise ratio falls as the bin grows. That argument is correct and it
points one way only -- bigger is better.

It is only half the tradeoff. A bin is also a low-pass filter. Whatever happens
faster than the bin is averaged away before the operator ever sees it, so the
same move that cleans up the state destroys the dynamics the operator exists to
measure. Nothing in the original selection looked at that side.

This script measures both sides on the real data, using the comparison the
incumbent licenses. Baum and Davison (2009) model choice with a scalar linear
operator: one state coordinate, one rate parameter, one mode. Restricting our
operator to rank 1 is that model's reach. If the unrestricted operator predicts
held-out behavior better than rank 1 does, the scalar constraint binds.

Each participant is tested against their OWN order-shuffled null, so "better"
means better than what the estimator manufactures for free at that sample size.

    python3 analysis/run_bin_dynamics_tradeoff.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dynalysis import adapt, states as S           # noqa: E402

EVENTS = Path("analysis/data/final_events.csv")
BINS = (3, 5, 10, 20)
TRAIN_FRAC = 0.70
RIDGE = 1.0
N_NULL = 60


def fit_rank(X, Y, r, alpha):
    """Ridge solution restricted to rank r (Izenman, 1975)."""
    d = X.shape[1]
    A = np.linalg.solve(X.T @ X + alpha * np.eye(d), X.T @ Y)
    if r >= d:
        return A
    if r == 0:
        return np.zeros_like(A)
    _, _, Vt = np.linalg.svd(X @ A, full_matrices=False)
    return A @ (Vt[:r].T @ Vt[:r])


def split(tr, xc, yc):
    tr = tr.sort_values(["context_t", "transition_order"])
    n = int(len(tr) * TRAIN_FRAC)
    X, Y = tr[xc].to_numpy(), tr[yc].to_numpy()
    Xtr_r, Ytr_r, Xte_r, Yte_r = X[:n], Y[:n], X[n:], Y[n:]
    mu, sd = Xtr_r.mean(0), Xtr_r.std(0)
    sd[sd == 0] = 1.0
    return ((Xtr_r - mu) / sd, (Ytr_r - mu) / sd,
            (Xte_r - mu) / sd, (Yte_r - mu) / sd)


def main() -> None:
    raw = adapt.load_new_events(EVENTS)
    xc, yc = S.x_cols(), S.y_cols()
    rng = np.random.default_rng(0)
    out_rows = []

    for b in BINS:
        rows = []
        for pid, g_raw in raw.groupby("participant_id"):
            prep = adapt.add_primitives(adapt.prepare(g_raw))
            st = S.build_states(prep, b, context_col="context_segment")
            tr = S.build_transitions(st, context_col="context_segment")
            if len(tr) < 60:
                continue
            Xtr, Ytr, Xte, Yte = split(tr, xc, yc)
            if len(Xte) < 20:
                continue
            mp = np.mean((Yte - Xte) ** 2)
            sk = {r: 1 - np.mean((Yte - Xte @ fit_rank(Xtr, Ytr, r, RIDGE)) ** 2) / mp
                  for r in (0, 1, len(xc))}
            gain = sk[len(xc)] - sk[1]

            null = []
            for _ in range(N_NULL):
                Ys = Ytr[rng.permutation(len(Ytr))]
                g_full = 1 - np.mean((Yte - Xte @ fit_rank(Xtr, Ys, len(xc), RIDGE)) ** 2) / mp
                g_one = 1 - np.mean((Yte - Xte @ fit_rank(Xtr, Ys, 1, RIDGE)) ** 2) / mp
                null.append(g_full - g_one)

            rows.append({"bin": b, "participant_id": pid,
                         "n_transitions": len(tr),
                         "skill_rank0": sk[0], "skill_rank1": sk[1],
                         "skill_full": sk[len(xc)],
                         "gain_full_over_scalar": gain,
                         "null_gain_p95": float(np.quantile(null, 0.95)),
                         "beats_null": bool(gain > np.quantile(null, 0.95))})
        out_rows.extend(rows)

    d = pd.DataFrame(out_rows)
    print("Held-out skill = 1 - MSE/MSE_persistence, per participant, "
          f"{d.participant_id.nunique()} participants\n")
    print("  rank 0 = no dynamics (intercept only)")
    print("  rank 1 = one mode; the reach of a scalar linear operator")
    print("  full   = unrestricted 4x4 operator\n")
    hdr = (f"  {'bin':>4}{'transitions':>13}{'rank0':>8}{'rank1':>8}"
           f"{'full':>8}{'full-rank1':>12}{'beats own null':>16}")
    print(hdr)
    print("  " + "-" * (len(hdr) - 2))
    for b, g in d.groupby("bin"):
        print(f"  {b:>4}{g.n_transitions.median():>13.0f}"
              f"{g.skill_rank0.median():>8.3f}{g.skill_rank1.median():>8.3f}"
              f"{g.skill_full.median():>8.3f}"
              f"{g.gain_full_over_scalar.median():>+12.4f}"
              f"{f'{g.beats_null.sum()}/{len(g)}':>16}")

    best = d.groupby("bin").beats_null.sum().idxmax()
    print(f"\n  The scalar constraint binds at bin = {best}: the unrestricted")
    print(f"  operator beats rank 1 in "
          f"{d[d.bin == best].beats_null.sum()}/{d[d.bin == best].shape[0]} "
          f"participants against their own nulls.")
    print(f"  At bin = 10, the bin study 1 actually used, it binds in "
          f"{d[d.bin == 10].beats_null.sum()}/{d[d.bin == 10].shape[0]}.")

    out = Path("analysis/outputs/final/bin_dynamics_tradeoff.csv")
    out.parent.mkdir(parents=True, exist_ok=True)
    d.to_csv(out, index=False)
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
