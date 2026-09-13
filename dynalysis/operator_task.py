"""
Per-participant analysis of the free-operant operator-estimation procedure.

Every function here takes one participant's responses and returns that
participant's result. Nothing pools across participants, and nothing averages
across the replications within a participant: a block boundary is a
replication, and the result is a count of how many of them showed the arranged
effect. Averaging would conceal a participant who reversed on half of them,
which is the outcome the count is there to expose.

The model-free profiles -- how allocation moves after a block boundary, a
momentary stimulus, or a perturbation -- are the primary measurements. The
fitted operator is checked against them rather than the other way round.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd


# ----------------------------------------------------------------- loading --

def load(path: str | Path, include_practice: bool = False) -> pd.DataFrame:
    d = pd.read_csv(path)
    if "is_test" in d:
        d = d[d.is_test == 0]
    if not include_practice:
        d = d[d.is_practice == 0]
    d = d.assign(pid=d.prolific_pid.astype(str).str[:8])
    return d.sort_values(["pid", "session_id", "trial_index"]).reset_index(drop=True)


def sessions(d: pd.DataFrame) -> pd.DataFrame:
    """One row per participant-session. A participant who reloaded has two."""
    out = []
    for (pid, sess), g in d.groupby(["pid", "session_id"], sort=False):
        out.append({
            "pid": pid, "session": sess[-8:], "responses": len(g),
            "minutes": g.elapsed_ms.max() / 60000,
            "blocks": g.block_index.nunique(),
            "transitions": max(g.block_index.nunique() - 1, 0),
            "perturbations": int(((g.perturbation_active == 1)
                                  & (g.perturbation_active.shift(1) != 1)).sum()),
            "appetitive": int((g.stimulus == "appetitive").sum()),
            "aversive": int((g.stimulus == "aversive").sum()),
            "p_left_choice": g.chosen_side.eq("left").mean(),
            "switch_rate": g.switched.mean(),
            "points": g.points_total.max(),
            "contiguous": bool(g.trial_index.max() - g.trial_index.min() + 1 == len(g)),
        })
    return pd.DataFrame(out)


@dataclass
class Integrity:
    rows: int
    problems: dict[str, int]

    @property
    def ok(self) -> bool:
        return not any(self.problems.values())

    def __str__(self) -> str:
        if self.ok:
            return f"{self.rows} rows; all checks pass"
        bad = ", ".join(f"{k}={v}" for k, v in self.problems.items() if v)
        return f"{self.rows} rows; PROBLEMS: {bad}"


def check(g: pd.DataFrame) -> Integrity:
    """Invariants the arranged schedule guarantees. These run every time."""
    p = {
        # the recorded choice must agree with the recorded rich side
        "chose_rich": int((g.chose_rich == (g.chosen_side == g.effective_rich)).sum()
                          != len(g)),
        # a perturbation must invert the block state, and nothing else may
        "perturb_inverts": int(((g.perturbation_active == 1)
                                & (g.effective_rich == g.block_rich)).sum()),
        "no_perturb_matches": int(((g.perturbation_active == 0)
                                   & (g.effective_rich != g.block_rich)).sum()),
        # an appetitive stimulus supersedes the block probabilities
        "appetitive_probs": int(((g.stimulus == "appetitive")
                                 & (g[["p_left", "p_right"]].max(axis=1) < 0.55)).sum()),
        # a stimulus must have a side, and no stimulus must not
        "stimulus_side": int(((g.stimulus != "none") & g.stimulus_side.isna()).sum()
                             + ((g.stimulus == "none")
                                & g.stimulus_side.notna()).sum()),
        # switching must agree with the choice sequence
        "switched": int((g.switched != (g.chosen_side != g.previous_side)
                         .fillna(False)).sum()),
    }
    return Integrity(rows=len(g), problems=p)


# --------------------------------------------------- block transitions --

def transitions(g: pd.DataFrame, window: int = 32,
                settle: int = 20) -> pd.DataFrame:
    """One row per block boundary: what allocation did before and after.

    Each boundary reverses which panel pays better, so each is an independent
    replication within the participant. `moved_as_arranged` is the per-boundary
    result; the participant's result is how many of them did.

    The post-boundary window starts `settle` responses in, not at the boundary.
    A reversal takes roughly 16-23 responses to take effect, so a window
    starting at zero averages the old allocation together with the new one and
    understates every shift. The first version of this did exactly that and
    reported barely more than half of boundaries moving as arranged for a
    participant whose time course shows the shift plainly.
    """
    g = g.sort_values("trial_index").reset_index(drop=True)
    rows = []
    for b in sorted(g.block_index.unique()):
        if b <= g.block_index.min():
            continue
        start = g.index[g.block_index == b][0]
        pre = g.loc[max(0, start - window): start - 1]
        post = g.loc[start + settle: start + settle + window - 1]
        if len(pre) < window // 2 or len(post) < window // 2:
            continue
        new_rich = g.loc[start, "block_rich"]
        # proportion choosing the panel that is rich AFTER the boundary
        p_pre = (pre.chosen_side == new_rich).mean()
        p_post = (post.chosen_side == new_rich).mean()
        rows.append({
            "block": int(b), "new_rich": new_rich,
            # named to avoid shadowing DataFrame.shift, which silently returns
            # the method rather than the column
            "p_pre": p_pre, "p_post": p_post, "displacement": p_post - p_pre,
            "moved_as_arranged": bool(p_post > p_pre),
            "n_pre": len(pre), "n_post": len(post),
        })
    return pd.DataFrame(rows)


def transition_profile(g: pd.DataFrame, span: int = 40) -> pd.DataFrame:
    """P(choose the newly rich panel) by responses since a block boundary,
    for one participant. This is the model-free time course."""
    g = g.sort_values("trial_index").reset_index(drop=True)
    rows = []
    for b in sorted(g.block_index.unique()):
        if b <= g.block_index.min():
            continue
        idx = g.index[g.block_index == b]
        if not len(idx):
            continue
        start = idx[0]
        new_rich = g.loc[start, "block_rich"]
        win = g.loc[start - span: start + span - 1]
        for i, r in win.iterrows():
            rows.append({"k": int(i - start),
                         "chose_new_rich": int(r.chosen_side == new_rich)})
    d = pd.DataFrame(rows)
    if d.empty:
        return d
    return (d.groupby("k").chose_new_rich.agg(["mean", "size"])
             .rename(columns={"mean": "p", "size": "n"}).reset_index())


# ------------------------------------------------- momentary stimuli --

def stimulus_profile(g: pd.DataFrame, kind: str, lags: int = 15) -> pd.DataFrame:
    """P(choose the panel the stimulus marked) at lag 0 and after.

    Lag 0 is the response the stimulus was shown for, where its arranged effect
    lives. Every later lag is behavioural persistence, because the arrangement
    has already ended. The floor on the inter-stimulus interval guarantees each
    window is free of further stimuli of the same kind.
    """
    g = g.sort_values("trial_index").reset_index(drop=True)
    hits = g.index[g.stimulus == kind]
    rows = []
    for h in hits:
        side = g.loc[h, "stimulus_side"]
        for k in range(0, lags + 1):
            j = h + k
            if j >= len(g):
                break
            if k > 0 and g.loc[j, "stimulus"] == kind:
                break          # next stimulus of this kind: window ends
            rows.append({"k": k, "chose_marked": int(g.loc[j, "chosen_side"] == side)})
    d = pd.DataFrame(rows)
    if d.empty:
        return d
    return (d.groupby("k").chose_marked.agg(["mean", "size"])
             .rename(columns={"mean": "p", "size": "n"}).reset_index())


# ---------------------------------------------------- perturbations --

def perturbation_profile(g: pd.DataFrame, pre: int = 20, post: int = 48) -> pd.DataFrame:
    """P(choose the panel the BLOCK favours) around a perturbation.

    The perturbation inverts the block state for 8 responses, so this should
    dip and return. Alignment is by the arranged direction, never by the
    displacement observed during the perturbation: aligning on the observed
    sign guarantees a displacement and manufactures a recovery curve out of
    regression to the mean.
    """
    g = g.sort_values("trial_index").reset_index(drop=True)
    onsets = g.index[(g.perturbation_active == 1)
                     & (g.perturbation_active.shift(1) != 1)]
    rows = []
    for o in onsets:
        block_rich = g.loc[o, "block_rich"]
        win = g.loc[max(0, o - pre): o + post]
        if g.loc[max(0, o - pre): o + post, "block_index"].nunique() > 1:
            continue          # stay inside the block that holds it
        for i, r in win.iterrows():
            rows.append({"k": int(i - o),
                         "chose_block_rich": int(r.chosen_side == block_rich)})
    d = pd.DataFrame(rows)
    if d.empty:
        return d
    return (d.groupby("k").chose_block_rich.agg(["mean", "size"])
             .rename(columns={"mean": "p", "size": "n"}).reset_index())


# ------------------------------------------------- magnitude / decay --

def stimulus_effect(g: pd.DataFrame, kind: str, lags: int = 15) -> dict | None:
    """Magnitude and persistence of one momentary stimulus, for one participant.

    Magnitude is the lag-0 displacement against the participant's own base rate
    of choosing that panel. Persistence is the first lag at which the
    displacement is no longer at least a quarter of its lag-0 value -- a crude
    half-life, but computed without reference to any model, which is the point.
    """
    prof = stimulus_profile(g, kind, lags)
    if prof.empty or prof.n.iloc[0] < 20:
        return None
    base = _base_rate(g, kind)
    dev = prof.p - base
    mag = float(dev.iloc[0])
    decay_to = None
    if abs(mag) > 1e-9:
        for _, r in prof.iloc[1:].iterrows():
            if abs((r.p - base) / mag) < 0.25:
                decay_to = int(r.k)
                break
    return {"kind": kind, "n_events": int(prof.n.iloc[0]), "base": base,
            "magnitude": mag, "lags_to_quarter": decay_to,
            "profile": prof.assign(dev=dev)}


def _base_rate(g: pd.DataFrame, kind: str) -> float:
    """How often the marked panel would be chosen absent the stimulus.

    Conditioned on the block state, not merely on which side was marked. The
    momentary stimuli are deliberately correlated with the block state -- 60%
    congruent for the appetitive, 40% for the aversive -- so the marked panel
    is more often the panel the block already favours. A base rate matched only
    on side therefore attributes block control to the stimulus: an earlier
    version did this and showed an appetitive effect that appeared to persist
    undiminished for eight responses, which was the block state throughout.

    The rate is taken from stimulus-free responses in the same block as each
    event, so the block state is held exactly rather than approximately.
    """
    hits = g[g.stimulus == kind]
    if hits.empty:
        return float("nan")
    plain = g[g.stimulus == "none"]
    if plain.empty:
        return float("nan")
    rates, weights = [], []
    for _, ev in hits.iterrows():
        same = plain[plain.block_index == ev.block_index]
        if len(same) < 10:
            continue
        rates.append((same.chosen_side == ev.stimulus_side).mean())
        weights.append(1.0)
    if not rates:
        return float("nan")
    return float(np.average(rates, weights=weights))
