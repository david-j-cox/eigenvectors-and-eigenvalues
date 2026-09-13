"""
Regression check: does the control estimator recover an arrangement we made?

The task's own code generates choice sets and scores them for three choosers
whose attention is fixed by construction. The estimator in dynalysis/mnc.py is
then asked to recover what each was built to attend to. This is validation of a
measure against ground truth the code created, not a simulation of behavior,
and no design decision rests on it.

It exists because the obvious measure fails this check and the failure is
silent. Run it after any change to the engine, the schema or the estimator.

    npx tsx experiment/scripts/validate_roundtrip.ts > analysis/data/roundtrip_validation.csv
    python3 analysis/validate_mnc_analysis.py

Exits non-zero if any expectation is violated.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dynalysis import mnc  # noqa: E402

DATA = Path("analysis/data/roundtrip_validation.csv")

# What each chooser in validate_roundtrip.ts was built to do, and therefore
# what the estimator must report. Margins are deliberately loose: the claim is
# that the arrangement is recovered, not that a particular number is hit.
EXPECT = {
    "both-rel": dict(controlled=True, min_gap=0.40,
                     why="uses both relevant dimensions"),
    "one-rele": dict(controlled=True, min_gap=0.30,
                     why="uses one relevant dimension, ignores the other"),
    "one-irre": dict(controlled=False, min_gap=None,
                     why="attends a dimension that carries nothing, so there "
                         "is no relevant-dimension control to find"),
}


def main() -> int:
    if not DATA.exists():
        print(f"missing {DATA}; regenerate it with validate_roundtrip.ts")
        return 2
    d = mnc.load(DATA)
    failures: list[str] = []

    rep = mnc.check_integrity(d)
    print(f"integrity: {rep}")
    if not rep.ok:
        failures.append("integrity checks failed on generated rows")

    if not mnc.has_relevance(d):
        failures.append("generated rows carry no relevance columns")
        print("\n".join(failures))
        return 1

    print(f"\n  {'chooser':<12}{'relevant':>10}{'irrelevant':>12}{'diff':>8}"
          f"{'null95':>9}  {'verdict':<20}expected")
    print("  " + "-" * 84)
    for pid, exp in EXPECT.items():
        rc = mnc.role_contrast(d, pid)
        if rc is None:
            failures.append(f"{pid}: no role contrast could be computed")
            continue
        verdict = "CONTROLLED" if rc["controlled"] else "not distinguished"
        want = "CONTROLLED" if exp["controlled"] else "not distinguished"
        ok = rc["controlled"] == exp["controlled"]
        if ok and exp["min_gap"] is not None and rc["difference"] < exp["min_gap"]:
            ok = False
            failures.append(
                f"{pid}: gap {rc['difference']:.2f} below the {exp['min_gap']} "
                f"this chooser should produce")
        elif not ok:
            failures.append(f"{pid}: got {verdict}, expected {want} ({exp['why']})")
        print(f"  {pid:<12}{rc['relevant']:>10.2f}{rc['irrelevant']:>12.2f}"
              f"{rc['difference']:>8.2f}{rc['null_p95']:>9.2f}  {verdict:<20}{want}"
              f"{'' if ok else '   <-- FAIL'}")

    print()
    if failures:
        print("VALIDATION FAILED")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("VALIDATION PASSED: the estimator recovers what each chooser was "
          "built to attend to")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
