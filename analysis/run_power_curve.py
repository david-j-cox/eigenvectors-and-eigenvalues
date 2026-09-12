"""
How many responses does one participant actually need?

Study 2 has one shot and a fixed budget, so the session length and the number
of participants trade directly against each other. That trade should be settled
by measurement, not by picking a round number: subsample study 1's responses,
refit, and find where the per-subject tests stop working.

Two tests are tracked, because they have different appetites.
  - Does the full operator beat the rank-1 (scalar) restriction, against that
    participant's own order-shuffled null? This is the comparison against Baum
    and Davison (2009).
  - Does the cue coefficient B recover the sign it has at full length? This is
    the manipulation check any multiple-control design depends on.

    python3 analysis/run_power_curve.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dynalysis import adapt                          # noqa: E402

EVENTS = Path("analysis/data/final_events.csv")
FRACTIONS = (0.10, 0.15, 0.25, 0.35, 0.50, 0.75, 1.00)
K = 3                     # embedding order
TRAIN_FRAC = 0.70
RIDGE = 1.0
N_NULL = 60
FEATURES = ["choice_left_raw", "reward_outcome", "switch_raw", "log_ici_for_state"]


def embed(df, k, cue=None):
    Xs, ys, us = [], [], []
    for seg, g in df.groupby("context_segment", sort=False):
        M = g[FEATURES].to_numpy(dtype=float)
        if len(M) < k + 3:
            continue
        cols = [M[k - 1 - i: len(M) - 1 - i] for i in range(k)]
        Xs.append(np.hstack(cols))
        ys.append(M[k:, 0])
        if cue is not None:
            us.append(g[cue].to_numpy()[k:])
    if not Xs:
        return None, None, None
    return (np.vstack(Xs), np.concatenate(ys),
            np.concatenate(us) if cue is not None else None)


def fit_predict(Xtr, ytr, Xte, rank=None, alpha=RIDGE):
    mu, sd = Xtr.mean(0), Xtr.std(0)
    sd[sd == 0] = 1.0
    A = np.hstack([(Xtr - mu) / sd, np.ones((len(Xtr), 1))])
    B = np.hstack([(Xte - mu) / sd, np.ones((len(Xte), 1))])
    R = alpha * np.eye(A.shape[1]); R[-1, -1] = 0.0
    W = np.linalg.solve(A.T @ A + R, A.T @ ytr)
    if rank == 1:
        # one direction of history only: project predictors onto their top PC
        Z = A[:, :-1]
        _, _, Vt = np.linalg.svd(Z - Z.mean(0), full_matrices=False)
        P = Vt[:1].T @ Vt[:1]
        A1 = np.hstack([(Z - Z.mean(0)) @ P, np.ones((len(A), 1))])
        B1 = np.hstack([(B[:, :-1] - Z.mean(0)) @ P, np.ones((len(B), 1))])
        R1 = alpha * np.eye(A1.shape[1]); R1[-1, -1] = 0.0
        W = np.linalg.solve(A1.T @ A1 + R1, A1.T @ ytr)
        return B1 @ W
    return B @ W


def main() -> None:
    raw = adapt.load_new_events(EVENTS)
    rng = np.random.default_rng(0)
    rows = []

    for pid, g_raw in raw.groupby("participant_id"):
        prep = adapt.add_primitives(adapt.prepare(g_raw))
        prep = prep.assign(cue=np.where(prep["context_color"] == "blue", 1.0, -1.0)
                           if "context_color" in prep.columns else 0.0)
        X_all, y_all, u_all = embed(prep, K, cue="cue")
        if X_all is None or len(X_all) < 400:
            continue
        # full-length reference sign of the cue coefficient
        XA = np.hstack([X_all, u_all[:, None]])
        mu, sd = XA.mean(0), XA.std(0); sd[sd == 0] = 1
        Z = np.hstack([(XA - mu) / sd, np.ones((len(XA), 1))])
        R = RIDGE * np.eye(Z.shape[1]); R[-1, -1] = 0
        ref_b = np.linalg.solve(Z.T @ Z + R, Z.T @ y_all)[-2]

        n_full = len(X_all)
        for fr in FRACTIONS:
            n = int(n_full * fr)
            if n < 120:
                continue
            X, y, u = X_all[:n], y_all[:n], u_all[:n]
            ntr = int(n * TRAIN_FRAC)
            Xtr, ytr, Xte, yte = X[:ntr], y[:ntr], X[ntr:], y[ntr:]
            base = np.clip(ytr.mean(), .01, .99)
            den = np.mean((yte - base) ** 2)
            if den <= 0:
                continue
            s_full = 1 - np.mean((yte - fit_predict(Xtr, ytr, Xte)) ** 2) / den
            s_one = 1 - np.mean((yte - fit_predict(Xtr, ytr, Xte, rank=1)) ** 2) / den
            gain = s_full - s_one
            null = []
            for _ in range(N_NULL):
                ys = ytr[rng.permutation(len(ytr))]
                gf = 1 - np.mean((yte - fit_predict(Xtr, ys, Xte)) ** 2) / den
                go = 1 - np.mean((yte - fit_predict(Xtr, ys, Xte, rank=1)) ** 2) / den
                null.append(gf - go)

            XAs = np.hstack([X, u[:, None]])
            mu2, sd2 = XAs.mean(0), XAs.std(0); sd2[sd2 == 0] = 1
            Z2 = np.hstack([(XAs - mu2) / sd2, np.ones((len(XAs), 1))])
            R2 = RIDGE * np.eye(Z2.shape[1]); R2[-1, -1] = 0
            b_hat = np.linalg.solve(Z2.T @ Z2 + R2, Z2.T @ y)[-2]

            rows.append({"participant_id": pid, "fraction": fr,
                         "n_responses": n,
                         "beats_null": bool(gain > np.quantile(null, .95)),
                         "cue_sign_ok": bool(np.sign(b_hat) == np.sign(ref_b))})

    d = pd.DataFrame(rows)
    print(f"{d.participant_id.nunique()} participants. Responses are per "
          f"participant, after practice and perturbation exclusions.\n")
    print(f"  {'responses':>11}{'full beats scalar':>20}{'cue sign recovered':>21}")
    print("  " + "-" * 50)
    for fr, g in d.groupby("fraction"):
        print(f"  {g.n_responses.median():>11.0f}"
              f"{f'{g.beats_null.sum()}/{len(g)}':>20}"
              f"{f'{g.cue_sign_ok.sum()}/{len(g)}':>21}")

    out = Path("analysis/outputs/final/power_curve.csv")
    out.parent.mkdir(parents=True, exist_ok=True)
    d.to_csv(out, index=False)
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
