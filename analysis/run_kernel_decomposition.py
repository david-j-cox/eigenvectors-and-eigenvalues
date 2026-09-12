"""
McDowell, Bass and Kessel's kernel and our eigenvalues are the same object.

McDowell et al. (1992) write behavior as a convolution of the reinforcement
stream with an impulse-response kernel,

    B(t) = INTEGRAL G(t - t') R(t') dt',

and name the critical test of the framework: the kernel must stay invariant
when the schedule changes. What they do not do is decompose G. For any linear
state-space model x(t+1) = A x(t) + B u(t), the impulse response is

    G(k) = A^(k-1) B = SUM_j c_j lambda_j^(k-1),

so G is a sum of exponentials whose rates ARE the eigenvalues of A. The kernel
is the thing you measure; the spectrum is what it is made of. Under a single
real eigenvalue the two descriptions are the same and nothing is gained. They
come apart exactly when the spectrum is not a single real number -- which is
what a scalar operator (Baum & Davison, 2009) assumes it is.

This script fits each participant's operator on the real study 1 data, rebuilds
the kernel two ways, and reports where a one-mode kernel is not enough.

    python3 analysis/run_kernel_decomposition.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dynalysis import adapt, states as S           # noqa: E402
from dynalysis.eigen import sorted_eig             # noqa: E402
from dynalysis.operators import fit_operator       # noqa: E402

EVENTS = Path("analysis/data/final_events.csv")
BIN = 10
HORIZON = 12          # kernel lags to reconstruct
N_NULL = 100          # order-shuffled surrogates per participant


def kernel_direct(A: np.ndarray, b: np.ndarray, n: int) -> np.ndarray:
    """G(k) = A^(k-1) b, computed by iterating the operator."""
    out, x = [], b.copy()
    for _ in range(n):
        out.append(x.copy())
        x = A @ x
    return np.array(out)


def kernel_from_spectrum(A: np.ndarray, b: np.ndarray, n: int) -> np.ndarray:
    """The same kernel rebuilt as a sum of exponentials in the eigenvalues.

    A = V diag(lam) V^-1, so A^(k-1) b = V diag(lam^(k-1)) V^-1 b. Each
    coordinate of G is then SUM_j c_j lam_j^(k-1) with c_j fixed by b.
    """
    lam, V = sorted_eig(A)
    c = np.linalg.solve(V, b.astype(complex))
    ks = np.arange(n)
    modes = lam[None, :] ** ks[:, None]            # n x d
    return np.real(modes * c[None, :] @ V.T)


def mode_shares(A: np.ndarray, horizon: int) -> np.ndarray:
    """Each mode's share of kernel energy, conjugate pairs grouped."""
    lam, V = sorted_eig(A)
    W = np.linalg.inv(V)
    ks = np.arange(horizon)
    energy, seen = [], set()
    for j in range(len(lam)):
        if j in seen:
            continue
        idx = [j]
        conj = [m for m in range(len(lam)) if m not in seen and m != j
                and abs(lam[m] - np.conj(lam[j])) < 1e-9
                and abs(np.imag(lam[j])) > 1e-9]
        if conj:
            idx.append(conj[0])
        seen.update(idx)
        term = sum(np.real(np.einsum("k,ij->kij", lam[m] ** ks,
                                     np.outer(V[:, m], W[m, :])))
                   for m in idx)
        energy.append(float(np.sum(term ** 2)))
    e = np.array(sorted(energy, reverse=True))
    return e / e.sum()


def main() -> None:
    rng = np.random.default_rng(0)
    raw = adapt.load_new_events(EVENTS)

    rows = []
    for pid, g_raw in raw.groupby("participant_id"):
        prep = adapt.add_primitives(adapt.prepare(g_raw))
        st = S.build_states(prep, BIN, context_col="context_segment")
        g = S.build_transitions(st, context_col="context_segment")
        if len(g) < 60:
            continue
        A, _ = fit_operator(g, alpha=1.0)
        lam, _ = sorted_eig(A)

        # Unit impulse into P(left), the coordinate the cue drives.
        b = np.zeros(A.shape[0]); b[0] = 1.0
        g_direct = kernel_direct(A, b, HORIZON)
        g_spec = kernel_from_spectrum(A, b, HORIZON)
        agree = float(np.max(np.abs(g_direct - g_spec)))

        shares = mode_shares(A, HORIZON)
        n90 = int(np.searchsorted(np.cumsum(shares), 0.90) + 1)

        # Surrogate null. Permuting the rows of the transition table destroys
        # the temporal pairing while leaving every marginal distribution, the
        # ridge penalty, the sample size and the state dimension untouched. A
        # 4x4 operator fitted to noise still HAS four eigenvalues, so whatever
        # mode count this produces is the count the estimator manufactures for
        # free, and the real data must be read against it -- not against 1.
        null_n90, null_top = [], []
        for _ in range(N_NULL):
            gs = g.copy()
            gs[S.y_cols()] = gs[S.y_cols()].to_numpy()[rng.permutation(len(gs))]
            A0, _ = fit_operator(gs, alpha=1.0)
            s0 = mode_shares(A0, HORIZON)
            null_n90.append(int(np.searchsorted(np.cumsum(s0), 0.90) + 1))
            null_top.append(float(s0[0]))

        rows.append({
            "participant_id": pid,
            "n_transitions": len(g),
            "rho": float(np.abs(lam[0])),
            "complex": bool(abs(np.imag(lam[0])) > 1e-9),
            "kernel_agreement": agree,
            "top_mode_share": float(shares[0]),
            "modes_for_90pct": n90,
            "null_modes_for_90pct_median": float(np.median(null_n90)),
            "null_top_mode_share_median": float(np.median(null_top)),
            "exceeds_null": bool(n90 > np.median(null_n90)),
        })

    d = pd.DataFrame(rows)
    print(f"{len(d)} participants, {BIN}-response bins, "
          f"{d.n_transitions.median():.0f} transitions (median)\n")

    print("1. Is the kernel the same object as the spectrum?")
    print(f"   max |A^(k-1)b  -  sum_j c_j lam_j^(k-1)|  over all "
          f"participants and lags: {d.kernel_agreement.max():.2e}")
    print("   (machine precision: the two constructions are identical)\n")

    print("2. How many modes does each kernel actually need?")
    print("   Share of kernel energy carried by the single largest mode, and")
    print("   the number of modes needed to reach 90%. A scalar operator")
    print("   (Baum & Davison, 2009) has exactly one mode available.\n")
    q = d.top_mode_share.quantile([0, .25, .5, .75, 1]).round(3)
    print("   top mode's share of kernel energy")
    for k, v in q.items():
        print(f"     {int(k*100):>3d}th pct   {v:.3f}")
    print(f"\n   modes needed to reach 90% of kernel energy:")
    for n, c in d.modes_for_90pct.value_counts().sort_index().items():
        print(f"     {n} mode{'s' if n > 1 else ' '}   {c:>2d}/{len(d)} participants")
    print(f"\n   participants needing more than one mode: "
          f"{(d.modes_for_90pct > 1).sum()}/{len(d)}")

    print("\n3. Against the order-shuffled null (the count the estimator")
    print("   manufactures from a 4x4 fit with no dynamics left in the data):\n")
    print(f"   real   modes for 90%: median {d.modes_for_90pct.median():.1f}  "
          f"(range {d.modes_for_90pct.min()}-{d.modes_for_90pct.max()})")
    print(f"   null   modes for 90%: median "
          f"{d.null_modes_for_90pct_median.median():.1f}")
    print(f"   real   top-mode share: median {d.top_mode_share.median():.3f}")
    print(f"   null   top-mode share: median "
          f"{d.null_top_mode_share_median.median():.3f}")
    print(f"\n   participants whose mode count EXCEEDS their own null: "
          f"{d.exceeds_null.sum()}/{len(d)}")
    if d.exceeds_null.sum() <= len(d) / 2:
        print("\n   >>> The multi-mode structure is NOT established. The null")
        print("   >>> produces a comparable mode count, so the extra modes")
        print("   >>> cannot be attributed to the behavior.")

    out = Path("analysis/outputs/final/kernel_decomposition.csv")
    out.parent.mkdir(parents=True, exist_ok=True)
    d.to_csv(out, index=False)
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
