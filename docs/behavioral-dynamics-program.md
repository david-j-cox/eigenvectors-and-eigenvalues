# Behavioral dynamics: individual-level eigenanalysis

## What this program tests

For an individual organism, does a transition operator estimated from earlier
behaviour in an environment reproduce a stable eigensystem, predict that same
individual's later behaviour in that environment, and prospectively predict
recovery from a controlled perturbation?

The unit of analysis is the individual. Group summaries are produced only after
individual profiles exist, and a group result that no individual shows is
reported as heterogeneity rather than as a finding.

## Relationship to the previous study

This extends `measuring-behavior-trajectories`, a six-minute depleting-patch
foraging task run with 60 participants. That study established group-level
dynamics: a pooled operator with spectral radius 0.81, phase-specific operators
differing in persistence, and eigenvectors loading on reward rate and response
pacing.

Its individual-level notebook was written but never executed. Running it
(`reanalysis/`) is the starting point of this program, because it answers
whether individual operators are estimable at all before any new data are
collected.

## Phase 0: what the previous data already show

From `reanalysis/outputs/summary.md`, across 60 participants with a median of
92 within-context transitions each:

- Individual operators predict the same individual's later behaviour. Held-out
  skill against persistence is 0.29 for a pooled `A_i`, and 92% of participants
  beat persistence. Context-specific and input-driven architectures beat the
  pooled operator for 92% of participants.
- Individual spectral radii are heterogeneous: median 0.66, interquartile range
  0.55 to 0.77, with an oscillatory dominant pair in 37% of participants.
- The dominant eigenvector loads on reward rate for 73% of participants.
- Dominant eigenvectors are bootstrap-stable: median resampled agreement 0.96,
  with 78% of participants above 0.90.

Two corrections matter and both are implemented:

- **Short-sample bias.** Least-squares estimation of an autoregressive operator
  understates persistence at these sample sizes. Correcting it by parametric
  bootstrap moves the median spectral radius from 0.66 to 0.70.
- **Measurement attenuation.** State coordinates are proportions over a handful
  of responses, so they carry sampling noise, and a noisy predictor shrinks the
  fitted coefficient. Correcting for it moves the median spectral radius from
  0.66 to 0.90 — but only 57% of participants can be corrected at all, and the
  correction is numerically unstable when noise approaches the signal. This is
  the single largest source of uncertainty in any published spectral radius from
  this paradigm, and it is why the state vector was chosen by simulation rather
  than by convention.

The finding that shapes the new design is negative. Splitting each context into
early and late halves and comparing the two operators gives a dominant
eigenvector agreement of 0.51 — which is what two estimates of the *same*
operator produce by chance at that sample size (11 transitions per half). The
existing data cannot distinguish a reproducible context-specific mode from
estimation noise. That is a sample-size limitation, and it is the specific
problem the new design exists to solve.

## Phase 0b: sizing the new design

`reanalysis/run_design_sim.py` simulates the replication test using each
participant's own operator, residual covariance, and measurement noise, and asks
how many transitions are needed before the test can distinguish a same-operator
pair from a genuinely different-operator pair.

| Transitions per estimate | Same-operator agreement | Discrimination AUC |
|---|---|---|
| 10 | 0.50 | 0.56 |
| 20 | 0.57 | 0.63 |
| 40 | 0.74 | 0.74 |
| 60 | 0.80 | 0.79 |
| 80 | 0.84 | 0.86 |
| 120 | 0.89 | 0.90 |

Three consequences:

1. **Five-response bins are worse than ten**, despite yielding twice as many
   transitions: the added measurement noise more than cancels the gain (AUC 0.68
   against 0.86 at 80 transitions). Ten-response bins are the default.
2. **AUC is the per-participant probability of ordering a comparison correctly**,
   so a sign test across participants inherits it directly. At 36 transitions per
   cell (AUC ~0.73) a group directional claim across 45 participants has about
   90% power, while a confident per-individual claim does not.
3. **Recovery forecasting is cheap.** Twenty pre-perturbation transitions already
   give positive forecast skill for 98% of simulated cases. Perturbations do not
   need a large dedicated budget.

## Design of the new task

### One session, not three studies

The build specification proposes three separate 10-15 minute studies. Run on
separate samples, no participant would ever contribute both a context-replication
estimate and a perturbation-recovery test, which is precisely the conjunction the
program's central claim requires. The three manipulations are therefore folded
into one continuous procedure in which every block serves more than one analysis.

### Structure

```
Practice (60 responses, neutral background)
Stage 1: green -> A-rich, blue -> B-rich    (8 blocks x 100 responses)
Stage 2: green -> B-rich, blue -> A-rich    (8 blocks x 100 responses)
Stage 3: green -> A-rich, blue -> B-rich    (8 blocks x 100 responses)
Perturbation part: red, one contingency     (5 blocks x 200 responses, 8 perturbations)
```

Total 3,460 responses, about 26 minutes of responding at the rate the previous
study observed.

### Why two reversals rather than one

With a single reversal, green carries A-rich only before it and B-rich only
after. Every "same colour, different contingency" comparison is therefore also an
early-versus-late comparison, and the two explanations cannot be separated. The
build specification's Study 2 has this confound.

Returning to the original mapping in stage 3 fixes it. Both competing
comparisons can be drawn from adjacent stages, so neither is favoured by having
its estimates closer together in time:

- same colour, different contingency: green/A-rich (stage 1) against
  green/B-rich (stage 2)
- different colour, same contingency: green/A-rich (stage 1) against
  blue/A-rich (stage 2)

and each can be computed twice, from the 1-2 and 2-3 stage pairs. Stages 1 and 3
also share a mapping, which gives the longest-range replication test available:
the same individual, the same colour, the same contingency, separated by the
whole of stage 2.

### Schedules

Concurrent variable-interval with a changeover delay. VI rather than
response-probability reinforcement because a reinforcer set up on the neglected
alternative keeps accruing, which makes exclusive preference costly and sustains
the switching the state vector needs.

| Contingency | Option A | Option B | Combined rate |
|---|---|---|---|
| A-rich | VI 1 s | VI 4 s | 1.25/s |
| B-rich | VI 4 s | VI 1 s | 1.25/s |
| Symmetric | VI 1.6 s | VI 1.6 s | 1.25/s |

Total programmed reinforcement rate is held constant across contingencies.
Without that constraint a "symmetric" context is also a leaner one, and any
difference in its dynamics could be a response to reduced richness rather than to
changed distribution. The build specification's 0.80/0.20 against 0.50/0.50
contingencies do not hold it.

### Two parameters that simulated sessions changed

Both were found by running whole sessions through the real event schema and the
real analysis (`experiment/scripts/pilot_check.ts` into
`analysis/run_pilot_diagnostics.py`), not by argument.

- **The changeover delay is 750 ms *and* one response, not 2 s.** A purely
  time-based COD makes obtained reinforcement a hidden function of how fast a
  participant happens to click. At two responses per second a 2 s delay left 40%
  of responses ineligible for a responder switching every seven responses, which
  halved obtained reinforcement.
- **Patch depletion is implemented but off.** The previous study's dominant
  eigenvector loaded on reward rate largely because depleting patches made reward
  rate genuinely dynamic, so carrying depletion over seemed likely to help. It
  did not: at every strength tested it lowered obtained reinforcement *and*
  raised the reward-rate noise ratio, because a melioration-like responder simply
  leaves a depleting alternative and thereby stabilises its own obtained rate.

### The open calibration question

Reward rate at ten-response bins carries roughly 60% sampling noise under a
stationary interval schedule, and no schedule parameter within this family fixes
it: Bernoulli noise is maximised near p = 0.5, so enriching the schedule does not
help, and the attenuation correction is numerically unstable at this noise level.

The state vector is therefore chosen by discrimination rather than by
per-coordinate noise, using `analysis/run_state_selection.py`. On the previous
study's data that criterion picks `[P(A), reward rate, switch rate]`; on
simulated sessions of the new task it picks `[P(A), reward rate]`, largely
because a smaller operator needs fewer transitions.

Those answers disagree, and the simulated one is contingent on a responder whose
choices depend only on the variables the winning state contains. **The state must
be re-selected on real pilot data before it is fixed.** This is the single most
important thing the pilot decides.

## Analysis

`dynalysis/` holds one implementation shared by the reanalysis, the pilot
diagnostics, and the eventual analysis of real data, so the sample sizes the
design simulation produced are binding on the analysis that actually runs.

| Module | Role |
|---|---|
| `states.py` | Event stream to binned state vectors and transitions |
| `operators.py` | Ridge-regularized `A_i`, `A_i + B_i u`, `A_{i,c}`; temporal holdout; multi-step forecasts |
| `eigen.py` | Spectra, eigenvector similarity, principal angles, block bootstrap, bias and attenuation corrections |
| `profiles.py` | Per-participant dynamical profiles and replication tests |
| `design_simulation.py` | Replication noise floor, discrimination AUC, recovery forecasting |
| `adapt.py` | Schema adapters and analysis-cell definitions |

## Decision rules

A claim that a context-specific mode reproduced requires all of:

1. the early operator predicts later observations in the same cell, beating
   persistence;
2. the dominant eigenvector is bootstrap-stable;
3. early and late estimates agree **by more than the simulated same-operator
   floor at that sample size** — this is the criterion the previous data fail,
   and reporting agreement without the floor is what makes such a result look
   stronger than it is.

Whether dynamics follow physical context or functional contingency is decided by
whether same-contingency similarity exceeds same-colour similarity, computed
within participant and matched on elapsed time by the two-reversal design.

## Status

Built and tested: task engine, session plan, perturbation engine, event schema,
checkpointed logging with idempotent upserts, Supabase transport and migrations,
the browser task, the Phase 0 reanalysis, the design simulations, and the pilot
diagnostic loop. 81 automated tests.

Not yet done: a human pilot. Every number in this document about the new task
comes from simulated responders, and the design has one open question — the state
vector — that only real behaviour can settle.
