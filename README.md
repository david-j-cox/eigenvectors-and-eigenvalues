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
npm test          # 90 tests
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
worse despite yielding more transitions), the changeover delay (500 ms and one
response, since a 2 s time-only delay exceeds an entire average human run and
leaves 72% of responses ineligible), patch depletion (implemented, off, because
it reduced reinforcement at every strength without restoring the reward-rate
dynamics it was meant to), five exposures per cell, and the two-reversal
structure.

The simulated responders those decisions rest on are calibrated to the previous
study's 60 participants — their conditional switch probabilities and their
inter-response-time distributions, drawn one real person at a time rather than
averaged. That is what makes claims about changeover delays and reinforcement
density meaningful, since both turn on how often someone switches and how fast
they respond.

**Not decided: the state vector**, and no simulation can decide it. A simulated
responder's context-specific dynamics are whatever its author gave it, so the
selection criterion mostly measures the agent. The current choice —
`[P(A), reward rate, switch rate]` — comes from the previous study's real data.
Rerun `analysis/run_state_selection.py` on real pilot data before fixing it.

Also unresolved: reward rate carries 60-76% sampling noise at ten-response bins,
and no schedule parameter in this family fixes it.

Nothing in this repository has been run with a human participant.
