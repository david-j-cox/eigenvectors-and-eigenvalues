#!/usr/bin/env python3
"""
Pilot acceptance checks for the behavioral dynamics task.

Runs the same state construction, operator fitting, and eigenanalysis that the
final analysis will use, and reports whether the data can actually support the
claims the design is meant to test. Point it at simulated sessions before
collecting anything, then at real pilot data.

The checks are deliberately ones that can fail. A design that produces clean
event files but operators nobody can estimate has not passed a pilot.

Usage:
    python run_pilot_diagnostics.py [--events PATH] [--bin 10] [--out DIR]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from dynalysis import adapt, eigen as E, operators as O, states as S  # noqa: E402

# The primary state, provisional until pilot data replace the simulated
# sessions it was chosen on.
#
# The criterion is discrimination, not per-coordinate noise: a coordinate earns
# its place by improving the separation between two estimates of the same
# operator and two estimates of different ones. On the previous study's data
# that criterion picked [P(A), reward rate, switch rate]; on simulated sessions
# of the new task it picks [P(A), reward rate], largely because a smaller
# operator needs fewer transitions and the extra coordinates add noise without
# adding context-discriminative variance.
#
# Those two answers disagree, and the simulated one is contingent on a
# responder whose choices depend only on local reinforcement rates -- exactly
# the variables the winning state contains. Treat this as the default to start
# from and rerun `run_state_selection.py` on real pilot data before fixing it.
PRIMARY_STATE = ["choice_prop_A", "reward_rate"]

TARGETS = {
    "min_transitions_per_cell": 30,
    "max_noise_ratio": 0.60,
    "min_frac_beating_persistence": 0.70,
    "min_responses_per_s": 1.2,
    "max_session_minutes": 32.0,
    "min_switch_rate": 0.02,
    "max_switch_rate": 0.45,
    "min_rewards_per_bin": 1.5,
}


# Metadata columns share the _t / _next suffix with state coordinates, so they
# have to be named rather than pattern-matched.
META_COLS = [
    "participant_id", "context_t", "context_next", "boundary",
    "transition_order", "n_clicks_t", "n_clicks_next",
]


def restrict(tr: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    """Keep the metadata and only the state coordinates in `cols`."""
    keep = META_COLS + [f"{c}_t" for c in cols] + [f"{c}_next" for c in cols]
    return tr[[c for c in dict.fromkeys(keep) if c in tr.columns]].copy()


def noise_ratios(tr: pd.DataFrame, cols: list[str], bin_clicks: int) -> dict:
    """Sampling noise as a share of between-bin variance, per coordinate."""
    out = {}
    for c in cols:
        vals = tr[f"{c}_t"].to_numpy(float)
        n = tr["n_clicks_t"].to_numpy(float)
        if c == "mean_log_ici":
            noise = np.var(vals, ddof=1) / max(bin_clicks, 1)
        else:
            noise = float(np.mean(vals * (1 - vals) / np.maximum(n, 1)))
        total = float(np.var(vals, ddof=1))
        out[c] = noise / total if total > 0 else np.inf
    return out


def fit_all(tr: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    """Held-out prediction and eigensystem for every participant."""
    import dynalysis.states as ST

    original = ST.STATE_COLS[:]
    ST.STATE_COLS[:] = cols  # the fitters read the module-level coordinate list
    try:
        contexts = sorted(tr["context_t"].unique())
        rows = []
        for pid, g in tr.groupby("participant_id"):
            fit = O.fit_participant(g, contexts, min_train=20, min_test=6)
            if fit is None:
                rows.append({"participant_id": pid, "fitted": False})
                continue
            scores = fit["scores"].set_index("model")
            alpha = float(scores.loc["A_i", "alpha"])
            A, _ = O.fit_operator(g, alpha=alpha)
            row = {
                "participant_id": pid,
                "fitted": True,
                "n_transitions": len(g),
                "skill_A_i": scores.loc["A_i", "skill_vs_persistence"],
                "skill_A_ic": scores.loc["A_ic", "skill_vs_persistence"]
                if "A_ic" in scores.index else np.nan,
                "ridge_alpha": alpha,
            }
            row.update(E.describe_operator(A))
            rows.append(row)
        return pd.DataFrame(rows)
    finally:
        ST.STATE_COLS[:] = original


def replication(tr: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    """Compare operators for the same colour and contingency across stages.

    Stages 1 and 3 arrange the same mapping, separated by the whole of stage 2.
    That separation is the point: it is the longest-range test of whether an
    individual's dynamics in an environment recur when they return to it.
    """
    import dynalysis.states as ST

    original = ST.STATE_COLS[:]
    ST.STATE_COLS[:] = cols
    try:
        rows = []
        for pid, g in tr.groupby("participant_id"):
            meta = g["context_t"].astype(str).str.split("|", expand=True)
            g = g.assign(
                color=meta[0], contingency=meta[1],
                stage=meta[2].str.removeprefix("s").astype(int),
            )
            for (color, cont), gc in g.groupby(["color", "contingency"]):
                stages = sorted(gc["stage"].unique())
                if 1 not in stages or 3 not in stages:
                    continue
                early = gc[gc["stage"] == 1]
                late = gc[gc["stage"] == 3]
                if len(early) < 12 or len(late) < 12:
                    continue

                A_e, scaler = O.fit_operator(early, alpha=1.0)
                A_l, _ = O.fit_operator(late, alpha=1.0, scaler=scaler)

                row = {"participant_id": pid, "color": color, "contingency": cont,
                       "n_early": len(early), "n_late": len(late)}
                row.update(E.compare_operators(A_e, A_l))

                X = scaler.transform(late[[f"{c}_t" for c in cols]].to_numpy())
                Y = scaler.transform(late[[f"{c}_next" for c in cols]].to_numpy())
                mse_op = float(np.mean((Y - X @ A_e.T) ** 2))
                mse_pers = float(np.mean((Y - X) ** 2))
                row["early_predicts_late_skill"] = (
                    1 - mse_op / mse_pers if mse_pers > 0 else np.nan
                )
                rows.append(row)
        return pd.DataFrame(rows)
    finally:
        ST.STATE_COLS[:] = original


def color_vs_contingency(tr: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    """The competing similarity predictions, matched on elapsed time.

    Both comparisons use operators from adjacent stages, so neither is favoured
    by having its two estimates closer together in the session. With a single
    reversal that matching is impossible, which is why the design uses two.
    """
    import dynalysis.states as ST

    original = ST.STATE_COLS[:]
    ST.STATE_COLS[:] = cols
    try:
        rows = []
        for pid, g in tr.groupby("participant_id"):
            meta = g["context_t"].astype(str).str.split("|", expand=True)
            g = g.assign(
                color=meta[0], contingency=meta[1],
                stage=meta[2].str.removeprefix("s").astype(int),
            )
            _, scaler = O.fit_operator(g, alpha=1.0)

            ops = {}
            for (color, cont, stage), gc in g.groupby(["color", "contingency", "stage"]):
                if len(gc) < 12:
                    continue
                ops[(color, cont, stage)], _ = O.fit_operator(
                    gc, alpha=1.0, scaler=scaler
                )

            for pair in ((1, 2), (2, 3)):
                a, b = pair
                for (color, cont, stage), A in ops.items():
                    if stage != a:
                        continue
                    # Same colour, different contingency: the reversal changed
                    # what this colour arranges.
                    same_color = [
                        (k, v) for k, v in ops.items()
                        if k[2] == b and k[0] == color and k[1] != cont
                    ]
                    # Different colour, same contingency: the other colour now
                    # arranges what this one used to.
                    same_cont = [
                        (k, v) for k, v in ops.items()
                        if k[2] == b and k[0] != color and k[1] == cont
                    ]
                    for label, matches in (
                        ("same_color_diff_contingency", same_color),
                        ("diff_color_same_contingency", same_cont),
                    ):
                        for _, B in matches:
                            row = {
                                "participant_id": pid, "comparison": label,
                                "stage_pair": f"{a}v{b}", "color": color,
                                "contingency": cont,
                            }
                            row.update(E.compare_operators(A, B))
                            rows.append(row)
        return pd.DataFrame(rows)
    finally:
        ST.STATE_COLS[:] = original


def perturbation_readiness(raw: pd.DataFrame, bin_clicks: int) -> pd.DataFrame:
    """Whether each perturbation has usable pre-perturbation and recovery data."""
    rows = []
    for pid, g in raw.groupby("participant_id"):
        for pid_key, gp in g[g["perturbation_id"].notna()].groupby("perturbation_id"):
            block = int(gp["block_index"].iloc[0])
            onset = int(gp["trial_in_block"].min())
            offset = int(gp["trial_in_block"].max()) + 1
            block_rows = g[g["block_index"] == block]
            recovery = block_rows[block_rows["trial_in_block"] >= offset]
            rows.append({
                "participant_id": pid,
                "perturbation_id": pid_key,
                "type": gp["perturbation_type"].iloc[0],
                "repetition": int(gp["perturbation_repetition"].iloc[0]),
                "duration_responses": len(gp),
                "pre_responses_in_block": onset,
                "recovery_responses": len(recovery),
                "recovery_bins": len(recovery) // bin_clicks,
                "rewards_during": int(gp["reward_outcome"].sum()),
            })
    return pd.DataFrame(rows)


def check(label: str, value: float, ok: bool, detail: str = "") -> str:
    mark = "PASS" if ok else "FAIL"
    return f"| {label} | {value:.3f} | {mark} | {detail} |"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--events", default=str(HERE / "data" / "simulated_events.csv"))
    ap.add_argument("--bin", type=int, default=10)
    ap.add_argument("--out", default=str(HERE / "outputs"))
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    raw = adapt.load_new_events(args.events)
    sessions = adapt.summarize_sessions(raw)

    prepared = adapt.add_primitives(adapt.prepare(raw))
    st = S.build_states(prepared, args.bin, context_col="context_segment")
    tr_all = S.build_transitions(st, context_col="context_segment")

    # Group transitions by analysis cell rather than by block, so exposures to
    # the same cell pool into one operator estimate.
    cell = tr_all["context_t"].astype(str).str.rsplit("|", n=1).str[0]
    tr_all = tr_all.assign(context_t=cell, context_next=cell)

    tr = restrict(tr_all, PRIMARY_STATE)

    per_cell = tr.groupby(["participant_id", "context_t"]).size()
    ratios = noise_ratios(tr, PRIMARY_STATE, args.bin)
    profiles = fit_all(tr, PRIMARY_STATE)
    rep = replication(tr, PRIMARY_STATE)
    cvc = color_vs_contingency(tr, PRIMARY_STATE)
    pert = perturbation_readiness(raw, args.bin)

    for name, frame in [
        ("session_quality", sessions), ("individual_profiles", profiles),
        ("stage_replication", rep), ("color_vs_contingency", cvc),
        ("perturbation_readiness", pert),
    ]:
        frame.to_csv(out_dir / f"pilot_{name}.csv", index=False)

    fitted = profiles[profiles["fitted"]]
    frac_beating = float((fitted["skill_A_i"] > 0).mean()) if len(fitted) else 0.0
    rewards_per_bin = float(sessions["reward_rate"].median() * args.bin)

    lines = [
        "# Pilot diagnostics",
        "",
        f"Events: `{args.events}`  ",
        f"Participants: {sessions['participant_id'].nunique()}  ",
        f"State: {', '.join(PRIMARY_STATE)} in {args.bin}-response bins",
        "",
        "## Acceptance checks",
        "",
        "| Check | Value | Result | Target |",
        "|---|---|---|---|",
        check("Median transitions per analysis cell", per_cell.median(),
              per_cell.median() >= TARGETS["min_transitions_per_cell"],
              f">= {TARGETS['min_transitions_per_cell']}"),
        check("Minimum transitions in any cell", per_cell.min(),
              per_cell.min() >= TARGETS["min_transitions_per_cell"] * 0.8,
              "no cell far below the median"),
        check("Median responses per second", sessions["responses_per_s"].median(),
              sessions["responses_per_s"].median() >= TARGETS["min_responses_per_s"],
              f">= {TARGETS['min_responses_per_s']}"),
        check("Median session minutes", sessions["duration_min"].median(),
              sessions["duration_min"].median() <= TARGETS["max_session_minutes"],
              f"<= {TARGETS['max_session_minutes']}"),
        check("Reinforcers per state bin", rewards_per_bin,
              rewards_per_bin >= TARGETS["min_rewards_per_bin"],
              f">= {TARGETS['min_rewards_per_bin']}"),
        check("Median switch rate", sessions["switch_rate"].median(),
              TARGETS["min_switch_rate"] <= sessions["switch_rate"].median()
              <= TARGETS["max_switch_rate"],
              f"{TARGETS['min_switch_rate']}-{TARGETS['max_switch_rate']}"),
        check("Participants beating persistence", frac_beating,
              frac_beating >= TARGETS["min_frac_beating_persistence"],
              f">= {TARGETS['min_frac_beating_persistence']:.0%}"),
    ]
    for c, r in ratios.items():
        lines.append(
            check(f"Noise ratio: {S.STATE_LABELS.get(c, c)}", r,
                  r <= TARGETS["max_noise_ratio"],
                  f"<= {TARGETS['max_noise_ratio']}")
        )

    lines += [
        "",
        "A failed noise-ratio check means that coordinate is measured mostly as "
        "sampling noise at this bin size, so its column of the operator is "
        "attenuated and its eigenvector loading cannot be interpreted.",
        "",
        "## Individual operators",
        "",
        f"- Participants fitted: {len(fitted)} / {len(profiles)}",
        f"- Held-out skill vs persistence (A_i): "
        f"{fitted['skill_A_i'].median():.3f} "
        f"[{fitted['skill_A_i'].quantile(.25):.3f}, "
        f"{fitted['skill_A_i'].quantile(.75):.3f}]",
        f"- Spectral radius: {fitted['spectral_radius'].median():.3f} "
        f"[{fitted['spectral_radius'].quantile(.25):.3f}, "
        f"{fitted['spectral_radius'].quantile(.75):.3f}]",
        f"- Complex dominant pair: {fitted['complex_pair'].mean():.0%} of participants",
        "",
    ]

    if len(rep):
        lines += [
            "## Stage 1 vs stage 3 replication (same colour, same contingency)",
            "",
            f"- Comparisons: {len(rep)}",
            f"- Dominant-eigenvector |cos|: {rep['dominant_cosine'].median():.3f} "
            f"[{rep['dominant_cosine'].quantile(.25):.3f}, "
            f"{rep['dominant_cosine'].quantile(.75):.3f}]",
            f"- Early operator predicting late stage, skill: "
            f"{rep['early_predicts_late_skill'].median():.3f} "
            f"({(rep['early_predicts_late_skill'] > 0).mean():.0%} positive)",
            "",
            "Compare the |cos| value against the same-operator floor in "
            "`reanalysis/outputs/design_replication_floor_bin10.csv` at this "
            "number of transitions. Similarity below the floor is estimation "
            "noise, not replication.",
            "",
        ]

    if len(cvc):
        med = cvc.groupby("comparison")["dominant_cosine"].median()
        per_p = (
            cvc.groupby(["participant_id", "comparison"])["dominant_cosine"]
            .median().unstack()
        )
        if {"same_color_diff_contingency", "diff_color_same_contingency"} <= set(per_p.columns):
            follows_contingency = (
                per_p["diff_color_same_contingency"]
                > per_p["same_color_diff_contingency"]
            )
            share = float(follows_contingency.mean())
        else:
            share = float("nan")

        lines += [
            "## Physical context vs functional contingency",
            "",
            "| Comparison | Median dominant \\|cos\\| |",
            "|---|---|",
            *[f"| {k} | {v:.3f} |" for k, v in med.items()],
            "",
            f"Participants whose dynamics follow the contingency rather than the "
            f"colour: {share:.0%}",
            "",
            "Both comparisons are matched on elapsed time by construction, so a "
            "difference between them cannot be explained by one pair of "
            "estimates simply being closer together in the session.",
            "",
        ]

    if len(pert):
        lines += [
            "## Perturbation readiness",
            "",
            f"- Perturbations delivered: {len(pert)} "
            f"({pert.groupby('participant_id').size().median():.0f} per participant)",
            f"- Median recovery bins after offset: {pert['recovery_bins'].median():.0f}",
            f"- Perturbations with at least 3 recovery bins: "
            f"{(pert['recovery_bins'] >= 3).mean():.0%}",
            f"- Reinforcers delivered during extinction: "
            f"{int(pert.loc[pert['type'] == 'extinction', 'rewards_during'].sum())} "
            "(must be 0)",
            "",
        ]

    (out_dir / "pilot_diagnostics.md").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
