"""
Can the proposed study 2 detect what it claims, at the budget available?

One shot, ~$55. Three measured facts from study 1 constrain the design:

  1. The full-vs-scalar test saturates at ~1,400 responses per participant
     (23/23); 1,000 gives 22/23 and 600 gives 21/23.  [run_power_curve.py]
  2. A cue coefficient does not stabilize until ~150 responses of exposure to
     BOTH of its values. At 100 responses its sign is right only 38% of the
     time -- worse than a coin. Every condition change restarts that clock.
  3. Median response rate is 223/min, but the range is 62-315. A fixed-time
     session gives the slowest participant a quarter of the data.

This simulates the design under those constraints: two cues varying
independently, and a within-subject REVERSAL of which cue dominates. The
ground truth is arranged, so recovery can be scored. log d is computed on the
same responses as the comparison measure.

    python3 analysis/sim_study2_power.py
"""
from __future__ import annotations

import numpy as np

RNG = np.random.default_rng(11)
P_STAY = 0.88          # study 1 subjects ran .82-.95
ACQUIRE = 150          # responses before a cue coefficient is trusted


def run_subject(n_per_cond, w_strong, w_weak, block=30):
    """Two conditions. Cue X dominates in the first, cue Y in the second."""
    out = []
    for cond, (wx, wy) in enumerate([(w_strong, w_weak), (w_weak, w_strong)]):
        ux = cue(n_per_cond, block)
        uy = cue(n_per_cond, block * 1.7)      # independent schedules
        c = np.empty(n_per_cond, dtype=int)
        c[0] = RNG.integers(0, 2)
        for t in range(1, n_per_cond):
            drive = wx * (2 * ux[t] - 1) + wy * (2 * uy[t] - 1)
            p_left = np.clip(P_STAY if c[t - 1] == 1 else 1 - P_STAY, .01, .99)
            p_left = np.clip(p_left + drive, .01, .99)
            c[t] = 1 if RNG.random() < p_left else 0
        out.append((cond, c, ux, uy))
    return out


def cue(n, mean_block):
    u, cur = [], RNG.integers(0, 2)
    while len(u) < n:
        u.extend([cur] * max(1, int(RNG.exponential(mean_block))))
        cur = 1 - cur
    return np.array(u[:n])


def fit_B(c, ux, uy, skip=ACQUIRE):
    """Cue coefficients, conditioning on the previous response."""
    lag, y = c[skip:-1], c[skip + 1:]
    X = np.column_stack([lag, 2 * ux[skip + 1:] - 1, 2 * uy[skip + 1:] - 1,
                         np.ones(len(y))])
    b = np.linalg.lstsq(X, y.astype(float), rcond=None)[0]
    return b[1], b[2]


def log_d(c, u, skip=ACQUIRE):
    B = np.zeros((2, 2))
    for s in (0, 1):
        for b in (0, 1):
            B[s, b] = np.sum((u[skip:] == s) & (c[skip:] == b))
    B += 0.5
    return 0.5 * np.log(B[0, 0] * B[1, 1] / (B[0, 1] * B[1, 0]))


def trial(n_per_cond, w_strong, w_weak, n_subj=400):
    op_ok = ld_ok = 0
    for _ in range(n_subj):
        conds = run_subject(n_per_cond, w_strong, w_weak)
        bx = [fit_B(c, ux, uy)[0] for _, c, ux, uy in conds]
        by = [fit_B(c, ux, uy)[1] for _, c, ux, uy in conds]
        dx = [log_d(c, ux) for _, c, ux, uy in conds]
        dy = [log_d(c, uy) for _, c, ux, uy in conds]
        # the arranged crossover: X > Y in condition 0, Y > X in condition 1
        op_ok += (bx[0] > by[0]) and (by[1] > bx[1])
        ld_ok += (dx[0] > dy[0]) and (dy[1] > dx[1])
    return 100 * op_ok / n_subj, 100 * ld_ok / n_subj


print(f"Crossover recovered per simulated subject (chance = 25%),")
print(f"first {ACQUIRE} responses of each condition discarded as acquisition.\n")
print(f"  {'resp/cond':>10}{'total':>8}{'~min':>7}"
      f"{'operator B':>13}{'log d':>9}")
print("  " + "-" * 47)
for n in (300, 450, 600, 800, 1000):
    op, ld = trial(n, 0.10, 0.02)
    print(f"  {n:>10}{2*n:>8}{2*n/223:>7.1f}{op:>12.0f}%{ld:>8.0f}%")

print("\n  Effect size sensitivity at 600 responses per condition:")
print(f"  {'strong':>8}{'weak':>7}{'operator B':>13}{'log d':>9}")
for ws, ww in ((0.15, 0.03), (0.10, 0.02), (0.06, 0.012), (0.04, 0.008)):
    op, ld = trial(600, ws, ww)
    print(f"  {ws:>8.3f}{ww:>7.3f}{op:>12.0f}%{ld:>8.0f}%")


# ----------------------------------------------------------------------
# The crossover does not discriminate. Where do the measures come apart?
# ----------------------------------------------------------------------

def trial_decoy(n, w_real, block_real=30, block_decoy=30, n_subj=400):
    """A third cue that predicts NOTHING, varying on its own schedule.
    Any control attributed to it is an artifact. Both measures are scored
    on their own stated uncertainty, as a participant-level decision."""
    op_fp = ld_fp = scored = 0
    while scored < n_subj:
        ur = cue(n, block_real)
        ud = cue(n, block_decoy)          # decoy: never enters the agent
        # a decoy that never switches inside the analyzed window carries no
        # information for EITHER measure and is not a fair test of either
        if np.std(ud[ACQUIRE:]) < 1e-9 or np.std(ur[ACQUIRE:]) < 1e-9:
            continue
        scored += 1
        c = np.empty(n, dtype=int); c[0] = RNG.integers(0, 2)
        for t in range(1, n):
            p = np.clip(P_STAY if c[t-1] == 1 else 1 - P_STAY, .01, .99)
            p = np.clip(p + w_real * (2*ur[t]-1), .01, .99)
            c[t] = 1 if RNG.random() < p else 0
        s = ACQUIRE
        lag, y = c[s:-1], c[s+1:].astype(float)
        X = np.column_stack([lag, 2*ur[s+1:]-1, 2*ud[s+1:]-1, np.ones(len(y))])
        b, *_ = np.linalg.lstsq(X, y, rcond=None)
        resid = y - X @ b
        dof = len(y) - X.shape[1]
        cov = (resid @ resid / dof) * np.linalg.inv(X.T @ X)
        op_fp += abs(b[2] / np.sqrt(cov[2, 2])) > 1.96
        # log d on the decoy, with the SE a reader would compute from counts
        B = np.zeros((2, 2))
        for sv in (0, 1):
            for bv in (0, 1):
                B[sv, bv] = np.sum((ud[s:] == sv) & (c[s:] == bv))
        B += 0.5
        ld = 0.5*np.log(B[0,0]*B[1,1]/(B[0,1]*B[1,0]))
        se = 0.5*np.sqrt(np.sum(1.0/B))
        ld_fp += abs(ld/se) > 1.96
    return 100*op_fp/scored, 100*ld_fp/scored


print("\n\nTHE DECOY CUE: present, salient, varying, predicts nothing.")
print("Every detection below is a FALSE POSITIVE. Correct answer: 5%.\n")
print(f"  {'resp/cond':>10}{'decoy block':>13}{'operator B':>13}{'log d':>9}")
print("  " + "-" * 45)
for n in (450, 600, 800):
    for bd in (15, 30, 60):
        op, ld = trial_decoy(n, 0.10, block_decoy=bd)
        print(f"  {n:>10}{bd:>13}{op:>12.0f}%{ld:>8.0f}%")
