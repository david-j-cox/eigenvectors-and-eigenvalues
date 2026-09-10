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

| Stage | Green | Blue |
|---|---|---|
| 1 | A-rich | B-rich |
| 2 | B-rich | A-rich |
| 3 | A-rich | B-rich |

The colour-to-contingency assignment is randomised per participant, so half see
the table above and half see it transposed. The perturbation part uses a third
colour (red) held at one contingency throughout, so its pre-perturbation
baseline is never a reversed cell. Colours alternate strictly within and across
stages, so no context ever repeats on consecutive blocks. Run
`experiment/scripts/print_schedule.ts` for a participant's full sequence.

```
Practice (60 responses, neutral background)
Stage 1: 10 blocks x 100 responses, alternating green and blue
Stage 2: 10 blocks x 100 responses, mapping reversed
Stage 3: 10 blocks x 100 responses, mapping restored
Perturbation part: 5 blocks x 200 responses, red, 8 perturbations
```

Total 4,060 responses, about 24 minutes of responding at the 2.84 responses per
second real participants produced in the previous study. Each colour x
contingency x stage cell gets five exposures, 500 responses, and 45 within-block
transitions.

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

### How the simulated responders are made credible

Two design parameters were decided by running whole sessions through the real
event schema and the real analysis. Whether those decisions mean anything
depends entirely on whether the simulated responder switches and responds like a
participant, so it is not hand-tuned.

`experiment/src/engine/human_calibration.json` holds per-participant parameters
measured from the previous study's 60 humans:

| Statistic | Human median [IQR] |
|---|---|
| switch rate | 0.201 [0.115, 0.305] |
| p(switch \| reinforced) | 0.144 |
| p(switch \| not reinforced) | 0.289 |
| mean run length | 4.96 responses |
| response rate | 2.86/s (median ICI 0.349 s) |

Each simulated participant draws one real person's conditional switch
probabilities and their log-normal inter-response-time distribution, rather than
an average, so the sample keeps the real heterogeneity.
`tests/engine/calibration.test.ts` checks that simulated sessions reproduce
those statistics.

Two limits, both material. First, only the switching and the timing are
borrowed; the tilt that makes the agent prefer the richer alternative is not
calibrated. Second, those participants worked a *depleting-patch* schedule where
a patch empties in about eight responses and switching is near-compulsory. A
stationary concurrent VI should produce longer runs, so this agent changes over
at least as often as a real participant plausibly would. That makes it a
**conservative** test of anything whose cost scales with changeovers, which is
the right direction of error for the changeover delay.

### Two parameters this decided

- **The changeover delay is 500 ms *and* one response, not 2 s.** A purely
  time-based COD makes obtained reinforcement a hidden function of how fast a
  participant clicks, and a human run averages 4.96 responses at 0.349 s each --
  1.7 s. A 2 s delay therefore exceeds an entire average run. With calibrated
  responders:

  | COD | Reinforcers per 10-response bin | Responses ineligible |
  |---|---|---|
  | none | 3.24 | 0% |
  | 500 ms + 1 response | 2.21 | 28% |
  | 750 ms + 1 response | 2.04 | 45% |
  | 2000 ms + 1 response | 1.26 | 72% |

  The 2 s value the earlier design used would have left participants unable to
  earn anything for most of the task. What this cannot settle is the COD's
  effect on *behaviour*: the calibrated agent's switching comes from fixed
  probabilities and barely responds to it, so whether 500 ms is long enough to
  suppress adventitious reinforcement of changeovers is a pilot question.

- **Patch depletion is implemented but off.** The previous study's dominant
  eigenvector loaded on reward rate largely because depleting patches made reward
  rate genuinely dynamic, so carrying depletion over seemed likely to help. With
  calibrated responders it did not, at any strength:

  | Depletion per response | Reinforcers per 10-response bin |
  |---|---|
  | none | 1.96 |
  | 0.06 | 1.58 |
  | 0.25 | 1.17 |
  | 0.40 | 1.00 |

  The reason is behavioural: a responder that leaves an alternative when it stops
  paying stabilises its own obtained rate, so depletion removes reinforcement
  without producing the swings in reward rate it was meant to restore. In the
  previous study the patches emptied faster than choice could track, which is
  what produced those swings.

### The open question the pilot must settle

Reward rate at ten-response bins carries 60-76% sampling noise under a stationary
interval schedule, and no schedule parameter within this family fixes it:
Bernoulli noise is maximised near p = 0.5, so enriching does not help, and the
attenuation correction is numerically unstable at this noise level. With
human-calibrated switching the ratio is worse than with an idealised responder,
because more changeovers mean less obtained reinforcement.

The state vector is `[P(A), reward rate, switch rate]`, chosen by discrimination
on the **previous study's real data**: dropping mean log ICI helps, because it
loads similarly on the dominant mode in every context and dilutes the differences
under test, while dropping switch rate hurts most despite it being the noisiest
coordinate.

An earlier version of this document recommended `[P(A), reward rate]` on the
strength of simulated sessions. That was wrong, and the reason is worth stating,
because it bounds what any of this simulation is good for. **A simulated
responder's context-specific dynamics are whatever its author gave it.** The
human-calibrated agent has almost none -- its changeover probabilities are fixed
constants, so its transition operator barely differs between contexts -- and
every candidate state scores near chance against it (AUC 0.55-0.60 at the design
sample size). The hand-tuned melioration agent scored 0.86, but only because its
own adaptation rule was context-dependent by construction. Neither number is
about the state vector.

The distinction that matters:

- **Grounded.** The replication floor and the required sample size
  (`reanalysis/run_design_sim.py`) simulate from operators *fitted to real
  participants*, so they describe the estimator and are usable.
- **Grounded.** The changeover-delay and reinforcement-density results depend on
  switching frequency and response timing, both taken from human data.
- **Not grounded.** Which coordinates carry an organism's context-specific
  dynamics. That is the empirical question this study exists to answer, and no
  simulation can answer it in advance.

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
comes from simulated responders. Their switching and timing are calibrated to
real participants, which is what makes the changeover-delay and reinforcement
results usable; their *dynamics* are not and cannot be, which is why the state
vector stays open until real behaviour settles it.
