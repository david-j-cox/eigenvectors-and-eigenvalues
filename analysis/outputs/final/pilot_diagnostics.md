# Pilot diagnostics

Events: `data/final_events.csv`  
Participants: 13  
State: choice_prop_A, reward_rate, switch_rate in 10-response bins

## Acceptance checks

| Check | Value | Result | Target |
|---|---|---|---|
| Transitions per color x contingency cell | 72.000 | PASS | >= 40 (operator estimation) |
| Minimum in any cell | 72.000 | PASS | the weakest cell is what the design can claim |
| Transitions per cell x stage | 36.000 | PASS | half the pooled figure (replication comparison) |
| Median responses per second | 3.718 | PASS | >= 1.2 |
| Median session minutes | 19.094 | PASS | <= 32 |
| Reinforcers per state bin | 4.077 | PASS | >= 2 |
| Median switch rate | 0.077 | PASS | 0.02-0.45 |
| Participants beating persistence | 1.000 | PASS | >= 70% |
| Noise ratio: P(A) | 0.062 | PASS | <= 0.6 |
| Noise ratio: reward rate | 0.306 | PASS | <= 0.6 |
| Noise ratio: switch rate | 0.419 | PASS | <= 0.6 |

A failed noise-ratio check means that coordinate is measured mostly as sampling noise at this bin size, so its column of the operator is attenuated and its eigenvector loading cannot be interpreted.

## Individual operators

- Participants fitted: 13 / 13
- Held-out skill vs persistence (A_i): 0.489 [0.423, 0.540]
- Spectral radius: 0.292 [0.163, 0.502]
- Complex dominant pair: 38% of participants

## Replication across stages (same color, same contingency)

- Comparisons: 52
- Dominant-eigenvector |cos|: 0.593 [0.217, 0.787]
- Early operator predicting late stage, skill: 0.503 (92% positive)

Compare the |cos| value against the same-operator floor in `reanalysis/outputs/design_replication_floor_bin10.csv` at this number of transitions. Similarity below the floor is estimation noise, not replication.

## Physical context vs functional contingency

| Comparison | Median dominant \|cos\| |
|---|---|
| diff_color_same_contingency | 0.746 |
| same_color_diff_contingency | 0.603 |

Participants whose dynamics follow the contingency rather than the color: 77%

Both comparisons are matched on elapsed time by construction, so a difference between them cannot be explained by one pair of estimates simply being closer together in the session.

## Perturbation readiness

- Perturbations delivered: 104 (8 per participant)
- Median recovery bins after offset: 10
- Perturbations with at least 3 recovery bins: 100%
- Reinforcers delivered during extinction: 0 (must be 0)
