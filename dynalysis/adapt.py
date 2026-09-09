"""
Map raw event files onto the columns the state builder expects.

Two event schemas exist: the previous foraging study's, and the new task's.
Rather than fork the analysis, each is adapted here into a common frame. The
important part is the choice of *analysis cell*: transitions are only pooled
within a cell, and getting that wrong silently mixes dynamics from different
environments into one operator.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def load_new_events(path) -> pd.DataFrame:
    """Load an event file written by the new task and normalize its columns."""
    df = pd.read_csv(path).sort_values(["participant_id", "trial_index"]).copy()

    df["click_index"] = df["trial_index"]
    df["ici_s"] = df["ici_ms"] / 1000.0
    df["elapsed_time_s"] = df["elapsed_time_ms"] / 1000.0

    df["reversal_stage"] = df["reversal_stage"].fillna(-1).astype(int)
    return df


def cell_key(
    df: pd.DataFrame,
    level: str = "color_contingency_stage",
) -> pd.Series:
    """The analysis cell each response belongs to.

    ``color_contingency_stage`` is the finest cell and the one the replication
    test needs: an operator is only compared with another operator estimated
    under the same colour, the same contingency, and a different stage.

    ``contingency`` and ``color`` are the two competing coarser groupings the
    study is designed to choose between -- whether dynamics follow what the
    environment looks like or what it arranges.
    """
    color = df["physical_context_id"].astype(str)
    cont = df["functional_contingency_id"].astype(str)
    stage = df["reversal_stage"].astype(str)

    if level == "color_contingency_stage":
        return color + "|" + cont + "|s" + stage
    if level == "color_contingency":
        return color + "|" + cont
    if level == "contingency":
        return cont
    if level == "color":
        return color
    raise ValueError(f"unknown cell level: {level}")


def prepare(
    df: pd.DataFrame,
    level: str = "color_contingency_stage",
    exclude_practice: bool = True,
    exclude_perturbed: bool = True,
    perturbation_recovery_responses: int = 0,
) -> pd.DataFrame:
    """Filter to the responses an operator may be estimated from.

    Perturbed responses are excluded by default. A perturbation is an
    experimentally imposed departure from the local dynamics, so including it
    in the baseline estimate would fit the operator to the very deviation it is
    later asked to predict. ``perturbation_recovery_responses`` additionally
    drops the recovery window, for analyses that want a clean pre-perturbation
    baseline rather than a mixture of baseline and relaxation.
    """
    out = df.copy()

    if exclude_practice:
        out = out.loc[out["part"] != "practice"]

    if exclude_perturbed:
        out = out.loc[out["perturbation_active"] == 0]

    if perturbation_recovery_responses > 0:
        since = out["trials_since_perturbation_offset"]
        out = out.loc[since.isna() | (since >= perturbation_recovery_responses)]

    out = out.copy()
    out["context_cell"] = cell_key(out, level)

    # The state builder bins by position within context, so responses must be
    # contiguous within a cell. A cell that a participant left and returned to
    # is split by block, since a bin must never straddle an absence.
    out["context_segment"] = (
        out["context_cell"].astype(str) + "|b" + out["block_index"].astype(str)
    )
    return out


def add_primitives(df: pd.DataFrame, ici_cap_s: float = 5.0) -> pd.DataFrame:
    """Add the per-response columns the state builder aggregates.

    The switch indicator comes from the task's own `switched` column rather than
    being recomputed by differencing choices. The task resets it at every block
    boundary, where there is no previous response to compare against; a
    recomputed version would score the first response of each block as a switch
    whenever the participant happened to start on the other side, inflating the
    switch-rate coordinate exactly at the block starts the analysis is most
    interested in.
    """
    out = df.copy()
    out["choice_A_raw"] = (out["chosen_option"] == "A").astype(int)
    out["switch_raw"] = out["switched"].astype(int)
    out["log_ici_for_state"] = np.log1p(
        (out["ici_ms"] / 1000.0).clip(lower=0, upper=ici_cap_s)
    )
    return out


def split_segment(states: pd.DataFrame, col: str = "context_segment") -> pd.DataFrame:
    """Recover colour, contingency, stage and block from a segment key."""
    parts = states[col].astype(str).str.split("|", expand=True)
    out = states.copy()
    out["color"] = parts[0]
    out["contingency"] = parts[1]
    out["stage"] = parts[2].str.removeprefix("s").astype(int)
    out["block"] = parts[3].str.removeprefix("b").astype(int)
    return out


def summarize_sessions(df: pd.DataFrame) -> pd.DataFrame:
    """Session-level quality metrics used by the pilot acceptance checks."""
    rows = []
    for pid, g in df.groupby("participant_id"):
        duration_s = g["elapsed_time_ms"].max() / 1000.0
        switches = int((g["switched"] == 1).sum())
        rows.append({
            "participant_id": pid,
            "n_responses": len(g),
            "duration_min": duration_s / 60.0,
            "responses_per_s": len(g) / duration_s if duration_s > 0 else np.nan,
            "reward_rate": float(g["reward_outcome"].mean()),
            "switch_rate": switches / len(g),
            "n_blocks": int(g["block_index"].nunique()),
            "n_perturbations": int(g["perturbation_id"].dropna().nunique()),
            "cod_blocked_share": float((g["cod_active"] == 1).mean()),
            "reinforcers_withheld": int((g["reinforcer_withheld_by_cod"] == 1).sum()),
        })
    return pd.DataFrame(rows)
