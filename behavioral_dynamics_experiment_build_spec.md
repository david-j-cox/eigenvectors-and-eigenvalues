# Build Specification: Individual-Level Behavioral Dynamics Experiments

## Purpose

Extend the existing browser-based non-stationary two-choice foraging experiment into a small experimental program designed specifically to test whether individual organisms exhibit reproducible dynamical modes of behavior, whether those modes are organized by physical context or functional reinforcement contingencies, and whether eigenvalues/eigenvectors estimated from prior behavior prospectively predict later behavior and recovery from perturbation.

This specification assumes the new experiments will live in the **same repository** as the existing study and should reuse as much of the current architecture as practical:
- browser-based HTML/CSS/JavaScript task
- participant/session IDs
- event-level logging
- phase/context metadata
- raw event export
- analysis scripts/notebooks kept separate from task code
- existing deployment conventions

The primary scientific unit is the **individual participant**. Group summaries are secondary.

---

# Core Scientific Framework

For participant \(i\), define a coarse-grained behavioral state:

\[
x_{i,t}=
\begin{bmatrix}
P(A)_{i,t}\\
P(\mathrm{reward})_{i,t}\\
P(\mathrm{switch})_{i,t}\\
\overline{\log(1+\mathrm{ICI})}_{i,t}
\end{bmatrix}
\]

and model state evolution as one of:

\[
x_{i,t+1}=A_i x_{i,t}
\]

\[
x_{i,t+1}=A_i x_{i,t}+B_i u_t+c_i
\]

\[
x_{i,t+1}=A_{i,c}x_{i,t}
\]

or, later:

\[
x_{i,t+1}=A_{i,z_t}x_{i,t}+B_{i,z_t}u_t+\epsilon_{i,t}
\]

where:
- \(A_i\): participant-specific transition operator
- \(A_{i,c}\): participant-specific operator for context \(c\)
- \(u_t\): experimentally arranged environmental input
- \(B_i\): participant-specific sensitivity to environmental input
- \(z_t\): latent behavioral mode

The experiments below should generate **many repeated within-subject transitions** so these operators can be estimated, validated, and compared within the same person.

---

# Global Design Principles

## Primary design principle

Do not optimize these tasks for between-group mean differences.

Optimize them for:
- repeated within-person context transitions
- repeated returns to the same context
- enough observations per context to estimate local dynamics
- prospective prediction of later behavior from earlier behavior in the same participant
- controlled perturbations with known onset and offset

## General timing target

Target approximately **10–15 minutes per study** unless pilot data indicate otherwise.

## General response topology

Use the same basic two-option operant structure as the current foraging task:
- Option A
- Option B
- keyboard and/or click response
- reinforcement delivered probabilistically
- trial-level timestamps
- inter-response / inter-click interval retained

## General context signaling

Use visually distinct background contexts:
- Green
- Blue
- Red

Use exact color codes consistently across the task and store them in event logs.

Do not rely on color alone for discrimination if accessibility becomes a concern. A later version can pair each color with a simple geometric texture/pattern, but the first implementation can remain color-based.

## Critical counterbalancing

Randomize the mapping between:
- physical color
- functional contingency

for each participant when appropriate.

Store the randomized mapping explicitly in session metadata.

---

# Study 1: Repeated Context-Specific Dynamical Modes

## Scientific question

Does the same individual repeatedly express a similar dynamical operator when returned to the same reinforcement context?

Primary test:

\[
A_{i,c}^{(early)}\stackrel{?}{\approx}A_{i,c}^{(late)}
\]

and whether early estimates predict later exposures to the same context.

## Core structure

Use three signaled contexts:
- Context 1
- Context 2
- Context 3

Each context is identified by a background color.

Recommended functional contingencies:

### Left-favored context
\[
P(R|A)=0.80,\qquad P(R|B)=0.20
\]

### Right-favored context
\[
P(R|A)=0.20,\qquad P(R|B)=0.80
\]

### Symmetric context
\[
P(R|A)=0.50,\qquad P(R|B)=0.50
\]

Randomize which physical color corresponds to which contingency for each participant.

## Repeated exposures

Recommended starting point:
- 18 total context blocks
- 6 exposures per context
- 12–20 responses per block
- no immediate repetition of the same context
- block order pseudorandomized
- each context represented throughout early, middle, and late parts of the session

Example:

Green → Blue → Red → Green → Red → Blue → ...

Do not use only one long exposure per context.

## Important IVs

### IV1: Physical context
- Green
- Blue
- Red

### IV2: Functional contingency
- A-rich
- B-rich
- Symmetric

### IV3: Exposure number
Ordinal within context:
- 1 through 6

### IV4: Context transition type
Examples:
- A-rich → B-rich
- A-rich → Symmetric
- B-rich → A-rich
- B-rich → Symmetric
- Symmetric → A-rich
- Symmetric → B-rich

### IV5: Trials since context transition
Integer:
- 0, 1, 2, ...

This is essential for transition-aligned analyses.

## Important DVs

### Primary behavioral DVs
- choice: A/B
- reinforcement delivered: 0/1
- response latency / ICI
- switch: 0/1
- cumulative points
- trial number
- block number
- trial-in-block
- context color
- functional contingency
- reward probability for A
- reward probability for B
- transition type
- trials since transition

### Derived state DVs
Compute in analysis:
- \(P(A)\)
- reward rate
- switch rate
- mean/median ICI
- log ICI
- recent reinforcement difference
- recent choice allocation
- perseveration/run length

## Primary analytics

### A. Individual temporal holdout
For each participant:
- train on early exposures
- test on later exposures
- never mix future observations into training

### B. Fit participant-specific operators
Compare:

\[
x_{t+1}=A_i x_t
\]

\[
x_{t+1}=A_i x_t+B_i u_t
\]

\[
x_{t+1}=A_{i,c}x_t
\]

### C. Same-context replication
Estimate:
- \(A_{i,c}^{early}\)
- \(A_{i,c}^{late}\)

Compare:
- spectral radius
- eigenvalues
- dominant eigenvector
- cosine similarity
- top-2 subspace principal angles

### D. Predict later exposures
Use early context-specific operator to predict:
- later states in same context
- first several states after re-entry into that context

### E. Transition-aligned trajectories
Align every context change at \(t=0\).

Plot for each participant:
- choice allocation
- reward rate
- switching
- ICI
- state-space trajectory

### F. Multi-step forecasting
Evaluate:
- 1-step
- 2-step
- 5-step
- 10-step

### G. Baselines
Compare against:
- persistence
- EWMA/autoregression
- RL
- HMM
- S-Map
- DMD/DMDc

---

# Study 2: Physical Context vs Functional Contingency

## Scientific question

Do dynamical modes follow:
1. the physical stimulus context,
2. the learned reinforcement contingency,
3. or the interaction between the two?

This tests whether “environment” in the state-space model is topographical or functional.

## Core design

Use two physical contexts:
- Green
- Blue

Use two functional contingencies:
- A-rich
- B-rich

### Stage 1
Green → A-rich
Blue → B-rich

### Stage 2 reversal
Green → B-rich
Blue → A-rich

The participant should receive repeated alternating exposures before and after reversal.

## Recommended structure

- 8–10 pre-reversal blocks
- 8–10 post-reversal blocks
- 12–20 responses per block
- repeated alternation/pseudorandomization
- no immediate same-context repetition

Do not signal the reversal explicitly.

## Important IVs

### IV1: Physical context
- Green
- Blue

### IV2: Functional contingency
- A-rich
- B-rich

### IV3: Reversal phase
- pre-reversal
- post-reversal

### IV4: Context × contingency relation
Examples:
- Green/A-rich
- Green/B-rich
- Blue/A-rich
- Blue/B-rich

### IV5: Exposure number
Repeated within each context/contingency combination.

### IV6: Trials since reversal
Integer centered at reversal.

### IV7: Trials since context switch
Integer centered at each context transition.

## Important DVs

Same core DVs as Study 1:
- choice
- reward
- switch
- ICI/RT
- run length
- cumulative points

Additionally:
- context identity
- contingency identity
- pre/post reversal
- trials since reversal
- trials since context change

## Primary analytics

### A. Competing similarity predictions

If dynamics follow physical context:

\[
A_{i,\mathrm{Green\ pre}}\approx A_{i,\mathrm{Green\ post}}
\]

If dynamics follow functional contingency:

\[
A_{i,\mathrm{Green,A-rich}}\approx A_{i,\mathrm{Blue,A-rich}}
\]

### B. Eigenvector similarity tests
Within participant compare:
- same physical color, different contingency
- different physical color, same contingency
- same physical color, same contingency where available

Metrics:
- absolute cosine similarity
- principal angles
- eigenvalue distance
- spectral-radius difference

### C. Predictive model comparison

Physical-context model:
\[
x_{t+1}=A_{i,\mathrm{color}}x_t
\]

Functional-context model:
\[
x_{t+1}=A_{i,\mathrm{contingency}}x_t
\]

Interaction model:
\[
x_{t+1}=A_{i,\mathrm{color}\times\mathrm{contingency}}x_t
\]

Controlled common-operator model:
\[
x_{t+1}=A_i x_t+B_i u_t
\]

Primary criterion:
- held-out later behavior in same participant

### D. Reversal dynamics
Quantify:
- adaptation lag
- perseveration
- switch burst
- RT slowing
- hysteresis
- trajectory reorganization

### E. Functional-control test
Ask whether the eigensystem reorganizes when the contingency reverses even though the physical context remains constant.

---

# Study 3: Perturbation and Recovery

## Scientific question

Can eigenvalues estimated from prior behavior prospectively predict how the same individual's behavior recovers after a controlled perturbation?

This is the strongest prospective test of the dynamical framework.

## Core idea

First establish repeated exposures to a relatively stable context.

Then introduce brief perturbations.

After perturbation, restore the original contingency and observe recovery.

Let \(x^\ast\) be the pre-perturbation local state.

Define deviation:

\[
\delta x_t=x_t-x^\ast
\]

Then test:

\[
\delta x_{t+1}\approx A_i\delta x_t
\]

and:

\[
\delta x_t\approx A_i^t\delta x_0
\]

## Perturbation types

Implement at least two initially.

### Perturbation A: Brief extinction
For a fixed number of responses:
- \(P(R|A)=0\)
- \(P(R|B)=0\)

Recommended starting duration:
- 5–10 responses

Then restore baseline contingency.

### Perturbation B: Brief contingency reversal
For a fixed number of responses:
- swap A-rich and B-rich contingencies

Recommended starting duration:
- 5–10 responses

Then restore baseline contingency.

### Optional later perturbation C: Alternative reinforcement pulse
Briefly increase reinforcement probability on the currently less preferred option.

### Optional later perturbation D: Rich reinforcement pulse
Briefly increase reinforcement on both options.

## Repeated perturbations

Recommended:
- 6–10 perturbations per participant
- multiple examples of each perturbation type
- pseudorandom timing
- minimum recovery interval between perturbations

## Important IVs

### IV1: Perturbation type
- extinction
- reversal
- optional alternative-reinforcement pulse
- optional rich pulse

### IV2: Perturbation magnitude
Examples:
- duration in trials
- change in reinforcement probability

### IV3: Perturbation onset
Exact trial/time index.

### IV4: Perturbation offset
Exact trial/time index.

### IV5: Time since perturbation
Centered variable:
- negative = pre-perturbation
- zero = onset
- positive = recovery

### IV6: Baseline context
If multiple baseline environments are used.

### IV7: Perturbation repetition number
To assess whether recovery itself changes with experience.

## Important DVs

### Primary
- choice
- reward
- switch
- ICI
- run length
- cumulative points

### Recovery-specific derived DVs
- deviation from pre-perturbation state
- Euclidean/Mahalanobis distance from local equilibrium
- time to return within tolerance band
- peak displacement
- overshoot
- oscillation
- recovery half-life
- adaptation lag
- area under recovery curve

## Primary analytics

### A. Estimate operator from pre-perturbation data
For participant \(i\):

\[
A_i^{pre}
\]

Do not use post-perturbation observations to estimate the operator used for prediction.

### B. Prospective recovery forecast
At perturbation offset:

\[
\hat{\delta x}_{t+k}=A_i^k\delta x_t
\]

Compare predicted to observed recovery.

### C. Eigenvalue-derived predictions
For dominant eigenvalue \(\lambda_1\):
- \(|\lambda_1|\approx 1\): slow recovery
- small \(|\lambda_1|\): rapid recovery
- negative \(\lambda\): alternating correction
- complex conjugate pair: oscillatory recovery

### D. Recovery shape tests
Quantify whether observed:
- monotonic decay
- overshoot
- damped oscillation
- state switch

matches the eigensystem.

### E. Repeated perturbation reliability
Ask whether a participant's recovery dynamics are reproducible across repeated perturbations of the same type.

### F. Compare perturbation classes
Test whether the same \(A_i\) predicts:
- extinction recovery
- reversal recovery

or whether different perturbations require different local operators.

---

# Shared Data Schema

Every raw event should include enough information to reconstruct the entire experimental state without depending on derived analysis files.

## Required identifiers
- participant_id
- prolific_pid
- study_id
- session_id
- experiment_version

## Required timing fields
- timestamp_utc
- elapsed_time_ms
- trial_index
- block_index
- trial_in_block
- response_time_ms
- ici_ms

## Required response fields
- chosen_option
- previous_option
- switched
- run_length

## Required consequence fields
- reward_outcome
- points_earned
- cumulative_points
- p_reward_A
- p_reward_B

## Required context fields
- physical_context_id
- context_color
- functional_contingency_id
- exposure_number
- phase
- reversal_status
- trials_since_context_switch

## Required perturbation fields
- perturbation_active
- perturbation_type
- perturbation_id
- perturbation_trial_index
- trials_since_perturbation_onset
- trials_since_perturbation_offset

## Required quality-control fields
- page_visible
- fullscreen_active
- focus_lost_count
- browser_width
- browser_height
- input_method
- task_completed

---

# Session Metadata

Save one session-level JSON object containing:
- participant/session identifiers
- experiment version
- randomization seed
- color-to-contingency mapping
- block sequence
- reversal point
- perturbation schedule
- task start/end time
- total responses
- total rewards
- total points
- completion status
- browser/device info

The full randomization schedule must be recoverable after the fact.

---

# Implementation Requirements

## Deterministic randomization

Use a participant-specific seeded PRNG.

Given participant/session ID + experiment version, the exact block order and perturbation schedule should be reproducible.

## No accidental immediate context repetition

When generating pseudorandom block sequences:
- enforce no same-context consecutive blocks unless intentionally designed
- balance context exposure across thirds of the session

## Logging

Log every response immediately or checkpoint frequently.

Do not wait until task completion to send the entire session.

Recommended:
- local in-memory buffer
- POST every block or every 20–30 events
- upsert by participant_session_id + trial_index
- final completion event

## Recovery from disconnect

If refresh/reconnect occurs:
- restore session state where feasible
- do not restart the participant into a fresh randomization
- preserve already-recorded events

## Prolific integration

Capture:
- PROLIFIC_PID
- STUDY_ID
- SESSION_ID

from URL parameters.

## Completion

Completion code should be configuration-driven, not buried in task logic.

---

# Analysis Architecture

Create an `/analysis` directory containing:

## raw_data_validation.py
Checks:
- duplicate trials
- missing transitions
- impossible timestamps
- context sequence integrity
- randomization integrity
- reward probabilities match programmed contingency
- perturbation onset/offset correctness

## build_states.py
Constructs state vectors from raw events.

Default:
- non-overlapping 10-click bins

Also support:
- 5-click bins
- 20-click bins
- time-based bins later if useful

## fit_individual_linear.py
Fits:
- \(A_i\)
- \(A_i+B_i u_t\)
- \(A_{i,c}\)

with:
- within-person temporal split
- ridge regularization
- inner validation for hyperparameter selection

## eigenanalysis.py
Per participant/context:
- eigenvalues
- eigenvectors
- spectral radius
- complex-pair detection
- dominant feature
- cosine similarity
- principal angles

## bootstrap_individual.py
Moving-block bootstrap:
- eigenvector stability
- spectral-radius confidence intervals

## forecast.py
Evaluates:
- 1-step
- 2-step
- 5-step
- 10-step forecasts

## compare_models.py
Compare:
- persistence
- autoregressive baseline
- EWMA
- RL
- HMM
- S-Map
- DMD
- DMDc
- switching linear dynamical system

## perturbation_analysis.py
Computes:
- recovery curves
- peak displacement
- half-life
- overshoot
- return-to-baseline time
- observed vs eigenvalue-predicted recovery

---

# Primary Performance Metrics

Do not rely on \(R^2\) alone.

Use:

## Prediction error
- MSE
- RMSE
- MAE

## Relative skill

\[
\mathrm{Skill}=1-\frac{\mathrm{MSE}_{model}}{\mathrm{MSE}_{baseline}}
\]

## Multi-step forecast degradation
Error as a function of forecast horizon.

## Transition prediction
Prediction error centered on context changes.

## Perturbation recovery accuracy
Observed vs predicted:
- recovery time
- half-life
- peak displacement
- overshoot
- oscillation period if present

## Dynamical structure
- spectral radius
- eigenvalue distribution
- eigenvector loadings
- cosine similarity
- subspace principal angles
- bootstrap stability

---

# Individual-Level Reporting

Every participant should get an automatically generated dynamical profile containing:
- number of valid events
- number of state transitions
- held-out prediction metrics
- best model architecture
- \(A_i\)
- \(B_i\)
- \(A_{i,c}\)
- eigenvalues
- dominant eigenvector
- dominant feature
- bootstrap stability
- context-to-context eigenvector similarity
- perturbation recovery prediction accuracy

Group summaries should be produced only after these individual profiles exist.

---

# Key Scientific Decision Rules

## Claim: reproducible context-specific mode
Require:
1. early \(A_{i,c}\) predicts later observations in the same context;
2. dominant eigenvector is reasonably bootstrap-stable;
3. later estimate is similar to early estimate;
4. result exceeds simple predictive baselines.

## Claim: mode follows physical context
Require within participant:

\[
\mathrm{similarity(same\ color, different\ contingency)}
>
\mathrm{similarity(different\ color, same\ contingency)}
\]

## Claim: mode follows functional contingency
Require the reverse.

## Claim: eigenvalues prospectively predict recovery
Require pre-perturbation eigenvalues to predict later recovery trajectories not used in model fitting.

---

# Recommended Build Order

## Phase 1
Build Study 1 only.

Goals:
- verify repeated context sequencing
- verify clean event schema
- pilot timing
- pilot whether repeated within-subject operators are estimable

## Phase 2
Add Study 2 reversal logic.

Goals:
- preserve same codebase/components
- add physical vs functional context manipulation

## Phase 3
Add perturbation engine.

Perturbations should be configuration-driven, e.g.:

```js
{
  type: "extinction",
  durationTrials: 8,
  startAfterBlock: 6
}
```

Do not hard-code each perturbation type into unrelated task logic.

---

# Suggested Repository Structure

```text
repo/
├── existing-foraging-study/
├── dynamics-context-replication/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── config.js
│   └── api/
├── dynamics-context-reversal/
├── dynamics-perturbation-recovery/
├── shared/
│   ├── randomization.js
│   ├── logging.js
│   ├── prolific.js
│   └── task-utils.js
├── analysis/
│   ├── raw_data_validation.py
│   ├── build_states.py
│   ├── fit_individual_linear.py
│   ├── eigenanalysis.py
│   ├── bootstrap_individual.py
│   ├── forecast.py
│   ├── compare_models.py
│   └── perturbation_analysis.py
└── docs/
    └── behavioral-dynamics-program.md
```

If the existing repo already has a different organization, preserve its conventions rather than forcing this exact tree.

---

# Pilot Acceptance Criteria

Do not launch a full sample until the pilot confirms:

## Task integrity
- no missing event sequences
- randomization works as intended
- context mappings recover correctly
- reward probabilities match configuration
- perturbation timing is exact
- session resumes/checkpoints correctly

## Behavioral sensitivity
At least most pilot participants should show:
- context-sensitive choice allocation
- measurable transition dynamics
- non-degenerate switching
- sufficient response counts per context

## Analytic sufficiency
For most pilot participants:
- enough transitions to fit regularized \(A_i\)
- enough repeated context exposures to compare early vs late
- bootstrap eigenvector stability can be estimated
- held-out same-person predictions can be computed

## Timing
Median completion time should land near target without forcing extremely rapid responding.

---

# Final Scientific Goal

The strongest result would not be:

> “The average participant had eigenvalue \(\lambda=.82\).”

The stronger result would be:

> “For an individual organism, a transition operator estimated from earlier behavior in a given environment reproduced a stable eigensystem, predicted later behavior in that same environment, generalized across repeated returns to that environment, and prospectively predicted the organism's recovery after controlled perturbation.”

That is the target this experimental program should be built to test.
