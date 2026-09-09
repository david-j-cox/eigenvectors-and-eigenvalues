# Analysis of the new task

Two entry points, both runnable against simulated sessions before collection and
against real data afterwards.

| Script | Purpose |
|---|---|
| `run_pilot_diagnostics.py` | Acceptance checks: transitions per cell, noise ratios, held-out prediction, replication, physical-vs-functional comparison, perturbation readiness |
| `run_state_selection.py` | Which state coordinates to use, by discrimination rather than by per-coordinate noise |

```bash
python3 run_pilot_diagnostics.py --events data/pilot_events.csv
python3 run_state_selection.py   --events data/pilot_events.csv
```

Both share `../dynalysis/`, the same library the Phase 0 reanalysis uses, so the
sample sizes the design simulation produced are binding on the analysis that
actually runs.

## Acceptance criteria

The checks are written to be capable of failing. A pilot that produces clean
event files but operators nobody can estimate has not passed.

The check most likely to fail is the reward-rate noise ratio. Under a stationary
interval schedule that coordinate carries roughly 60% sampling noise at
ten-response bins, and no schedule parameter fixes it. Deciding what to do about
it — which is what `run_state_selection.py` is for — is the main job of the pilot.
