# Design parameters implied by the existing data

State bin: 10 responses. Simulation grounded in 20 participants' own operators, process noise, and measurement noise.

## 1. The replication noise floor

Two independent estimates of the **same** operator, at each sample size. Any observed early-vs-late similarity must beat these values before it counts as evidence of a reproducible mode.

| n_transitions | same_operator_cosine_median | same_operator_cosine_p05 | cosine_to_truth_median | rho_abs_error_median | rho_bias | frac_rho_within_0.05 |
|---|---|---|---|---|---|---|
| 10.000 | 0.496 | 0.052 | 0.581 | 0.120 | 0.088 | 0.207 |
| 15.000 | 0.552 | 0.053 | 0.710 | 0.108 | 0.026 | 0.245 |
| 20.000 | 0.565 | 0.062 | 0.742 | 0.100 | -0.009 | 0.245 |
| 30.000 | 0.617 | 0.072 | 0.822 | 0.093 | -0.033 | 0.280 |
| 40.000 | 0.735 | 0.087 | 0.839 | 0.093 | -0.049 | 0.270 |
| 60.000 | 0.804 | 0.110 | 0.899 | 0.086 | -0.060 | 0.307 |
| 80.000 | 0.838 | 0.150 | 0.945 | 0.083 | -0.069 | 0.322 |
| 120.000 | 0.885 | 0.257 | 0.962 | 0.073 | -0.074 | 0.342 |

**Observed in the existing dataset:** early-vs-late dominant |cos| = **0.507** at a median of 11 transitions per half.

**Floor at that sample size:** 0.496 (5th percentile 0.052).

The observed value sits +0.011 from the floor. A margin this small is not evidence of a reproducible context-specific mode: at this sample size two estimates of the same operator and two estimates of genuinely different operators are barely separable, as the discrimination table below shows. This is a sample-size limitation rather than a negative result, and it is the specific problem the new design has to solve.

## 2. Can the test tell same from different?

AUC of the dominant-eigenvector cosine separating same-operator pairs from different-operator pairs, using each participant's two most dissimilar context operators as the 'different' case.

| n_transitions | same_cosine_median | diff_cosine_median | auc |
|---|---|---|---|
| 10.000 | 0.518 | 0.439 | 0.560 |
| 15.000 | 0.545 | 0.430 | 0.589 |
| 20.000 | 0.580 | 0.430 | 0.631 |
| 30.000 | 0.634 | 0.403 | 0.668 |
| 40.000 | 0.724 | 0.382 | 0.736 |
| 60.000 | 0.779 | 0.366 | 0.792 |
| 80.000 | 0.822 | 0.347 | 0.859 |
| 120.000 | 0.891 | 0.324 | 0.899 |

## 3. Prospective recovery forecasting

Operator estimated from pre-perturbation transitions only, then used to forecast the decay of an imposed displacement. Skill is relative to assuming the perturbation does not decay.

| n_pre_transitions | recovery_forecast_skill_median | frac_skill_positive | half_life_abs_error_median |
|---|---|---|---|
| 10.000 | 0.610 | 0.952 | 0.613 |
| 15.000 | 0.666 | 0.965 | 0.439 |
| 20.000 | 0.697 | 0.982 | 0.396 |
| 30.000 | 0.722 | 0.985 | 0.309 |
| 40.000 | 0.738 | 0.988 | 0.316 |
| 60.000 | 0.753 | 0.990 | 0.298 |
| 80.000 | 0.752 | 0.990 | 0.277 |
| 120.000 | 0.764 | 0.990 | 0.265 |

## 4. Response budget

| Requirement | Transitions needed | Responses per context exposure |
|---|---|---|
| Replication floor reaches |cos| >= 0.85 | 120 | 1210 |
| Same-vs-different AUC >= 0.8 | 80 | 810 |
| Recovery forecast positive in >= 80% of cases | 10 | 110 |

Responses per exposure are the total across all exposures to that context, since exposures to the same context pool into one operator estimate. Divide by the number of exposures to size an individual block.
