"""
Eigenanalysis of participant-specific transition operators, plus the stability
and bias machinery needed before any eigenvalue is interpreted.

Two biases matter at these sample sizes and both push |lambda| downward:

1. Short-sample bias in autoregressive estimation. With ~25 transitions per
   context the least-squares operator systematically understates persistence.
2. Attenuation from measurement noise. A state coordinate is a proportion over
   a handful of responses, so it carries binomial noise; regressing a noisy
   predictor shrinks the coefficient toward zero.

Both are corrected here by moving-block bootstrap, which also yields the
eigenvector stability that decides whether a dominant mode is interpretable.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.linalg import subspace_angles

from .operators import fit_operator
from .states import STATE_COLS, STATE_LABELS


def sorted_eig(A: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Eigenvalues and eigenvectors ordered by descending magnitude."""
    vals, vecs = np.linalg.eig(A)
    order = np.argsort(np.abs(vals))[::-1]
    return vals[order], vecs[:, order]


def spectral_radius(A: np.ndarray) -> float:
    return float(np.max(np.abs(np.linalg.eigvals(A))))


def dominant_vector(A: np.ndarray) -> np.ndarray:
    """Real-valued representative of the dominant eigenvector.

    A complex pair has no single real direction, so the real part is taken and
    renormalized; ``describe_operator`` records that the mode was complex so a
    reader never treats such a loading as if it were a pure direction.
    """
    _, vecs = sorted_eig(A)
    v = vecs[:, 0]
    v = np.real(v) if np.iscomplexobj(v) else v
    n = np.linalg.norm(v)
    return v / n if n > 0 else v


def abs_cosine(v: np.ndarray, w: np.ndarray) -> float:
    """Absolute cosine similarity; eigenvector sign is arbitrary."""
    nv, nw = np.linalg.norm(v), np.linalg.norm(w)
    if nv == 0 or nw == 0:
        return np.nan
    return float(abs(np.vdot(v, w)) / (nv * nw))


def top2_principal_angles(A: np.ndarray, B: np.ndarray) -> tuple[float, float]:
    """Principal angles (degrees) between the top-2 eigenspaces of A and B.

    More robust than comparing single eigenvectors when two similarly
    persistent modes can rotate within a shared subspace.
    """
    _, Va = sorted_eig(A)
    _, Vb = sorted_eig(B)
    Pa, Pb = np.real(Va[:, :2]), np.real(Vb[:, :2])
    ang = np.degrees(subspace_angles(Pa, Pb))
    return float(np.mean(ang)), float(np.max(ang))


def describe_operator(A: np.ndarray, prefix: str = "") -> dict:
    """Summarize one operator: spectrum, dominant mode, and its loadings."""
    vals, _ = sorted_eig(A)
    v = dominant_vector(A)
    complex_pair = bool(np.any(np.abs(np.imag(vals)) > 1e-9))

    out = {
        f"{prefix}spectral_radius": float(np.abs(vals[0])),
        f"{prefix}lambda1_real": float(np.real(vals[0])),
        f"{prefix}lambda1_imag": float(np.imag(vals[0])),
        f"{prefix}lambda2_mag": float(np.abs(vals[1])),
        f"{prefix}complex_pair": complex_pair,
        f"{prefix}dominant_feature": STATE_LABELS[STATE_COLS[int(np.argmax(np.abs(v)))]],
    }
    # Half-life of the dominant mode, in state-bins. This is the quantity the
    # perturbation study asks the operator to predict prospectively.
    rho = out[f"{prefix}spectral_radius"]
    out[f"{prefix}half_life_bins"] = (
        float(np.log(0.5) / np.log(rho)) if 0 < rho < 1 else np.inf
    )
    if complex_pair and abs(np.imag(vals[0])) > 1e-9:
        out[f"{prefix}oscillation_period_bins"] = float(
            2 * np.pi / abs(np.angle(vals[0]))
        )
    else:
        out[f"{prefix}oscillation_period_bins"] = np.nan

    for j, col in enumerate(STATE_COLS):
        out[f"{prefix}loading_{col}"] = float(v[j])
    return out


# ------------------------------------------------------- block bootstrap ---

def moving_block_indices(
    n: int, block_len: int, rng: np.random.Generator
) -> np.ndarray:
    """Indices for one moving-block bootstrap replicate of a length-n series.

    Blocks preserve local temporal dependence, which a naive resample of
    individual transitions would destroy and thereby understate uncertainty.
    """
    if n <= block_len:
        return rng.integers(0, n, size=n)
    starts = rng.integers(0, n - block_len + 1, size=int(np.ceil(n / block_len)))
    idx = np.concatenate([np.arange(s, s + block_len) for s in starts])
    return idx[:n]


def bootstrap_operator(
    df: pd.DataFrame,
    alpha: float = 1.0,
    n_boot: int = 400,
    block_len: int = 4,
    seed: int = 20260909,
) -> dict:
    """Moving-block bootstrap of one operator.

    Returns the point estimate, the bias-corrected spectral radius, a
    percentile interval, and the stability of the dominant eigenvector
    (distribution of |cos| between each replicate's dominant vector and the
    point estimate's).
    """
    A_hat, scaler = fit_operator(df, alpha=alpha)
    rho_hat = spectral_radius(A_hat)
    v_hat = dominant_vector(A_hat)

    rng = np.random.default_rng(seed)
    n = len(df)
    rhos, cosines, complex_flags = [], [], []

    for _ in range(n_boot):
        idx = moving_block_indices(n, block_len, rng)
        sub = df.iloc[idx]
        try:
            A_b, _ = fit_operator(sub, alpha=alpha, scaler=scaler)
        except (np.linalg.LinAlgError, ValueError):
            continue
        vals = np.linalg.eigvals(A_b)
        rhos.append(float(np.max(np.abs(vals))))
        cosines.append(abs_cosine(dominant_vector(A_b), v_hat))
        complex_flags.append(bool(np.any(np.abs(np.imag(vals)) > 1e-9)))

    rhos = np.asarray(rhos, float)
    cosines = np.asarray(cosines, float)

    if rhos.size == 0:
        return {"spectral_radius": rho_hat, "n_boot_ok": 0}

    # Bootstrap bias correction: the replicate mean estimates E[rho_hat], so
    # reflecting the point estimate through it removes the leading-order bias.
    bias = float(np.mean(rhos) - rho_hat)
    rho_bc = float(np.clip(rho_hat - bias, 0.0, 1.5))

    return {
        "spectral_radius": rho_hat,
        "spectral_radius_bias": bias,
        "spectral_radius_bias_corrected": rho_bc,
        "spectral_radius_lo": float(np.percentile(rhos, 2.5)),
        "spectral_radius_hi": float(np.percentile(rhos, 97.5)),
        "eigvec_stability_median": float(np.nanmedian(cosines)),
        "eigvec_stability_lo": float(np.nanpercentile(cosines, 5)),
        "frac_replicates_complex": float(np.mean(complex_flags)),
        "n_boot_ok": int(rhos.size),
    }


def compare_operators(A: np.ndarray, B: np.ndarray) -> dict:
    """Similarity between two operators estimated from different data."""
    va, _ = sorted_eig(A)
    vb, _ = sorted_eig(B)
    mean_ang, max_ang = top2_principal_angles(A, B)
    return {
        "dominant_cosine": abs_cosine(dominant_vector(A), dominant_vector(B)),
        "top2_mean_angle_deg": mean_ang,
        "top2_max_angle_deg": max_ang,
        "eigenvalue_distance": float(np.abs(va[0] - vb[0])),
        "spectral_radius_diff": float(abs(np.abs(va[0]) - np.abs(vb[0]))),
        "operator_frobenius_distance": float(np.linalg.norm(A - B)),
    }


# ------------------------------------------- bias and attenuation controls ---

def parametric_bias_correction(
    A_hat: np.ndarray,
    residuals: np.ndarray,
    n_obs: int,
    n_sim: int = 400,
    seed: int = 20260909,
) -> dict:
    """Correct the short-sample downward bias in the estimated spectral radius.

    Least-squares estimation of an autoregressive operator understates
    persistence when the series is short. The size of that understatement is
    measured directly: series of the same length are simulated from A_hat with
    resampled residuals, refit the same way, and the average shortfall of the
    refit spectral radius from the generating one is the bias.

    The moving-block bootstrap answers a different question (sampling
    uncertainty) and is not a substitute for this.
    """
    rng = np.random.default_rng(seed)
    d = A_hat.shape[0]
    rho_true = spectral_radius(A_hat)
    burn = 50
    rhos = []

    for _ in range(n_sim):
        x = np.zeros(d)
        series = np.empty((n_obs + 1, d))
        for t in range(burn):
            x = A_hat @ x + residuals[rng.integers(len(residuals))]
        series[0] = x
        for t in range(1, n_obs + 1):
            x = A_hat @ x + residuals[rng.integers(len(residuals))]
            series[t] = x

        X, Y = series[:-1], series[1:]
        Xc, Yc = X - X.mean(0), Y - Y.mean(0)
        try:
            A_sim = np.linalg.lstsq(Xc, Yc, rcond=None)[0].T
        except np.linalg.LinAlgError:
            continue
        rhos.append(spectral_radius(A_sim))

    if not rhos:
        return {"spectral_radius_sample_bias": np.nan,
                "spectral_radius_debiased": rho_true}

    bias = float(np.mean(rhos) - rho_true)
    return {
        "spectral_radius_sample_bias": bias,
        "spectral_radius_debiased": float(np.clip(rho_true - bias, 0.0, 1.5)),
    }


def measurement_noise_cov(
    df: pd.DataFrame, scaler, bin_clicks: int
) -> np.ndarray:
    """Sampling-noise covariance of the observed state, in standardized units.

    Three of the four coordinates are proportions over the responses in a bin,
    so each carries binomial noise p(1-p)/n. The log-ICI coordinate is a mean
    over the same responses, so its noise is var/n. Treating these as
    independent gives a diagonal Sigma, which is then rescaled into the same
    standardized units the operator is estimated in.
    """
    from .states import STATE_COLS

    var = np.zeros(len(STATE_COLS))
    n_eff = df["n_clicks_t"].to_numpy(float)

    for j, col in enumerate(STATE_COLS):
        vals = df[f"{col}_t"].to_numpy(float)
        if col == "mean_log_ici":
            var[j] = float(np.var(vals, ddof=1))  # conservative upper bound
            var[j] = var[j] / max(bin_clicks, 1)
        else:
            var[j] = float(np.mean(vals * (1 - vals) / np.maximum(n_eff, 1)))

    # scaler.scale_ maps raw units to standardized ones; variances scale by its
    # square.
    return np.diag(var / np.maximum(scaler.scale_ ** 2, 1e-12))


def attenuation_correct(A_hat: np.ndarray, Sxx: np.ndarray, Sigma: np.ndarray):
    """Undo regression attenuation caused by noise in the predictor state.

    With observed x = x* + e and Cov(e) = Sigma, least squares estimates
    A_hat = A Var(x*) (Var(x*) + Sigma)^-1, so A = A_hat Sxx (Sxx - Sigma)^-1.

    Returns ``None`` when the noise estimate is large enough that Sxx - Sigma
    is not positive definite, which means the state is too noisy at this bin
    size to support the correction rather than that the correction is zero.
    """
    S_true = Sxx - Sigma
    eigvals = np.linalg.eigvalsh((S_true + S_true.T) / 2)
    if np.min(eigvals) <= 1e-6:
        return None
    try:
        return A_hat @ Sxx @ np.linalg.inv(S_true)
    except np.linalg.LinAlgError:
        return None
