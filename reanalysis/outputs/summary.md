# Phase 0 reanalysis: individual-level dynamics in the existing dataset

Participants profiled: **60**  
State: 4-D, non-overlapping 10-response bins within context  
Within-context transitions per participant: **92** (min 25, max 120)

All values are median [IQR] across participants.

## 1. Does an individual's earlier behaviour predict their own later behaviour?

Skill is 1 - MSE/MSE_persistence on strictly later transitions in each context.

| Architecture | Held-out skill vs persistence | Participants better than persistence |
|---|---|---|
| A_i | 0.291 [0.199, 0.431] | 92% |
| A_i + B_i u_t | 0.343 [0.225, 0.466] | 93% |
| A_{i,c} | 0.357 [0.200, 0.483] | 90% |

Best architecture by held-out MSE: DMDc 50%, A_ic 42%, A_i 8%

## 2. Eigensystem of the individual operator

- Spectral radius (raw ridge estimate): 0.656 [0.550, 0.766]
- Corrected for short-sample bias: 0.696 [0.560, 0.816]
- Corrected for state measurement noise: 0.898 [0.789, 1.040] (57% of participants correctable)
- Dominant-mode half-life: 1.65 [1.16, 2.61] state bins
- Complex (oscillatory) dominant pair: 37% of participants

Dominant feature of the leading eigenvector: reward rate 73%, mean log ICI 15%, switch rate 7%, P(A) 5%

### Eigenvector stability (moving-block bootstrap)

- Median |cos| between bootstrap and point-estimate dominant vector: 0.957 [0.906, 0.975]
- Participants with stability >= 0.9: 78%
- Participants with stability >= 0.7: 97%

### Sampling noise in each state coordinate

Ratio of within-bin sampling-noise variance to total between-bin variance. A coordinate above ~0.5 is more noise than signal at this bin size and its operator column is strongly attenuated.

| Coordinate | noise / total variance |
|---|---|
| P(A) | 0.265 [0.142, 0.405] |
| reward rate | 0.231 [0.166, 0.293] |
| switch rate | 0.574 [0.232, 1.355] |
| mean log ICI | 0.100 [0.100, 0.100] |

## 3. Does an operator replicate within the same context?

Each context's transitions were split into an early and a late half. This is the closest analogue in this dataset to the repeated-exposure replication test the new study is designed to run.

- Comparisons available: 233 (median 4 per participant)
- Transitions per half: 11 [10, 12] early, 12 [11, 13] late
- Dominant-eigenvector |cos| early vs late: 0.507 [0.214, 0.742]
- Top-2 subspace mean principal angle: 44.8 [30.7, 59.8] deg
- |rho_early - rho_late|: 0.106 [0.057, 0.188]
- Early operator predicting late half, skill vs persistence: 0.342 [0.116, 0.481] (80% of comparisons positive)

**These are the numbers the new design has to beat.** An observed early/late similarity is only evidence of a reproducible mode if it exceeds what two estimates of the *same* operator produce at the same sample size. That noise floor is computed in `design_simulation.py`.

## 4. Do operators differ across contexts within a participant?

- Cross-context dominant |cos|: 0.384 [0.191, 0.666]
- Cross-context top-2 mean angle: 45.0 [31.7, 59.5] deg

Compare against the within-context early/late values in section 3: if cross-context similarity is not clearly lower than within-context replication, the context-specific operator is not yet distinguishable from estimation noise.

## 5. Multi-step forecast degradation

| Horizon (bins) | Skill vs persistence |
|---|---|
| 1 | 0.268 [0.181, 0.420] |
| 2 | 0.256 [0.106, 0.350] |
| 5 | 0.157 [-0.188, 0.383] |
| 10 | n/a |

## 6. Bin-size sensitivity

| bin_clicks | transitions_per_participant | median_skill_A_i | frac_beating_persistence | median_spectral_radius | median_eigvec_stability | median_early_late_cosine | frac_switch_rate_noise |
|---|---|---|---|---|---|---|---|
| 5.000 | 188.500 | 0.378 | 0.950 | 0.612 | 0.962 | 0.487 | 0.650 |
| 10.000 | 92.500 | 0.291 | 0.917 | 0.656 | 0.957 | 0.507 | 0.574 |
| 20.000 | 44.500 | 0.222 | 0.857 | 0.705 | 0.934 | 0.464 | 0.420 |
