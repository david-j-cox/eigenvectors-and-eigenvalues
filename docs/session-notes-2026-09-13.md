# Session notes, 12–13 September 2026

What was established, what was found to be wrong, and what to do next. Written
so that the reasoning is recoverable without re-reading the transcript.

## 1. What is now established

**The kernel and the spectrum are the same object.** For any linear
state-space model the impulse response is *A*^(k−1)*B*, which expands to
Σ *c*ⱼ λⱼ^(k−1). McDowell, Bass and Kessel's (1992) kernel is therefore a sum
of exponentials whose rates are the eigenvalues; verified on study 1's fitted
operators to 5 × 10⁻¹⁶. Baum and Davison's (2009) scalar operator is the
rank-one case of the same equation. The third correspondence — Nevin's
resistance to change and |λ| for the mode a disrupter excites — remains
proposed and untested.

**Study 1's state bin was a low-pass filter.** The 10-response bin was chosen
on a sampling-noise criterion, which argues only for wider bins; nothing in
that selection considered what a bin removes. At that width an unconstrained
operator beat a scalar one for 13 of 23 participants and rank 0 — no dynamics
at all — already scored .437. At a 3-response bin the unconstrained operator
won 23 of 23. Tuned properly on a fixed target, every participant chose the
smallest bin the code allowed, and an unbinned lag embedding beat the best bin
in 23 of 23 at every prediction horizon.

**The eigenvector question was answerable all along.** The bin is an analytic
choice applied to stored events, not a property of the experiment. Re-binning
lifted the same-operator cosine floor from .548 to .943 and made the comparison
readable; it reads as no difference across conditions, which is the eigenvalue
invariance result arriving from a second direction.

**Perturbation recovery, measured.** An 8-response unsignalled contingency
reversal displaces allocation maximally 16–23 responses after onset — 8 to 15
responses after it has ended — and returns by 24–32. Every block and recovery
window in the new procedure is sized from this.

**A signal changes magnitude, not time course.** Signalled and unsignalled
reversals in study 1 both peak at 16–23 responses; the signal raises the size
of the shift from about .59 to .70. Study 1 therefore contains no pair of
variables differing in persistence, which is why the new design has to arrange
one.

**Depletion confounds any decay estimate.** Under a depleting schedule,
allocating toward the richer alternative reduces its yield, so behaviour
returns toward indifference whether or not anything was learned. Study 1's
signalled curve declines after its peak although the contingency change is
permanent. The new procedure uses state-dependent probabilities and nothing
depletes.

**The new procedure works.** Seven sessions, integrity checks passing on all.
Every participant moved toward the newly rich panel on a majority of block
boundaries (15/23, 19/23, 15/18, 19/23, 10/15, 19/23, 8/9), with transitions
taking ~16–23 responses — study 1's measurement, replicated in a different
schedule.

## 2. What was found to be wrong

Each of these produced something that read as a result before it was caught.

**Discrete-trial forced choice cannot carry the dynamics.** Four-alternative
choice conveys ~2 bits per trial, nearly all spent on whether the correct
alternative was taken. Against agents built with attentional half-lives of 2, 8
and 32 trials, the ordering was recovered on 8 of 10 runs only at 2,400 trials
per person, against a chance rate of one in six. The static per-dimension
measure works and is validated; the dynamic one is not identifiable.

**Mode counting measures the estimator, not the organism.** An order-shuffled
surrogate needs the same median three modes and a comparable top-mode share.
A 4 × 4 operator has four eigenvalues whatever it is fitted to.

**The per-dimension match rate cannot separate relevant from irrelevant.** A
participant who chooses correctly has chosen the winner, and the winner matches
itself on every dimension. Against a chooser built to use only the relevant
dimensions it returned +50% on relevant and +37% on irrelevant.

**A conditional logit must be fitted within a relevant set.** Pooled across
contexts it averages each dimension over both roles and every coefficient
collapses together.

**Aligning episodes by observed displacement manufactures recovery.** It
guarantees a displacement and produces a curve out of regression to the mean.
Alignment must be by the arranged direction.

**Least squares is the wrong loss for a binary target**; it flatters a baseline
that predicts exactly ±1. **A logistic link then breaks the eigenvalue
interpretation** — coefficients on an unbounded logit scale gave spectral radii
above one for five of seven participants. The model must be linear in the
lagged choices and the *scoring* fixed instead.

**Stimulus effects need a control matched on stickiness, not a base rate.** A
participant who switches on 8% of responses stays put regardless of what was
shown. The control is an unmarked response in the same block with the same
lag-0 choice. **And that control must be keyed on which panel was marked** —
without it, P(choose left) is averaged with P(choose right) and the control
sits at exactly .500 for every participant at every lag, correcting nothing.

**log d needs its standard error computed before any two values are compared.**
One participant appeared to show the decisive case — appetitive and aversive
log d of −0.505 and −0.510 — on 29 and 28 events with standard errors of 0.385
and 0.408.

**Two participant-facing faults.** The end screen's pending count updated only
when a response was logged, so after the last one it froze and told every
finisher their data had failed to upload; one participant emailed about it. And
the click lock was released only inside a callback scheduled after the logging
call, so anything throwing on that path froze the task with the page looking
normal; one participant reported exactly that and returned their submission
(paid $3.00 by bonus).

## 3. Where the analysis stands

Per participant, on 2,360 responses each (two shorter):

- Block transitions replicate in every participant.
- A decay half-life is estimable for 5 of 14 stimulus effects, four of them
  aversive. The appetitive stimulus rarely produces a fittable decay.
- Operator half-lives run 1.9–8.8 responses, all stable (ρ < 1).
- log d resolves appetitive from aversive within 5 of 7 participants.

**The test the introduction proposes has not been made.** It requires two
variables matched on magnitude and differing in persistence, and at ~60
stimulus presentations per participant log d's standard error (~0.27) cannot
establish a match. Correlations between |log d| and either magnitude or
half-life are near zero at this sample size and should not be interpreted in
either direction.

**Also not done:** the fitted operator's eigenvalues have not been checked
against the model-free decay profiles. That comparison is the paper's claim and
needs the operator refitted per variable rather than as a single dominant mode.

## 4. Recommendations

### For continuing

The procedure does what it was built to do. Integrity is clean on every
session, the reinforcement manipulation replicates within every participant,
the schedule no longer confounds decay with depletion, and the analysis is in
saved code with an end-to-end validation that fails when a deliberately
misspecified estimator is substituted. The instrument is sound; what is missing
is resolution.

### Against continuing unchanged

Another five participants at the current parameters would reproduce the same
impasse. The binding constraint is the number of stimulus presentations, and it
is set by the design rather than by the sample: the 15-response floor on the
inter-stimulus interval caps each stimulus type near 6% of responses, so a
2,400-response session cannot yield much beyond 140 presentations even at the
ceiling, against 60 currently arranged. Halving log d's standard error needs
roughly four times the events.

### The change to make, and the fork

**Run one momentary stimulus rather than two.** Dropping the aversive stimulus
lets the appetitive run at the floor, roughly doubling its presentations
immediately, and frees the response stream that the second schedule's recovery
windows currently consume. The cost is the appetitive/aversive contrast, which
is the only comparison log d currently resolves.

**Or lengthen the session.** 2,400 responses is 10.8 min at the median rate
observed; the 28-minute cap binds only for the slowest. A 4,000-response
session would cost about $5 per participant at the established $10/hr and yield
roughly 100 presentations per stimulus while keeping both.

The second is the smaller scientific compromise and the larger financial one.
Either is defensible; running again without choosing is not.

### Smaller items

- **A reload restarts at response zero.** The participant who froze lost 15
  minutes to this. Session position should be recoverable from storage.
- **Check the eigenvalues against the model-free decay** before collecting more
  data; it costs nothing and is the claim the paper makes.
- **The manuscript needs restructuring.** The preliminary study is unpublished
  and nobody will read it as background; it becomes Experiment 1 with this as
  Experiment 2, or it comes out. That decision changes the architecture.
