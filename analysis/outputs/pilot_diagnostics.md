# Pilot diagnostics

Events: `data/sim_calibrated.csv`  
Participants: 20  
State: choice_prop_A, reward_rate, switch_rate in 10-response bins

## Acceptance checks

| Check | Value | Result | Target |
|---|---|---|---|
| Median transitions per analysis cell | 45.000 | PASS | >= 40 |
| Minimum transitions in any cell | 45.000 | PASS | no cell far below the median |
| Median responses per second | 2.732 | PASS | >= 1.2 |
| Median session minutes | 24.768 | PASS | <= 32 |
| Reinforcers per state bin | 1.839 | FAIL | >= 2 |
| Median switch rate | 0.232 | PASS | 0.02-0.45 |
| Participants beating persistence | 1.000 | PASS | >= 70% |
| Noise ratio: P(A) | 0.124 | PASS | <= 0.6 |
| Noise ratio: reward rate | 0.761 | FAIL | <= 0.6 |
| Noise ratio: switch rate | 0.369 | PASS | <= 0.6 |

A failed noise-ratio check means that coordinate is measured mostly as sampling noise at this bin size, so its column of the operator is attenuated and its eigenvector loading cannot be interpreted.

## Individual operators

- Participants fitted: 20 / 20
- Held-out skill vs persistence (A_i): 0.435 [0.404, 0.462]
- Spectral radius: 0.399 [0.343, 0.491]
- Complex dominant pair: 55% of participants

## Stage 1 vs stage 3 replication (same colour, same contingency)

- Comparisons: 40
- Dominant-eigenvector |cos|: 0.532 [0.341, 0.848]
- Early operator predicting late stage, skill: 0.410 (100% positive)

Compare the |cos| value against the same-operator floor in `reanalysis/outputs/design_replication_floor_bin10.csv` at this number of transitions. Similarity below the floor is estimation noise, not replication.

## Physical context vs functional contingency

| Comparison | Median dominant \|cos\| |
|---|---|
| diff_color_same_contingency | 0.757 |
| same_color_diff_contingency | 0.574 |

Participants whose dynamics follow the contingency rather than the colour: 60%

Both comparisons are matched on elapsed time by construction, so a difference between them cannot be explained by one pair of estimates simply being closer together in the session.

## Perturbation readiness

- Perturbations delivered: 160 (8 per participant)
- Median recovery bins after offset: 10
- Perturbations with at least 3 recovery bins: 100%
- Reinforcers delivered during extinction: 0 (must be 0)
