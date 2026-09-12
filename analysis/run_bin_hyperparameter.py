"""
Select the state bin per individual, on a yardstick that does not move with it.

Nothing requires one bin width for everyone. It is a hyperparameter like the
ridge penalty, and the ridge penalty is already chosen per participant. But it
cannot be tuned on held-out SKILL, because skill is 1 - MSE/MSE_persistence and
both of those change when the bin changes: a wider bin has a different target,
a different baseline, and fewer transitions. Maximizing that number across bins
compares quantities that are not on the same scale.

The fix is to score every candidate bin on one fixed, bin-independent target:
predict the side of each individual held-out RESPONSE. A response is a response
whatever window was used to build the state, so Brier scores from a 3-bin model
and a 20-bin model are directly comparable. The bin then earns its width by
predicting the same thing better, or it does not.

    python3 analysis/run_bin_hyperparameter.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dynalysis import adapt, states as S            # noqa: E402

EVENTS = Path("analysis/data/final_events.csv")
CANDIDATES = (3, 4, 5, 7, 10, 15, 20)   # 3 is the floor build_states allows
TRAIN_FRAC = 0.70
RIDGE = 1.0


def response_level_brier(g_raw, b, train_frac=TRAIN_FRAC, alpha=RIDGE):
    """Fit an operator on states binned at b, then score it on individual
    responses. Returns (brier, brier_baserate, n_scored) or None.

    The operator predicts the next state; its P(left) coordinate is read as the
    probability that each response in the NEXT bin goes left. Every candidate
    bin is therefore scored on the identical set of held-out responses.
    """
    prep = adapt.add_primitives(adapt.prepare(g_raw))
    st = S.build_states(prep, b, context_col="context_segment")
    tr = S.build_transitions(st, context_col="context_segment")
    if len(tr) < 60:
        return None
    tr = tr.sort_values(["context_t", "transition_order"])
    xc, yc = S.x_cols(), S.y_cols()
    n = int(len(tr) * train_frac)
    X, Y = tr[xc].to_numpy(), tr[yc].to_numpy()
    Xtr_r, Ytr_r = X[:n], Y[:n]
    mu, sd = Xtr_r.mean(0), Xtr_r.std(0)
    sd[sd == 0] = 1.0
    Xtr, Ytr = (Xtr_r - mu) / sd, (Ytr_r - mu) / sd
    d = Xtr.shape[1]
    A = np.linalg.solve(Xtr.T @ Xtr + alpha * np.eye(d), Xtr.T @ Ytr)

    # held-out: predicted P(left) for each test transition, unstandardized
    Xte = (X[n:] - mu) / sd
    pred = (Xte @ A) * sd + mu
    p_left = np.clip(pred[:, 0], 0.01, 0.99)

    # the observed proportion in the target bin, and how many responses it holds
    obs = Y[n:, 0]
    w = np.full(len(obs), b, dtype=float)

    # Brier on individual responses: for a bin of b responses with observed
    # proportion q, the mean squared error over those responses is
    # q(1-p)^2 + (1-q)p^2, which is the exact response-level Brier score.
    brier = float(np.sum(w * (obs * (1 - p_left) ** 2
                              + (1 - obs) * p_left ** 2)) / np.sum(w))
    base = float(np.mean(Y[:n, 0]))
    base = min(max(base, 0.01), 0.99)
    brier_base = float(np.sum(w * (obs * (1 - base) ** 2
                                   + (1 - obs) * base ** 2)) / np.sum(w))
    return brier, brier_base, float(np.sum(w))


def main() -> None:
    raw = adapt.load_new_events(EVENTS)
    rows = []
    for pid, g_raw in raw.groupby("participant_id"):
        rec = {"participant_id": pid}
        for b in CANDIDATES:
            r = response_level_brier(g_raw, b)
            if r is None:
                continue
            brier, base, n = r
            rec[f"skill_b{b}"] = 1 - brier / base
            rec["n_responses_scored"] = n
        cand = {b: rec.get(f"skill_b{b}") for b in CANDIDATES
                if rec.get(f"skill_b{b}") is not None}
        if not cand:
            continue
        rec["best_bin"] = max(cand, key=cand.get)
        rec["best_skill"] = cand[rec["best_bin"]]
        rec["skill_at_10"] = cand.get(10, np.nan)
        rec["skill_at_3"] = cand.get(3, np.nan)
        rows.append(rec)

    d = pd.DataFrame(rows)
    print(f"{len(d)} participants. Response-level Brier skill against each")
    print("participant's own base rate. Same held-out responses at every bin.\n")

    print("  Group-level: median skill by bin")
    for b in CANDIDATES:
        c = f"skill_b{b}"
        if c in d:
            print(f"    bin {b:>2}   {d[c].median():+.4f}")

    print(f"\n  Best bin per participant:")
    vc = d.best_bin.value_counts().sort_index()
    for b, c in vc.items():
        print(f"    bin {b:>2}   {c:>2} participants")
    print(f"\n  distinct bins chosen: {d.best_bin.nunique()} of {len(CANDIDATES)}")
    print(f"  median best bin: {d.best_bin.median():.0f}   "
          f"range {d.best_bin.min()}-{d.best_bin.max()}")

    gain_vs10 = d.best_skill - d.skill_at_10
    gain_vs3 = d.best_skill - d.skill_at_3
    print(f"\n  gain from per-participant tuning vs. fixed bin 10: "
          f"median {gain_vs10.median():+.4f}, "
          f"positive in {(gain_vs10 > 0).sum()}/{len(d)}")
    print(f"  gain from per-participant tuning vs. fixed bin  3: "
          f"median {gain_vs3.median():+.4f}, "
          f"positive in {(gain_vs3 > 0).sum()}/{len(d)}")

    out = Path("analysis/outputs/final/bin_hyperparameter.csv")
    out.parent.mkdir(parents=True, exist_ok=True)
    d.to_csv(out, index=False)
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
