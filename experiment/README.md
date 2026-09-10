# The task

A concurrent-operants two-alternative choice procedure with signalled contexts,
two contingency reversals, and embedded perturbations. About 26 minutes of
responding.

## Design in one page

Blocks are defined by a **response count**, not by elapsed time, because every
downstream estimate is a per-response state transition and a time-defined block
yields an unpredictable number of them.

```
practice           60 responses,  neutral background
stage 1     10  x 100 responses,  green -> A-rich, blue -> B-rich
stage 2     10  x 100 responses,  green -> B-rich, blue -> A-rich
stage 3     10  x 100 responses,  green -> A-rich, blue -> B-rich
perturbation 5  x 200 responses,  red, 8 perturbations
```

4,060 responses, about 24 minutes of responding. Colours alternate strictly, so
no context repeats on consecutive blocks, and the colour-to-contingency
assignment is randomised per participant.

```bash
npx tsx scripts/print_schedule.ts participant-001   # a participant's full sequence
```

The colour-to-contingency mapping is randomised per participant and stored in the
session record. Stage 3 restores stage 1, which is what lets a same-colour and a
different-colour comparison be matched on elapsed time; see
`../docs/behavioral-dynamics-program.md`.

## Code

| Path | Role |
|---|---|
| `src/engine/plan.ts` | Builds the whole schedule deterministically from a seed |
| `src/engine/schedule.ts` | Concurrent VI, changeover delay, optional depletion |
| `src/engine/perturbation.ts` | Perturbations as schedule overrides, expressed as data |
| `src/engine/session.ts` | The procedure; no DOM dependency, so it can be simulated |
| `src/engine/simulate.ts` | Simulated responders, calibrated to human switching statistics |
| `src/engine/human_calibration.json` | Per-participant switch probabilities and response timing, measured from the previous study's 60 participants |
| `src/logging/` | Event schema, checkpointed logger, Supabase transport |
| `src/ui/` | Screens and the browser wiring |

Adding a perturbation type means adding one case to `effectiveSchedule`. Nothing
in block sequencing or response handling knows that perturbations exist.

## Commands

```bash
npm test                                   # 90 tests
npm run dev
npm run build
npx tsx scripts/pilot_check.ts --n 20      # simulate sessions, export real schema
npx tsx scripts/pilot_check.ts --n 20 --no-depletion
```

## Reproducibility

Every randomised feature derives from `experiment version :: participant id`
through separate named streams, so changing the number of perturbations cannot
renumber the block order. Given those two strings the entire schedule is
reconstructible after the fact and can be checked against what was logged.

A participant who refreshes returns to the same schedule rather than a fresh
randomisation.
