"""
Per-participant dynamical profiles.

Every participant gets an independent profile before any group summary is
computed: how well their own earlier behavior predicts their own later
behavior, what their eigensystem is, how stable it is, and whether an
operator estimated from the first half of a context still describes the second
half of that same context.

The last of these is the direct analogue, in the existing dataset, of the
repeated-exposure replication test the new experiment is being built to run.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import eigen as E
from . import operators as O
from .states import STATE_COLS, x_cols, y_cols

MIN_CONTEXT_TRANSITIONS = 10   # below this, an early/late split is not usable
MIN_HALF = 5                   # transitions required in each half


def _residuals(df: pd.DataFrame, A: np.ndarray, scaler) -> np.ndarray:
    X = scaler.transform(df[x_cols()].to_numpy())
    Y = scaler.transform(df[y_cols()].to_numpy())
    return Y - X @ A.T


def participant_profile(
    g: pd.DataFrame,
    contexts: list,
    bin_clicks: int,
    n_boot: int = 300,
    n_sim: int = 300,
    seed: int = 20260909,
) -> dict | None:
    """Build the full profile for one participant."""
    fit = O.fit_participant(g, contexts)
    if fit is None:
        return None

    scores = fit["scores"].set_index("model")
    alpha = float(scores.loc["A_i", "alpha"])

    # Pooled operator, estimated on all of this person's transitions. This is
    # the descriptive eigensystem; the predictive claim is carried by the
    # held-out scores above, which used training data only.
    A, scaler = O.fit_operator(g, alpha=alpha)
    profile = {
        "participant_id": g["participant_id"].iloc[0],
        "n_transitions": len(g),
        "n_train": fit["n_train"],
        "n_test": fit["n_test"],
        "n_contexts": int(g["context_t"].nunique()),
        "ridge_alpha": alpha,
    }

    for model in scores.index:
        profile[f"mse_{model}"] = scores.loc[model, "mse"]
        profile[f"skill_{model}"] = scores.loc[model, "skill_vs_persistence"]
    profile["best_model"] = str(scores.drop(index="persistence")["mse"].idxmin())

    profile.update(E.describe_operator(A))

    # Sampling uncertainty and eigenvector stability.
    profile.update(E.bootstrap_operator(g, alpha=alpha, n_boot=n_boot, seed=seed))

    # Short-sample bias in the spectral radius.
    profile.update(
        E.parametric_bias_correction(
            A, _residuals(g, A, scaler), len(g), n_sim=n_sim, seed=seed
        )
    )

    # Attenuation from sampling noise in the state coordinates.
    X = scaler.transform(g[x_cols()].to_numpy())
    Sxx = np.cov(X, rowvar=False)
    Sigma = E.measurement_noise_cov(g, scaler, bin_clicks)
    for j, col in enumerate(STATE_COLS):
        profile[f"noise_ratio_{col}"] = float(Sigma[j, j] / Sxx[j, j])
    A_att = E.attenuation_correct(A, Sxx, Sigma)
    if A_att is not None:
        profile["spectral_radius_attenuation_corrected"] = E.spectral_radius(A_att)
        v = E.dominant_vector(A_att)
        for j, col in enumerate(STATE_COLS):
            profile[f"att_loading_{col}"] = float(v[j])
    else:
        profile["spectral_radius_attenuation_corrected"] = np.nan

    # Multi-step forecast degradation, using the training-only operator.
    train_g = g.loc[fit["train_index"]]
    A_train, sc_train = O.fit_operator(train_g, alpha=alpha)
    fc = O.multistep_forecast(g.loc[fit["test_index"]], A_train, sc_train)
    for k in (1, 2, 5, 10):
        sub = fc.loc[fc["horizon"] == k] if len(fc) else fc
        profile[f"skill_h{k}"] = (
            float(np.average(sub["skill_vs_persistence"], weights=sub["n"]))
            if len(sub) else np.nan
        )

    return profile


def context_replication(
    g: pd.DataFrame,
    alpha: float = 1.0,
    n_boot: int = 200,
    seed: int = 20260909,
) -> pd.DataFrame:
    """Split each context's transitions into an early and a late half and ask
    whether the same operator describes both.

    This is the within-dataset stand-in for the new study's repeated returns to
    the same context. Both halves are standardized with the same scaler, fit
    from the early half, so the two operators live in comparable units.
    """
    rows = []
    for ctx, gc in g.groupby("context_t"):
        gc = gc.sort_values("transition_order")
        n = len(gc)
        if n < MIN_CONTEXT_TRANSITIONS:
            continue
        half = n // 2
        early, late = gc.iloc[:half], gc.iloc[half:]
        if len(early) < MIN_HALF or len(late) < MIN_HALF:
            continue

        A_early, scaler = O.fit_operator(early, alpha=alpha)
        A_late, _ = O.fit_operator(late, alpha=alpha, scaler=scaler)

        row = {
            "participant_id": gc["participant_id"].iloc[0],
            "context": ctx,
            "n_early": len(early),
            "n_late": len(late),
            "rho_early": E.spectral_radius(A_early),
            "rho_late": E.spectral_radius(A_late),
        }
        row.update(E.compare_operators(A_early, A_late))

        # Does the early operator predict the late observations one step ahead,
        # relative to persistence on those same observations?
        Xl = scaler.transform(late[x_cols()].to_numpy())
        Yl = scaler.transform(late[y_cols()].to_numpy())
        mse_op = float(np.mean((Yl - Xl @ A_early.T) ** 2))
        mse_pers = float(np.mean((Yl - Xl) ** 2))
        row["early_predicts_late_mse"] = mse_op
        row["early_predicts_late_skill"] = 1 - mse_op / mse_pers if mse_pers else np.nan

        rows.append(row)

    return pd.DataFrame(rows)


def cross_context_similarity(g: pd.DataFrame, alpha: float = 1.0) -> pd.DataFrame:
    """Pairwise operator similarity across contexts within one participant."""
    from itertools import combinations

    ops = {}
    _, scaler = O.fit_operator(g, alpha=alpha)
    for ctx, gc in g.groupby("context_t"):
        if len(gc) < MIN_CONTEXT_TRANSITIONS:
            continue
        ops[ctx], _ = O.fit_operator(gc, alpha=alpha, scaler=scaler)

    rows = []
    for a, b in combinations(sorted(ops), 2):
        row = {
            "participant_id": g["participant_id"].iloc[0],
            "context_a": a,
            "context_b": b,
        }
        row.update(E.compare_operators(ops[a], ops[b]))
        rows.append(row)
    return pd.DataFrame(rows)
