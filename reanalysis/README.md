# Phase 0: reanalysis of the previous study

Runs the individual-level analysis that `measuring-behavior-trajectories`
specified but never executed, and uses it to size the new experiment.

## Scripts

| Script | Question it answers |
|---|---|
| `run_reanalysis.py` | Are individual operators estimable, stable, and predictive? |
| `run_design_sim.py` | How many transitions does the replication test need? |
| `run_state_dim.py` | Does the state vector need all four coordinates? |
| `run_all.sh` | All of the above, at full replicate counts |

Each takes `--quick` for a fast pass with fewer bootstrap replicates.

## Reading the outputs

`outputs/summary.md` is the substantive result. `outputs/design_recommendations_bin10.md`
carries the number the new design was built around: the same-operator agreement
floor at each sample size.

That floor is the point of this phase. An observed similarity between two
operator estimates means nothing on its own, because two estimates of the *same*
operator do not agree perfectly at finite sample size. The previous study's
early-versus-late agreement of 0.51 is indistinguishable from that floor, which
is why the new task collects far more transitions per environment rather than
more participants.
