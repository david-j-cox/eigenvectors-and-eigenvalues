# State selection for the new task

Events: `data/final_events.csv`  
Bin: 10 responses. AUC for separating same-operator from different-operator pairs, median across participants.

| n_transitions | 2D_choice_reward | 2D_choice_switch | 3D_no_ici | 3D_no_switch | 4D_full |
|---|---|---|---|---|---|
| 15.000 | 0.556 | 0.526 | 0.544 | 0.534 | 0.539 |
| 20.000 | 0.587 | 0.537 | 0.558 | 0.568 | 0.561 |
| 30.000 | 0.633 | 0.539 | 0.599 | 0.638 | 0.596 |
| 36.000 | 0.677 | 0.538 | 0.625 | 0.628 | 0.628 |
| 50.000 | 0.704 | 0.533 | 0.702 | 0.672 | 0.669 |
| 80.000 | 0.819 | 0.564 | 0.762 | 0.718 | 0.758 |

At the 36 transitions per cell the design delivers, the best state is **2D_choice_reward**.

## Sampling noise per coordinate

| coordinate | noise_ratio |
|---|---|
| choice_prop_A | 0.062 |
| mean_log_ici | 0.100 |
| reward_rate | 0.353 |
| switch_rate | 0.737 |

Noise ratio alone does not decide inclusion. A coordinate can be noisy and still earn its place by carrying context-discriminative variance, and a quiet coordinate can hurt by loading similarly in every context and diluting the differences under test.
