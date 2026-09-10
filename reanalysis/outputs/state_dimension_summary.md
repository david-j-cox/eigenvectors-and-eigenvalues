# Does the state vector need all four coordinates?

State bin: 10 responses. AUC for distinguishing same-operator from different-operator pairs, median across 15 participants.

| n_transitions | 2D_choice_reward | 2D_choice_switch | 3D_no_ici | 3D_no_reward | 3D_no_switch | 4D_full |
|---|---|---|---|---|---|---|
| 10.000 | 0.511 | 0.514 | 0.547 | 0.496 | 0.499 | 0.557 |
| 15.000 | 0.528 | 0.522 | 0.567 | 0.524 | 0.516 | 0.568 |
| 20.000 | 0.524 | 0.543 | 0.620 | 0.510 | 0.529 | 0.607 |
| 30.000 | 0.528 | 0.614 | 0.709 | 0.553 | 0.561 | 0.647 |
| 40.000 | 0.567 | 0.618 | 0.744 | 0.565 | 0.609 | 0.675 |
| 60.000 | 0.604 | 0.681 | 0.823 | 0.605 | 0.617 | 0.750 |
| 80.000 | 0.674 | 0.703 | 0.857 | 0.621 | 0.662 | 0.790 |

Reaching AUC 0.80 requires, in transitions per operator estimate:

| State | Free parameters | Transitions for AUC 0.80 | Responses per estimate |
|---|---|---|---|
| 4D_full | 16 | not reached in grid | - |
| 3D_no_switch | 9 | not reached in grid | - |
| 3D_no_ici | 9 | 60 | 610 |
| 3D_no_reward | 9 | not reached in grid | - |
| 2D_choice_switch | 4 | not reached in grid | - |
| 2D_choice_reward | 4 | not reached in grid | - |