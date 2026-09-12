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
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent

# The reversal part is ABAB. A condition is a color-to-contingency mapping;
# each is experienced twice, so the four presentations are A1, B1, A2, B2.
# Note A and B here name conditions, not response alternatives -- those are
# left and right.
CONDITION_ORDER = ["A1", "B1", "A2", "B2"]
sys.path.insert(0, str(HERE.parent))

from dynalysis import adapt, eigen as E, operators as O, states as S  # noqa: E402

# The primary state.
#
# Chosen on the previous study's real data, where the discrimination criterion
# picks these three coordinates: dropping mean log ICI helps, because it loads
# similarly on the dominant mode in every context and dilutes the differences
# under test, while dropping switch rate hurts most despite it being the
# noisiest coordinate.
#
# An earlier version of this file used [P(left), reward rate], chosen on simulated
# sessions. That was a mistake. Simulated responders cannot settle this
# question: a responder whose switching comes from fixed conditional
# probabilities has almost no context-specific dynamics to detect, so the
# criterion scores every candidate state near chance and mostly measures how
# many parameters each one has. The question of which coordinates carry an
# organism's context-specific dynamics is the empirical question this study
# exists to answer, and it can only be settled on behavior.
#
# Rerun `run_state_selection.py` on real pilot data before treating this as
# fixed.
PRIMARY_STATE = ["choice_prop_left", "reward_rate", "switch_rate"]

def _load_targets() -> dict:
    """Read the acceptance thresholds the task exports.

    They live in the task's config and are written here by
    `experiment/scripts/export_targets.ts`. Keeping a second copy in this file
    is how the task and the diagnostics come to disagree about what an
    acceptable pilot looks like, which is worse than either threshold being
    wrong.
    """
    path = HERE / "pilot_targets.json"
    if not path.exists():
        raise FileNotFoundError(
            f"{path} is missing. Run `npx tsx scripts/export_targets.ts` from "
            "experiment/ to generate it."
        )
    t = json.loads(path.read_text())["targets"]
    return {
        "min_transitions_per_cell": t["minTransitionsPerCell"],
        "max_noise_ratio": t["maxNoiseRatio"],
        "min_frac_beating_persistence": t["minFracBeatingPersistence"],
        "min_responses_per_s": t["minResponsesPerSecond"],
        "max_session_minutes": t["maxSessionMinutes"],
        "min_switch_rate": t["minSwitchRate"],
        "max_switch_rate": t["maxSwitchRate"],
        "min_rewards_per_bin": t["minRewardsPerBin"],
    }


TARGETS = _load_targets()


# Metadata columns share the _t / _next suffix with state coordinates, so they
# have to be named rather than pattern-matched.
META_COLS = [
    "participant_id", "context_t", "context_next", "boundary",
    "transition_order", "n_clicks_t", "n_clicks_next",
]


META_COLS.append("condition_cell")


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
    """Compare operators for the same color and contingency across exposures.

    The reversal part is ABAB: condition A, condition B, then each again. A
    condition is a color-to-contingency mapping, and each is experienced twice
    (A1 then A2, B1 then B2). Both pairs are compared, so the replication test is
    replicated within each participant rather than resting on one comparison --
    and both mappings contribute, rather than only the unreversed one.
    """
    import dynalysis.states as ST

    original = ST.STATE_COLS[:]
    ST.STATE_COLS[:] = cols
    try:
        rows = []
        for pid, g in tr.groupby("participant_id"):
            meta = g["condition_cell"].astype(str).str.split("|", expand=True)
            g = g.assign(
                color=meta[0], contingency=meta[1], condition=meta[2],
            )
            for (color, cont), gc in g.groupby(["color", "contingency"]):
                conditions = [c for c in CONDITION_ORDER if c in set(gc["condition"])]
                for a, b in (("A1", "A2"), ("B1", "B2")):
                    if a not in conditions or b not in conditions:
                        continue
                    early = gc[gc["condition"] == a]
                    late = gc[gc["condition"] == b]
                    if len(early) < 12 or len(late) < 12:
                        continue

                    A_e, scaler = O.fit_operator(early, alpha=1.0)
                    A_l, _ = O.fit_operator(late, alpha=1.0, scaler=scaler)

                    row = {"participant_id": pid, "color": color,
                           "contingency": cont, "condition_pair": f"{a}v{b}",
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

    Both comparisons use operators from adjacent conditions, so neither is favored
    by having its two estimates closer together in the session. With a single
    reversal that matching is impossible, which is why the design uses two.
    """
    import dynalysis.states as ST

    original = ST.STATE_COLS[:]
    ST.STATE_COLS[:] = cols
    try:
        rows = []
        for pid, g in tr.groupby("participant_id"):
            meta = g["condition_cell"].astype(str).str.split("|", expand=True)
            g = g.assign(
                color=meta[0], contingency=meta[1], condition=meta[2],
            )
            _, scaler = O.fit_operator(g, alpha=1.0)

            ops = {}
            for (color, cont, cond), gc in g.groupby(["color", "contingency", "condition"]):
                if len(gc) < 12:
                    continue
                ops[(color, cont, cond)], _ = O.fit_operator(
                    gc, alpha=1.0, scaler=scaler
                )

            # Adjacent presentations, so both comparison kinds span one
            # condition change and are matched on separation in the session.
            for a, b in (("A1", "B1"), ("B1", "A2")):
                for (color, cont, condition), A in ops.items():
                    if condition != a:
                        continue
                    # Same color, different contingency: the reversal changed
                    # what this color arranges.
                    same_color = [
                        (k, v) for k, v in ops.items()
                        if k[2] == b and k[0] == color and k[1] != cont
                    ]
                    # Different color, same contingency: the other color now
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
                                "condition_pair": f"{a}v{b}", "color": color,
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

    # Two groupings, for two different questions.
    #
    # An operator is estimated from a color x contingency cell pooled across
    # every condition in which that mapping was in force -- under ABAB, two conditions.
    # The condition-level split is only needed for the replication comparison, which
    # deliberately holds two estimates apart in time. Using the condition-level cell
    # for estimation would halve the data behind every operator.
    condition_cell = tr_all["context_t"].astype(str).str.rsplit("|", n=1).str[0]
    pooled_cell = condition_cell.str.rsplit("|", n=1).str[0]
    tr_all = tr_all.assign(
        condition_cell=condition_cell, context_t=pooled_cell, context_next=pooled_cell
    )

    tr = restrict(tr_all, PRIMARY_STATE)

    per_cell = tr.groupby(["participant_id", "context_t"]).size()
    per_condition_cell = tr.groupby(["participant_id", "condition_cell"]).size()
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
        check("Transitions per color x contingency cell", per_cell.median(),
              per_cell.median() >= TARGETS["min_transitions_per_cell"],
              f">= {TARGETS['min_transitions_per_cell']} (operator estimation)"),
        check("Minimum in any cell", per_cell.min(),
              per_cell.min() >= TARGETS["min_transitions_per_cell"] * 0.8,
              "the weakest cell is what the design can claim"),
        check("Transitions per cell x condition", per_condition_cell.median(),
              per_condition_cell.median() >= TARGETS["min_transitions_per_cell"] / 2,
              "half the pooled figure (replication comparison)"),
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
            "## Replication across conditions (same color, same contingency)",
            "",
            f"- Comparisons: {len(rep)}",
            f"- Dominant-eigenvector |cos|: {rep['dominant_cosine'].median():.3f} "
            f"[{rep['dominant_cosine'].quantile(.25):.3f}, "
            f"{rep['dominant_cosine'].quantile(.75):.3f}]",
            f"- Early operator predicting late condition, skill: "
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
            f"color: {share:.0%}",
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
