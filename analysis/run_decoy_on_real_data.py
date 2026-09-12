"""
The decoy test with no simulated organism.

sim_study2_power.py answered this with an invented agent: a two-state Markov
chain with a P(stay) and cue weights that were chosen, not measured. For the
crossover comparison that matters, because the answer depends on the size of an
effect nobody measured. For the decoy it is avoidable, and avoiding it is
better.

A decoy cue has to be synthetic -- study 1 did not contain one, which is the
whole point of running study 2. But the BEHAVIOR does not. Here each of the 23
real participants' real response streams is used unchanged, and the only
generated object is a cue series that predicts nothing, laid over responses
that were already made. Both measures are then asked the same question: does
this cue control behavior? The true answer is no, by construction, so every
detection is a false positive and the correct rate is 5%.

Nothing about an organism is assumed. The responses are the organism.

    python3 analysis/run_decoy_on_real_data.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dynalysis import adapt                      # noqa: E402

EVENTS = Path("analysis/data/final_events.csv")
BLOCKS = (15, 30, 60, 120)      # mean responses per decoy block
N_DECOY = 200                   # independent decoy series per participant


def decoy_series(n, mean_block, rng):
    u, cur = [], rng.integers(0, 2)
    while len(u) < n:
        u.extend([cur] * max(1, int(rng.exponential(mean_block))))
        cur = 1 - cur
    return np.array(u[:n])


def log_d_and_se(choice, cue):
    B = np.zeros((2, 2))
    for s in (0, 1):
        for b in (0, 1):
            B[s, b] = np.sum((cue == s) & (choice == b))
    B += 0.5
    ld = 0.5 * np.log(B[0, 0] * B[1, 1] / (B[0, 1] * B[1, 0]))
    se = 0.5 * np.sqrt(np.sum(1.0 / B))
    return ld, se


def operator_b_and_se(choice, cue, k=3):
    """Cue coefficient conditioned on the last k responses, with its OLS SE."""
    n = len(choice)
    lag = np.column_stack([choice[k - 1 - i: n - 1 - i] for i in range(k)])
    y = choice[k:].astype(float)
    u = 2.0 * cue[k:] - 1.0
    X = np.column_stack([lag, u, np.ones(len(y))])
    if np.std(u) < 1e-9:
        return np.nan, np.nan
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ beta
    dof = len(y) - X.shape[1]
    if dof <= 0:
        return np.nan, np.nan
    cov = (resid @ resid / dof) * np.linalg.pinv(X.T @ X)
    return beta[k], float(np.sqrt(max(cov[k, k], 0)))


def main() -> None:
    raw = adapt.load_new_events(EVENTS)
    rng = np.random.default_rng(7)
    rows, stay_rates = [], []

    for pid, g_raw in raw.groupby("participant_id"):
        prep = adapt.add_primitives(adapt.prepare(g_raw)).sort_values("click_index")
        c = prep["choice_left_raw"].to_numpy(dtype=int)
        if len(c) < 800:
            continue
        stay_rates.append(float(np.mean(c[1:] == c[:-1])))
        for mb in BLOCKS:
            ld_hits = op_hits = valid = 0
            for _ in range(N_DECOY):
                u = decoy_series(len(c), mb, rng)
                if np.std(u) < 1e-9:
                    continue
                ld, ld_se = log_d_and_se(c, u)
                b, b_se = operator_b_and_se(c, u)
                if not np.isfinite(b_se) or b_se == 0:
                    continue
                valid += 1
                ld_hits += abs(ld / ld_se) > 1.96
                op_hits += abs(b / b_se) > 1.96
            if valid:
                rows.append({"participant_id": pid, "mean_block": mb,
                             "n_responses": len(c),
                             "logd_fp_rate": 100 * ld_hits / valid,
                             "operator_fp_rate": 100 * op_hits / valid})

    d = pd.DataFrame(rows)
    sr = np.array(stay_rates)
    print(f"{d.participant_id.nunique()} real participants, "
          f"{d.n_responses.median():.0f} responses each (median).")
    print(f"{N_DECOY} independent decoy series per participant per block length.\n")
    print(f"Measured P(stay) in these real streams: median {np.median(sr):.3f}, "
          f"range {sr.min():.3f}-{sr.max():.3f}")
    print(f"(the simulation had assumed .88 with a range of .82-.95)\n")

    print("False-positive rate on a cue that predicts nothing. Correct: 5%.\n")
    print(f"  {'decoy block':>12}{'log d':>10}{'operator':>11}"
          f"{'participants where log d > 20%':>32}")
    print("  " + "-" * 65)
    for mb, g in d.groupby("mean_block"):
        print(f"  {mb:>12}{g.logd_fp_rate.mean():>9.0f}%"
              f"{g.operator_fp_rate.mean():>10.0f}%"
              f"{f'{(g.logd_fp_rate > 20).sum()}/{len(g)}':>32}")

    out = Path("analysis/outputs/final/decoy_on_real_data.csv")
    out.parent.mkdir(parents=True, exist_ok=True)
    d.to_csv(out, index=False)
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
