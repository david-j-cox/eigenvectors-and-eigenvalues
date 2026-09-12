"""
Binned against unbinned, at a matched prediction horizon.

run_unbinned_embedding.py scored the lag model at +0.76 against +0.45 for the
best bin, but that comparison was unfair and the number should not be used. A
binned model at width b predicts the MEAN OF THE NEXT b RESPONSES; the lag
model as written predicted only the next single response. Shorter horizons are
easier, so some of that gap was the horizon, not the representation.

Here both models predict the same target: the mean of the next h responses, for
h from 1 to 10, scored on the same held-out responses against the same base
rate. Binning can then only be blamed for what it actually costs.

    python3 analysis/run_matched_horizon.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dynalysis import adapt                          # noqa: E402

EVENTS = Path("analysis/data/final_events.csv")
HORIZONS = (1, 3, 5, 10)
TRAIN_FRAC = 0.70
RIDGE = 1.0
FEATURES = ["choice_left_raw", "reward_outcome", "switch_raw", "log_ici_for_state"]


def design(df, k, h, binned_width=None):
    """Predict the mean of the next h responses.

    k lags of history. If binned_width is set, history is first averaged into
    non-overlapping windows of that width -- the representation study 1 used --
    otherwise the raw responses are the state.
    """
    Xs, ys = [], []
    for _, g in df.groupby("context_segment", sort=False):
        M = g[FEATURES].to_numpy(dtype=float)
        if binned_width:
            n = len(M) // binned_width
            if n < k + 2:
                continue
            M_hist = M[:n * binned_width].reshape(n, binned_width, -1).mean(1)
            step = binned_width
        else:
            M_hist, step = M, 1
        if len(M_hist) < k + 2:
            continue
        for t in range(k, len(M_hist)):
            start = t * step
            if start + h > len(M):
                break
            Xs.append(np.concatenate([M_hist[t - 1 - i] for i in range(k)]))
            ys.append(M[start:start + h, 0].mean())
    if len(Xs) < 200:
        return None, None
    return np.array(Xs), np.array(ys)


def skill(X, y, alpha=RIDGE):
    n = int(len(X) * TRAIN_FRAC)
    Xtr, ytr, Xte, yte = X[:n], y[:n], X[n:], y[n:]
    mu, sd = Xtr.mean(0), Xtr.std(0)
    sd[sd == 0] = 1.0
    A = np.hstack([(Xtr - mu) / sd, np.ones((len(Xtr), 1))])
    B = np.hstack([(Xte - mu) / sd, np.ones((len(Xte), 1))])
    R = alpha * np.eye(A.shape[1])
    R[-1, -1] = 0.0
    w = np.linalg.solve(A.T @ A + R, A.T @ ytr)
    p = np.clip(B @ w, 0.0, 1.0)
    base = np.clip(ytr.mean(), 0.01, 0.99)
    denom = np.mean((yte - base) ** 2)
    return float(1 - np.mean((yte - p) ** 2) / denom) if denom > 0 else np.nan


def main() -> None:
    raw = adapt.load_new_events(EVENTS)
    rows = []
    for pid, g_raw in raw.groupby("participant_id"):
        prep = adapt.add_primitives(adapt.prepare(g_raw))
        for h in HORIZONS:
            rec = {"participant_id": pid, "horizon": h}
            # unbinned, embedding order tuned per participant
            best = -9
            for k in (1, 2, 3, 5, 8):
                X, y = design(prep, k, h)
                if X is None:
                    continue
                s = skill(X, y)
                if s > best:
                    best, rec["best_k"] = s, k
            rec["unbinned"] = best if best > -9 else np.nan
            # binned representations
            for b in (3, 10):
                X, y = design(prep, 3, h, binned_width=b)
                rec[f"binned{b}"] = skill(X, y) if X is not None else np.nan
            rows.append(rec)

    d = pd.DataFrame(rows)
    print(f"{d.participant_id.nunique()} participants. Both models predict the "
          f"mean of the next h responses.\n")
    print(f"  {'horizon':>8}{'unbinned':>12}{'binned b=3':>13}"
          f"{'binned b=10':>14}{'unbinned wins':>16}")
    print("  " + "-" * 61)
    for h, g in d.groupby("horizon"):
        wins = (g.unbinned > g.binned3).sum()
        print(f"  {h:>8}{g.unbinned.median():>+12.4f}{g.binned3.median():>+13.4f}"
              f"{g.binned10.median():>+14.4f}{f'{wins}/{len(g)}':>16}")

    print(f"\n  embedding order chosen, pooled over horizons: "
          f"{dict(sorted(d.best_k.value_counts().items()))}")
    per = d.groupby('participant_id').best_k.nunique()
    print(f"  participants whose best k is the same at every horizon: "
          f"{(per == 1).sum()}/{len(per)}")

    out = Path("analysis/outputs/final/matched_horizon.csv")
    out.parent.mkdir(parents=True, exist_ok=True)
    d.to_csv(out, index=False)
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
