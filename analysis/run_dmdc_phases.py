#!/usr/bin/env python3
"""
Four per-subject tests of stimulus control, on the ABAB reversal part.

    python3 run_dmdc_phases.py --events data/final_events.csv

The reversal does not change the reinforcement waveform. In both conditions the
rich key alternates every 100 responses; what reverses is the phase relation
between that waveform and the color cue. So the schedule is identical across
conditions and any difference in the choice series is attributable to control by
color. The reversal belongs in the control term, not the spectrum.

    x(t+1) = A x(t) + B u(t) + c,    u = +1 when the color in force is blue,
                                         -1 when green

The input is the COLOR, not the contingency. Using the contingency would make B
positive in every phase by construction -- it would measure only that subjects
move toward whichever key pays, which is true in both conditions and is not the
reversal. The reversal is the color-to-contingency mapping, so with color as the
input the same cue value means opposite payoffs in condition A and condition B,
and B must change sign between them.

1. SIGN OF B. Predicted to flip between condition A and condition B. This is the
   direct measure of stimulus control by color, and unlike eigenvector
   similarity it is a single scalar with a predicted sign.

2. STABILITY OF eig(A). The organism's autonomous relaxation should not depend
   on which mapping is in force. Instability means something other than the
   mapping changed. Benchmarked against a bootstrap of four estimates of one
   phase's own operator, since four estimates at 72 transitions scatter on their
   own.

3. ANTICIPATION. Color switches on an exact 100-response count with zero jitter,
   so a subject could be counting rather than attending to color. Counting
   produces anticipation: preference shifts before the color changes. Measured
   as the alignment of the 20 responses preceding a switch with the cue that is
   about to arrive. Counting predicts a positive value.

4. IS THE CUE DOING ANYTHING. An autonomous model given enough delay memory can
   carry a 100-response oscillation by itself, and because the cue has zero
   jitter it is 80-90% predictable from its own past. So the comparison is run
   twice: away from condition boundaries, and within three bins of one. The cue
   only carries information its own history lacks at the reversals.
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from dynalysis import adapt, states as S  # noqa: E402

COLS = ["choice_prop_left", "reward_rate", "mean_log_ici"]
PHASES = ["A1", "B1", "A2", "B2"]
ORDER = {p: i for i, p in enumerate(PHASES)}


def phase_frame(prep: pd.DataFrame, bin_clicks: int) -> pd.DataFrame:
    st = S.build_states(prep, bin_clicks, context_col="context_segment")
    m = st.context_segment.str.split("|", expand=True)
    st = st.assign(color=m[0], cont=m[1], cond=m[2], blk=m[3])
    st = st[st.cond.isin(PHASES)].copy()
    st["bi"] = st.blk.str.removeprefix("b").astype(int)
    st["ord"] = st.cond.map(ORDER)
    return st.sort_values(["ord", "bi", "state_bin"]).reset_index(drop=True)


def fit(X, Y, U, use_u):
    Z = np.hstack([X, U, np.ones((len(X), 1))]) if use_u else np.hstack([X, np.ones((len(X), 1))])
    return np.linalg.lstsq(Z, Y, rcond=None)[0], Z


def spectral_radius(X, Y, U):
    W, _ = fit(X, Y, U, True)
    return float(np.max(np.abs(np.linalg.eigvals(W.T[:, :X.shape[1]]))))


def design_one_phase(st, cond):
    s = st[st.cond == cond]
    X, Y, U = [], [], []
    for _, g in s.groupby("context_segment", sort=False):
        g = g.sort_values("state_bin")
        v = g[COLS].to_numpy(float)
        if len(v) < 3:
            continue
        u = 1.0 if g.color.iloc[0] == "blue" else -1.0
        X.append(v[:-1]); Y.append(v[1:]); U.append(np.full((len(v) - 1, 1), u))
    if not X:
        return None
    return np.vstack(X), np.vstack(Y), np.vstack(U)


def embed(v, u, d):
    X, Y, U = [], [], []
    for t in range(d - 1, len(v) - 1):
        X.append(v[t - d + 1:t + 1][::-1].ravel()); Y.append(v[t + 1]); U.append([u[t]])
    return np.array(X), np.array(Y), np.array(U)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--events", default=str(HERE / "data" / "final_events.csv"))
    ap.add_argument("--bin", type=int, default=10)
    ap.add_argument("--delay", type=int, default=10)
    ap.add_argument("--boot", type=int, default=300)
    ap.add_argument("--out", default=str(HERE / "outputs" / "final"))
    args = ap.parse_args()

    rng = np.random.default_rng(0)
    raw = adapt.load_new_events(args.events)
    rows = []

    for pid, g in raw.groupby("participant_id"):
        prep = adapt.add_primitives(adapt.prepare(g))
        st = phase_frame(prep, args.bin)
        if st.cond.nunique() < 4:
            continue
        r = {"participant_id": pid}

        # 1 + 2: per-phase DMDc
        Bs, rhos = {}, {}
        for cond in PHASES:
            dm = design_one_phase(st, cond)
            if dm is None:
                continue
            X, Y, U = dm
            W, _ = fit(X, Y, U, True)
            Bs[cond] = float(W.T[0, X.shape[1]])      # cue -> choice
            rhos[cond] = spectral_radius(X, Y, U)
        for cond in PHASES:
            r[f"B_{cond}"] = Bs.get(cond, np.nan)
            r[f"rho_{cond}"] = rhos.get(cond, np.nan)
        a = [Bs.get(c, np.nan) for c in ("A1", "A2")]
        b = [Bs.get(c, np.nan) for c in ("B1", "B2")]
        r["B_sign_flips"] = bool(np.nanmean(a) > 0 > np.nanmean(b)
                                 or np.nanmean(a) < 0 < np.nanmean(b))
        rv = np.array(list(rhos.values()))
        r["rho_spread"] = float(rv.max() - rv.min()) if len(rv) == 4 else np.nan

        # same-operator benchmark for that spread
        spreads = []
        for _ in range(args.boot):
            vals = []
            for cond in PHASES:
                dm = design_one_phase(st, cond)
                if dm is None:
                    continue
                X, Y, U = dm
                i = rng.integers(0, len(X), len(X))
                vals.append(spectral_radius(X[i], Y[i], U[i]))
            if len(vals) == 4:
                spreads.append(max(vals) - min(vals))
        r["rho_spread_null_p95"] = float(np.percentile(spreads, 95)) if spreads else np.nan
        r["rho_unstable"] = bool(r["rho_spread"] > r["rho_spread_null_p95"])

        # 3: anticipation, at response resolution
        ev = g[g.part == "reversal"].sort_values("trial_index")
        x = (ev.chosen_option == "left").astype(float).to_numpy()
        u = np.where(ev.functional_contingency_id.to_numpy() == "left_rich", 1.0, -1.0)
        sw = np.flatnonzero(np.diff(u) != 0) + 1
        pre = [((x[s - 20:s] * 2 - 1) * u[s]).mean()
               for s in sw if s >= 25 and s + 25 <= len(x)]
        r["pre_switch_alignment"] = float(np.mean(pre)) if pre else np.nan
        r["n_switches"] = len(pre)

        # 4: does the cue add beyond an autonomous model, and where
        v = st[COLS].to_numpy(float)
        uu = np.where(st.color.to_numpy() == "blue", 1.0, -1.0)
        cond_arr = st.cond.to_numpy()
        bnd = np.flatnonzero(cond_arr[1:] != cond_arr[:-1]) + 1
        dist = np.full(len(v), 10 ** 6)
        for bd in bnd:
            dist = np.minimum(dist, np.abs(np.arange(len(v)) - bd))
        X, Y, U = embed(v, uu, args.delay)
        keep = dist[args.delay:]
        k = int(len(X) * 0.7)
        preds = {}
        for use_u in (False, True):
            W, _ = fit(X[:k], Y[:k], U[:k], use_u)
            Z = np.hstack([X[k:], U[k:], np.ones((len(X) - k, 1))]) if use_u \
                else np.hstack([X[k:], np.ones((len(X) - k, 1))])
            preds[use_u] = ((Y[k:] - Z @ W) ** 2).mean(axis=1)
        near = keep[k:] <= 3
        far = keep[k:] > 3
        for name, sel in (("near", near), ("far", far)):
            if sel.sum() > 3:
                a_, b_ = preds[False][sel].mean(), preds[True][sel].mean()
                r[f"cue_gain_{name}"] = float(100 * (a_ - b_) / a_)
            else:
                r[f"cue_gain_{name}"] = np.nan
        r["n_near"] = int(near.sum())
        rows.append(r)

    out = pd.DataFrame(rows)
    d = Path(args.out); d.mkdir(parents=True, exist_ok=True)
    out.to_csv(d / "dmdc_phases.csv", index=False)

    n = len(out)
    print(f"\n{n} subjects, bin {args.bin}, delay {args.delay}\n")
    print("1. SIGN OF B (cue -> choice), per subject")
    print(f"{'subject':>10}{'A1':>9}{'B1':>9}{'A2':>9}{'B2':>9}   flips")
    for _, s in out.iterrows():
        print(f"{s.participant_id[:8]:>10}{s.B_A1:>+9.3f}{s.B_B1:>+9.3f}"
              f"{s.B_A2:>+9.3f}{s.B_B2:>+9.3f}   {'yes' if s.B_sign_flips else 'NO'}")
    print(f"\n  flips as predicted: {int(out.B_sign_flips.sum())}/{n}")

    print("\n2. STABILITY OF eig(A) across the four phases")
    print(f"{'subject':>10}{'spread':>9}{'null p95':>10}   verdict")
    for _, s in out.iterrows():
        print(f"{s.participant_id[:8]:>10}{s.rho_spread:>9.3f}{s.rho_spread_null_p95:>10.3f}"
              f"   {'unstable' if s.rho_unstable else 'within noise'}")
    print(f"\n  spread beyond the same-operator null: {int(out.rho_unstable.sum())}/{n}")

    print("\n3. ANTICIPATION (counting control predicts a POSITIVE value)")
    print(f"{'subject':>10}{'pre-switch':>12}{'switches':>10}")
    for _, s in out.iterrows():
        print(f"{s.participant_id[:8]:>10}{s.pre_switch_alignment:>+12.3f}{int(s.n_switches):>10}")
    print(f"\n  positive (consistent with counting): "
          f"{int((out.pre_switch_alignment > 0).sum())}/{n}")

    print("\n4. CUE GAIN over an autonomous model, by distance from a reversal")
    print(f"{'subject':>10}{'4+ bins away':>14}{'within 3':>11}")
    for _, s in out.iterrows():
        print(f"{s.participant_id[:8]:>10}{s.cue_gain_far:>13.1f}%{s.cue_gain_near:>10.1f}%")
    print(f"\n  median away from reversals: {out.cue_gain_far.median():.1f}%")
    print(f"  median at reversals:        {out.cue_gain_near.median():.1f}%")
    print(f"  larger at reversals for {int((out.cue_gain_near > out.cue_gain_far).sum())}/{n}")
    print(f"\n-> {d / 'dmdc_phases.csv'}")


if __name__ == "__main__":
    main()
