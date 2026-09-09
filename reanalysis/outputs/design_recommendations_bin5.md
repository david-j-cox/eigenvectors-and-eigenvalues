# Design parameters implied by the existing data

State bin: 5 responses. Simulation grounded in 20 participants' own operators, process noise, and measurement noise.

## 1. The replication noise floor

Two independent estimates of the **same** operator, at each sample size. Any observed early-vs-late similarity must beat these values before it counts as evidence of a reproducible mode.

| n_transitions | same_operator_cosine_median | same_operator_cosine_p05 | cosine_to_truth_median | rho_abs_error_median | rho_bias | frac_rho_within_0.05 |
|---|---|---|---|---|---|---|
| 10.000 | 0.417 | 0.046 | 0.397 | 0.132 | 0.131 | 0.193 |
| 15.000 | 0.488 | 0.049 | 0.470 | 0.104 | 0.060 | 0.260 |
| 20.000 | 0.490 | 0.053 | 0.516 | 0.092 | 0.019 | 0.273 |
| 30.000 | 0.500 | 0.057 | 0.656 | 0.083 | -0.025 | 0.300 |
| 40.000 | 0.548 | 0.058 | 0.675 | 0.085 | -0.047 | 0.292 |
| 60.000 | 0.651 | 0.066 | 0.805 | 0.080 | -0.065 | 0.313 |
| 80.000 | 0.715 | 0.080 | 0.862 | 0.091 | -0.077 | 0.305 |
| 120.000 | 0.834 | 0.104 | 0.924 | 0.085 | -0.085 | 0.328 |

**Observed in the existing dataset:** early-vs-late dominant |cos| = **0.507** at a median of 11 transitions per half.

**Floor at that sample size:** 0.417 (5th percentile 0.046).

The observed value exceeds the floor, so there is replication signal in the existing data beyond estimation noise.

## 2. Can the test tell same from different?

AUC of the dominant-eigenvector cosine separating same-operator pairs from different-operator pairs, using each participant's two most dissimilar context operators as the 'different' case.

| n_transitions | same_cosine_median | diff_cosine_median | auc |
|---|---|---|---|
| 10.000 | 0.436 | 0.434 | 0.516 |
| 15.000 | 0.457 | 0.432 | 0.525 |
| 20.000 | 0.472 | 0.433 | 0.534 |
| 30.000 | 0.496 | 0.419 | 0.572 |
| 40.000 | 0.542 | 0.427 | 0.596 |
| 60.000 | 0.638 | 0.425 | 0.648 |
| 80.000 | 0.709 | 0.411 | 0.679 |
| 120.000 | 0.799 | 0.373 | 0.748 |

## 3. Prospective recovery forecasting

Operator estimated from pre-perturbation transitions only, then used to forecast the decay of an imposed displacement. Skill is relative to assuming the perturbation does not decay.

| n_pre_transitions | recovery_forecast_skill_median | frac_skill_positive | half_life_abs_error_median |
|---|---|---|---|
| 10.000 | 0.580 | 0.923 | 0.524 |
| 15.000 | 0.654 | 0.972 | 0.305 |
| 20.000 | 0.693 | 0.975 | 0.252 |
| 30.000 | 0.715 | 0.977 | 0.233 |
| 40.000 | 0.736 | 0.982 | 0.228 |
| 60.000 | 0.737 | 0.982 | 0.218 |
| 80.000 | 0.755 | 0.983 | 0.225 |
| 120.000 | 0.760 | 0.980 | 0.214 |

## 4. Response budget

| Requirement | Transitions needed | Responses per context exposure |
|---|---|---|
| Replication floor reaches |cos| >= 0.85 | not reached in grid | - |
| Same-vs-different AUC >= 0.8 | not reached in grid | - |
| Recovery forecast positive in >= 80% of cases | 10 | 55 |

Responses per exposure are the total across all exposures to that context, since exposures to the same context pool into one operator estimate. Divide by the number of exposures to size an individual block.
