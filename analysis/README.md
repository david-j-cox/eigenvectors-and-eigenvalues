# Analysis of the new task

Two entry points, both runnable against simulated sessions before collection and
against real data afterwards.

| Script | Purpose |
|---|---|
| `run_pilot_diagnostics.py` | Acceptance checks: transitions per cell, noise ratios, held-out prediction, replication, physical-vs-functional comparison, perturbation readiness |
| `run_state_selection.py` | Which state coordinates to use, by discrimination rather than by per-coordinate noise |

| `export_events.py` | Pulls collected sessions out of Supabase into the CSV the other two read |

```bash
export SUPABASE_URL=https://<project>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...              # never the anon key

python3 export_events.py          --out data/pilot_events.csv
python3 run_pilot_diagnostics.py --events data/pilot_events.csv
python3 run_state_selection.py   --events data/pilot_events.csv
```

The export drops test and incomplete sessions by default, so the acceptance
checks run on exactly what a real pilot produced. The event table's columns are
the ones the simulation writes, so nothing is renamed on the way through.

Both share `../dynalysis/`, the same library the Phase 0 reanalysis uses, so the
sample sizes the design simulation produced are binding on the analysis that
actually runs.

## Acceptance criteria

The checks are written to be capable of failing. A pilot that produces clean
event files but operators nobody can estimate has not passed.

The reward-rate noise ratio used to be the check most likely to fail, and it is
why the task no longer runs on a concurrent VI. Under an interval schedule that
coordinate was 86% sampling noise, because obtained reinforcement is set by the
programmed rate rather than by behavior, and no schedule parameter fixed it.
Depleting patches bring it to 21%, against the 17% the previous study's
participants produced. That question is settled in simulation and is not what the
pilot is for.

What the pilot decides is what simulation cannot: whether reward rate carries
context-specific structure in a real organism, and whether human switch rates
under depleting patches stay inside the range the simulated responders assumed
(0.185, against a human range measured from the previous study's 60
participants). `run_state_selection.py` answers the first on real data.
