# Pilot diagnostics

Events: `data/sim_calibrated.csv`  
Participants: 20  
State: choice_prop_A, reward_rate, switch_rate in 10-response bins

## Acceptance checks

| Check | Value | Result | Target |
|---|---|---|---|
| Transitions per colour x contingency cell | 72.000 | PASS | >= 40 (operator estimation) |
| Minimum in any cell | 72.000 | PASS | the weakest cell is what the design can claim |
| Transitions per cell x stage | 36.000 | PASS | half the pooled figure (replication comparison) |
| Median responses per second | 2.794 | PASS | >= 1.2 |
| Median session minutes | 25.409 | PASS | <= 32 |
| Reinforcers per state bin | 1.730 | FAIL | >= 2 |
| Median switch rate | 0.182 | PASS | 0.02-0.45 |
| Participants beating persistence | 1.000 | PASS | >= 70% |
| Noise ratio: P(A) | 0.111 | PASS | <= 0.6 |
| Noise ratio: reward rate | 0.858 | FAIL | <= 0.6 |
| Noise ratio: switch rate | 0.354 | PASS | <= 0.6 |

A failed noise-ratio check means that coordinate is measured mostly as sampling noise at this bin size, so its column of the operator is attenuated and its eigenvector loading cannot be interpreted.

## Individual operators

- Participants fitted: 20 / 20
- Held-out skill vs persistence (A_i): 0.432 [0.407, 0.463]
- Spectral radius: 0.399 [0.354, 0.506]
- Complex dominant pair: 60% of participants

## Replication across stages (same colour, same contingency)

- Comparisons: 80
- Dominant-eigenvector |cos|: 0.513 [0.299, 0.797]
- Early operator predicting late stage, skill: 0.412 (99% positive)

Compare the |cos| value against the same-operator floor in `reanalysis/outputs/design_replication_floor_bin10.csv` at this number of transitions. Similarity below the floor is estimation noise, not replication.

## Physical context vs functional contingency

| Comparison | Median dominant \|cos\| |
|---|---|
| diff_color_same_contingency | 0.513 |
| same_color_diff_contingency | 0.478 |

Participants whose dynamics follow the contingency rather than the colour: 65%

Both comparisons are matched on elapsed time by construction, so a difference between them cannot be explained by one pair of estimates simply being closer together in the session.

## Perturbation readiness

- Perturbations delivered: 160 (8 per participant)
- Median recovery bins after offset: 10
- Perturbations with at least 3 recovery bins: 100%
- Reinforcers delivered during extinction: 0 (must be 0)
