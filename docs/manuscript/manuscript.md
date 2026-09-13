%%TITLE%%Measuring the Relative Influence of Multiple Variables on Behavior Using Transition Operators
%%AUTHOR%%David J. Cox
%%AFFIL%%Endicott College

# Measuring the Relative Influence of Multiple Variables on Behavior Using Transition Operators

Behavior is seldom under the control of a single variable. At any moment,
several features of the environment covary with responding, and both applied
and experimental analyses require an estimate of which features control
behavior and in what proportion.

## Magnitude as the Prevailing Metric

The measures in general use express influence as a magnitude. Discriminability,
log *d* (Davison & Tustin, 1978), indexes the degree to which a stimulus
dimension separates responding. Sensitivity in the generalized matching law
indexes the degree to which allocation follows a reinforcer ratio. The
discrimination ratio (Vyazovska et al., 2014) indexes the degree to which a
dimension separates responding to S+ from responding to S−. Each yields, for
each variable, a single value for amount of control.

Magnitude does not exhaust influence. An effect that is large but dissipates
within three responses may contribute less to subsequent behavior than an
effect that is small but remains detectable a minute later. The measures above
cannot distinguish these cases, because none represents time.

## Quantitative Accounts That Represent Time

Three research programs have measured persistence. They developed
independently, report in incommensurate units, and are not ordinarily cited
together.

McDowell et al. (1992) expressed behavior as the convolution of the
reinforcement stream with an impulse-response kernel,

> *B*(*t*) = ∫ *G*(*t* − *t*′) *R*(*t*′) d*t*′,

and identified the critical test of the framework as the invariance of the
kernel under a change of schedule. The kernel has both a height and a time
constant, so magnitude and persistence are distinct within it. The formulation
admits a single input.

Baum and Davison (2009) modeled log choice as updated at each food delivery,

> *B*(*i* + 1) = (1 − *w*) *B*(*i*) + *wA*,

with fitted values of *w* between .42 and .66. Magnitude and persistence are
distinct in this account as well, and are separately manipulable: a changeover
delay altered the asymptote *A*, whereas overall food rate altered the rate *w*.
The operator is scalar and therefore admits a single rate. Reported fits were
obtained from data pooled across six pigeons and 60 to 85 sessions.

Nevin (1992) indexed behavioral strength by resistance to change under a
disrupter. The central claim of behavioral momentum theory is that response
rate and resistance to change constitute independent dimensions of behavior.
Resistance is estimated for one response class at a time. Nevin et al. (2005)
extended the account with an unmeasured probability of attending, which
introduces a latent variable while remaining an account of steady states and of
decay under disruption.

Each account distinguishes magnitude from persistence for a single influence.
None distinguishes them across several concurrent influences. The limitation is
structural rather than historical: a scalar operator admits one rate, a
single-input kernel one time constant, and a resistance measure one response
class.

## The Transition Operator and Its Spectrum

Consider an operator fitted to an individual's response series,

> **x**(*t* + 1) = **A x**(*t*) + **B u**(*t*) + **c**,

in which **x** is a vector of behavioral measures and **u** a vector of
manipulated environmental variables.

Relative influence resides in **B** rather than in the spectrum of **A**. Column
*k* of **B** estimates the effect of variable *k* on behavior with the
organism's own carryover already accommodated in **A**. This is the quantity the
magnitude measures above estimate, with autocorrelation partialed out.

The spectrum supplies two quantities that **B** does not. For a diagonalizable
operator, **A** = **V**Λ**V**⁻¹ and **A**^*k* = **V**Λ^*k***V**⁻¹, so the
operator's action reduces to independent scaling along each eigenvector. The
eigenvalues then give the persistence of each mode: |λ| < 1 decays with
half-life log(.5)/log|λ|, and complex λ introduces oscillation with period
2π/arg(λ). A variable with a small effect on a slowly decaying mode may
therefore exert more influence over subsequent behavior than a variable with a
large effect on a rapidly decaying one. The eigenvectors identify which
measured variables constitute a single mode, and thus whether a set of recorded
variables represents that many influences or fewer.

Two of the three correspondences are exact. For any linear state-space model
the impulse response is **A**^(*k*−1)**B**, which expands as Σ*ⱼ* *cⱼ* λ*ⱼ*^(*k*−1);
the kernel of McDowell et al. (1992) is therefore a sum of exponentials whose
rates are the eigenvalues, a correspondence verified on fitted operators to
5 × 10⁻¹⁶. The model of Baum and Davison (2009) is the present formulation
restricted to a single state coordinate with a single real eigenvalue (1 − *w*)
on (0, 1), and is thus the rank-one case. The third correspondence, between
resistance to change and |λ| for the mode a disrupter excites, is proposed and
remains untested.

## Evidence From a Preliminary Study

A preliminary study fitted individual operators to 23 participants foraging
between two alternatives under an ABAB contingency reversal. The cue
coefficient reversed sign with the contingency in 21 of 23 participants, and
the spectrum of **A** remained within each participant's own same-operator
reference distribution in 23 of 23. The latter constitutes the invariance test
specified by McDowell et al. (1992). The scalar restriction imposed by the model
of Baum and Davison (2009) was violated by 23 of 23 participants when the
series was examined at a temporal resolution at which behavior varies.

That study does not address relative influence, because it manipulated a single
cue. With one manipulated variable there is no relative influence to estimate.
The dominant eigenvector loaded on proportion of responses to the left
alternative for 17 of 23 participants and on mean log inter-response time for
the remainder, and did not differ across conditions, which is the expected
outcome for a design in which nothing competes.

A discrete-trial procedure was also examined. Four compound stimulus dimensions
were arranged following Vyazovska et al. (2014), who reported approximately
equal attention across their four dimensions and stated that they could not
construct a null-hypothesis test for the attentional tradeoffs they observed.
Human participants reproduced the equality, for the reason the arrangement
produces it: when every dimension must match for reinforcement, each is equally
predictive. Rendering only a subset of dimensions relevant resolves this, and
the resulting static estimate of per-dimension control was validated against
constructed ground truth. However, four-alternative forced choice conveys
approximately two bits per trial, most of which is expended on whether the
correct alternative was selected, and the dynamics of control proved
unidentifiable: against agents constructed with attentional half-lives of 2, 8,
and 32 trials, the correct ordering was recovered on 8 of 10 runs only at 2,400
trials per participant, against a chance rate of one in six. A free-operant
procedure yields 375 to 1,329 state transitions in 20 min where forced choice
yields approximately 120 choices.

## The Present Study

Several environmental variables are manipulated within a free-operant
two-alternative procedure. The variables are imperfectly correlated with one
another: a stimulus uncorrelated with reinforcement acquires no discriminative
function, whereas a stimulus perfectly correlated with reinforcement rate
contributes no variance that rate does not already explain, and the
corresponding columns of **B** are unidentifiable. Imperfect correlation renders
each variable both predictive and separately estimable.

The critical requirement is that variables be arranged to differ in persistence
while matched in magnitude. An analysis based on the matching law or on log *d*,
having no representation of time, must return equivalent values for two such
variables. The spectrum returns different eigenvalues. This divergence,
computed on the same responses, constitutes the test.

The design further requires brief perturbations followed by recovery windows.
Eigenvalues are decay rates, and estimating them requires observing return from
a displacement rather than inferring it from steady-state performance. Such
windows are themselves measurements of resistance to change, and therefore
provide a test of the third correspondence noted above.

# Method

## Participants

Adults recruited through Prolific and restricted to desktop or laptop
computers. Participants who completed earlier studies in this program are
excluded by identifier. Sample size is fixed in advance at *n* = 15. The design
is single-subject; each effect is estimated and reported for each participant,
and *n* indexes the number of independent replications of a within-subject
result rather than the denominator of a group test.

## Apparatus and Display

The procedure is administered in the participant's browser. The display
comprises a dark neutral background, two identical light-gray response panels
arranged side by side, and a cumulative point counter. The panels are visually
indistinguishable from one another and remain so throughout the session except
when a momentary stimulus is scheduled. No feature of the display marks block
transitions, the state of the reinforcement schedule, or responses remaining,
so that no event other than those under experimental control can acquire a
discriminative function.

Responding is free-operant. A response consists of a click or tap on either
panel; there are no trials, no enforced inter-response interval, and no
programmed delays. A brief point indicator appears at the selected panel
immediately following each response, indicating a gain, a loss, or neither. In
a previous study employing this procedure, 23 participants emitted a median of
4,136 responses at 223 responses per minute (*IQR* = 185–242, range = 62–315).

## Reinforcement Schedule

Each response produces a point with a probability determined by the panel
selected and the current state of the schedule. Probabilities are properties of
the schedule state and are independent of the participant's recent allocation.
No alternative depletes and no interval accrues.

This constitutes a departure from the previous study in this program, which
employed depleting patches. Under depletion, allocation toward the richer
alternative reduces its yield, so responding returns toward indifference
irrespective of what the participant has learned. A decay rate estimated under
such a schedule is confounded with the restoring force of the schedule itself.
Because the present study concerns decay rates, the schedule is held constant
while behavior varies.

## Independent Variables

Three variables are manipulated.

#### Reinforcement Rate (V1; Unsignaled). The pair of reinforcement
probabilities associated with the two panels. In the neutral state both panels
deliver points with *p* = .25. In a biased state one panel delivers points with
*p* = .45 and the other with *p* = .10. The display does not change when this
variable changes; the current state is available only from the distribution of
obtained outcomes across responses.

#### Momentary Appetitive Stimulus (V2; Signaled). On scheduled responses, the
border of one panel changes to gold before the response is emitted and reverts
immediately thereafter. On that response only, the bordered panel delivers
points with *p* = .60 and the alternative with *p* = .05, superseding V1. The
gold border appears on the panel favored by V1 on 60% of occurrences and on the
alternative panel on 40%.

#### Momentary Aversive Stimulus (V3; Signaled). On scheduled responses, the
border of one panel changes to dark red under the same timing rules as V2. A
response to a red-bordered panel subtracts one point; a response to the
alternative panel is unaffected and produces points at the rate specified by V1.
The red border appears on the panel favored by V1 on 40% of occurrences and on
the alternative panel on 60%.

The partial correlations among V1, V2, and V3 are essential to identification
and are set deliberately. Congruence is arranged in opposite directions for the
appetitive and aversive stimuli so that the two are not collinear with each
other.

## Design

### Block Structure

The session is divided into blocks of 100 consecutive responses. V1 changes
state at each block boundary, alternating between a biased state and its
reversal, with the favored panel drawn subject to the constraint that
consecutive blocks differ. Block boundaries are not marked on the display.

Block length follows from measurement. In the previous study, an unsignaled
reversal of the reinforcement contingency produced a displacement in allocation
that reached maximum 16 to 23 responses after onset and returned to baseline by
24 to 32 responses. A block of 100 responses therefore contains the complete
transition together with approximately 68 subsequent responses at the new
steady state. Shorter blocks would yield additional transitions but would
terminate before allocation had stabilized, so that the magnitude of each shift
would be underestimated; longer blocks would estimate magnitudes more precisely
while yielding too few transitions to characterize their time course.

### Scheduling of Momentary Stimuli

V2 and V3 are scheduled on a variable-response schedule with a minimum
inter-stimulus interval of 15 responses and a mean of 20, drawn independently
for each stimulus type. The minimum interval is required for identification. If
momentary stimuli occurred at a fixed probability per response, successive
occurrences would fall within one another's recovery windows and lags beyond
the mean interval would be uninterpretable. The constraint guarantees that each
occurrence is followed by at least 15 responses free of further stimuli of that
type.

The constraint reduces the rate of momentary stimuli to approximately 5% of
responses, in place of the 20% that unconstrained scheduling would permit, so
that magnitude estimates for V2 and V3 rest on fewer observations. Because the
experimental question concerns decay rather than magnitude, precision is
sacrificed on the dimension on which the question does not depend.

### Perturbations

At scheduled points, V1 is reversed for exactly 8 responses and then restored,
with no accompanying change to the display. Each perturbation is followed by at
least 40 responses during which V1 is held constant and no momentary stimulus
of either type is scheduled, so that return is observed without further
disturbance. Perturbations are positioned to fall entirely within a block.

### Session Parameters

The procedure terminates after 2,400 responses or 28 min, whichever occurs
first. At the median response rate previously observed this corresponds to
approximately 11 min and 24 blocks; at the slowest rate previously observed, to
28 min and approximately 17 blocks. The number of blocks completed is recorded
and treated as a quantity of interest, because it bounds the number of
within-subject replications a participant contributes.

Participants receive fixed payment independent of points earned. Points serve
as feedback only, and this is stated in the instructions.

## Data Analysis

### Recorded Variables

One record per response comprises the panel selected, the outcome, the state of
V1, the presence and location of V2 or V3, the inter-response time, the block
index, the ordinal position of the response within its block, whether a
perturbation was in effect, and the number of responses since the most recent
perturbation offset. Every quantity described below is derivable from these
records without reference to a separate randomization file.

### State Vector and Operator Estimation

Let **x**(*t*) denote a vector of behavioral measures evaluated at response *t*
and **u**(*t*) the vector of environmental variables in effect. Operators are
estimated for each participant as

> **x**(*t* + 1) = **A x**(*t*) + **B u**(*t*) + **c**.

The state is constructed without aggregation into bins. In the previous study
the state comprised proportions computed over a window of responses, which
requires a window width, and that width was selected on a sampling-noise
criterion that argues only for wider windows. A window also functions as a
low-pass filter: at the width selected, an unconstrained operator predicted
held-out behavior no better than a scalar operator for 13 of 23 participants,
whereas at the narrowest width examined it did so for 23 of 23. In the present
study the state is a lag embedding of the response series, comprising the
recorded response-level measures over the preceding *k* responses, so that each
response contributes a transition. Embedding order *k* is selected for each
participant by held-out predictive likelihood.

Fits are evaluated as skill relative to a persistence baseline on temporally
held-out responses, 1 − *MSE*/*MSE*persistence, and not by within-sample fit.

### Analysis of Individual Transitions

Each block boundary constitutes a within-subject replication. For each boundary
the following are computed: the direction of change in allocation over the 32
responses following the boundary relative to the 32 preceding it, the magnitude
of that change, and whether the direction corresponds to the arrangement.
Results are reported for each participant as counts of replications, in the
form *k* of *m* boundaries exhibited the arranged effect, rather than as a mean
across boundaries, which would obscure a participant who reversed on half of
them.

Decay rates are estimated for each participant across that participant's
transitions, because a single transition of approximately 32 binary responses
does not support a reliable rate estimate.

### Primary Comparison

The hypothesis under test is that influence comprises two separable components,
magnitude and persistence, and that measures without a representation of time
conflate them.

Two quantities are estimated per participant for each of V1, V2, and V3. The
first is magnitude: the asymptotic displacement in allocation attributable to
the variable, obtained from the steady-state portion of blocks for V1 and from
the immediate response (lags 0 and 1) for V2 and V3. The second is persistence:
the decay of that displacement, obtained without reference to any model as the
profile of allocation at lags 1 through 15 following each momentary stimulus,
and at lags 1 through 40 following each perturbation offset.

The model-free decay profile serves as the criterion against which the
estimated operator is evaluated. The spectral prediction is that the eigenvalue
associated with the mode a variable drives corresponds to that variable's
measured decay; this correspondence is tested rather than assumed.

The critical comparison concerns variables matched in magnitude and differing
in persistence. The arranged effect of V2 terminates with the response on which
it occurs, whereas V1 must be integrated across responses to be detected. Any
influence of V2 at lag 1 or beyond therefore constitutes behavioral persistence
rather than continued arrangement. Where the estimated magnitudes of two
variables are statistically indistinguishable for a participant while their
measured decay profiles differ, an analysis based on the matching law and one
based on signal-detection theory must return equivalent values for both,
because neither represents time. The spectrum returns different eigenvalues.

### Comparison Measures

Sensitivity to reinforcement in the generalized matching law and log *d* for
each signaled stimulus are computed on the identical response series for each
participant. These constitute the established measures of relative influence
and are reported alongside the operator estimates rather than in place of them.

### Reference Distributions and Validation

No estimate is interpreted without a reference distribution computed from the
same participant's data. For operator invariance, the reference is the
distribution of spectral distances between two independent estimates of the
same operator at equal sample size. For eigenvector comparisons, the reference
is the same-operator cosine floor. For per-variable control, the reference is a
permutation that removes the identity of each variable while preserving the
choice structure and the participant's responses.

The complete analysis is validated against constructed ground truth before
application. The procedure's own code generates response sequences for agents
whose influence structure is fixed by construction, including agents whose
control is directed toward a variable carrying no information and agents whose
influence decays at specified rates, and the analysis is required to recover
the arrangement. This validation is repeated following any change to the
procedure, the recorded schema, or the estimator, and is required to fail when
a deliberately misspecified estimator is substituted.

# References

Baum, W. M. (2010). Dynamics of choice: A tutorial. *Journal of the Experimental Analysis of Behavior, 94*(2), 161–174. https://doi.org/10.1901/jeab.2010.94-161

Baum, W. M., & Davison, M. (2009). Modeling the dynamics of choice. *Behavioural Processes, 81*(2), 189–194. https://doi.org/10.1016/j.beproc.2009.01.005

Davison, M. (2018). Divided stimulus control: Which key did you peck, or what color was it? *Journal of the Experimental Analysis of Behavior, 109*(1), 107–124. https://doi.org/10.1002/jeab.295

Davison, M., & Elliffe, D. (2010). Divided stimulus control: A replication and a quantitative model. *Journal of the Experimental Analysis of Behavior, 94*(1), 13–23. https://doi.org/10.1901/jeab.2010.94-13

Davison, M., & Nevin, J. A. (1999). Stimuli, reinforcers, and behavior: An integration. *Journal of the Experimental Analysis of Behavior, 71*(3), 439–482. https://doi.org/10.1901/jeab.1999.71-439

Davison, M., & Tustin, R. D. (1978). The relation between the generalized matching law and signal-detection theory. *Journal of the Experimental Analysis of Behavior, 29*(2), 331–336. https://doi.org/10.1901/jeab.1978.29-331

Gomes-Ng, S., Austin, T., Bai, J. Y. H., Landon, J., & Cowie, S. (2026). Divided control by past behavior, present stimuli, and future outcome value in a concurrent-chains procedure. *Journal of the Experimental Analysis of Behavior, 125*, e70087. https://doi.org/10.1002/jeab.70087

Gomes-Ng, S., Cowie, S., & Elliffe, D. (2023). Divided stimulus control depends on differential and nondifferential reinforcement: Testing a quantitative model. *Journal of the Experimental Analysis of Behavior, 120*(3), 344–362. https://doi.org/10.1002/jeab.876

Gomes-Ng, S., Elliffe, D., & Cowie, S. (2026). Divided stimulus control depends on global, but not local, reinforcement contingencies. *Journal of the Experimental Analysis of Behavior, 126*(2), e70127. https://doi.org/10.1002/jeab.70127

McDowell, J. J, Bass, R., & Kessel, R. (1992). Applying linear systems analysis to dynamic behavior. *Journal of the Experimental Analysis of Behavior, 57*(3), 377–391. https://doi.org/10.1901/jeab.1992.57-377

Nevin, J. A. (1992). An integrative model for the study of behavioral momentum. *Journal of the Experimental Analysis of Behavior, 57*(3), 301–316. https://doi.org/10.1901/jeab.1992.57-301

Nevin, J. A., Davison, M., & Shahan, T. A. (2005). A theory of attending and reinforcement in conditional discriminations. *Journal of the Experimental Analysis of Behavior, 84*(2), 281–303. https://doi.org/10.1901/jeab.2005.97-04

Reynolds, G. S. (1961). Attention in the pigeon. *Journal of the Experimental Analysis of Behavior, 4*(3), 203–208. https://doi.org/10.1901/jeab.1961.4-203

Shahan, T. A., & Podlesnik, C. A. (2006). Divided attention performance and the matching law. *Learning & Behavior, 34*(3), 255–261. https://doi.org/10.3758/BF03192881

Vyazovska, O. V., Teng, Y., & Wasserman, E. A. (2014). Attentional tradeoffs in the pigeon. *Journal of the Experimental Analysis of Behavior, 101*(3), 337–354. https://doi.org/10.1002/jeab.84
