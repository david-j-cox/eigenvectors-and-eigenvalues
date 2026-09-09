#!/usr/bin/env python3
"""
Phase 0b: convert the measured dynamics into design parameters.

Uses operators, residual covariances, and measurement-noise levels estimated
from the existing dataset to answer:

  1. What dominant-eigenvector agreement do two estimates of the SAME operator
     produce at a given number of transitions? (the replication noise floor)
  2. At what sample size can that test distinguish same-operator from
     different-operator pairs at all?
  3. How much pre-perturbation data is needed to forecast recovery?
  4. What do those answers imply for responses per context exposure?

Outputs to reanalysis/outputs/:
    design_replication_floor.csv
    design_discrimination.csv
    design_recovery.csv
    design_recommendations.md

Usage:
    python run_design_sim.py [--bin 10] [--n-participants 20] [--quick]
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

N_GRID = (10, 15, 20, 30, 40, 60, 80, 120)
MIN_CONTEXT_N = 12
TARGET_AUC = 0.80
TARGET_FLOOR_COS = 0.85


def participant_ingredients(tr: pd.DataFrame, bin_clicks: int, alpha: float = 1.0):
    """For one participant: pooled operator, process noise, observation noise,
    and a second operator from a different context to serve as the
    'genuinely different dynamics' comparison.
    """
    A, scaler = O.fit_operator(tr, alpha=alpha)
    X = scaler.transform(tr[S.x_cols()].to_numpy())
    Y = scaler.transform(tr[S.y_cols()].to_numpy())
    resid = Y - X @ A.T
    Q = np.cov(resid, rowvar=False)
    Sigma = E.measurement_noise_cov(tr, scaler, bin_clicks)

    ctx_ops = {}
    for ctx, g in tr.groupby("context_t"):
        if len(g) >= MIN_CONTEXT_N:
            ctx_ops[ctx], _ = O.fit_operator(g, alpha=alpha, scaler=scaler)

    A_diff = None
    if len(ctx_ops) >= 2:
        # Use the pair of contexts whose operators differ most, so the
        # discrimination estimate reflects the best case the design could face.
        keys = sorted(ctx_ops)
        best = max(
            ((a, b) for i, a in enumerate(keys) for b in keys[i + 1:]),
            key=lambda p: np.linalg.norm(ctx_ops[p[0]] - ctx_ops[p[1]]),
        )
        A_diff = ctx_ops[best[1]]
        A = ctx_ops[best[0]]

    return A, A_diff, Q, Sigma


def pool(frames: list[pd.DataFrame], key: str) -> pd.DataFrame:
    """Median across participants at each sample size."""
    return (
        pd.concat(frames, ignore_index=True)
        .groupby(key, as_index=False)
        .median(numeric_only=True)
        .round(3)
    )


def first_reaching(df: pd.DataFrame, col: str, target: float, key: str):
    hit = df.loc[df[col] >= target, key]
    return int(hit.iloc[0]) if len(hit) else None


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--events", default=str(DEFAULT_EVENTS))
    ap.add_argument("--bin", type=int, default=10)
    ap.add_argument("--n-participants", type=int, default=20,
                    help="participants to average the simulation over")
    ap.add_argument("--out", default=str(HERE / "outputs"))
    ap.add_argument("--quick", action="store_true")
    args = ap.parse_args()

    n_rep = 60 if args.quick else 300
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    raw = S.load_events(args.events)
    states = S.build_states(raw, args.bin)
    tr_all = S.build_transitions(states)

    pids = sorted(tr_all["participant_id"].unique())
    rng = np.random.default_rng(20260909)
    if len(pids) > args.n_participants:
        pids = list(rng.choice(pids, size=args.n_participants, replace=False))

    floor_f, disc_f, rec_f = [], [], []
    for i, pid in enumerate(pids, 1):
        g = tr_all[tr_all["participant_id"] == pid]
        if len(g) < 30:
            continue
        A, A_diff, Q, Sigma = participant_ingredients(g, args.bin)
        print(f"  [{i}/{len(pids)}] {pid}  rho={E.spectral_radius(A):.3f}", flush=True)

        floor_f.append(D.replication_floor(
            A, Q, N_GRID, Sigma_obs=Sigma, n_rep=n_rep, seed=20260909 + i))
        rec_f.append(D.recovery_prediction(
            A, Q, N_GRID, Sigma_obs=Sigma, n_rep=n_rep, seed=20260909 + i))
        if A_diff is not None:
            disc_f.append(D.discrimination(
                A, A_diff, Q, N_GRID, Sigma_obs=Sigma, n_rep=n_rep,
                seed=20260909 + i))

    floor = pool(floor_f, "n_transitions")
    rec = pool(rec_f, "n_pre_transitions")
    disc = pool(disc_f, "n_transitions") if disc_f else pd.DataFrame()

    floor.to_csv(out_dir / "design_replication_floor.csv", index=False)
    rec.to_csv(out_dir / "design_recovery.csv", index=False)
    if len(disc):
        disc.to_csv(out_dir / "design_discrimination.csv", index=False)

    # --- observed values these have to be compared against ---
    rep_path = out_dir / "context_replication.csv"
    observed = pd.read_csv(rep_path) if rep_path.exists() else pd.DataFrame()

    n_for_auc = first_reaching(disc, "auc", TARGET_AUC, "n_transitions") if len(disc) else None
    n_for_floor = first_reaching(floor, "same_operator_cosine_median",
                                 TARGET_FLOOR_COS, "n_transitions")
    n_for_recovery = first_reaching(rec, "frac_skill_positive", 0.80,
                                    "n_pre_transitions")

    def budget(n):
        return D.responses_needed(n, args.bin) if n else None

    lines = [
        "# Design parameters implied by the existing data",
        "",
        f"State bin: {args.bin} responses. "
        f"Simulation grounded in {len(floor_f)} participants' own operators, "
        f"process noise, and measurement noise.",
        "",
        "## 1. The replication noise floor",
        "",
        "Two independent estimates of the **same** operator, at each sample size. "
        "Any observed early-vs-late similarity must beat these values before it "
        "counts as evidence of a reproducible mode.",
        "",
        *md_table(floor[[
            "n_transitions", "same_operator_cosine_median",
            "same_operator_cosine_p05", "cosine_to_truth_median",
            "rho_abs_error_median", "rho_bias", "frac_rho_within_0.05",
        ]]),
        "",
    ]

    if len(observed):
        obs_med = observed["dominant_cosine"].median()
        obs_n = observed["n_early"].median()
        near = floor.iloc[(floor["n_transitions"] - obs_n).abs().argmin()]
        lines += [
            f"**Observed in the existing dataset:** early-vs-late dominant "
            f"|cos| = **{obs_med:.3f}** at a median of {obs_n:.0f} transitions "
            f"per half.",
            "",
            f"**Floor at that sample size:** {near['same_operator_cosine_median']:.3f} "
            f"(5th percentile {near['same_operator_cosine_p05']:.3f}).",
            "",
            (
                f"The observed value sits {obs_med - near['same_operator_cosine_median']:+.3f} "
                "from the floor. A margin this small is not evidence of a "
                "reproducible context-specific mode: at this sample size two "
                "estimates of the same operator and two estimates of genuinely "
                "different operators are barely separable, as the discrimination "
                "table below shows. This is a sample-size limitation rather than "
                "a negative result, and it is the specific problem the new design "
                "has to solve."
                if obs_med - near["same_operator_cosine_median"] < 0.15
                else
                f"The observed value clears the floor by "
                f"{obs_med - near['same_operator_cosine_median']:+.3f}, so there is "
                "replication signal beyond estimation noise."
            ),
            "",
        ]

    if len(disc):
        lines += [
            "## 2. Can the test tell same from different?",
            "",
            "AUC of the dominant-eigenvector cosine separating same-operator "
            "pairs from different-operator pairs, using each participant's two "
            "most dissimilar context operators as the 'different' case.",
            "",
            *md_table(disc),
            "",
        ]

    lines += [
        "## 3. Prospective recovery forecasting",
        "",
        "Operator estimated from pre-perturbation transitions only, then used to "
        "forecast the decay of an imposed displacement. Skill is relative to "
        "assuming the perturbation does not decay.",
        "",
        *md_table(rec),
        "",
        "## 4. Response budget",
        "",
        "| Requirement | Transitions needed | Responses per context exposure |",
        "|---|---|---|",
        f"| Replication floor reaches |cos| >= {TARGET_FLOOR_COS} | "
        f"{n_for_floor or 'not reached in grid'} | {budget(n_for_floor) or '-'} |",
        f"| Same-vs-different AUC >= {TARGET_AUC} | "
        f"{n_for_auc or 'not reached in grid'} | {budget(n_for_auc) or '-'} |",
        f"| Recovery forecast positive in >= 80% of cases | "
        f"{n_for_recovery or 'not reached in grid'} | {budget(n_for_recovery) or '-'} |",
        "",
        "Responses per exposure are the total across all exposures to that "
        "context, since exposures to the same context pool into one operator "
        "estimate. Divide by the number of exposures to size an individual block.",
        "",
    ]

    (out_dir / "design_recommendations.md").write_text("\n".join(lines), encoding="utf-8")

    print("\n--- replication floor ---")
    print(floor.to_string(index=False))
    if len(disc):
        print("\n--- discrimination ---")
        print(disc.to_string(index=False))
    print("\n--- recovery ---")
    print(rec.to_string(index=False))


if __name__ == "__main__":
    main()
