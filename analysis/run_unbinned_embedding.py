"""
Drop the bin entirely.

Every participant's best bin is 3, the smallest build_states permits, so the
optimum sits on the boundary and the sweep never saw past it. The honest
conclusion is not "3 is right" but "binning is costing us and we stopped
looking where the code stopped."

Binning was never required by the eigen approach. It was required by the
decision to make the state a vector of PROPORTIONS, which need several
responses to be defined. A lag embedding needs none: the state is the last k
responses themselves, and the operator is the companion matrix of an order-k
linear model. That matrix has a spectrum exactly as A does, so eigenvalues,
half-lives and modes all survive with no window at all.

Both models are scored on the identical held-out responses, as Brier against
each participant's own base rate, so the comparison is like for like.

    python3 analysis/run_unbinned_embedding.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dynalysis import adapt, states as S            # noqa: E402

EVENTS = Path("analysis/data/final_events.csv")
LAGS = (1, 2, 3, 5, 8, 12, 20)
TRAIN_FRAC = 0.70
RIDGE = 1.0
FEATURES = ["choice_left_raw", "reward_outcome", "switch_raw", "log_ici_for_state"]


def embed(df, k):
    """Lagged design at the response level, within context segments only."""
    Xs, ys = [], []
    for _, g in df.groupby("context_segment", sort=False):
        M = g[FEATURES].to_numpy(dtype=float)
        if len(M) < k + 2:
            continue
        cols = [M[k - 1 - i: len(M) - 1 - i] for i in range(k)]
        Xs.append(np.hstack(cols))
        ys.append(M[k:, 0])
    if not Xs:
        return None, None
    return np.vstack(Xs), np.concatenate(ys)


def brier_skill(Xtr, ytr, Xte, yte, alpha=RIDGE):
    mu, sd = Xtr.mean(0), Xtr.std(0)
    sd[sd == 0] = 1.0
    Xtr, Xte = (Xtr - mu) / sd, (Xte - mu) / sd
    Xtr = np.hstack([Xtr, np.ones((len(Xtr), 1))])
    Xte = np.hstack([Xte, np.ones((len(Xte), 1))])
    d = Xtr.shape[1]
    R = alpha * np.eye(d)
    R[-1, -1] = 0.0
    w = np.linalg.solve(Xtr.T @ Xtr + R, Xtr.T @ ytr)
    p = np.clip(Xte @ w, 0.01, 0.99)
    base = np.clip(ytr.mean(), 0.01, 0.99)
    return (1 - np.mean((yte - p) ** 2) / np.mean((yte - base) ** 2),
            np.linalg.solve(Xtr.T @ Xtr + R, Xtr.T @ ytr))


def companion_spectrum(w, k, nfeat):
    """Eigenvalues of the order-k model written as a first-order operator.

    Only the choice-on-choice lag coefficients enter the companion form for the
    choice coordinate; this is the AR part of the fitted model.
    """
    phi = np.array([w[i * nfeat + 0] for i in range(k)])
    C = np.zeros((k, k))
    C[0, :] = phi
    if k > 1:
        C[1:, :-1] = np.eye(k - 1)
    return np.linalg.eigvals(C)


def main() -> None:
    raw = adapt.load_new_events(EVENTS)
    rows = []
    for pid, g_raw in raw.groupby("participant_id"):
        prep = adapt.add_primitives(adapt.prepare(g_raw))
        rec = {"participant_id": pid}
        best = (-9, None, None)
        for k in LAGS:
            X, y = embed(prep, k)
            if X is None or len(X) < 200:
                continue
            n = int(len(X) * TRAIN_FRAC)
            sk, w = brier_skill(X[:n], y[:n], X[n:], y[n:])
            rec[f"skill_k{k}"] = sk
            if sk > best[0]:
                best = (sk, k, w)
        if best[1] is None:
            continue
        rec["best_lag"] = best[1]
        rec["best_skill"] = best[0]
        lam = companion_spectrum(best[2], best[1], len(FEATURES))
        rho = float(np.max(np.abs(lam)))
        rec["rho"] = rho
        rec["halflife_responses"] = (float(np.log(0.5) / np.log(rho))
                                     if 0 < rho < 1 else np.nan)
        rec["n_complex"] = int(np.sum(np.abs(np.imag(lam)) > 1e-9) // 2)
        rows.append(rec)

    d = pd.DataFrame(rows)
    print(f"{len(d)} participants. Brier skill on individual held-out "
          f"responses, against each participant's own base rate.\n")
    print("  Unbinned lag embedding: median skill by embedding order k")
    for k in LAGS:
        c = f"skill_k{k}"
        if c in d:
            print(f"    k = {k:>2}   {d[c].median():+.4f}")

    print(f"\n  best k per participant: "
          f"{dict(sorted(d.best_lag.value_counts().items()))}")
    print(f"  distinct orders chosen: {d.best_lag.nunique()} of {len(LAGS)}   "
          f"(median {d.best_lag.median():.0f}, range "
          f"{d.best_lag.min()}-{d.best_lag.max()})")

    print(f"\n  Comparison on the same yardstick:")
    print(f"    binned, bin 3 (the best bin)      +0.4533")
    print(f"    binned, bin 10 (study 1's choice) +0.0118")
    print(f"    unbinned lag embedding, tuned k   {d.best_skill.median():+.4f}")

    print(f"\n  Spectrum of the companion matrix, no window involved:")
    print(f"    spectral radius     median {d.rho.median():.3f}   "
          f"range {d.rho.min():.3f}-{d.rho.max():.3f}")
    print(f"    half-life           median {d.halflife_responses.median():.1f} "
          f"responses")
    print(f"    complex pairs       {(d.n_complex > 0).sum()}/{len(d)} participants")

    out = Path("analysis/outputs/final/unbinned_embedding.csv")
    out.parent.mkdir(parents=True, exist_ok=True)
    d.to_csv(out, index=False)
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
