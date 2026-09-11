"""
Choosing the state bin per participant, from that participant's responding.

Ten responses per bin was a guess. It is the wrong kind of quantity to guess,
because the bin sits on a trade-off whose two sides are set by the individual:

  * wider bins average away sampling noise, and the noise in a rate coordinate
    is binomial, so it falls as 1/B;
  * wider bins yield fewer transitions, and the operator needs transitions.

Where the optimum sits depends on how much the participant's behaviour actually
moves between bins, which differs between people and between coordinates. A
participant who switches on 7% of responses and one who switches on 22% are not
measured equally well by the same bin.

The decomposition
-----------------
Between-bin variance of a coordinate observed at bin B is the true variation of
the behaviour plus the sampling variance of estimating it from B responses:

    Var_obs(B) = sigma2_true + V1 / B

V1 is the per-response sampling variance: p(1 - p) for a rate, the mean
within-bin variance for a continuous coordinate. sigma2_true follows by
subtraction. The noise ratio the acceptance checks report is then

    r(B) = (V1 / B) / Var_obs(B)

and requiring r(B) <= r* inverts to a closed form for the smallest usable bin:

    B >= (1 - r*) * V1 / (r* * sigma2_true)

Every term comes from the participant's own data. Nothing is assumed about the
schedule or about other participants.

When a coordinate carries no signal
-----------------------------------
If sigma2_true estimates to zero or below -- observed variance at or under the
binomial floor -- the formula diverges, and that is the correct answer rather
than a failure. It means the coordinate is sampling noise all the way down for
that participant and no bin width recovers it. One pilot participant's switch
rate behaved exactly this way (observed variance 0.90x the binomial
expectation), while another's carried real signal that emerged as bins widened
(1.71x rising to 3.04x). A single global bin cannot serve both; a rule that
reads each participant can.

Comparing operators fitted at different bins
--------------------------------------------
Eigenvectors are unaffected: they live in the coordinate space, which does not
change with B. Eigenvalues do change, because one step means B responses, so a
raw eigenvalue is a per-bin decay. `to_per_response` rescales it to a
per-response rate and `half_life_responses` to a half-life in responses, both of
which are comparable across participants measured at different bins.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd


@dataclass
class CoordinateFit:
    name: str
    v1: float                 # per-response sampling variance
    sigma2_true: float        # variance of the underlying behaviour
    min_bin: float            # smallest bin reaching the target noise ratio
    signal_ratio: float       # observed variance / sampling floor at the probe bin
    usable: bool              # False when there is no signal to recover


@dataclass
class BinChoice:
    participant: str
    bin_size: int
    coordinates: list[CoordinateFit] = field(default_factory=list)
    dropped: list[str] = field(default_factory=list)
    transitions_weakest_cell: int | None = None
    limited_by: str | None = None

    @property
    def usable_names(self) -> list[str]:
        return [c.name for c in self.coordinates if c.usable]


def _decompose(values: np.ndarray, probe_bin: int, binomial: bool) -> tuple[float, float, float]:
    """Split observed between-bin variance into sampling and signal parts."""
    n = len(values) // probe_bin * probe_bin
    if n < probe_bin * 4:
        return np.nan, np.nan, np.nan
    blocks = values[:n].reshape(-1, probe_bin)
    means = blocks.mean(axis=1)

    if binomial:
        p = float(values[:n].mean())
        v1 = p * (1.0 - p)
    else:
        v1 = float(blocks.var(axis=1, ddof=1).mean())

    var_obs = float(means.var(ddof=1))
    floor = v1 / probe_bin
    sigma2 = var_obs - floor
    ratio = var_obs / floor if floor > 0 else np.inf
    return v1, sigma2, ratio


def choose_bin(
    df: pd.DataFrame,
    coordinates: dict[str, bool],
    target_noise: float = 0.5,
    probe_bin: int = 10,
    min_transitions: int | None = 40,
    cell_responses: int | None = None,
    max_bin: int = 60,
    participant: str = "",
) -> BinChoice:
    """
    Smallest bin at which every requested coordinate reaches `target_noise`.

    `coordinates` maps column name -> is_binomial. A coordinate with no
    recoverable signal is dropped rather than allowed to dictate the bin, and
    named in `dropped`; the caller decides whether a state without it is worth
    fitting.

    If `cell_responses` is given (responses in the weakest design cell), the bin
    is capped so that cell still yields `min_transitions` transitions. When that
    cap binds, `limited_by` says so: the design, not the measurement, is then
    the constraint.
    """
    fits: list[CoordinateFit] = []
    for col, binomial in coordinates.items():
        v1, sigma2, ratio = _decompose(df[col].to_numpy(dtype=float), probe_bin, binomial)
        if not np.isfinite(v1):
            continue
        if sigma2 <= 0:
            fits.append(CoordinateFit(col, v1, max(sigma2, 0.0), np.inf, ratio, usable=False))
            continue
        need = (1.0 - target_noise) * v1 / (target_noise * sigma2)
        fits.append(CoordinateFit(col, v1, sigma2, need, ratio, usable=need <= max_bin))

    usable = [f for f in fits if f.usable]
    dropped = [f.name for f in fits if not f.usable]
    chosen = int(np.ceil(max([f.min_bin for f in usable], default=1.0)))
    chosen = max(chosen, 1)
    limited_by = "measurement"

    transitions = None
    if cell_responses and min_transitions:
        cap = max(1, cell_responses // min_transitions)
        if chosen > cap:
            chosen, limited_by = cap, "design"
        transitions = cell_responses // chosen

    return BinChoice(participant or "", chosen, fits, dropped, transitions, limited_by)


# ---------------------------------------------------------------- comparability --

def to_per_response(eigenvalue: complex | float, bin_size: int) -> complex | float:
    """Rescale a per-bin eigenvalue to per-response, so operators fitted at
    different bins can be compared."""
    lam = complex(eigenvalue)
    if abs(lam) == 0:
        return 0.0
    return lam ** (1.0 / bin_size)


def half_life_responses(eigenvalue: complex | float, bin_size: int) -> float:
    """Half-life of a mode in responses -- the bin-independent way to report it."""
    mag = abs(complex(eigenvalue))
    if not 0 < mag < 1:
        return np.inf
    return bin_size * np.log(0.5) / np.log(mag)
