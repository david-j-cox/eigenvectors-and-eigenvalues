"""
Does log d report control by a cue that a subject is provably insensitive to?

The agent below never looks at the cue. Its choice is a two-state Markov chain
and nothing else. Any control either measure attributes to the cue is an
artifact. The question is not whether each measure is unbiased -- both are, by
symmetry -- but whether each one's OWN stated uncertainty covers its actual
sampling variability. A measure whose nominal standard error is too small
declares control that is not there, one subject at a time, which is how these
studies are read.
"""
import numpy as np

RNG = np.random.default_rng(20260912)
N_RESP   = 2000     # responses per simulated subject, study 2's budget
P_STAY   = 0.90     # choice autocorrelation; study 1 subjects ran .82-.95
BLOCK    = 40       # mean responses per cue block, jittered
BIN      = 10       # responses per state bin for the dynamical fit
N_SUBJ   = 2000


def cue_series(n, mean_block):
    """Binary cue switching on its own schedule, independent of behavior."""
    u, cur = [], RNG.integers(0, 2)
    while len(u) < n:
        run = max(1, int(RNG.exponential(mean_block)))
        u.extend([cur] * run)
        cur = 1 - cur
    return np.array(u[:n])


def cue_blind_agent(n, p_stay):
    """Choice is a Markov chain. The cue is not an input."""
    c = np.empty(n, dtype=int)
    c[0] = RNG.integers(0, 2)
    stay = RNG.random(n) < p_stay
    for t in range(1, n):
        c[t] = c[t - 1] if stay[t] else 1 - c[t - 1]
    return c


def log_d(choice, cue):
    """Davison & Tustin (1978), Eq 2 of Davison & Elliffe (2010).
    0.5 * log( B11*B22 / (B12*B21) ), with the conventional 0.5 correction
    for empty cells."""
    B = np.zeros((2, 2))
    for s in (0, 1):
        for b in (0, 1):
            B[s, b] = np.sum((cue == s) & (choice == b))
    B += 0.5
    return 0.5 * np.log((B[0, 0] * B[1, 1]) / (B[0, 1] * B[1, 0]))


def log_d_nominal_se(choice, cue):
    """The SE a reader would compute from the cell counts, treating responses
    as independent Bernoulli draws -- the standard delta-method SE of a
    log odds ratio, halved to match the 0.5 multiplier."""
    B = np.zeros((2, 2))
    for s in (0, 1):
        for b in (0, 1):
            B[s, b] = np.sum((cue == s) & (choice == b))
    B += 0.5
    return 0.5 * np.sqrt(np.sum(1.0 / B))


def dmdc(choice, cue, bin_size):
    """x(t+1) = A x(t) + B u(t) + c, least squares, per subject.
    State: [P(left), switch rate] over each bin. Input: bin-mean cue, centered.
    Returns the cue coefficient for P(left) and its OLS standard error."""
    n_bins = len(choice) // bin_size
    ch = choice[:n_bins * bin_size].reshape(n_bins, bin_size)
    cu = cue[:n_bins * bin_size].reshape(n_bins, bin_size)
    p_left = ch.mean(axis=1)
    switch = np.mean(np.diff(ch, axis=1) != 0, axis=1)
    u = cu.mean(axis=1) * 2 - 1
    X = np.column_stack([p_left[:-1], switch[:-1], u[:-1], np.ones(n_bins - 1)])
    y = p_left[1:]
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ beta
    dof = len(y) - X.shape[1]
    s2 = resid @ resid / dof
    cov = s2 * np.linalg.inv(X.T @ X)
    return beta[2], np.sqrt(cov[2, 2])       # B coefficient, its OLS SE


ld, ld_se, bb, bb_se = [], [], [], []
for _ in range(N_SUBJ):
    u = cue_series(N_RESP, BLOCK)
    c = cue_blind_agent(N_RESP, P_STAY)
    ld.append(log_d(c, u));          ld_se.append(log_d_nominal_se(c, u))
    b, se = dmdc(c, u, BIN);         bb.append(b); bb_se.append(se)

ld, ld_se, bb, bb_se = map(np.asarray, (ld, ld_se, bb, bb_se))

def report(name, est, nominal_se):
    actual = est.std(ddof=1)
    nominal = nominal_se.mean()
    # fraction of subjects who would be called "significant" at .05
    hit = np.mean(np.abs(est / nominal_se) > 1.96)
    print(f"{name}")
    print(f"  mean estimate            {est.mean():+.4f}   (truth: 0)")
    print(f"  actual SD across subjects {actual:.4f}")
    print(f"  mean SE the method reports {nominal:.4f}")
    print(f"  understatement factor     {actual / nominal:.2f}x")
    print(f"  subjects declared to show cue control at p<.05:  "
          f"{hit * 100:5.1f}%   (should be 5.0%)\n")

print(f"cue-blind agent, P(stay)={P_STAY}, {N_RESP} responses, "
      f"{N_SUBJ} simulated subjects\n")
report("log d  (Davison & Tustin 1978)", ld, ld_se)
report("B      (cue column of the DMDc fit)", bb, bb_se)
