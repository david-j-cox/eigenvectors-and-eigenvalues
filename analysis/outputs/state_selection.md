# State selection for the new task

Events: `data/pilot_events.csv`  
Bin: 10 responses. AUC for separating same-operator from different-operator pairs, median across participants.

| n_transitions | 2D_choice_reward | 2D_choice_switch | 3D_no_ici | 3D_no_switch | 4D_full |
|---|---|---|---|---|---|
| 15.000 | 0.536 | 0.574 | 0.607 | 0.592 | 0.583 |
| 20.000 | 0.516 | 0.596 | 0.662 | 0.591 | 0.675 |
| 30.000 | 0.533 | 0.666 | 0.797 | 0.648 | 0.754 |
| 36.000 | 0.593 | 0.695 | 0.830 | 0.702 | 0.874 |
| 50.000 | 0.581 | 0.770 | 0.938 | 0.764 | 0.906 |
| 80.000 | 0.718 | 0.787 | 0.976 | 0.897 | 0.969 |

At the 36 transitions per cell the design delivers, the best state is **4D_full**.

## Sampling noise per coordinate

| coordinate | noise_ratio |
|---|---|
| choice_prop_A | 0.074 |
| mean_log_ici | 0.100 |
| reward_rate | 0.340 |
| switch_rate | 1.282 |

Noise ratio alone does not decide inclusion. A coordinate can be noisy and still earn its place by carrying context-discriminative variance, and a quiet coordinate can hurt by loading similarly in every context and diluting the differences under test.
