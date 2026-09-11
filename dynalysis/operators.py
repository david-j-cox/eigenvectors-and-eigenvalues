"""
Fit participant-specific linear transition operators with honest temporal
holdout.

Architectures, all estimated separately for every participant i:

    persistence   x_{t+1} = x_t
    A_i           x_{t+1} = A_i x_t + c_i
    DMDc          x_{t+1} = A_i x_t + B_i u_t + c_i
    A_{i,c}       x_{t+1} = A_{i,c} x_t + c_{i,c}

The outer split is temporal within each context: the earliest transitions in a
context train, the latest test. Ridge alpha is chosen on an inner temporal
split of the outer training set only, so no held-out observation ever touches
hyperparameter selection.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

from .states import STATE_COLS, x_cols, y_cols

ALPHAS = (0.01, 0.1, 1.0, 10.0)
ARCHITECTURES = ("pooled", "dmdc", "context")


# ----------------------------------------------------------------- splits ---

def temporal_split(
    g: pd.DataFrame,
    train_fraction: float = 0.70,
    min_context_n: int = 5,
) -> tuple[pd.Series, pd.Series]:
    """Split one participant's transitions into earlier/later within context.

    Splitting inside context rather than across the whole session means the
    training set sees every environment; the test set is still strictly later
    behavior in each of them.
    """
    train = pd.Series(False, index=g.index)
    test = pd.Series(False, index=g.index)

    for _, gp in g.groupby("context_t"):
        gp = gp.sort_values("transition_order")
        n = len(gp)
        if n < min_context_n:
            continue
        cut = min(max(2, int(np.floor(train_fraction * n))), n - 1)
        train.loc[gp.index[:cut]] = True
        test.loc[gp.index[cut:]] = True

    return train, test


def make_inputs(df: pd.DataFrame, contexts: list) -> np.ndarray:
    """Environmental input u_t: destination-context indicators plus any
    programmed reinforcement pulses.

    The first context is the reference level, so its indicator is dropped.
    Latent option values are deliberately not used as inputs: depletion makes
    them partly a consequence of the participant's own behavior, which would
    smuggle the response back in as if it were an environmental cause.
    """
    cols = [
        (df["context_next"].to_numpy() == c).astype(float) for c in contexts[1:]
    ]
    for name in ("bonus_A_next", "bonus_B_next"):
        if name in df.columns:
            cols.append(df[name].to_numpy(float))
    if not cols:
        return np.zeros((len(df), 0))
    return np.column_stack(cols)


# ------------------------------------------------------------- estimation ---

def _fit(X: np.ndarray, Y: np.ndarray, alpha: float) -> Ridge:
    return Ridge(alpha=alpha, fit_intercept=True).fit(X, Y)


def _mse(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.mean((a - b) ** 2))


def select_alpha(
    train_df: pd.DataFrame,
    architecture: str,
    contexts: list,
    inner_fraction: float = 0.75,
) -> float:
    """Choose ridge alpha on an inner temporal split of the training data."""
    inner_train, inner_val = temporal_split(
        train_df, train_fraction=inner_fraction, min_context_n=4
    )
    a_df, v_df = train_df.loc[inner_train], train_df.loc[inner_val]
    if len(v_df) < 3 or len(a_df) < 6:
        return 1.0

    scaler = StandardScaler().fit(a_df[x_cols()].to_numpy())
    Xtr, Ytr = scaler.transform(a_df[x_cols()].to_numpy()), scaler.transform(
        a_df[y_cols()].to_numpy()
    )
    Xva, Yva = scaler.transform(v_df[x_cols()].to_numpy()), scaler.transform(
        v_df[y_cols()].to_numpy()
    )

    scores = []
    for alpha in ALPHAS:
        if architecture == "pooled":
            pred = _fit(Xtr, Ytr, alpha).predict(Xva)
            scores.append((alpha, _mse(Yva, pred)))

        elif architecture == "dmdc":
            Dtr = np.column_stack([Xtr, make_inputs(a_df, contexts)])
            Dva = np.column_stack([Xva, make_inputs(v_df, contexts)])
            pred = _fit(Dtr, Ytr, alpha).predict(Dva)
            scores.append((alpha, _mse(Yva, pred)))

        elif architecture == "context":
            pred = np.full_like(Yva, np.nan)
            for c in v_df["context_t"].unique():
                m_tr = a_df["context_t"].to_numpy() == c
                m_va = v_df["context_t"].to_numpy() == c
                if m_tr.sum() < 3:
                    continue
                pred[m_va] = _fit(Xtr[m_tr], Ytr[m_tr], alpha).predict(Xva[m_va])
            ok = np.isfinite(pred).all(axis=1)
            if ok.sum() >= 2:
                scores.append((alpha, _mse(Yva[ok], pred[ok])))
        else:
            raise ValueError(f"unknown architecture: {architecture}")

    return min(scores, key=lambda z: z[1])[0] if scores else 1.0


def fit_participant(
    g: pd.DataFrame,
    contexts: list,
    train_fraction: float = 0.70,
    min_train: int = 15,
    min_test: int = 4,
) -> dict | None:
    """Fit every architecture for one participant and score held-out behavior.

    Returns None when the participant does not have enough transitions to both
    train and be tested honestly.
    """
    g = g.sort_values(["context_t", "transition_order"]).copy()
    train_mask, test_mask = temporal_split(g, train_fraction)
    train_df, test_df = g.loc[train_mask], g.loc[test_mask]

    if len(train_df) < min_train or len(test_df) < min_test:
        return None

    scaler = StandardScaler().fit(train_df[x_cols()].to_numpy())
    Xtr = scaler.transform(train_df[x_cols()].to_numpy())
    Ytr = scaler.transform(train_df[y_cols()].to_numpy())
    Xte = scaler.transform(test_df[x_cols()].to_numpy())
    Yte = scaler.transform(test_df[y_cols()].to_numpy())

    preds: dict[str, np.ndarray] = {"persistence": Xte.copy()}
    alphas: dict[str, float] = {}
    operators: dict[str, np.ndarray] = {}

    # --- pooled A_i ---
    a_pool = select_alpha(train_df, "pooled", contexts)
    m_pool = _fit(Xtr, Ytr, a_pool)
    preds["A_i"] = m_pool.predict(Xte)
    alphas["A_i"] = a_pool
    operators["A_i"] = m_pool.coef_.copy()

    # --- DMDc ---
    U_tr, U_te = make_inputs(train_df, contexts), make_inputs(test_df, contexts)
    if U_tr.shape[1] > 0:
        a_ctrl = select_alpha(train_df, "dmdc", contexts)
        m_ctrl = _fit(np.column_stack([Xtr, U_tr]), Ytr, a_ctrl)
        preds["DMDc"] = m_ctrl.predict(np.column_stack([Xte, U_te]))
        alphas["DMDc"] = a_ctrl
        n_state = len(STATE_COLS)
        operators["DMDc_A"] = m_ctrl.coef_[:, :n_state].copy()
        operators["DMDc_B"] = m_ctrl.coef_[:, n_state:].copy()

    # --- context-specific A_{i,c} ---
    a_ctx = select_alpha(train_df, "context", contexts)
    ctx_pred = np.full_like(Yte, np.nan)
    ctx_ops: dict = {}
    for c in test_df["context_t"].unique():
        m_tr = train_df["context_t"].to_numpy() == c
        m_te = test_df["context_t"].to_numpy() == c
        if m_tr.sum() < 4:
            continue
        m = _fit(Xtr[m_tr], Ytr[m_tr], a_ctx)
        ctx_pred[m_te] = m.predict(Xte[m_te])
        ctx_ops[c] = m.coef_.copy()
    preds["A_ic"] = ctx_pred
    alphas["A_ic"] = a_ctx
    operators["A_ic"] = ctx_ops

    # --- score ---
    scores = []
    base = None
    for name, pred in preds.items():
        ok = np.isfinite(pred).all(axis=1)
        if ok.sum() < 3:
            continue
        mse = _mse(Yte[ok], pred[ok])
        mae = float(np.mean(np.abs(Yte[ok] - pred[ok])))
        row = {"model": name, "n_test": int(ok.sum()), "mse": mse, "rmse": np.sqrt(mse),
               "mae": mae, "alpha": alphas.get(name, np.nan)}
        if name == "persistence":
            base = mse
        scores.append(row)

    for row in scores:
        # Skill is relative to persistence, the honest null for a system that
        # simply stays where it is.
        row["skill_vs_persistence"] = 1.0 - row["mse"] / base if base else np.nan

    return {
        "scores": pd.DataFrame(scores),
        "operators": operators,
        "scaler": scaler,
        "n_train": len(train_df),
        "n_test": len(test_df),
        "train_index": train_df.index,
        "test_index": test_df.index,
    }


def fit_operator(
    df: pd.DataFrame, alpha: float = 1.0, scaler: StandardScaler | None = None
) -> tuple[np.ndarray, StandardScaler]:
    """Fit a single standardized operator A to a block of transitions."""
    X_raw, Y_raw = df[x_cols()].to_numpy(), df[y_cols()].to_numpy()
    if scaler is None:
        scaler = StandardScaler().fit(X_raw)
    X, Y = scaler.transform(X_raw), scaler.transform(Y_raw)
    return _fit(X, Y, alpha).coef_.copy(), scaler


def multistep_forecast(
    states_g: pd.DataFrame,
    A: np.ndarray,
    scaler: StandardScaler,
    horizons=(1, 2, 5, 10),
    context_col: str = "context_t",
) -> pd.DataFrame:
    """Iterate x_{t+k} = A^k x_t inside each context and score against truth.

    Forecasts never cross a context boundary: the operator describes local
    dynamics, so carrying one across a contingency change would score it on a
    process it does not claim to model.
    """
    rows = []
    for ctx, g in states_g.groupby(context_col):
        g = g.sort_values("transition_order")
        X = scaler.transform(g[x_cols()].to_numpy())
        n = len(X)
        for k in horizons:
            if n <= k:
                continue
            Ak = np.linalg.matrix_power(A, k)
            pred = X[: n - k] @ Ak.T
            truth = X[k:]
            rows.append({
                "context": ctx,
                "horizon": k,
                "n": n - k,
                "mse": _mse(truth, pred),
                "mse_persistence": _mse(truth, X[: n - k]),
            })

    out = pd.DataFrame(rows)
    if len(out):
        out["skill_vs_persistence"] = 1 - out["mse"] / out["mse_persistence"]
    return out
