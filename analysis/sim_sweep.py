"""Two things the first simulation leaves open:
   (a) does the log d false-positive rate track autocorrelation, or is it an
       artifact of the one value we picked?
   (b) can B still DETECT real cue control? A measure that never fires is
       not a solution to a measure that always fires."""
import numpy as np
exec(open(__file__.replace('sim_sweep', 'sim_logd_vs_B')).read().split('ld, ld_se, bb, bb_se = [], [], [], []')[0])

def sensitive_agent(n, p_stay, cue, w):
    """Markov chain as before, but the cue biases the switch probability.
    w = 0 reproduces the cue-blind agent."""
    c = np.empty(n, dtype=int); c[0] = RNG.integers(0, 2)
    for t in range(1, n):
        target = cue[t]                       # cue says which side is rich
        p = p_stay + w if c[t-1] == target else p_stay - w
        c[t] = c[t-1] if RNG.random() < np.clip(p, 0.01, 0.99) else 1 - c[t-1]
    return c

def run(p_stay, w, n_subj=800):
    ldh = bbh = 0
    for _ in range(n_subj):
        u = cue_series(N_RESP, BLOCK)
        c = sensitive_agent(N_RESP, p_stay, u, w)
        ldh += abs(log_d(c, u) / log_d_nominal_se(c, u)) > 1.96
        b, se = dmdc(c, u, BIN)
        bbh += abs(b / se) > 1.96
    return 100*ldh/n_subj, 100*bbh/n_subj

print("(a) NO real cue control (w = 0). Every detection is a false positive.\n")
print(f"  {'P(stay)':>8} {'log d':>10} {'B':>10}")
for ps in (0.55, 0.65, 0.75, 0.85, 0.90, 0.95):
    a, b = run(ps, 0.0)
    print(f"  {ps:>8.2f} {a:>9.1f}% {b:>9.1f}%")

print("\n(b) REAL cue control, P(stay) = 0.90. Detections are true positives.\n")
print(f"  {'cue weight w':>12} {'log d':>10} {'B':>10}")
for w in (0.00, 0.02, 0.05, 0.10, 0.20):
    a, b = run(0.90, w)
    print(f"  {w:>12.2f} {a:>9.1f}% {b:>9.1f}%")
