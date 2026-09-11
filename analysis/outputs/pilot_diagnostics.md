# Pilot diagnostics

Events: `data/pilot_events.csv`  
Participants: 3  
State: choice_prop_A, reward_rate, switch_rate in 10-response bins

## Acceptance checks

| Check | Value | Result | Target |
|---|---|---|---|
| Transitions per color x contingency cell | 72.000 | PASS | >= 40 (operator estimation) |
| Minimum in any cell | 19.000 | FAIL | the weakest cell is what the design can claim |
| Transitions per cell x stage | 36.000 | PASS | half the pooled figure (replication comparison) |
| Median responses per second | 3.398 | PASS | >= 1.2 |
| Median session minutes | 20.893 | PASS | <= 32 |
| Reinforcers per state bin | 2.092 | PASS | >= 2 |
| Median switch rate | 0.082 | PASS | 0.02-0.45 |
| Participants beating persistence | 1.000 | PASS | >= 70% |
| Noise ratio: P(A) | 0.078 | PASS | <= 0.6 |
| Noise ratio: reward rate | 0.265 | PASS | <= 0.6 |
| Noise ratio: switch rate | 0.949 | FAIL | <= 0.6 |

A failed noise-ratio check means that coordinate is measured mostly as sampling noise at this bin size, so its column of the operator is attenuated and its eigenvector loading cannot be interpreted.

## Individual operators

- Participants fitted: 3 / 3
- Held-out skill vs persistence (A_i): 0.278 [0.273, 0.401]
- Spectral radius: 0.315 [0.205, 0.458]
- Complex dominant pair: 0% of participants

## Replication across stages (same color, same contingency)

- Comparisons: 12
- Dominant-eigenvector |cos|: 0.504 [0.249, 0.718]
- Early operator predicting late stage, skill: 0.532 (100% positive)

Compare the |cos| value against the same-operator floor in `reanalysis/outputs/design_replication_floor_bin10.csv` at this number of transitions. Similarity below the floor is estimation noise, not replication.

## Physical context vs functional contingency

| Comparison | Median dominant \|cos\| |
|---|---|
| diff_color_same_contingency | 0.698 |
| same_color_diff_contingency | 0.568 |

Participants whose dynamics follow the contingency rather than the color: 67%

Both comparisons are matched on elapsed time by construction, so a difference between them cannot be explained by one pair of estimates simply being closer together in the session.

## Perturbation readiness

- Perturbations delivered: 16 (8 per participant)
- Median recovery bins after offset: 10
- Perturbations with at least 3 recovery bins: 100%
- Reinforcers delivered during extinction: 0 (must be 0)
