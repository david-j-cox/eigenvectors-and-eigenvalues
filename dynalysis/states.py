"""
Build coarse-grained behavioral state vectors from raw click-level events.

The state is

    x_t = [ P(A)_t, P(reward)_t, P(switch)_t, mean log(1+ICI)_t ]

aggregated over non-overlapping bins of BIN_CLICKS responses taken within
a single experimental context (phase). Bins never straddle a context change,
so a transition x_t -> x_{t+1} is always local to one contingency unless it
is explicitly flagged as a boundary.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

STATE_COLS = ["choice_prop_A", "reward_rate", "switch_rate", "mean_log_ici"]

STATE_LABELS = {
    "choice_prop_A": "P(A)",
    "reward_rate": "reward rate",
    "switch_rate": "switch rate",
    "mean_log_ici": "mean log ICI",
}

# ICI is capped before the log so that rare long pauses (participant looked
# away, tab lost focus) do not dominate the fourth state coordinate.
ICI_CAP_S = 5.0


def load_events(path) -> pd.DataFrame:
    """Load raw click-level events and add the primitive per-click columns."""
    raw = pd.read_csv(path).sort_values(["participant_id", "click_index"]).copy()

    raw["choice_A_raw"] = (raw["chosen_option"] == "A").astype(int)

    raw["switch_raw"] = (
        raw.groupby("participant_id")["chosen_option"]
        .transform(lambda s: s.ne(s.shift()).astype(int))
    )
    # The first response of a session has no predecessor, so it is not a switch.
    raw.loc[raw.groupby("participant_id").head(1).index, "switch_raw"] = 0

    raw["log_ici_for_state"] = np.log1p(raw["ici_s"].clip(lower=0, upper=ICI_CAP_S))

    return raw


def build_states(
    raw: pd.DataFrame,
    bin_clicks: int = 10,
    context_col: str = "phase_id",
    min_fill: float | None = None,
) -> pd.DataFrame:
    """Aggregate clicks into non-overlapping within-context bins.

    ``min_fill`` is the fraction of ``bin_clicks`` a bin must contain to be
    kept; partial trailing bins below that are dropped rather than contributing
    a noisier state than the rest of the series. Defaults to 0.5.
    """
    if min_fill is None:
        min_fill = 0.5
    min_clicks = max(3, int(np.ceil(min_fill * bin_clicks)))

    df = raw.copy()
    df["click_within_context"] = df.groupby(["participant_id", context_col]).cumcount()
    df["state_bin"] = df["click_within_context"] // bin_clicks

    agg = {
        "n_clicks": ("click_index", "size"),
        "choice_prop_A": ("choice_A_raw", "mean"),
        "reward_rate": ("reward_outcome", "mean"),
        "switch_rate": ("switch_raw", "mean"),
        "mean_log_ici": ("log_ici_for_state", "mean"),
        "t_start_s": ("elapsed_time_s", "min"),
        "t_end_s": ("elapsed_time_s", "max"),
    }
    if "bonus_target" in df.columns:
        agg["bonus_A"] = ("bonus_target", lambda s: float(np.mean(s == "A")))
        agg["bonus_B"] = ("bonus_target", lambda s: float(np.mean(s == "B")))

    group_cols = ["participant_id", context_col, "state_bin"]
    if "phase_label" in df.columns and context_col == "phase_id":
        group_cols = ["participant_id", context_col, "phase_label", "state_bin"]

    states = df.groupby(group_cols, as_index=False).agg(**agg)
    states = states.loc[states["n_clicks"] >= min_clicks].copy()

    return states.sort_values(["participant_id", context_col, "state_bin"]).reset_index(
        drop=True
    )


def build_transitions(
    states: pd.DataFrame,
    context_col: str = "phase_id",
    include_boundaries: bool = False,
) -> pd.DataFrame:
    """Pair consecutive states into (x_t, x_{t+1}) rows.

    Within-context transitions require consecutive ``state_bin`` values inside
    the same context. Boundary transitions connect the last bin of one context
    to the first bin of the next and are the experimentally imposed
    perturbations; they are excluded by default because they describe
    reorganization between contexts rather than dynamics within one.
    """
    rows = []

    for pid, g in states.groupby("participant_id"):
        g = g.sort_values([context_col, "state_bin"]).reset_index(drop=True)

        for i in range(len(g) - 1):
            cur, nxt = g.loc[i], g.loc[i + 1]

            within = (
                nxt[context_col] == cur[context_col]
                and nxt["state_bin"] == cur["state_bin"] + 1
            )
            boundary = (
                nxt[context_col] != cur[context_col] and nxt["state_bin"] == 0
            )

            if not (within or (boundary and include_boundaries)):
                continue

            row = {
                "participant_id": pid,
                "context_t": cur[context_col],
                "context_next": nxt[context_col],
                "boundary": bool(boundary),
                "transition_order": int(cur["state_bin"]),
                "n_clicks_t": cur["n_clicks"],
                "n_clicks_next": nxt["n_clicks"],
            }
            if "phase_label" in g.columns:
                row["context_label"] = cur["phase_label"]
            for col in ("bonus_A", "bonus_B"):
                if col in g.columns:
                    row[f"{col}_next"] = nxt[col]

            for col in STATE_COLS:
                row[f"{col}_t"] = cur[col]
                row[f"{col}_next"] = nxt[col]

            rows.append(row)

    tr = pd.DataFrame(rows)
    return tr.sort_values(["participant_id", "context_t", "transition_order"]).reset_index(
        drop=True
    )


def x_cols() -> list[str]:
    return [f"{c}_t" for c in STATE_COLS]


def y_cols() -> list[str]:
    return [f"{c}_next" for c in STATE_COLS]
