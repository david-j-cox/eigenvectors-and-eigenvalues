"""
Everything worth quoting about an MNC dataset, from saved code.

All computation lives in dynalysis/mnc.py; this only arranges the output. A
number in a writeup should be traceable to a function here, not to a shell
command that no longer exists.

    python3 analysis/run_mnc_report.py --events analysis/data/mnc_pilot_live.csv
"""

from __future__ import annotations

import argparse
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dynalysis import mnc  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--events", default="analysis/data/mnc_pilot_live.csv")
    ap.add_argument("--out", default="analysis/outputs/final")
    a = ap.parse_args()

    d = mnc.load(a.events)
    rel = mnc.has_relevance(d)
    print(f"{d.pid.nunique()} participants, {len(d)} trials, "
          f"version(s) {sorted(d.experiment_version.unique())}")
    print(f"relevance arranged: {rel}\n")

    print("1. INTEGRITY")
    rep = mnc.check_integrity(d)
    print(f"   {rep}")
    if not rep.ok:
        print("   -> stop here; nothing below is interpretable")

    print("\n2. SESSIONS")
    s = mnc.session_summary(d)
    print(s.to_string(index=False, float_format=lambda v: f"{v:.3f}"))

    print("\n3. ACQUISITION (accuracy by position within a context)")
    ac = mnc.acquisition_curve(d)
    for _, r in ac.iterrows():
        bar = "#" * int(round(r.accuracy * 20))
        print(f"   t{int(r.trial_in_context):<3}n={int(r.n):<4}"
              f"{100*r.accuracy:>5.0f}%  {bar}")

    print("\n4. VARIANCE LEFT TO ANALYSE")
    print(mnc.ceiling_check(d).to_string(index=False,
                                         float_format=lambda v: f"{v:.3f}"))

    print("\n5. PER-DIMENSION CONTROL (conditional logit over the choice set)")
    print(f"   {'pid':<10}{'fits':>6}   " + "".join(f"{x:>12}" for x in mnc.DIMS))
    for pid in sorted(d.pid.unique()):
        r = mnc.dimension_control(d, pid)
        if not r:
            continue
        print(f"   {pid:<10}{len(r['per_context']):>6}   "
              + "".join(f"{v:>12.2f}" for v in r["mean"]))

    if rel:
        print("\n6. CONTROL BY ARRANGED ROLE, against each participant's own null")
        print(f"   {'pid':<10}{'relevant':>10}{'irrelevant':>12}"
              f"{'diff':>8}{'null95':>9}  verdict")
        for pid in sorted(d.pid.unique()):
            rc = mnc.role_contrast(d, pid)
            if not rc:
                continue
            print(f"   {pid:<10}{rc['relevant']:>10.2f}{rc['irrelevant']:>12.2f}"
                  f"{rc['difference']:>8.2f}{rc['null_p95']:>9.2f}  "
                  f"{'CONTROLLED' if rc['controlled'] else 'not distinguished'}")
    else:
        print("\n6. No role contrast: this version made every dimension relevant.")

    out = Path(a.out) / "mnc_report_sessions.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    s.to_csv(out, index=False)
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
