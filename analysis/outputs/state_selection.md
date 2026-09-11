# State selection for the new task

Events: `data/pilot3_events.csv`  
Bin: 10 responses. AUC for separating same-operator from different-operator pairs, median across participants.

| n_transitions | 2D_choice_reward | 2D_choice_switch | 3D_no_ici | 3D_no_switch | 4D_full |
|---|---|---|---|---|---|
| 15.000 | 0.687 | 0.591 | 0.617 | 0.540 | 0.508 |
| 20.000 | 0.726 | 0.593 | 0.630 | 0.548 | 0.512 |
| 30.000 | 0.796 | 0.614 | 0.644 | 0.563 | 0.589 |
| 36.000 | 0.850 | 0.628 | 0.667 | 0.614 | 0.594 |
| 50.000 | 0.885 | 0.621 | 0.712 | 0.677 | 0.617 |
| 80.000 | 0.907 | 0.679 | 0.778 | 0.830 | 0.778 |

At the 36 transitions per cell the design delivers, the best state is **2D_choice_reward**.

## Sampling noise per coordinate

| coordinate | noise_ratio |
|---|---|
| choice_prop_A | 0.048 |
| mean_log_ici | 0.100 |
| reward_rate | 0.291 |
| switch_rate | 0.988 |

Noise ratio alone does not decide inclusion. A coordinate can be noisy and still earn its place by carrying context-discriminative variance, and a quiet coordinate can hurt by loading similarly in every context and diluting the differences under test.
