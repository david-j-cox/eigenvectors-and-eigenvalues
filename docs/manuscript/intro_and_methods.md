# Measuring the relative influence of multiple variables on behavior

*Draft manuscript: Introduction and Method. 13 September 2026.*

# Introduction

## The question

Behavior is rarely under the control of one thing. At any moment several
features of the environment covary with what an organism does, and the
practical question — in a functional analysis, in a treatment, in an
experiment — is which of them actually control responding, and by how much
relative to each other.

The measures in general use answer that question in units of **magnitude**.
Discriminability (log *d*; Davison & Tustin, 1978, cited in Davison & Elliffe,
2010) indexes how strongly a stimulus dimension separates responding.
Sensitivity in the generalized matching law indexes how strongly allocation
follows a reinforcer ratio. A discrimination ratio (Vyazovska, Teng, &
Wasserman, 2014) indexes how strongly a dimension separates S+ from S−. Each
returns, per variable, one number for how much.

Magnitude is not the whole of influence. An effect that is large and gone in
three responses may matter less than one that is small and still present a
minute later. Nothing in the measures above distinguishes those two cases,
because none of them has a time axis.

## Three literatures that do have a time axis, and what each leaves out

Three programs have measured persistence. They developed separately, report in
different units, and are not cited together.

**McDowell, Bass, and Kessel (1992)** write behavior as a convolution of the
reinforcement stream with an impulse-response kernel,

    B(t) = ∫ G(t − t′) R(t′) dt′,

and name the critical test of the framework: the kernel must stay invariant
when the schedule changes. The kernel has a height and a time constant, so
magnitude and persistence are separate in it. It is single-input: one
reinforcement stream, one kernel.

**Baum and Davison (2009)** update log choice at every food delivery,

    B(i+1) = (1 − w)·B(i) + w·A,

with fitted *w* between .42 and .66. Magnitude and persistence are separate
here too, and they are separately manipulable: a changeover delay moved the
asymptote *A* while overall food rate moved the rate *w*. The operator is
scalar. It has exactly one rate to give, and its fits pool across six pigeons
and 60–85 sessions rather than describing an individual.

**Nevin (1992)** indexes strength by resistance to change under a disrupter,
and behavioral momentum's central claim is precisely that response rate and
resistance to change are independent dimensions of behavior. Resistance is
measured for one response class at a time. Nevin, Davison, and Shahan (2005)
add an unmeasured probability of attending, which buys a latent variable but
remains an account of steady states and of decay under disruption.

Each separates magnitude from persistence for a **single** influence. None
separates them across **several simultaneous** influences, and the reason is
structural rather than historical: a scalar operator has one rate, a
single-input kernel has one time constant, and a resistance is measured for one
class.

## What a transition operator adds, and what it does not

Fit, per individual, on the response series:

    x(t+1) = A·x(t) + B·u(t) + c

where *x* is a state vector of behavioral measures and *u* the environmental
variables being manipulated.

It is worth being exact about which part does what, because the eigen
machinery is easily over-sold.

**Relative influence lives in B, not in the spectrum.** Column *k* of *B* is
variable *k*'s effect on behavior, estimated with the organism's own
carry-over already accounted for in *A*. That is what the existing magnitude
measures estimate, with the autocorrelation removed.

**The spectrum adds two things B cannot say.** For a diagonalizable operator,
A = VΛV⁻¹, so A^k = VΛ^kV⁻¹ and the operator's whole action reduces to
independent scaling along each eigenvector. The **eigenvalues** then give how
long an influence persists once delivered — |λ| < 1 decays with half-life
log(½)/log|λ|, complex λ adds oscillation with period 2π/arg(λ) — so a
variable with a small effect on a slow mode can outweigh a large effect on a
fast one. The **eigenvectors** give which measured variables move as a single
mode, and therefore whether the several things recorded are several influences
or fewer.

Two of the three connections above are exact rather than analogical. For any
linear state-space model the impulse response is A^(k−1)B, which expands to
Σ_j c_j λ_j^(k−1): **McDowell's kernel is a sum of exponentials whose rates are
the eigenvalues**, verified on fitted operators to 5×10⁻¹⁶. And Baum and
Davison's model is this one restricted to a single state coordinate with a
single real eigenvalue (1 − w) in (0, 1), so their account is the rank-1 case.
The third connection — that Nevin's resistance to change corresponds to |λ| for
the mode a disrupter excites — is **proposed and not yet demonstrated**.

## What has already been established, and what it does not settle

Study 1 fitted per-individual operators to 23 people foraging between two
alternatives under an ABAB contingency reversal. The cue coefficient reversed
sign with the contingency in 21 of 23 subjects while the spectrum of *A* stayed
inside each subject's own same-operator null in 23 of 23 — which is McDowell's
invariance test, passed. The scalar restriction that Baum and Davison's model
imposes was violated by 23 of 23 subjects once the series was examined on a
time scale where behavior moves.

It does not settle the question this program is about, because **it varied one
cue**. With a single manipulated variable there is no relative influence to
measure. The dominant eigenvector loaded on P(left) for 17 of 23 subjects and
on inter-response time for the rest, and did not change across conditions:
the right answer for a design with nothing to separate.

A discrete-trial attempt at multiple control was also run and is reported
separately. Four compound stimulus dimensions were arranged after Vyazovska et
al. (2014), who report that their pigeons attended all four about equally and
who state that they could not fashion a null hypothesis test for the
attentional tradeoffs they could see. Human participants reproduced the
equality, for the reason their arrangement produces it: when every dimension
must match, each is exactly as predictive as the others. Making only some
dimensions relevant fixes that, and the resulting static measure of
per-dimension control is validated. But four-alternative forced choice carries
about two bits per trial, nearly all of it spent on whether the correct
alternative was taken, and the dynamics of control proved unidentifiable from
it: against agents built with attentional half-lives of 2, 8, and 32 trials,
the ordering was recovered on 8 of 10 runs only at 2,400 trials per person,
against a chance rate of 1 in 6. **A free-operant stream yields 375–1,329 state
transitions in twenty minutes where forced choice yields about 120 choices**,
which is why the test below is run in the former.

## The experiment

Several environmental variables are varied **independently of one another**
within a free-operant two-alternative task — reinforcement rate on each side, a
signaling stimulus, and a punishment contingency — since independent variation
is what makes each column of *B* identifiable. That much would test whether
relative influence can be measured at all.

The test of the eigen claim specifically requires more. Some variables are
arranged to differ in **persistence but not magnitude**: a reinforcement change
and a signal change calibrated to shift allocation equally, one whose effect
should decay within a few responses and one that should carry. A matching-law
or log-*d* analysis, having no time axis, must call those two equal. The
spectrum says they are not. **That divergence is the prediction only this
approach makes, and it is the experiment.**

The design also needs brief perturbations with recovery windows. Eigenvalues
are decay rates, so the system has to be disturbed and watched returning for
them to be measured rather than inferred from steady state. Those windows are
themselves resistance-to-change measurements, which is what would turn the
Nevin correspondence from proposed into tested.

Session length is capped at thirty minutes.

# Method

## Participants

Adults recruited through Prolific, restricted to desktop or laptop computers.
Participants who had taken part in earlier studies in this program are excluded
by identifier. Sample size is fixed in advance at *n* = 15. The design is
single-subject: every effect below is estimated and reported per participant,
and *n* indexes how many independent replications of a within-subject result
are available, not the denominator of a group test.

## Apparatus and display

The task runs in the participant's browser. The display carries a dark neutral
background, two identical light-gray response panels side by side, and a
running point counter. The panels are visually indistinguishable from one
another and remain so for the whole session except when a momentary stimulus
is scheduled (below). Nothing on the display marks the passage of blocks, the
state of the reinforcement schedule, or the number of responses remaining, so
that no visual event other than the ones under experimental control can acquire
a discriminative function.

Responding is free-operant. A response is a click or tap on either panel;
there are no trials, no enforced inter-response interval, and no waiting.
Immediately after each response a brief point indicator appears at the panel
that was chosen, showing either a gain, a loss, or nothing. In a previous study
using this preparation, 23 participants emitted a median of 4,136 responses at
223 responses per minute (interquartile range 185–242, full range 62–315).

## Reinforcement schedule

Each response produces a point with a probability determined by the panel
chosen and the current state of the schedule. **Probabilities are properties of
the state and do not depend on the participant's recent allocation.** No patch
depletes and no interval accrues.

This is a deliberate departure from the previous study in this program, which
used depleting patches. Under depletion, allocating toward the richer panel
reduces its yield, so behavior returns toward indifference whether or not the
participant has learned anything. A decay rate measured in that preparation is
confounded with the schedule's own restoring force. Because the present study
is about decay rates, the schedule must hold still while behavior moves.

## Environmental variables

Three variables are manipulated. They are described here by what they arrange;
their expected time courses are stated in the Design section.

**V1, reinforcement rate (unsignaled).** The pair of reinforcement
probabilities attached to the two panels. In the neutral state both panels pay
*p* = .25. In a biased state one panel pays *p* = .45 and the other *p* = .10.
**The display does not change when this variable changes.** A participant can
learn the current state only from the distribution of outcomes across
responses.

**V2, momentary appetitive stimulus (signaled).** On scheduled responses, the
border of one panel turns gold before the response is emitted and reverts
immediately after it. On that response only, the gold panel pays *p* = .60 and
the other *p* = .05, overriding V1. The gold border appears on the panel
favored by V1 on 60% of its occurrences and on the other panel on 40%.

**V3, momentary aversive stimulus (signaled).** On scheduled responses, the
border of one panel turns dark red, under the same timing rules as V2. A
response to a red-bordered panel subtracts a point; a response to the other
panel is unaffected and pays at the V1 rate. The red border is assigned to the
panel favored by V1 on 40% of its occurrences and to the other panel on 60%.

The partial correlations between V2, V3 and V1 are load-bearing and are set
deliberately. A stimulus uncorrelated with reinforcement has no discriminative
function and cannot acquire control; a stimulus perfectly correlated with V1
carries no variance that V1 does not already explain, and the two columns of
the input matrix are then unidentifiable. Partial correlation makes each
variable predictive and each separately estimable. Congruence is set in
opposite directions for the appetitive and aversive stimuli so that the two are
not collinear with each other.

## Design

### Block structure

The session is divided into blocks of 100 consecutive responses. At each block
boundary V1 changes state, alternating between a biased state and its reversal;
the panel favored is drawn subject to the constraint that consecutive blocks
differ. Block boundaries are not marked on the display.

The block length follows from measurement rather than convention. In the
previous study, an unsignaled reversal of the reinforcement contingency
produced a displacement in allocation that peaked 16–23 responses after onset
and returned to baseline by 24–32 responses. A 100-response block therefore
contains the full transition and approximately 68 further responses at the new
steady state. Shorter blocks would yield more transitions but would end before
allocation had settled, so that the magnitude of each shift would be
systematically underestimated; longer blocks would estimate magnitudes more
precisely while yielding too few transitions to characterize their time course.

### Momentary stimulus scheduling

V2 and V3 are scheduled on a variable-interval-like response schedule with a
**minimum inter-stimulus interval of 15 responses** and a mean of 20, drawn
independently for each stimulus type. The minimum is required rather than
cosmetic. If momentary stimuli occurred at a fixed probability per response,
successive occurrences would fall inside one another's decay windows and no
lag beyond the mean interval could be interpreted. The enforced floor
guarantees that every occurrence is followed by at least 15 responses free of
further stimuli of that type, which is the window in which its decay is read.

The cost of the floor is accepted explicitly: the resulting rate is
approximately 5% of responses rather than the 20% that unconstrained scheduling
would permit, so magnitude estimates for V2 and V3 rest on fewer observations.
Because the experimental question concerns decay rather than magnitude, the
loss is taken on the side that the question does not turn on.

### Perturbations

At scheduled points, V1 is reversed for exactly 8 responses and then restored,
with no accompanying change to the display. Each perturbation is followed by at
least 40 responses during which V1 is held constant and no momentary stimulus
of either type is scheduled, so that the return is observed without further
disturbance. Perturbations are placed so that they fall entirely within a block
and do not straddle a boundary.

### Session

The task ends after 2,400 responses or 28 minutes, whichever comes first. At
the median response rate observed previously this corresponds to approximately
11 minutes and 24 blocks; at the slowest rate observed, to 28 minutes and
approximately 17 blocks. The number of blocks completed is recorded and is a
covariate of interest rather than a nuisance, since it bounds how many
within-subject replications that participant contributes.

Participants are paid a fixed amount that does not depend on points earned.
Points are feedback only, and this is stated in the instructions.

## Data analysis

### Logged data

One row per response records: the panel chosen, the outcome, the state of V1,
whether and where V2 or V3 was present, the inter-response time, the block
index, the position of the response within its block, whether a perturbation
was active, and the number of responses since the most recent perturbation
offset. Every quantity used below is derivable from these rows without
reference to a separate randomization record.

### State vector and operator

Let **x**(*t*) be a state vector of behavioral measures evaluated at response
*t* and **u**(*t*) the vector of environmental variables in force. Operators
are fitted per participant,

> **x**(*t*+1) = **A x**(*t*) + **B u**(*t*) + **c**

**The state is constructed without binning.** In the previous study the state
was a vector of proportions over a window of responses, which required a window
width, and that width was selected on a sampling-noise criterion that argues
only for wider windows. A window is also a low-pass filter: at the width
selected, an unconstrained operator predicted held-out behavior no better than
a scalar one in 13 of 23 participants, while at the narrowest width tested it
did so in 23 of 23. Here the state is a lag embedding of the response series
itself — the values of the recorded response-level measures over the preceding
*k* responses — so that every response contributes a transition. The embedding
order *k* is selected per participant by held-out predictive likelihood.

Fits are evaluated by skill against a persistence baseline on temporally
held-out responses, 1 − MSE/MSE<sub>persistence</sub>, never by in-sample fit.

### Per-transition analysis

Each block boundary is a within-subject replication. For each boundary the
following are computed: the direction of the change in allocation over the 32
responses following the boundary relative to the 32 preceding it; its
magnitude; and whether the direction matches the one arranged. **Results are
reported per participant as counts of replications** — *k* of *m* boundaries
showed the arranged effect — and never as a mean across boundaries, which would
conceal a participant who reversed on half of them.

Decay rates are estimated per participant across that participant's
transitions, because a single transition of approximately 32 binary responses
does not support a reliable rate estimate on its own.

### The discriminating test

The hypothesis under test is that influence has two separable components,
magnitude and persistence, and that measures without a time axis conflate them.

For each of V1, V2 and V3, two quantities are estimated per participant. The
first is **magnitude**: the asymptotic displacement in allocation attributable
to that variable, read from the steady-state portion of blocks for V1 and from
the immediate (lag-0 and lag-1) response to the stimulus for V2 and V3. The
second is **persistence**: the decay of that displacement, read model-free as
the profile of allocation at lags 1 through 15 following each momentary
stimulus, and at lags 1 through 40 following each perturbation offset.

The model-free decay profile is the ground truth against which the fitted
operator is checked. The spectral prediction is that the eigenvalue associated
with the mode a variable drives corresponds to that variable's measured decay,
and this correspondence is tested rather than assumed.

**The critical comparison is between variables matched on magnitude and
differing in persistence.** V2's arranged effect terminates after the response
on which it occurs; V1's must be integrated across responses to be detected at
all. Any influence of V2 at lag 1 and beyond is therefore behavioral
persistence rather than continued arrangement. Where the estimated magnitudes
of two variables are statistically indistinguishable for a participant while
their measured decay profiles differ, a matching-law analysis and a
signal-detection analysis (log *d*) must return the same value for both, since
neither has a time axis. The spectrum returns different eigenvalues. **That
divergence, computed on the same responses, is the test.**

### Comparison measures

Computed on the identical response series for each participant: sensitivity to
reinforcement in the generalized matching law, and log *d* for each signaled
stimulus. These are the incumbent measures of relative influence and are
reported alongside the operator estimates, not in place of them.

### Nulls and validation

No estimate is interpreted without a reference distribution computed from that
participant's own data. For operator invariance, the reference is the
distribution of spectral distances between two independent estimates of the
same operator at the same sample size. For eigenvector comparisons, the
reference is the same-operator cosine floor. For per-dimension control, the
reference is a permutation that destroys which variable is which while leaving
the choice structure and the participant's actual responses unaltered.

The full analysis chain is validated end to end before it is applied. The
task's own code generates response sequences for agents whose influence
structure is fixed by construction — including agents whose attention is
misdirected to a variable that carries no information, and agents whose
influence decays at known rates — and the analysis is required to recover what
was arranged. This validation is re-run after any change to the task, the
logged schema, or the estimator, and it is required to fail when a deliberately
mis-specified estimator is substituted.

## References

Baum, W. M. (2010). Dynamics of choice: A tutorial. *Journal of the
Experimental Analysis of Behavior, 94*(2), 161–174.

Baum, W. M., & Davison, M. (2009). Modeling the dynamics of choice.
*Behavioural Processes, 81*(2), 189–194.

Davison, M. (2018). Divided stimulus control: Which key did you peck, or what
color was it? *Journal of the Experimental Analysis of Behavior, 109*(1),
107–124.

Davison, M., & Elliffe, D. (2010). Divided stimulus control: A replication and
a quantitative model. *Journal of the Experimental Analysis of Behavior,
94*(1), 13–23.

Gomes-Ng, S., Austin, T., Bai, J. Y. H., Landon, J., & Cowie, S. (2026).
Divided control by past behavior, present stimuli, and future outcome value in
a concurrent-chains procedure. *Journal of the Experimental Analysis of
Behavior, 125*, e70087.

Gomes-Ng, S., Cowie, S., & Elliffe, D. (2023). Divided stimulus control depends
on differential and nondifferential reinforcement: Testing a quantitative
model. *Journal of the Experimental Analysis of Behavior, 120*(3), 344–362.

Gomes-Ng, S., Elliffe, D., & Cowie, S. (2026). Divided stimulus control depends
on global, but not local, reinforcement contingencies. *Journal of the
Experimental Analysis of Behavior, 126*(2), e70127.

McDowell, J. J, Bass, R., & Kessel, R. (1992). Applying linear systems analysis
to dynamic behavior. *Journal of the Experimental Analysis of Behavior, 57*(3),
377–391.

Nevin, J. A. (1992). An integrative model for the study of behavioral momentum.
*Journal of the Experimental Analysis of Behavior, 57*(3), 301–316.

Nevin, J. A., Davison, M., & Shahan, T. A. (2005). A theory of attending and
reinforcement in conditional discriminations. *Journal of the Experimental
Analysis of Behavior, 84*(2), 281–303.

Vyazovska, O. V., Teng, Y., & Wasserman, E. A. (2014). Attentional tradeoffs in
the pigeon. *Journal of the Experimental Analysis of Behavior, 101*(3),
337–354.

*Cited at one remove and not read in the original: Davison & Nevin (1999),
Davison & Tustin (1978), Reynolds (1961), Shahan & Podlesnik (2006).*
