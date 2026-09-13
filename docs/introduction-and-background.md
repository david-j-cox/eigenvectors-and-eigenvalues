# Measuring the relative influence of multiple variables on behavior

*Introduction and background. Drafted 13 September 2026.*

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
