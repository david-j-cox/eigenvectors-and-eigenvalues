# The task

A concurrent-operants two-alternative choice procedure with signaled contexts,
two contingency reversals, and embedded perturbations. About 26 minutes of
responding.

## Design in one page

Blocks are defined by a **response count**, not by elapsed time, because every
downstream estimate is a per-response state transition and a time-defined block
yields an unpredictable number of them.

```
practice           60 responses,  neutral gray background
stage 1      8  x 100 responses,  green -> A-rich, blue -> B-rich
stage 2      8  x 100 responses,  green -> B-rich, blue -> A-rich
stage 3      8  x 100 responses,  green -> A-rich, blue -> B-rich
stage 4      8  x 100 responses,  green -> B-rich, blue -> A-rich
perturbation 5  x 200 responses,  red, 8 perturbations
```

4,260 responses, about 25 minutes of responding. ABAB rather than ABA so the
A-to-B transition occurs twice and all four color x contingency cells get equal
data. Colors alternate strictly, so no context repeats on consecutive blocks,
and the color-to-contingency assignment is randomized per participant.

Each context fills the viewport behind two identical panels, and every signaled
color is paired with a texture (green plain, blue stripes, red dots) so the
discrimination does not rest on hue. Practice uses a neutral gray logged as its
own context id.

```bash
npx tsx scripts/print_schedule.ts participant-001   # a participant's full sequence
```

The color-to-contingency mapping is randomized per participant and stored in the
session record. Stage 3 restores stage 1, which is what lets a same-color and a
different-color comparison be matched on elapsed time; see
`../docs/behavioral-dynamics-program.md`.

## Code

| Path | Role |
|---|---|
| `src/engine/plan.ts` | Builds the whole schedule deterministically from a seed |
| `src/engine/schedule.ts` | Both schedules: depleting patches (default) and concurrent VI, plus the changeover delay |
| `src/engine/perturbation.ts` | Perturbations as schedule overrides, expressed as data |
| `src/engine/session.ts` | The procedure; no DOM dependency, so it can be simulated |
| `src/engine/simulate.ts` | Simulated responders, calibrated to human switching statistics |
| `src/engine/human_calibration.json` | Per-participant switch probabilities and response timing, measured from the previous study's 60 participants |
| `src/logging/` | Event schema, checkpointed logger, Supabase transport (writes via RPC) |
| `src/ui/` | Screens and the browser wiring |

Adding a perturbation type means adding one case to `effectiveSchedule`. Nothing
in block sequencing or response handling knows that perturbations exist.

## Commands

```bash
npm test                                   # 111 tests
npm run dev
npm run build
npx tsx scripts/pilot_check.ts --n 20      # simulate sessions, export real schema
npx tsx scripts/pilot_check.ts --n 20 --no-depletion

npm run preflight                          # check deployment env vars
npx tsx scripts/verify_supabase.ts         # live check against the real database
npm run build:prod                         # preflight, then build
```

Deploying to participants is `../docs/deployment-runbook.md`.

## Reproducibility

Every randomized feature derives from `experiment version :: participant id`
through separate named streams, so changing the number of perturbations cannot
renumber the block order. Given those two strings the entire schedule is
reconstructible after the fact and can be checked against what was logged.

A participant who refreshes returns to the same schedule rather than a fresh
randomization.
