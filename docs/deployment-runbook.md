# Deploying the task and running a pilot

Supabase for storage, Vercel for hosting, Prolific for recruitment. Work through
the four sections in order; the last one is the check that catches a
misconfiguration while it is still cheap.

The task itself needs no changes. What follows is entirely configuration.

---

## 1. Supabase

Create a project, then run both migrations in the SQL editor, in order:

```
experiment/supabase/migrations/001_create_tables.sql
experiment/supabase/migrations/002_enable_rls.sql
```

`002` is not optional. Until it runs the tables have no row-level security, and
the key that ships in the participant's page can read as well as write.

From **Settings -> API** take two keys, and keep them straight:

| Key | Where it goes | What it can do |
|---|---|---|
| anon / publishable | Vercel, published in the page bundle | insert and update only |
| service_role / secret | your shell, never committed | full read access |

The anon key is public by design. It is safe only because `002` restricts it to
inserts and updates, and because there is deliberately no select policy: without
one, a participant who reads the key out of the page still cannot download
anyone's data. `npm run build:prod` refuses to build if a privileged key has
been put in the anon slot, but do not rely on that alone.

## 2. Vercel

Import the repository, then set:

| Setting | Value |
|---|---|
| Root Directory | `experiment` |
| Framework preset | Vite (auto-detected) |
| Build command | `npm run build:prod` (already in `vercel.json`) |

Add three environment variables under **Settings -> Environment Variables**:

```
VITE_SUPABASE_URL        https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY   <anon / publishable key>
VITE_COMPLETION_CODE     <from the Prolific study, section 3>
```

All three are read **at build time** and inlined into the bundle. Changing one
in the dashboard has no effect until you redeploy. This is the single most
common way to end up with a live study that quietly collects nothing, which is
why `build:prod` runs `scripts/preflight.ts` first and fails the deploy if a
variable is missing, if the completion code is still a placeholder, or if the
key in the anon slot is privileged.

The completion code comes from Prolific, so create the study first, or deploy
twice.

## 3. Prolific

Create the study, then:

**Study URL** — pass the three identifiers through as query parameters:

```
https://<your-app>.vercel.app/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}
```

Set **how Prolific records IDs** to *via URL parameters*
(`prolific_id_option: "url_parameters"` over the API). This is a separate
setting from the URL itself, and it is the one that decides whether those
placeholders get filled in. Left on the default, Prolific asks the participant
to type their ID instead and the placeholders arrive empty.

`readProlificParams` reads these, and `PROLIFIC_PID` becomes both the
participant id and the randomization seed. Get either half wrong and every
participant falls back to a browser-local id, which means they all receive the
*same* schedule and, because `session_id` is derived from it, they overwrite
each other's rows.

**Completion** — a study carries a list of completion codes. Take the one whose
`code_type` is `COMPLETED`, put that exact string in `VITE_COMPLETION_CODE`, and
redeploy. The end screen shows whatever that variable holds; if it does not
match, nobody can be paid.

**Devices** — desktop only (`device_compatibility: ["desktop"]`).

**Timing** — about 26 minutes of responding, plus consent and instructions.
Budget 35 minutes and set the maximum generously: a participant who is timed out
mid-session leaves a partial record that the export will exclude. The task
carries its own 30-minute soft cap, which drops trailing perturbation blocks
rather than truncating a reversal stage.

The task needs a keyboard (F and J) and a viewport large enough for two panels.

## 4. Before you launch: run it yourself

Open the deployed URL with the test flag:

```
https://<your-app>.vercel.app/?PROLIFIC_PID=researcher-check&test=1
```

`test=1` marks the session record `is_test_session`, and the export drops those
by default. Without it your own run is indistinguishable from participant 1.

You need not finish all 4,260 responses. A minute of responding is enough to
confirm the pipeline, then check that rows arrived:

```bash
cd analysis
export SUPABASE_URL=https://<project>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...
python3 export_events.py --include-test --include-incomplete --out /tmp/check.csv
```

Rows present means the whole chain works: bundle, keys, RLS policies, upsert.
Zero rows means the anon key or the URL is wrong in the Vercel build. Open the
browser console on the live page — the app warns loudly there when it falls back
to in-memory logging.

Then launch to 2-3 participants before opening the study further.

## After collection

```bash
cd analysis
python3 export_events.py          --out data/pilot_events.csv
python3 run_pilot_diagnostics.py --events data/pilot_events.csv
python3 run_state_selection.py   --events data/pilot_events.csv
```

The export excludes test and incomplete sessions by default and refuses to write
if any `(session_id, trial_index)` is duplicated, since duplicates would corrupt
the state bins silently rather than visibly.

What the pilot is actually deciding is in `../analysis/README.md`. The
reward-rate noise question is settled in simulation and is not among them; what
remains is whether reward rate carries context-specific structure in a real
organism, and whether human switch rates under depleting patches stay in the
range the simulated responders assumed.

## Things that will bite

| Symptom | Cause |
|---|---|
| No rows in Supabase, task otherwise fine | env vars set after the last build; redeploy |
| Every participant gets the same schedule | study URL missing `PROLIFIC_PID`, or ID recording not set to URL parameters |
| Participants report the code is rejected | `VITE_COMPLETION_CODE` differs from Prolific, or was changed without redeploying |
| Export returns nothing | all sessions still `in_progress`; nobody reached the end screen |
| Sessions overwrite each other | two people on one browser without a distinct `PROLIFIC_PID` |

---

## Appendix: driving Prolific from the API

Everything in section 3 can be done over
[Prolific's REST API](https://docs.prolific.com/api-reference/studies/create-study.md)
instead of the dashboard, which is worth it mainly because it resolves the
ordering problem: creating the draft hands you the completion code, so you can
set `VITE_COMPLETION_CODE` and deploy before anything is visible to
participants. A token comes from **Settings -> API tokens**.

```bash
curl -sX POST https://api.prolific.com/api/v1/studies/ \
  -H "Authorization: Token $PROLIFIC_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Choice and adaptation in a two-option task",
    "description": "...",
    "external_study_url": "https://<app>.vercel.app/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}",
    "prolific_id_option": "url_parameters",
    "estimated_completion_time": 35,
    "total_available_places": 3,
    "reward": 700,
    "device_compatibility": ["desktop"],
    "completion_codes": [
      {"code": "<chosen>", "code_type": "COMPLETED",
       "actions": [{"action": "AUTOMATICALLY_APPROVE"}]}
    ]
  }'
```

`reward` is in cents of the workspace currency. The study is created
`UNPUBLISHED` and stays invisible to participants until it is transitioned:

```bash
curl -sX POST https://api.prolific.com/api/v1/studies/<id>/transition/ \
  -H "Authorization: Token $PROLIFIC_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "PUBLISH"}'
```

That second call is the one that spends money and exposes the study. Do section
4's own-run check between the two.
