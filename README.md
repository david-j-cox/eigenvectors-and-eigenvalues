# Eigenvectors and eigenvalues of individual behaviour

Does an individual organism have a reproducible dynamical mode? This repository
extends the dynamic-foraging study in `../measuring-behavior-trajectories` into a
prospective test: estimate a transition operator from a person's earlier
behaviour in an environment, then ask whether it predicts that same person's
later behaviour there and their recovery from a controlled perturbation.

Start with [`docs/behavioral-dynamics-program.md`](docs/behavioral-dynamics-program.md)
for the design and the evidence behind it.

## Layout

```
dynalysis/     shared analysis library (states, operators, eigenanalysis, simulation)
reanalysis/    Phase 0: individual-level reanalysis of the previous 60-participant study
experiment/    the browser task (TypeScript, React, Vite, Supabase)
analysis/      pilot diagnostics and analysis of new data
docs/          the program document
```

## Quick start

### Phase 0 reanalysis

Reproduces the individual-level results and the design simulation that sized the
new task. Reads the previous study's `events.csv` directly; no setup needed
beyond numpy, pandas, scikit-learn, and scipy.

```bash
cd reanalysis
./run_all.sh                     # full run, roughly 30 minutes
python3 run_reanalysis.py --quick --bins 10   # a fast look
```

Outputs land in `reanalysis/outputs/`, with `summary.md` and
`design_recommendations_bin10.md` as the two worth reading.

### The task

```bash
cd experiment
npm install
npm test          # 81 tests
npm run dev       # http://localhost:5173
```

Without Supabase credentials the task runs and keeps events in memory only,
logging a warning. To store data, apply `supabase/migrations/` and set:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_COMPLETION_CODE=...
```

The anon key has insert and update permission and no read permission, so it
cannot be used to download participant data.

### Pilot loop

Simulated participants are run through the real event schema and the real
analysis, so a design that cannot support its own analysis fails here rather than
after data collection.

```bash
cd experiment && npx tsx scripts/pilot_check.ts --n 20
cd ../analysis
python3 run_pilot_diagnostics.py     # acceptance checks
python3 run_state_selection.py       # which state vector to use
```

Point both scripts at real pilot data with `--events` when it exists.

## What is decided and what is not

Decided by measurement, not convention: the state bin (10 responses, since 5 is
worse despite yielding more transitions), the changeover delay (750 ms and one
response, since a longer time-only delay halves obtained reinforcement), patch
depletion (implemented, off, because it made every criterion worse), the number
of exposures per cell, and the two-reversal structure.

Not decided: the state vector. The discrimination criterion gives different
answers on the previous study's data and on simulated sessions of the new task,
and the simulated answer is contingent on the simulated responder. Rerun
`run_state_selection.py` on real pilot data before fixing it.

Nothing in this repository has been run with a human participant.
