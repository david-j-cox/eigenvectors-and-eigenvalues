"""Per-subject profile at the 3-response bin, for the study 1 report.

Same quantities the 10-response profile reported, recomputed on the time scale
the rank test says the dynamics actually live on, plus the scalar-vs-full
comparison that the 10-response bin could not resolve.

    python3 analysis/run_profiles_bin3.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from dynalysis import adapt, states as S                       # noqa: E402
from dynalysis.eigen import sorted_eig, describe_operator      # noqa: E402
from dynalysis.operators import fit_operator                   # noqa: E402
from run_bin_dynamics_tradeoff import fit_rank, split          # noqa: E402

EVENTS = Path("analysis/data/final_events.csv")
BIN = 3
RIDGE = 1.0


def main() -> None:
    raw = adapt.load_new_events(EVENTS)
    xc, yc = S.x_cols(), S.y_cols()
    rng = np.random.default_rng(0)
    rows = []

    for pid, g_raw in raw.groupby("participant_id"):
        prep = adapt.add_primitives(adapt.prepare(g_raw))
        st = S.build_states(prep, BIN, context_col="context_segment")
        tr = S.build_transitions(st, context_col="context_segment")
        if len(tr) < 60:
            continue
        A, _ = fit_operator(tr, alpha=RIDGE)
        desc = describe_operator(A)

        Xtr, Ytr, Xte, Yte = split(tr, xc, yc)
        mp = np.mean((Yte - Xte) ** 2)
        sk = {r: 1 - np.mean((Yte - Xte @ fit_rank(Xtr, Ytr, r, RIDGE)) ** 2) / mp
              for r in (0, 1, len(xc))}
        null = []
        for _ in range(200):
            Ys = Ytr[rng.permutation(len(Ytr))]
            gf = 1 - np.mean((Yte - Xte @ fit_rank(Xtr, Ys, len(xc), RIDGE)) ** 2) / mp
            g1 = 1 - np.mean((Yte - Xte @ fit_rank(Xtr, Ys, 1, RIDGE)) ** 2) / mp
            null.append(gf - g1)
        gain = sk[len(xc)] - sk[1]

        rows.append({
            "participant_id": pid,
            "n_transitions": len(tr),
            "skill_none": round(sk[0], 3),
            "skill_scalar": round(sk[1], 3),
            "skill_full": round(sk[len(xc)], 3),
            "gain_over_scalar": round(gain, 4),
            "null_p95": round(float(np.quantile(null, .95)), 4),
            "beats_null": bool(gain > np.quantile(null, .95)),
            "spectral_radius": round(desc["spectral_radius"], 3),
            "lambda1_real": round(desc["lambda1_real"], 3),
            "lambda1_imag": round(desc["lambda1_imag"], 3),
            "complex_pair": desc["complex_pair"],
            "half_life_bins": round(desc["half_life_bins"], 2),
            "dominant_feature": desc["dominant_feature"],
        })

    d = pd.DataFrame(rows)
    out = Path("analysis/outputs/final/profiles_bin3.csv")
    out.parent.mkdir(parents=True, exist_ok=True)
    d.to_csv(out, index=False)

    print(f"{len(d)} subjects, {BIN}-response bins, "
          f"{d.n_transitions.median():.0f} transitions (median)\n")
    print(d[["participant_id", "n_transitions", "skill_none", "skill_scalar",
             "skill_full", "gain_over_scalar", "beats_null",
             "spectral_radius", "half_life_bins",
             "dominant_feature"]].to_string(index=False))
    print(f"\nbeats own null: {d.beats_null.sum()}/{len(d)}")
    print(f"median skill  none {d.skill_none.median():.3f}  "
          f"scalar {d.skill_scalar.median():.3f}  full {d.skill_full.median():.3f}")
    print(f"median spectral radius {d.spectral_radius.median():.3f}  "
          f"(Baum & Davison fitted 1-w in .34-.58)")
    print(f"complex dominant pair: {d.complex_pair.sum()}/{len(d)}")
    print(f"dominant feature: "
          f"{d.dominant_feature.value_counts().to_dict()}")
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
