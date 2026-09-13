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


# ------------------------------------ separating stimulus from its payoff --

def stimulus_effect_by_outcome(g: pd.DataFrame, kind: str,
                               lags: int = 12) -> pd.DataFrame:
    """Split the post-stimulus profile by whether the marked response paid.

    A response to the gold panel is reinforced with p = .60, so a participant
    may stay there because they were PAID rather than because the stimulus
    still exerts control. The two are separable: if what persists is the
    stimulus, the profile should look the same whether or not that response
    paid; if it is the reinforcement, only the paid branch stays elevated.

    Returns one row per lag per branch, with the branch labelled `paid`.
    """
    g = g.sort_values("trial_index").reset_index(drop=True)
    hits = g.index[g.stimulus == kind]
    rows = []
    for h in hits:
        side = g.loc[h, "stimulus_side"]
        took = g.loc[h, "chosen_side"] == side
        if not took:
            continue          # they did not go there; nothing to persist
        paid = bool(g.loc[h, "rewarded"])
        for k in range(1, lags + 1):
            j = h + k
            if j >= len(g) or g.loc[j, "stimulus"] == kind:
                break
            rows.append({"k": k, "paid": paid,
                         "chose_marked": int(g.loc[j, "chosen_side"] == side)})
    d = pd.DataFrame(rows)
    if d.empty:
        return d
    return (d.groupby(["paid", "k"]).chose_marked.agg(["mean", "size"])
             .rename(columns={"mean": "p", "size": "n"}).reset_index())


# ------------------------------------------------- operator estimation --

def design(g: pd.DataFrame, k: int = 6) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Lag embedding of choice, plus the three manipulated variables.

    The state is the last k choices coded -1/+1, so A is a companion-style
    operator whose eigenvalues are the roots of the fitted autoregression --
    the persistence the organism carries independent of the environment. The
    inputs are the block state and each momentary stimulus, coded by side, so
    that a column of B is that variable's influence with the carryover already
    accounted for.
    """
    g = g.sort_values("trial_index").reset_index(drop=True)
    c = np.where(g.chosen_side.to_numpy() == "left", 1.0, -1.0)
    blk = np.where(g.block_rich.to_numpy() == "left", 1.0, -1.0)
    side = g.stimulus_side.fillna("none").to_numpy()
    kind = g.stimulus.to_numpy()
    app = np.where(kind == "appetitive", np.where(side == "left", 1.0, -1.0), 0.0)
    avr = np.where(kind == "aversive", np.where(side == "left", 1.0, -1.0), 0.0)

    n = len(c)
    rows, y = [], []
    for t in range(k, n):
        lags = c[t - k:t][::-1]
        rows.append(np.concatenate([lags, [blk[t], app[t], avr[t], 1.0]]))
        y.append(c[t])
    names = [f"choice_lag{i+1}" for i in range(k)] + [
        "block_rich", "appetitive", "aversive", "const"]
    return np.array(rows), np.array(y), names


def fit_operator(g: pd.DataFrame, k: int = 6, ridge: float = 1.0,
                 train_frac: float = 0.7) -> dict | None:
    """Linear autoregression of choice on its own lags plus the manipulated
    variables, scored on a scale the comparison is fair on.

    The model must be LINEAR in the lagged choices for the companion roots to
    be decay rates. A logistic version was tried and abandoned: its
    coefficients live on an unbounded logit scale where the sigmoid supplies
    the saturation, so the companion matrix came out with spectral radius above
    one for five of seven participants -- explosive operators, which a bounded
    choice process cannot have. The eigenvalues were describing the link
    function rather than the behaviour.

    Scoring is the part that needed fixing, not the model. Squared error on a
    +/-1 target flatters a baseline that predicts exactly +/-1 and punishes a
    ridge fit that shrinks toward zero; an earlier version reported skill of
    -0.65 against "repeat the last choice" for that reason alone. The linear
    prediction is therefore mapped to a probability and scored as a Brier skill
    against both the participant's own base rate and the persistence baseline.
    """
    X, y_pm, names = design(g, k)
    if len(y_pm) < 200:
        return None
    n_tr = int(len(y_pm) * train_frac)
    Xtr, ytr, Xte, yte = X[:n_tr], y_pm[:n_tr], X[n_tr:], y_pm[n_tr:]
    R = ridge * np.eye(X.shape[1])
    R[-1, -1] = 0.0
    beta = np.linalg.solve(Xtr.T @ Xtr + R, Xtr.T @ ytr)

    to_p = lambda v: np.clip((v + 1) / 2, 0.02, 0.98)
    y01 = (yte > 0).astype(float)
    brier = float(np.mean((y01 - to_p(Xte @ beta)) ** 2))
    brier_persist = float(np.mean((y01 - to_p(Xte[:, 0])) ** 2))
    brier_rate = float(np.mean((y01 - (ytr > 0).mean()) ** 2))

    phi = beta[:k]
    companion = np.zeros((k, k))
    companion[0, :] = phi
    if k > 1:
        companion[1:, :-1] = np.eye(k - 1)
    lam = np.linalg.eigvals(companion)
    lam = lam[np.argsort(-np.abs(lam))]
    rho = float(np.abs(lam[0]))
    return {
        "beta": dict(zip(names, beta)), "k": k,
        "skill_vs_base_rate": float(1 - brier / brier_rate),
        "skill_vs_persistence": float(1 - brier / brier_persist),
        "brier": brier,
        "eigenvalues": lam, "spectral_radius": rho,
        "half_life": float(np.log(0.5) / np.log(rho)) if 0 < rho < 1 else np.inf,
        "complex_dominant": bool(abs(np.imag(lam[0])) > 1e-9),
        "stable": bool(rho < 1),
        "B": {"block_rich": float(beta[k]), "appetitive": float(beta[k + 1]),
              "aversive": float(beta[k + 2])},
    }


def select_order(g: pd.DataFrame, orders=(2, 3, 4, 6, 8, 12)) -> tuple[int, float]:
    """Embedding order by held-out skill, per participant. Not assumed."""
    best, best_s = orders[0], -np.inf
    for k in orders:
        r = fit_operator(g, k)
        if r and r["skill_vs_base_rate"] > best_s:
            best, best_s = k, r["skill_vs_base_rate"]
    return best, float(best_s)


def stimulus_persistence(g: pd.DataFrame, kind: str, lags: int = 12) -> pd.DataFrame:
    """Persistence of a momentary stimulus against a matched control.

    Deviation from a same-block base rate corrects for the block state but not
    for the fact that the participant has just responded somewhere. A
    participant who switches on 15% of responses stays on whatever they last
    chose about 85% of the time, so "stayed on the marked panel" is mostly
    their own stickiness and only partly the stimulus.

    The control is an UNMARKED response in the same block on which the
    participant made the SAME choice: identical in the two respects that
    otherwise dominate -- the block state, and where the participant just
    was -- differing only in whether a stimulus was shown. `added` is what the
    stimulus contributes beyond those, and is the only quantity here that
    measures persistence of the stimulus rather than persistence of the
    participant.

    Matching on the lag-0 choice matters most for the aversive stimulus. An
    earlier version followed only events where the marked panel was chosen,
    which for a red border is the rare case of taking the loss, and the
    resulting group was both small and selected for inattention.
    """
    g = g.sort_values("trial_index").reset_index(drop=True)
    rows = []

    def follow(start: int, marked_side: str, chosen: str, is_marked: bool,
               block: int) -> None:
        for k in range(1, lags + 1):
            j = start + k
            if j >= len(g) or g.loc[j, "stimulus"] == kind:
                return
            rows.append({"k": k, "marked": is_marked, "chosen0": chosen,
                         "side": marked_side, "block": block,
                         "on_marked": int(g.loc[j, "chosen_side"] == marked_side)})

    events = g.index[g.stimulus == kind]
    for h in events:
        follow(h, g.loc[h, "stimulus_side"], g.loc[h, "chosen_side"], True,
               int(g.loc[h, "block_index"]))

    # One control set per marked side, so P(choose that side) is comparable.
    for side in ("left", "right"):
        for h in g.index[g.stimulus == "none"]:
            follow(h, side, g.loc[h, "chosen_side"], False,
                   int(g.loc[h, "block_index"]))

    d = pd.DataFrame(rows)
    if d.empty:
        return pd.DataFrame()

    # Match controls to the marked events on (lag-0 choice, block), then
    # weight the control mean by how the marked events are distributed across
    # those cells, so the comparison is like for like.
    out = []
    mk = d[d.marked]
    ct = d[~d.marked]
    # Cells must include which side is "marked": control rows are generated
    # for both sides from the same plain responses, so grouping without it
    # averages P(choose left) with P(choose right) and the control comes out at
    # exactly .5 for every participant at every lag -- chance, not a matched
    # estimate, and the stickiness correction it exists for does nothing.
    KEY = ["side", "chosen0", "block"]
    for k, mk_k in mk.groupby("k"):
        w = mk_k.groupby(KEY).size()
        ct_k = ct[ct.k == k]
        cell = ct_k.groupby(KEY).on_marked.agg(["mean", "size"])
        cell = cell[cell["size"] >= 5]
        common = w.index.intersection(cell.index)
        if len(common) == 0:
            continue
        ww = w.loc[common].to_numpy(dtype=float)
        control = float(np.average(cell.loc[common, "mean"], weights=ww))
        out.append({"k": int(k), "p_marked": float(mk_k.on_marked.mean()),
                    "p_control": control,
                    "added": float(mk_k.on_marked.mean()) - control,
                    "n_marked": int(len(mk_k)),
                    "n_control": int(cell.loc[common, "size"].sum())})
    return pd.DataFrame(out)


def decay_fit(prof: pd.DataFrame, col: str = "added") -> dict | None:
    """Exponential decay fitted to a matched-control profile.

    added(k) = a * exp(-k / tau), fitted on the log of the absolute deviation
    where that deviation keeps the sign it had at lag 1. Points that have
    crossed zero carry no information about the rate and are dropped rather
    than folded in with the wrong sign.

    Returns the magnitude at lag 1, the half-life in responses, and the
    proportion of variance the exponential accounts for, so a rate fitted to
    noise can be recognised as such instead of quoted.
    """
    if prof is None or prof.empty or len(prof) < 4:
        return None
    v = prof[col].to_numpy(dtype=float)
    k = prof["k"].to_numpy(dtype=float)
    sign = np.sign(v[0]) if v[0] != 0 else 1.0
    keep = (np.sign(v) == sign) & (np.abs(v) > 1e-6)
    if keep.sum() < 4:
        return None
    kk, vv = k[keep], np.abs(v[keep])
    A = np.column_stack([np.ones_like(kk), -kk])
    coef, *_ = np.linalg.lstsq(A, np.log(vv), rcond=None)
    a, inv_tau = float(np.exp(coef[0])), float(coef[1])
    pred = a * np.exp(-inv_tau * kk)
    ss = 1 - np.sum((vv - pred) ** 2) / max(np.sum((vv - vv.mean()) ** 2), 1e-12)
    half = float(np.log(2) / inv_tau) if inv_tau > 1e-6 else np.inf
    return {"magnitude": float(v[0]), "half_life": half,
            "r2": float(ss), "n_points": int(keep.sum()),
            "decays": bool(inv_tau > 1e-6)}


# ------------------------------------------------- incumbent measures --

def log_d(g: pd.DataFrame, kind: str) -> dict | None:
    """Discriminability of a signalled stimulus, after Davison and Tustin (1978).

        log d = 0.5 * log( (B11 * B22) / (B12 * B21) )

    Rows of the matrix are which panel the stimulus marked, columns are which
    panel was chosen, and only the responses the stimulus was shown for enter
    it. That restriction is the point of computing it here: log d is a count
    statistic over a set of responses and has no lag argument, so it can report
    how strongly a stimulus separated responding but nothing about how long the
    separation lasted.
    """
    hits = g[g.stimulus == kind]
    if len(hits) < 20:
        return None
    B = np.zeros((2, 2))
    for i, marked in enumerate(("left", "right")):
        for j, chosen in enumerate(("left", "right")):
            B[i, j] = ((hits.stimulus_side == marked)
                       & (hits.chosen_side == chosen)).sum()
    B = B + 0.25          # conventional correction for empty cells
    val = 0.5 * np.log((B[0, 0] * B[1, 1]) / (B[0, 1] * B[1, 0]))
    se = 0.5 * np.sqrt(np.sum(1.0 / B))
    return {"log_d": float(val), "se": float(se), "n": int(len(hits)),
            "matrix": B}


def matching_sensitivity(g: pd.DataFrame, min_block: int = 40) -> dict | None:
    """Sensitivity in the generalized matching law, fitted across blocks.

        log(B_left / B_right) = a * log(R_left / R_right) + log b

    One point per block, using obtained reinforcers rather than arranged
    probabilities. Like log d this is a count statistic: it summarises a block
    and carries no information about how quickly allocation got there.
    """
    pts = []
    for b, sub in g.groupby("block_index"):
        if len(sub) < min_block:
            continue
        bl = (sub.chosen_side == "left").sum()
        br = (sub.chosen_side == "right").sum()
        rl = ((sub.chosen_side == "left") & (sub.rewarded == 1)).sum()
        rr = ((sub.chosen_side == "right") & (sub.rewarded == 1)).sum()
        if min(bl, br, rl, rr) == 0:
            continue
        pts.append((np.log(rl / rr), np.log(bl / br)))
    if len(pts) < 5:
        return None
    x, y = np.array(pts).T
    A = np.column_stack([x, np.ones_like(x)])
    coef, *_ = np.linalg.lstsq(A, y, rcond=None)
    pred = A @ coef
    r2 = 1 - np.sum((y - pred) ** 2) / max(np.sum((y - y.mean()) ** 2), 1e-12)
    return {"sensitivity": float(coef[0]), "log_bias": float(coef[1]),
            "r2": float(r2), "n_blocks": int(len(pts))}
