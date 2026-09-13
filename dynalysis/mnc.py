"""
Loading, checking and measuring the Multiple Necessary Cues task.

Everything reported about an MNC session should come from here, so that a
number quoted in a writeup can be traced to a function rather than to a shell
command that no longer exists. Three things live here:

  load / clean    one row per trial, with the reload case resolved
  integrity       assertions the data must satisfy before it is interpreted
  control         per-dimension control, estimated from the whole choice set

The control estimator is the part that needs the most care, because the
obvious measure is wrong for version 1.1.0 and wrong quietly. See
`dimension_control` for what fails and why.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

DIMS = ["shape", "size", "orientation", "hue"]
N_DIM = len(DIMS)
N_ALT = 4


# ----------------------------------------------------------------- loading --

def compound(i: int) -> list[int]:
    """Compound index to one bit per dimension, matching the task's encoding
    in `compoundFromIndex`. Dimension order is DIMS and must stay in step
    with DIMENSIONS in src/config/mnc.ts."""
    return [(int(i) >> d) & 1 for d in range(N_DIM)]


def parse_alternatives(v) -> list[int]:
    """Postgres smallint[] arrives as '{9,2,7,12}' through CSV and as a list
    through the API. Accept both rather than depending on the export route."""
    if isinstance(v, str):
        return [int(x) for x in ast.literal_eval(v.replace("{", "[").replace("}", "]"))]
    return [int(x) for x in v]


def load(path: str | Path, include_test: bool = False) -> pd.DataFrame:
    """Load events, drop test sessions, and resolve participants who reloaded.

    A reload starts a new session id, so one participant can contribute two
    partial runs. The longer is kept: the two are not independent, and pooling
    them would double-count the acquisition the participant had already done.
    """
    d = pd.read_csv(path)
    if "is_test" in d and not include_test:
        d = d[d.is_test == 0]
    if "prolific_pid" in d and "session_id" in d:
        n = d.groupby(["prolific_pid", "session_id"]).size().reset_index(name="n")
        keep = n.sort_values("n").groupby("prolific_pid").tail(1)
        d = d.merge(keep[["prolific_pid", "session_id"]],
                    on=["prolific_pid", "session_id"])
        d = d.assign(pid=d.prolific_pid.astype(str).str[:8])
    else:
        d = d.assign(pid=d.participant_id.astype(str).str[:8])
    return d.sort_values(["pid", "trial_index"]).reset_index(drop=True)


def has_relevance(d: pd.DataFrame) -> bool:
    """True for version 1.1.0 and later, where only some dimensions matter."""
    return "rel_shape" in d.columns and d.rel_shape.notna().any()


# --------------------------------------------------------------- integrity --

@dataclass
class IntegrityReport:
    rows: int
    problems: dict[str, int]

    @property
    def ok(self) -> bool:
        return not any(self.problems.values())

    def __str__(self) -> str:
        head = f"{self.rows} rows"
        if self.ok:
            return head + "; all integrity checks pass"
        bad = ", ".join(f"{k}={v}" for k, v in self.problems.items() if v)
        return head + f"; PROBLEMS: {bad}"


def check_integrity(d: pd.DataFrame) -> IntegrityReport:
    """Assertions the data must satisfy before any of it is interpreted.

    These are cheap and they have caught real faults, so they run every time
    rather than once. Each counts rows that violate an invariant the task
    guarantees by construction.
    """
    p = {k: 0 for k in (
        "alt_count", "target_pos_mismatch", "chosen_pos_mismatch",
        "correct_flag", "disparity", "navail_range")}
    for _, r in d.iterrows():
        alts = parse_alternatives(r.alternatives)
        if len(alts) != N_ALT:
            p["alt_count"] += 1
            continue
        if alts[int(r.target_position)] != int(r.target_index):
            p["target_pos_mismatch"] += 1
        if alts[int(r.chosen_position)] != int(r.chosen_index):
            p["chosen_pos_mismatch"] += 1
        for dim in DIMS:
            n = r.get(f"navail_{dim}")
            if pd.notna(n) and not (1 <= int(n) <= N_ALT):
                p["navail_range"] += 1
        m = [int(r[f"match_{dim}"]) for dim in DIMS]
        if has_relevance(d) and pd.notna(r.get("rel_shape")):
            rel = [int(r[f"rel_{dim}"]) for dim in DIMS]
            wrong = sum(1 for i in range(N_DIM) if rel[i] and not m[i])
        else:
            wrong = N_DIM - sum(m)
        if (wrong == 0) != (int(r.correct) == 1):
            p["correct_flag"] += 1
        if wrong != int(r.error_disparity):
            p["disparity"] += 1
    return IntegrityReport(rows=len(d), problems=p)


# ----------------------------------------------------------------- control --

def choice_design(g: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """Design for a conditional logit over the alternatives.

    X[t, j, d] is 1 when alternative j carries the winning compound's value on
    dimension d. y[t] is the position chosen.
    """
    X, y = [], []
    for _, r in g.iterrows():
        alts = parse_alternatives(r.alternatives)
        if len(alts) != N_ALT:
            continue
        win = compound(alts[int(r.target_position)])
        X.append([[1.0 if compound(a)[d] == win[d] else 0.0 for d in range(N_DIM)]
                  for a in alts])
        y.append(int(r.chosen_position))
    return np.array(X), np.array(y)


def fit_conditional_logit(X, y, iters: int = 600, lr: float = 0.5,
                          ridge: float = 1e-3) -> np.ndarray:
    b = np.zeros(X.shape[2])
    n = len(y)
    for _ in range(iters):
        u = X @ b
        p = np.exp(u - u.max(1, keepdims=True))
        p /= p.sum(1, keepdims=True)
        b += lr * ((X[np.arange(n), y].sum(0) - (p[:, :, None] * X).sum((0, 1))) / n
                   - ridge * b)
    return b


def dimension_control(d: pd.DataFrame, pid: str | None = None,
                      min_trials: int = 30) -> dict[str, np.ndarray]:
    """Per-dimension control for one participant, as conditional-logit betas.

    Why not the simpler measure. Asking whether the chosen compound matched the
    winner on dimension d, against the rate implied by how many alternatives
    carried the winner's value, is wrong for 1.1.0 and fails silently: a
    participant who chooses correctly has chosen the winner, and the winner
    matches itself on every dimension. Validated against a chooser built to use
    only the relevant dimensions, that measure returned +50% on relevant
    dimensions and +37% on irrelevant ones.

    What identifies control is the alternatives NOT chosen, which is what a
    conditional logit over the full choice set uses.

    Why fit per relevant-set. Which dimensions are relevant changes with the
    context, so one fit pooled over contexts averages each dimension across
    both roles and every coefficient collapses toward the same value. Where
    relevance does not vary -- version 1.0.0 -- pooling is correct instead,
    and necessary, since those contexts are about a dozen trials each.
    """
    g = d if pid is None else d[d.pid == pid]
    fits = []
    if has_relevance(g):
        for rset, gg in g.groupby("relevant_dims"):
            if len(gg) < min_trials:
                continue
            X, y = choice_design(gg)
            if len(y) >= min_trials:
                fits.append((str(rset), fit_conditional_logit(X, y)))
    else:
        X, y = choice_design(g)
        if len(y) >= min_trials:
            fits.append((None, fit_conditional_logit(X, y)))
    if not fits:
        return {}
    return {"per_context": fits,
            "mean": np.mean([b for _, b in fits], axis=0)}


def role_contrast(d: pd.DataFrame, pid: str, n_null: int = 60,
                  seed: int = 0) -> dict | None:
    """Control by arranged-relevant versus arranged-irrelevant dimensions,
    against that participant's own permutation null.

    The null permutes dimension columns within each trial, which destroys which
    dimension is which while leaving the choice sets and the actual choices
    untouched. Only defined for versions that arrange relevance.
    """
    g = d[d.pid == pid]
    if not has_relevance(g):
        return None
    rng = np.random.default_rng(seed)

    def gap(permute: bool) -> float | None:
        rel, irr = [], []
        for rset, gg in g.groupby("relevant_dims"):
            if len(gg) < 30:
                continue
            X, y = choice_design(gg)
            if len(y) < 30:
                continue
            if permute:
                X = X.copy()
                for i in range(len(X)):
                    X[i] = X[i][:, rng.permutation(X.shape[2])]
            b = fit_conditional_logit(X, y, iters=250)
            names = str(rset).split("|")
            for i, dim in enumerate(DIMS):
                (rel if dim in names else irr).append(b[i])
        if not rel or not irr:
            return None
        return float(np.mean(rel)), float(np.mean(irr))

    obs = gap(False)
    if obs is None:
        return None
    null = [x for x in (gap(True) for _ in range(n_null)) if x]
    diffs = [a - b for a, b in null]
    p95 = float(np.quantile(diffs, 0.95)) if diffs else float("nan")
    return {"relevant": obs[0], "irrelevant": obs[1],
            "difference": obs[0] - obs[1], "null_p95": p95,
            "controlled": (obs[0] - obs[1]) > p95}


def spread_vs_null(d: pd.DataFrame, pid: str, n_null: int = 200,
                   seed: int = 0) -> dict | None:
    """Do a participant's dimensions differ in control beyond their own null?

    Applies where relevance does NOT vary -- version 1.0.0 -- and so there is
    no arranged contrast to draw and the only question left is whether the
    participant weighted the dimensions differently of their own accord. This
    is the evidence that decided whether that design could answer the
    program's question at all, so it belongs in the library rather than in a
    shell command.

    The null permutes dimension columns within each trial, destroying which
    dimension is which while leaving the choice sets and the actual choices
    untouched.
    """
    g = d[d.pid == pid]
    X, y = choice_design(g)
    if len(y) < 40:
        return None
    rng = np.random.default_rng(seed)
    obs = fit_conditional_logit(X, y)
    spread = float(obs.max() - obs.min())
    null = []
    for _ in range(n_null):
        Xp = X.copy()
        for i in range(len(Xp)):
            Xp[i] = Xp[i][:, rng.permutation(X.shape[2])]
        b = fit_conditional_logit(Xp, y, iters=250)
        null.append(float(b.max() - b.min()))
    p95 = float(np.quantile(null, 0.95))
    return {"betas": obs, "spread": spread, "null_p95": p95,
            "differs": spread > p95}


# ------------------------------------------------------------- descriptive --

def session_summary(d: pd.DataFrame) -> pd.DataFrame:
    """One row per participant: the numbers worth quoting about a session."""
    out = []
    for pid, g in d.groupby("pid"):
        out.append({
            "pid": pid,
            "arm": g.arm.iloc[0],
            "version": g.experiment_version.iloc[0],
            "trials": len(g),
            "contexts": g.context_index.nunique(),
            "accuracy": g.correct.mean(),
            "reinforced": g.rewarded.mean(),
            "errors": int((g.correct == 0).sum()),
            "median_rt_ms": g.response_time_ms.median(),
            "seconds": g.elapsed_ms.max() / 1000,
            "contiguous": bool(
                g.trial_index.max() - g.trial_index.min() + 1 == len(g)),
        })
    return pd.DataFrame(out)


def acquisition_curve(d: pd.DataFrame, max_trial: int = 14) -> pd.DataFrame:
    """Accuracy by position within a context, which is where any learning is."""
    g = d[d.trial_in_context <= max_trial]
    return (g.groupby("trial_in_context")
             .agg(n=("correct", "size"), accuracy=("correct", "mean"))
             .reset_index())


def ceiling_check(d: pd.DataFrame, window: int = 8) -> pd.DataFrame:
    """How much variance is left to analyse, per participant.

    A block at exactly 1.00 on every dimension contributes nothing to any
    covariance structure, so counting them is the cheapest way to see whether
    an arm has run out of signal.
    """
    out = []
    for pid, g in d.groupby("pid"):
        per = (g.assign(blk=np.arange(len(g)) // window)
                .groupby("blk")[[f"match_{x}" for x in DIMS]].mean())
        out.append({"pid": pid, "blocks": len(per),
                    "mean_match": per.values.mean(),
                    "sd_across_blocks": per.values.std(),
                    "blocks_at_ceiling": int((per == 1.0).all(axis=1).sum())})
    return pd.DataFrame(out)
