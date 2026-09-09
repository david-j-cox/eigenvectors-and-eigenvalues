#!/usr/bin/env python3
"""
Phase 0: individual-level reanalysis of the existing dynamic-foraging dataset.

Runs the analysis that `behavior_dynamics_individual_level.ipynb` specified but
never executed, and extends it with the bias, attenuation, and stability
controls the perturbation study will depend on.

Outputs land in reanalysis/outputs/:
    individual_profiles.csv     one dynamical profile per participant
    context_replication.csv     early-half vs late-half operator agreement
    cross_context.csv           operator similarity across contexts
    binsize_sensitivity.csv     how the above move with the state bin size
    summary.md                  the numbers that set the new design

Usage:
    python run_reanalysis.py [--events PATH] [--bins 5,10,20] [--quick]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from dynalysis import eigen as E  # noqa: E402
from dynalysis import operators as O  # noqa: E402
from dynalysis import profiles as P  # noqa: E402
from dynalysis import states as S  # noqa: E402

DEFAULT_EVENTS = (
    HERE.parent.parent
    / "measuring-behavior-trajectories"
    / "analysis" / "data" / "01_raw_data" / "events.csv"
)
PRIMARY_BIN = 10


def run_for_bin(raw: pd.DataFrame, bin_clicks: int, n_boot: int, n_sim: int):
    states = S.build_states(raw, bin_clicks)
    tr = S.build_transitions(states)
    contexts = sorted(tr["context_t"].unique())

    prof_rows, rep_frames, cross_frames = [], [], []
    for pid, g in tr.groupby("participant_id"):
        prof = P.participant_profile(
            g, contexts, bin_clicks, n_boot=n_boot, n_sim=n_sim
        )
        if prof is None:
            continue
        prof["bin_clicks"] = bin_clicks
        prof_rows.append(prof)

        alpha = prof["ridge_alpha"]
        rep = P.context_replication(g, alpha=alpha)
        if len(rep):
            rep["bin_clicks"] = bin_clicks
            rep_frames.append(rep)
        cx = P.cross_context_similarity(g, alpha=alpha)
        if len(cx):
            cx["bin_clicks"] = bin_clicks
            cross_frames.append(cx)

    return (
        pd.DataFrame(prof_rows),
        pd.concat(rep_frames, ignore_index=True) if rep_frames else pd.DataFrame(),
        pd.concat(cross_frames, ignore_index=True) if cross_frames else pd.DataFrame(),
        tr,
    )


def q(s: pd.Series, digits: int = 3) -> str:
    s = pd.to_numeric(s, errors="coerce").dropna()
    if s.empty:
        return "n/a"
    return (
        f"{s.median():.{digits}f} "
        f"[{s.quantile(.25):.{digits}f}, {s.quantile(.75):.{digits}f}]"
    )


def md_table(df: pd.DataFrame) -> list[str]:
    """Render a small DataFrame as a markdown table without extra dependencies."""
    cols = list(df.columns)
    rows = ["| " + " | ".join(cols) + " |",
            "|" + "|".join("---" for _ in cols) + "|"]
    for _, r in df.iterrows():
        rows.append("| " + " | ".join(
            f"{r[c]:.3f}" if isinstance(r[c], float) else str(r[c]) for c in cols
        ) + " |")
    return rows


def write_summary(out_dir: Path, prof: pd.DataFrame, rep: pd.DataFrame,
                  cross: pd.DataFrame, sens: pd.DataFrame, tr: pd.DataFrame):
    n = len(prof)
    lines = [
        "# Phase 0 reanalysis: individual-level dynamics in the existing dataset",
        "",
        f"Participants profiled: **{n}**  ",
        f"State: 4-D, non-overlapping {PRIMARY_BIN}-response bins within context  ",
        f"Within-context transitions per participant: "
        f"**{tr.groupby('participant_id').size().median():.0f}** "
        f"(min {tr.groupby('participant_id').size().min()}, "
        f"max {tr.groupby('participant_id').size().max()})",
        "",
        "All values are median [IQR] across participants.",
        "",
        "## 1. Does an individual's earlier behaviour predict their own later behaviour?",
        "",
        "Skill is 1 - MSE/MSE_persistence on strictly later transitions in each context.",
        "",
        "| Architecture | Held-out skill vs persistence | Participants better than persistence |",
        "|---|---|---|",
    ]
    for model, label in [("A_i", "A_i"), ("DMDc", "A_i + B_i u_t"), ("A_ic", "A_{i,c}")]:
        col = f"skill_{model}"
        if col not in prof:
            continue
        lines.append(
            f"| {label} | {q(prof[col])} | {(prof[col] > 0).mean():.0%} |"
        )
    best = prof["best_model"].value_counts(normalize=True)
    lines += [
        "",
        "Best architecture by held-out MSE: "
        + ", ".join(f"{k} {v:.0%}" for k, v in best.items()),
        "",
        "## 2. Eigensystem of the individual operator",
        "",
        f"- Spectral radius (raw ridge estimate): {q(prof['spectral_radius'])}",
        f"- Corrected for short-sample bias: {q(prof['spectral_radius_debiased'])}",
        f"- Corrected for state measurement noise: "
        f"{q(prof['spectral_radius_attenuation_corrected'])} "
        f"({prof['spectral_radius_attenuation_corrected'].notna().mean():.0%} of "
        f"participants correctable)",
        f"- Dominant-mode half-life: {q(prof['half_life_bins'], 2)} state bins",
        f"- Complex (oscillatory) dominant pair: "
        f"{prof['complex_pair'].mean():.0%} of participants",
        "",
        "Dominant feature of the leading eigenvector: "
        + ", ".join(
            f"{k} {v:.0%}"
            for k, v in prof["dominant_feature"].value_counts(normalize=True).items()
        ),
        "",
        "### Eigenvector stability (moving-block bootstrap)",
        "",
        f"- Median |cos| between bootstrap and point-estimate dominant vector: "
        f"{q(prof['eigvec_stability_median'])}",
        f"- Participants with stability >= 0.9: "
        f"{(prof['eigvec_stability_median'] >= 0.9).mean():.0%}",
        f"- Participants with stability >= 0.7: "
        f"{(prof['eigvec_stability_median'] >= 0.7).mean():.0%}",
        "",
        "### Sampling noise in each state coordinate",
        "",
        "Ratio of within-bin sampling-noise variance to total between-bin variance. "
        "A coordinate above ~0.5 is more noise than signal at this bin size and its "
        "operator column is strongly attenuated.",
        "",
        "| Coordinate | noise / total variance |",
        "|---|---|",
    ]
    for col in S.STATE_COLS:
        lines.append(f"| {S.STATE_LABELS[col]} | {q(prof[f'noise_ratio_{col}'])} |")

    lines += [
        "",
        "## 3. Does an operator replicate within the same context?",
        "",
        "Each context's transitions were split into an early and a late half. "
        "This is the closest analogue in this dataset to the repeated-exposure "
        "replication test the new study is designed to run.",
        "",
        f"- Comparisons available: {len(rep)} "
        f"(median {rep.groupby('participant_id').size().median():.0f} per participant)",
        f"- Transitions per half: {q(rep['n_early'], 0)} early, {q(rep['n_late'], 0)} late",
        f"- Dominant-eigenvector |cos| early vs late: {q(rep['dominant_cosine'])}",
        f"- Top-2 subspace mean principal angle: {q(rep['top2_mean_angle_deg'], 1)} deg",
        f"- |rho_early - rho_late|: {q(rep['spectral_radius_diff'])}",
        f"- Early operator predicting late half, skill vs persistence: "
        f"{q(rep['early_predicts_late_skill'])} "
        f"({(rep['early_predicts_late_skill'] > 0).mean():.0%} of comparisons positive)",
        "",
        "**These are the numbers the new design has to beat.** An observed "
        "early/late similarity is only evidence of a reproducible mode if it "
        "exceeds what two estimates of the *same* operator produce at the same "
        "sample size. That noise floor is computed in `design_simulation.py`.",
        "",
        "## 4. Do operators differ across contexts within a participant?",
        "",
        f"- Cross-context dominant |cos|: {q(cross['dominant_cosine'])}",
        f"- Cross-context top-2 mean angle: {q(cross['top2_mean_angle_deg'], 1)} deg",
        "",
        "Compare against the within-context early/late values in section 3: if "
        "cross-context similarity is not clearly lower than within-context "
        "replication, the context-specific operator is not yet distinguishable "
        "from estimation noise.",
        "",
        "## 5. Multi-step forecast degradation",
        "",
        "| Horizon (bins) | Skill vs persistence |",
        "|---|---|",
    ]
    for k in (1, 2, 5, 10):
        col = f"skill_h{k}"
        if col in prof:
            lines.append(f"| {k} | {q(prof[col])} |")

    lines += ["", "## 6. Bin-size sensitivity", "", *md_table(sens), ""]

    (out_dir / "summary.md").write_text("\n".join(lines), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--events", default=str(DEFAULT_EVENTS))
    ap.add_argument("--bins", default="5,10,20")
    ap.add_argument("--out", default=str(HERE / "outputs"))
    ap.add_argument("--quick", action="store_true",
                    help="fewer bootstrap/simulation replicates")
    args = ap.parse_args()

    n_boot, n_sim = (60, 60) if args.quick else (300, 300)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    raw = S.load_events(args.events)
    print(f"Loaded {len(raw):,} responses from "
          f"{raw['participant_id'].nunique()} participants")

    bins = [int(b) for b in args.bins.split(",")]
    sens_rows = []
    primary = None

    for b in bins:
        print(f"  fitting bin={b} ...", flush=True)
        prof, rep, cross, tr = run_for_bin(raw, b, n_boot, n_sim)
        if b == PRIMARY_BIN:
            primary = (prof, rep, cross, tr)

        sens_rows.append({
            "bin_clicks": b,
            "transitions_per_participant": tr.groupby("participant_id").size().median(),
            "median_skill_A_i": prof["skill_A_i"].median(),
            "frac_beating_persistence": (prof["skill_A_i"] > 0).mean(),
            "median_spectral_radius": prof["spectral_radius"].median(),
            "median_eigvec_stability": prof["eigvec_stability_median"].median(),
            "median_early_late_cosine": rep["dominant_cosine"].median() if len(rep) else np.nan,
            "frac_switch_rate_noise": prof["noise_ratio_switch_rate"].median(),
        })

    sens = pd.DataFrame(sens_rows).round(3)
    sens.to_csv(out_dir / "binsize_sensitivity.csv", index=False)

    if primary is None:
        print(f"bin={PRIMARY_BIN} not requested; no primary outputs written")
        print(sens.to_string(index=False))
        return

    prof, rep, cross, tr = primary
    prof.to_csv(out_dir / "individual_profiles.csv", index=False)
    rep.to_csv(out_dir / "context_replication.csv", index=False)
    cross.to_csv(out_dir / "cross_context.csv", index=False)
    write_summary(out_dir, prof, rep, cross, sens, tr)

    print(f"\nWrote {len(prof)} individual profiles to {out_dir}")
    print(sens.to_string(index=False))


if __name__ == "__main__":
    main()
