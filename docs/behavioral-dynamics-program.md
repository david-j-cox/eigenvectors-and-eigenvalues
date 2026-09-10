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
| 4 | B-rich | A-rich |

The colour-to-contingency assignment is randomised per participant, so half see
the table above and half see it transposed. The perturbation part uses a third
colour (red) held at one contingency throughout, so its pre-perturbation
baseline is never a reversed cell. Colours alternate strictly within and across
stages, so no context ever repeats on consecutive blocks. Run
`experiment/scripts/print_schedule.ts` for a participant's full sequence.

```
Practice (60 responses, neutral grey background)
Stage 1: 8 blocks x 100 responses, alternating green and blue
Stage 2: 8 blocks x 100 responses, mapping reversed
Stage 3: 8 blocks x 100 responses, mapping restored
Stage 4: 8 blocks x 100 responses, mapping reversed again
Perturbation part: 5 blocks x 200 responses, red, 8 perturbations
```

Total 4,260 responses, about 25 minutes of responding at the 2.8-2.9 responses
per second real participants produced. Each colour x contingency x stage cell
gets four exposures and 36 within-block transitions; each cell occurs in two
stages, so an operator is estimated from 72.

### Why three reversals rather than one

With a single reversal, green carries A-rich only before it and B-rich only
after. Every "same colour, different contingency" comparison is therefore also an
early-versus-late comparison, and the two explanations cannot be separated. The
build specification's Study 2 has this confound.

Restoring the original mapping in stage 3 breaks it: both competing comparisons
can then be drawn from adjacent stages, so neither is favoured by having its
estimates closer together in time.

- same colour, different contingency: green/A-rich (stage 1) against
  green/B-rich (stage 2)
- different colour, same contingency: green/A-rich (stage 1) against
  blue/A-rich (stage 2)

Three stages (ABA) is not enough, for two reasons. First, ABA contains one
A-to-B transition and one B-to-A transition, so neither is replicated within a
participant and a single unusual reversal cannot be distinguished from a real
one. Second, and easier to miss: under ABA the first mapping is in force for two
stages and the reversed mapping for one, so every reversed cell is estimated
from half the data of its counterpart. **The weakest cell is what the design can
claim**, and under ABA that was always a reversed one.

ABAB fixes both. The A-to-B transition occurs at stages 1-2 and again at 3-4,
and all four colour x contingency cells receive equal data. The binding
constraint improves from 45 transitions to 72 even though the per-stage figure
falls from 45 to 36.

Two same-mapping stage pairs are available for the replication test -- 1 against
3 and 2 against 4 -- so that test is itself replicated within each participant,
and both mappings contribute rather than only the unreversed one.

### How the contexts are signalled

Each context fills the whole viewport behind two visually identical response
panels, so the signal is unmissable and cannot be confused with a property of
either option. The exact hex values are logged with every response.

| Context | Colour | Texture |
|---|---|---|
| Green | `#2E7D5B` | plain |
| Blue | `#2E5C8A` | diagonal stripes |
| Red | `#96382F` | dots |
| Practice | `#4A4A4A` grey | plain |

Every signalled colour is paired with a distinct texture overlay. Colour alone
would put the discrimination out of reach of a colour-vision-deficient
participant and would make the three contexts indistinguishable in a greyscale
screenshot.

Practice is a neutral grey and is a first-class context id rather than a
display-only override, so a practice response logs
`physical_context_id: "neutral"`. An earlier version displayed grey while logging
green, which would have put a context in the data that no participant saw. A
test now asserts that the hex painted on screen is the constant written to
`context_color`.

The instructions say only that the background will change from time to time.
Telling participants that colour signals anything would convert a discrimination
the task is measuring into an instruction they were given.

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
measured from the previous study's humans. **They are measured per condition,
because switching is a function of the schedule in force** -- the same people
behaved quite differently across the four phases:

| Previous phase | Schedule | Switch rate | p(sw \| rft) | p(sw \| none) | Mean run | Reward/response |
|---|---|---|---|---|---|---|
| 1 Symmetric | 1:1, rich | 0.208 | 0.178 | 0.271 | 4.81 | 0.68 |
| 2 A advantage | 2.4:1 | 0.163 | 0.110 | 0.257 | 5.98 | 0.58 |
| 3 B advantage | 2.4:1 | 0.153 | 0.102 | 0.247 | 6.36 | 0.56 |
| 4 Scarcity | 1:1, lean | 0.230 | 0.134 | 0.294 | 4.11 | 0.14 |

Pooling across these would have produced a switch rate belonging to no condition
at all. **No previous condition matches the new task on both dimensions**, and
the two closest ones disagree:

- **`asymmetric`** (phases 2-3) matches the schedule asymmetry (2.4:1 against our
  4:1) but is far richer than our task, and predicts *less* switching (0.16).
- **`lean`** (phase 4) matches the reinforcement density (0.14 per response
  against our ~0.20) but is symmetric, and predicts *more* switching (0.23).

Our task is asymmetric *and* lean, a combination that did not occur. The two
pools therefore bracket the plausible range, and **every parameter sweep is run
under both**; a conclusion is only acted on if it survives the pair.

Each simulated participant draws one real person's conditional switch
probabilities and their log-normal inter-response-time distribution, rather than
an average, so the sample keeps the real heterogeneity.
`tests/engine/calibration.test.ts` checks that simulated sessions reproduce each
pool's statistics.

Two limits remain. Only the switching and the timing are borrowed; the tilt that
makes the agent prefer the richer alternative is not calibrated, and it
interacts with the 4:1 schedule in ways that stop the simulated switch rates
from reproducing the pools' ordering exactly. And the previous task's depleting
patches made switching near-compulsory, so these agents change over at least as
often as a real participant plausibly would -- a **conservative** error for
anything whose cost scales with changeovers.

### Two parameters this decided

- **The changeover delay is 500 ms *and* one response, not 2 s.** A purely
  time-based COD makes obtained reinforcement a hidden function of how fast a
  participant clicks, and a human run averages 4.96 responses at 0.349 s each --
  1.7 s. A 2 s delay therefore exceeds an entire average run. With calibrated
  responders:

  | COD | Reinforcers/bin (asym) | Ineligible (asym) | Reinforcers/bin (lean) | Ineligible (lean) |
  |---|---|---|---|---|
  | none | 3.18 | 0% | 2.96 | 0% |
  | 500 ms + 1 response | 2.14 | 32% | 2.15 | 25% |
  | 750 ms + 1 response | 1.89 | 41% | 2.02 | 36% |
  | 2000 ms + 1 response | 0.95 | 73% | 1.21 | 65% |

  The 2 s value the earlier design used would have left participants unable to
  earn anything for most of the task, under either calibration. What this cannot settle is the COD's
  effect on *behaviour*: the calibrated agent's switching comes from fixed
  probabilities and barely responds to it, so whether 500 ms is long enough to
  suppress adventitious reinforcement of changeovers is a pilot question.

- **Patch depletion is implemented but off.** The previous study's dominant
  eigenvector loaded on reward rate largely because depleting patches made reward
  rate genuinely dynamic, so carrying depletion over seemed likely to help. With
  calibrated responders it did not, at any strength:

  | Depletion per response | Reinforcers/bin (asym) | Reinforcers/bin (lean) |
  |---|---|---|
  | none | 2.10 | 2.21 |
  | 0.06 | 1.75 | 1.79 |
  | 0.25 | 1.34 | 1.31 |
  | 0.40 | 1.13 | 1.08 |

  The reason is behavioural: a responder that leaves an alternative when it stops
  paying stabilises its own obtained rate, so depletion removes reinforcement
  without producing the swings in reward rate it was meant to restore. In the
  previous study the patches emptied faster than choice could track, which is
  what produced those swings.

### The open question the pilot must settle

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
- **Grounded.** Whether a coordinate is *measurable* -- whether it has true
  between-bin variance above its sampling noise. This depends on the schedule
  and on allocation, both of which the simulation models, and it is what
  decided the schedule.
- **Not grounded.** Which coordinates carry an organism's context-specific
  *dynamics*. That is the empirical question this study exists to answer, and no
  simulation can answer it in advance.

The distinction between the last two is what let the schedule question be
settled while the state question stays open. "Does reward rate vary enough to
measure" is answerable in advance; "does reward rate carry this organism's
context-specific mode" is not.

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

Built and tested: task engine with both schedule modes, session plan,
perturbation engine, event schema, checkpointed logging with idempotent upserts,
Supabase transport and migrations, the browser task, the Phase 0 reanalysis, the
design simulations, and the pilot diagnostic loop. 107 automated tests.

Every pilot acceptance check now passes on simulated sessions.

Not yet done: a human pilot. Every number in this document about the new task
comes from simulated responders. Their switching and timing are calibrated to
real participants, which is what makes the changeover-delay and reinforcement
results usable; their *dynamics* are not and cannot be, which is why the state
vector stays open until real behaviour settles it.
