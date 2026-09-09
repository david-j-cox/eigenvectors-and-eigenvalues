# State selection for the new task

Events: `/Users/davidjcox/Documents/ResearchRepos/artificial-organisms/BehavioralDynamics/eigenvectors-and-eigenvalues/analysis/data/sim_stationary.csv`  
Bin: 10 responses. AUC for separating same-operator from different-operator pairs, median across participants.

| n_transitions | 2D_choice_reward | 2D_choice_switch | 3D_no_ici | 3D_no_switch | 4D_full |
|---|---|---|---|---|---|
| 15.000 | 0.663 | 0.582 | 0.603 | 0.510 | 0.510 |
| 20.000 | 0.662 | 0.616 | 0.595 | 0.584 | 0.552 |
| 30.000 | 0.829 | 0.734 | 0.693 | 0.660 | 0.605 |
| 36.000 | 0.863 | 0.713 | 0.772 | 0.737 | 0.661 |
| 50.000 | 0.950 | 0.848 | 0.815 | 0.816 | 0.734 |
| 80.000 | 0.990 | 0.949 | 0.903 | 0.820 | 0.801 |

At the 36 transitions per cell the design delivers, the best state is **2D_choice_reward**.

## Sampling noise per coordinate

| coordinate | noise_ratio |
|---|---|
| choice_prop_A | 0.054 |
| mean_log_ici | 0.100 |
| reward_rate | 0.710 |
| switch_rate | 0.590 |

Noise ratio alone does not decide inclusion. A coordinate can be noisy and still earn its place by carrying context-discriminative variance, and a quiet coordinate can hurt by loading similarly in every context and diluting the differences under test.
