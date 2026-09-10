# State selection for the new task

Events: `data/sim_patch.csv`  
Bin: 10 responses. AUC for separating same-operator from different-operator pairs, median across participants.

| n_transitions | 2D_choice_reward | 2D_choice_switch | 3D_no_ici | 3D_no_switch | 4D_full |
|---|---|---|---|---|---|
| 15.000 | 0.512 | 0.535 | 0.522 | 0.499 | 0.508 |
| 20.000 | 0.520 | 0.554 | 0.496 | 0.549 | 0.508 |
| 30.000 | 0.554 | 0.621 | 0.550 | 0.547 | 0.564 |
| 36.000 | 0.577 | 0.641 | 0.557 | 0.560 | 0.568 |
| 50.000 | 0.619 | 0.728 | 0.608 | 0.592 | 0.613 |
| 80.000 | 0.650 | 0.832 | 0.617 | 0.627 | 0.681 |

At the 36 transitions per cell the design delivers, the best state is **2D_choice_switch**.

## Sampling noise per coordinate

| coordinate | noise_ratio |
|---|---|
| choice_prop_A | 0.089 |
| mean_log_ici | 0.100 |
| reward_rate | 0.273 |
| switch_rate | 0.535 |

Noise ratio alone does not decide inclusion. A coordinate can be noisy and still earn its place by carrying context-discriminative variance, and a quiet coordinate can hurt by loading similarly in every context and diluting the differences under test.
