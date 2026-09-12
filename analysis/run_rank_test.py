"""
How many dynamical modes does an individual's behavior actually need?

run_kernel_decomposition.py shows that counting modes in a fitted operator does
not answer this: an order-shuffled surrogate, with every trace of dynamics
destroyed, yields the same median mode count (3) and a comparable top-mode
share. A 4x4 operator fitted to noise still HAS four eigenvalues. Mode counting
measures the estimator, not the organism.

Held-out prediction cannot be gamed the same way. Restricting the operator's
rank removes modes; if those modes were carrying real structure, held-out error
rises, and if they were noise, it does not. This is the nested comparison that
the incumbent models license directly:

    rank 0   x(t+1) = c                 no dynamics, the intercept alone
    rank 1   one mode                   the Baum & Davison (2009) case
    rank 2..d                           progressively less restricted
    full                                unrestricted A

Reduced-rank regression is used for the restriction (Izenman, 1975): fit least
squares, then project the fitted values onto their own leading components.

    python3 analysis/run_rank_test.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dynalysis import adapt, states as S           # noqa: E402

EVENTS = Path("analysis/data/final_events.csv")
BIN = 10
TRAIN_FRAC = 0.70
RIDGE = 1.0


def fit_rank(X: np.ndarray, Y: np.ndarray, r: int, alpha: float) -> np.ndarray:
    """Ridge solution restricted to rank r. r >= X.shape[1] is unrestricted."""
    d = X.shape[1]
    G = X.T @ X + alpha * np.eye(d)
    A = np.linalg.solve(G, X.T @ Y)               # d x d, maps X -> Y
    if r >= d:
        return A
    if r == 0:
        return np.zeros_like(A)
    # project the fitted values onto their own top-r left singular directions
    F = X @ A
    U, s, Vt = np.linalg.svd(F, full_matrices=False)
    P = Vt[:r].T @ Vt[:r]
    return A @ P


def main() -> None:
    raw = adapt.load_new_events(EVENTS)
    xc, yc = S.x_cols(), S.y_cols()
    rows = []

    for pid, g_raw in raw.groupby("participant_id"):
        prep = adapt.add_primitives(adapt.prepare(g_raw))
        st = S.build_states(prep, BIN, context_col="context_segment")
        tr = S.build_transitions(st, context_col="context_segment")
        if len(tr) < 60:
            continue
        tr = tr.sort_values(["context_t", "transition_order"])
        n_tr = int(len(tr) * TRAIN_FRAC)
        Xtr_r, Ytr_r = tr[xc].to_numpy()[:n_tr], tr[yc].to_numpy()[:n_tr]
        Xte_r, Yte_r = tr[xc].to_numpy()[n_tr:], tr[yc].to_numpy()[n_tr:]
        if len(Xte_r) < 20:
            continue

        mu, sd = Xtr_r.mean(0), Xtr_r.std(0)
        sd[sd == 0] = 1.0
        Xtr, Ytr = (Xtr_r - mu) / sd, (Ytr_r - mu) / sd
        Xte, Yte = (Xte_r - mu) / sd, (Yte_r - mu) / sd

        # persistence baseline: predict the state stays where it is
        mse_persist = float(np.mean((Yte - Xte) ** 2))

        r = {"participant_id": pid, "n_test": len(Xte)}
        for rank in range(0, len(xc) + 1):
            A = fit_rank(Xtr, Ytr, rank, RIDGE)
            pred = Xte @ A
            mse = float(np.mean((Yte - pred) ** 2))
            r[f"skill_rank{rank}"] = 1 - mse / mse_persist
        rows.append(r)

    d = pd.DataFrame(rows)
    ranks = [c for c in d.columns if c.startswith("skill_rank")]
    print(f"{len(d)} participants, held-out skill = 1 - MSE/MSE_persistence\n")
    print(f"  {'rank':<8}{'median':>9}{'IQR':>18}{'n better than rank 1':>24}")
    for c in ranks:
        k = int(c.replace("skill_rank", ""))
        v = d[c]
        q1, q3 = v.quantile([.25, .75])
        better = (d[c] > d["skill_rank1"] + 1e-9).sum() if k != 1 else None
        b = f"{better}/{len(d)}" if better is not None else "--"
        print(f"  {k:<8}{v.median():>9.3f}{f'[{q1:.3f}, {q3:.3f}]':>18}{b:>24}")

    print("\n  gain from rank 1 -> full, per participant:")
    gain = d[ranks[-1]] - d["skill_rank1"]
    print(f"    median {gain.median():+.4f}   "
          f"IQR [{gain.quantile(.25):+.4f}, {gain.quantile(.75):+.4f}]")
    print(f"    participants improved by full rank: "
          f"{(gain > 0).sum()}/{len(d)}")
    print(f"    improved by more than 0.01 skill:   "
          f"{(gain > 0.01).sum()}/{len(d)}")

    out = Path("analysis/outputs/final/rank_test.csv")
    out.parent.mkdir(parents=True, exist_ok=True)
    d.to_csv(out, index=False)
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
