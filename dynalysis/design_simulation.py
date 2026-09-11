"""
Turn the measured dynamics into design parameters for the new experiment.

Every claim the new study wants to make is a comparison between two operator
estimates: early exposure vs late exposure, green vs blue, pre-perturbation vs
recovery. Two estimates of the *same* operator never agree perfectly at finite
sample size, so an observed similarity is evidence of a reproducible mode only
if it exceeds that noise floor.

This module computes the floor by simulation, using operators, residual
covariances, and measurement-noise levels taken from the existing dataset
rather than invented. It answers, in units the task can be built to:

    How many responses per context exposure, and how many exposures,
    does an individual need before a replication test can succeed?
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

from . import eigen as E
from .states import STATE_COLS


def simulate_series(
    A: np.ndarray,
    Q: np.ndarray,
    n: int,
    rng: np.random.Generator,
    Sigma_obs: np.ndarray | None = None,
    burn: int = 50,
) -> tuple[np.ndarray, np.ndarray]:
    """Simulate x_{t+1} = A x_t + w, optionally observed with noise.

    ``Q`` is the process-noise covariance (residual covariance of the fitted
    operator); ``Sigma_obs`` is the sampling noise added by estimating each
    state from a finite bin of responses.
    """
    d = A.shape[0]
    Lq = np.linalg.cholesky(Q + 1e-9 * np.eye(d))
    x = np.zeros(d)
    for _ in range(burn):
        x = A @ x + Lq @ rng.standard_normal(d)

    true = np.empty((n + 1, d))
    true[0] = x
    for t in range(1, n + 1):
        x = A @ x + Lq @ rng.standard_normal(d)
        true[t] = x

    if Sigma_obs is None:
        return true, true
    Lo = np.linalg.cholesky(Sigma_obs + 1e-12 * np.eye(d))
    obs = true + rng.standard_normal((n + 1, d)) @ Lo.T
    return true, obs


def estimate(series: np.ndarray, alpha: float) -> np.ndarray:
    """Refit the operator from a simulated series exactly as the real pipeline
    would: centered, ridge-regularized, one step ahead."""
    X, Y = series[:-1], series[1:]
    Xc, Yc = X - X.mean(0), Y - Y.mean(0)
    return Ridge(alpha=alpha, fit_intercept=False).fit(Xc, Yc).coef_


def replication_floor(
    A: np.ndarray,
    Q: np.ndarray,
    n_grid,
    alpha: float = 1.0,
    Sigma_obs: np.ndarray | None = None,
    n_rep: int = 300,
    seed: int = 20260909,
) -> pd.DataFrame:
    """Agreement between two independent estimates of the *same* operator.

    This is the null distribution for the replication test: whatever similarity
    the real data show has to beat these values before "the same dynamical mode
    recurred" is a defensible reading.
    """
    rng = np.random.default_rng(seed)
    rho_true = E.spectral_radius(A)
    v_true = E.dominant_vector(A)
    rows = []

    for n in n_grid:
        cos_pair, ang_pair, cos_truth, rho_err, rho_est = [], [], [], [], []
        for _ in range(n_rep):
            _, s1 = simulate_series(A, Q, n, rng, Sigma_obs)
            _, s2 = simulate_series(A, Q, n, rng, Sigma_obs)
            A1, A2 = estimate(s1, alpha), estimate(s2, alpha)

            cos_pair.append(E.abs_cosine(E.dominant_vector(A1), E.dominant_vector(A2)))
            ang_pair.append(E.top2_principal_angles(A1, A2)[0])
            cos_truth.append(E.abs_cosine(E.dominant_vector(A1), v_true))
            r1 = E.spectral_radius(A1)
            rho_est.append(r1)
            rho_err.append(abs(r1 - rho_true))

        rows.append({
            "n_transitions": n,
            "same_operator_cosine_median": float(np.nanmedian(cos_pair)),
            "same_operator_cosine_p05": float(np.nanpercentile(cos_pair, 5)),
            "same_operator_cosine_p95": float(np.nanpercentile(cos_pair, 95)),
            "same_operator_angle_median": float(np.nanmedian(ang_pair)),
            "cosine_to_truth_median": float(np.nanmedian(cos_truth)),
            "frac_recovering_truth_at_0.9": float(np.nanmean(np.array(cos_truth) >= 0.9)),
            "rho_abs_error_median": float(np.nanmedian(rho_err)),
            "rho_bias": float(np.nanmean(rho_est) - rho_true),
            "frac_rho_within_0.05": float(np.nanmean(np.array(rho_err) <= 0.05)),
        })

    return pd.DataFrame(rows)


def discrimination(
    A_same: np.ndarray,
    A_diff: np.ndarray,
    Q: np.ndarray,
    n_grid,
    alpha: float = 1.0,
    Sigma_obs: np.ndarray | None = None,
    n_rep: int = 300,
    seed: int = 20260909,
) -> pd.DataFrame:
    """Can the replication test tell "same operator" from "different operator"?

    Reports the AUC of the dominant-eigenvector cosine separating pairs drawn
    from one operator (same context, two exposures) from pairs drawn from two
    genuinely different operators (two contexts). AUC near 0.5 means the design
    cannot answer the question at that sample size no matter how many
    participants are run.
    """
    rng = np.random.default_rng(seed)
    rows = []

    for n in n_grid:
        same, diff = [], []
        for _ in range(n_rep):
            _, s1 = simulate_series(A_same, Q, n, rng, Sigma_obs)
            _, s2 = simulate_series(A_same, Q, n, rng, Sigma_obs)
            same.append(E.abs_cosine(E.dominant_vector(estimate(s1, alpha)),
                                     E.dominant_vector(estimate(s2, alpha))))

            _, s3 = simulate_series(A_same, Q, n, rng, Sigma_obs)
            _, s4 = simulate_series(A_diff, Q, n, rng, Sigma_obs)
            diff.append(E.abs_cosine(E.dominant_vector(estimate(s3, alpha)),
                                     E.dominant_vector(estimate(s4, alpha))))

        same_a = np.asarray(same, float)
        diff_a = np.asarray(diff, float)
        ok = np.isfinite(same_a) & np.isfinite(diff_a)
        # AUC as the probability a same-operator pair scores above a
        # different-operator pair, ties counted as half.
        comp = same_a[ok][:, None] > diff_a[ok][None, :]
        ties = same_a[ok][:, None] == diff_a[ok][None, :]
        auc = float((comp.sum() + 0.5 * ties.sum()) / comp.size) if ok.sum() else np.nan

        rows.append({
            "n_transitions": n,
            "same_cosine_median": float(np.nanmedian(same_a)),
            "diff_cosine_median": float(np.nanmedian(diff_a)),
            "auc": auc,
        })

    return pd.DataFrame(rows)


def recovery_prediction(
    A: np.ndarray,
    Q: np.ndarray,
    n_pre_grid,
    perturbation_bins: int = 4,
    alpha: float = 1.0,
    Sigma_obs: np.ndarray | None = None,
    n_rep: int = 300,
    seed: int = 20260909,
) -> pd.DataFrame:
    """How much pre-perturbation data is needed to forecast recovery?

    A perturbation is modeled as a displacement of the state away from its
    local equilibrium; recovery is then the free response delta_x_{t+k} =
    A^k delta_x_t. The operator is estimated from pre-perturbation data only,
    exactly as the study requires, and scored on the simulated recovery.
    """
    rng = np.random.default_rng(seed)
    d = A.shape[0]
    rows = []

    for n_pre in n_pre_grid:
        skills, hl_err = [], []
        true_hl = E.describe_operator(A)["half_life_bins"]

        for _ in range(n_rep):
            _, pre = simulate_series(A, Q, n_pre, rng, Sigma_obs)
            A_hat = estimate(pre, alpha)

            # Displace the state, then let the true system relax.
            delta = rng.standard_normal(d) * 2.0
            obs, pred = [], []
            x = delta.copy()
            Lq = np.linalg.cholesky(Q + 1e-9 * np.eye(d))
            for k in range(1, perturbation_bins + 1):
                x = A @ x + Lq @ rng.standard_normal(d)
                obs.append(x.copy())
                pred.append(np.linalg.matrix_power(A_hat, k) @ delta)

            obs_a, pred_a = np.asarray(obs), np.asarray(pred)
            mse = float(np.mean((obs_a - pred_a) ** 2))
            # The null is "the perturbation does not decay at all".
            mse_null = float(np.mean((obs_a - delta) ** 2))
            skills.append(1 - mse / mse_null if mse_null > 0 else np.nan)

            hl_hat = E.describe_operator(A_hat)["half_life_bins"]
            if np.isfinite(hl_hat) and np.isfinite(true_hl):
                hl_err.append(abs(hl_hat - true_hl))

        rows.append({
            "n_pre_transitions": n_pre,
            "recovery_forecast_skill_median": float(np.nanmedian(skills)),
            "frac_skill_positive": float(np.nanmean(np.asarray(skills) > 0)),
            "half_life_abs_error_median": float(np.nanmedian(hl_err)) if hl_err else np.nan,
        })

    return pd.DataFrame(rows)


def responses_needed(n_transitions: int, bin_clicks: int) -> int:
    """Convert a transition requirement into a response budget.

    N transitions need N+1 states, and each state consumes ``bin_clicks``
    responses within the same context.
    """
    return int((n_transitions + 1) * bin_clicks)
