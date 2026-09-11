# State selection for the new task

Events: `data/final_events.csv`  
Bin: 10 responses. AUC for separating same-operator from different-operator pairs, median across participants.

| n_transitions | 2D_choice_reward | 2D_choice_switch | 3D_no_ici | 3D_no_switch | 4D_full |
|---|---|---|---|---|---|
| 15.000 | 0.568 | 0.534 | 0.601 | 0.566 | 0.541 |
| 20.000 | 0.579 | 0.541 | 0.607 | 0.599 | 0.535 |
| 30.000 | 0.618 | 0.555 | 0.670 | 0.618 | 0.609 |
| 36.000 | 0.646 | 0.559 | 0.693 | 0.648 | 0.651 |
| 50.000 | 0.686 | 0.616 | 0.737 | 0.674 | 0.651 |
| 80.000 | 0.792 | 0.646 | 0.810 | 0.832 | 0.795 |

At the 36 transitions per cell the design delivers, the best state is **3D_no_ici**.

## Sampling noise per coordinate

| coordinate | noise_ratio |
|---|---|
| choice_prop_A | 0.060 |
| mean_log_ici | 0.100 |
| reward_rate | 0.351 |
| switch_rate | 0.590 |

Noise ratio alone does not decide inclusion. A coordinate can be noisy and still earn its place by carrying context-discriminative variance, and a quiet coordinate can hurt by loading similarly in every context and diluting the differences under test.
