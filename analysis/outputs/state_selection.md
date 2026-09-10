# State selection for the new task

Events: `data/sim_calibrated.csv`  
Bin: 10 responses. AUC for separating same-operator from different-operator pairs, median across participants.

| n_transitions | 2D_choice_reward | 2D_choice_switch | 3D_no_ici | 3D_no_switch | 4D_full |
|---|---|---|---|---|---|
| 15.000 | 0.521 | 0.509 | 0.505 | 0.529 | 0.516 |
| 20.000 | 0.505 | 0.518 | 0.521 | 0.528 | 0.533 |
| 30.000 | 0.550 | 0.567 | 0.516 | 0.550 | 0.527 |
| 36.000 | 0.557 | 0.572 | 0.595 | 0.574 | 0.551 |
| 50.000 | 0.568 | 0.615 | 0.632 | 0.589 | 0.603 |
| 80.000 | 0.623 | 0.742 | 0.701 | 0.633 | 0.665 |

At the 36 transitions per cell the design delivers, the best state is **3D_no_ici**.

## Sampling noise per coordinate

| coordinate | noise_ratio |
|---|---|
| choice_prop_A | 0.144 |
| mean_log_ici | 0.100 |
| reward_rate | 0.917 |
| switch_rate | 0.685 |

Noise ratio alone does not decide inclusion. A coordinate can be noisy and still earn its place by carrying context-discriminative variance, and a quiet coordinate can hurt by loading similarly in every context and diluting the differences under test.
