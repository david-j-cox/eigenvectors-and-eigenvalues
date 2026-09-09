# Pilot diagnostics

Events: `data/sim_depletion.csv`  
Participants: 10  
State: choice_prop_A, reward_rate, switch_rate in 10-response bins

## Acceptance checks

| Check | Value | Result | Target |
|---|---|---|---|
| Median transitions per analysis cell | 36.000 | PASS | >= 30 |
| Minimum transitions in any cell | 36.000 | PASS | no cell far below the median |
| Median responses per second | 2.175 | PASS | >= 1.2 |
| Median session minutes | 26.511 | PASS | <= 32.0 |
| Reinforcers per state bin | 2.146 | PASS | >= 1.5 |
| Median switch rate | 0.106 | PASS | 0.02-0.45 |
| Participants beating persistence | 1.000 | PASS | >= 70% |
| Noise ratio: P(A) | 0.074 | PASS | <= 0.6 |
| Noise ratio: reward rate | 0.682 | FAIL | <= 0.6 |
| Noise ratio: switch rate | 0.330 | PASS | <= 0.6 |

A failed noise-ratio check means that coordinate is measured mostly as sampling noise at this bin size, so its column of the operator is attenuated and its eigenvector loading cannot be interpreted.

## Individual operators

- Participants fitted: 10 / 10
- Held-out skill vs persistence (A_i): 0.408 [0.389, 0.412]
- Spectral radius: 0.560 [0.539, 0.616]
- Complex dominant pair: 50% of participants

## Stage 1 vs stage 3 replication (same colour, same contingency)

- Comparisons: 20
- Dominant-eigenvector |cos|: 0.896 [0.827, 0.946]
- Early operator predicting late stage, skill: 0.352 (100% positive)

Compare the |cos| value against the same-operator floor in `reanalysis/outputs/design_replication_floor_bin10.csv` at this number of transitions. Similarity below the floor is estimation noise, not replication.

## Physical context vs functional contingency

| Comparison | Median dominant \|cos\| |
|---|---|
| diff_color_same_contingency | 0.883 |
| same_color_diff_contingency | 0.343 |

Participants whose dynamics follow the contingency rather than the colour: 80%

Both comparisons are matched on elapsed time by construction, so a difference between them cannot be explained by one pair of estimates simply being closer together in the session.

## Perturbation readiness

- Perturbations delivered: 80 (8 per participant)
- Median recovery bins after offset: 10
- Perturbations with at least 3 recovery bins: 100%
- Reinforcers delivered during extinction: 0 (must be 0)
