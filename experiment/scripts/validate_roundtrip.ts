/**
 * END-TO-END VALIDATION of the production path.
 *
 * Drives the real engine, the real scorer and the real row builder to emit
 * rows in exactly the shape the browser uploads, for choosers whose attention
 * is fixed by construction. The analysis is then run on those rows and asked
 * to recover what was arranged.
 *
 * This validates the ESTIMATOR AND THE PIPELINE against ground truth the code
 * itself created. It is not a behavioral simulation and no design decision
 * rests on it: the "choosers" are fixed rules, not models of people.
 *
 *   npx tsx scripts/validate_roundtrip.ts > /tmp/roundtrip.csv
 */
import { contextSpecs, buildTrial, scoreChoice } from '../src/engine/mnc';
import { buildMncRow, MNC_COLUMNS } from '../src/logging/mncSchema';
import { createRng, deriveSeed } from '../src/utils/rng';
import { MNC_CONFIG } from '../src/config/mnc';

type Attend = { label: string; dims: (spec: number[]) => number[] };

/**
 * A chooser whose ATTENTION ITSELF has dynamics.
 *
 * The choosers above apply the current rule directly and so have no
 * persistence to recover: their attention is whatever the context says, with
 * no memory. That is the right null for checking the static estimator, and the
 * wrong one for checking whether persistence can be measured at all.
 *
 * This one carries an attentional weight per dimension that moves toward the
 * current rule at a known rate. HALFLIVES are the ground truth: the estimator
 * has to recover them from choices alone.
 */
const HALFLIVES = [2, 8, 32];

// Each chooser attends to a FIXED set of dimensions and picks the alternative
// matching the winner on all of them, breaking ties at random. Lapses at a
// fixed rate so accuracy sits where the collected participants' did.
const CHOOSERS: Attend[] = [
  { label: 'both-relevant',  dims: (rel) => rel },
  { label: 'one-relevant',   dims: (rel) => [rel[0]] },
  { label: 'one-irrelevant', dims: (rel) => [[0,1,2,3].find((d) => !rel.includes(d))!] },
];
const LAPSE = 0.45; // chooses at random this often, so accuracy is not at ceiling

const rows: string[] = [MNC_COLUMNS.join(',')];

// --- choosers whose attention drifts at a known rate ---
for (const hl of HALFLIVES) {
  const label = `hl${String(hl).padStart(3,"0")}-drift`;
  const seed = `validate-${label}`;
  const specs = contextSpecs(deriveSeed(seed, 'mnc-targets'), 200);
  const trialRng = createRng(deriveSeed(seed, 'mnc-trials'));
  const rewardRng = createRng(deriveSeed(seed, 'mnc-reward'));
  const pickRng = createRng(deriveSeed(seed, 'pick'));
  const decay = Math.pow(0.5, 1 / hl);
  let w = [0, 0, 0, 0];
  let ctx = 0, inCtx = 0, pts = 0, t = 0;

  while (t < 600 && ctx < specs.length) {
    const spec = specs[ctx];
    const trial = buildTrial(spec, trialRng);
    const winner = trial.alternatives[trial.targetPosition];

    // attention relaxes toward the current rule at the known rate
    const target = [0, 1, 2, 3].map((d) => (spec.relevant.includes(d) ? 2 : 0));
    w = w.map((v, d) => decay * v + (1 - decay) * target[d]);

    // choose by a conditional logit on the CURRENT weights
    const util = trial.alternatives.map((a) =>
      a.reduce<number>((s, v, d) => s + (v === winner[d] ? w[d] : 0), 0));
    const mx = Math.max(...util);
    const ex = util.map((u) => Math.exp(u - mx));
    const tot = ex.reduce((s, v) => s + v, 0);
    let r = pickRng() * tot;
    let pos = 0;
    for (let i = 0; i < ex.length; i++) { r -= ex[i]; if (r <= 0) { pos = i; break; } }

    const rec = scoreChoice(trial, spec, pos, 'probabilistic', rewardRng);
    pts += rec.rewarded ? 1 : 0;
    inCtx += 1;
    const row = buildMncRow({
      identity: { participantId: label, prolificPid: label, studyId: 'validate',
                  sessionId: `${label}-sess`, experimentVersion: 'eigen-dynamics-1.1.0' },
      isTest: false, arm: 'probabilistic', elapsedMs: t * 1000, responseTimeMs: 900,
      trialIndex: t, contextIndex: ctx, trialInContext: inCtx,
      contextColor: '#000000', target: winner, spec,
      alternatives: trial.alternatives, targetPosition: trial.targetPosition,
      chosenPosition: pos, correct: rec.correct, rewarded: rec.rewarded,
      pointsTotal: pts, errorDisparity: rec.errorDisparity,
      matched: rec.matched, matchCounts: rec.matchCounts, advancedAfter: null,
    }) as unknown as Record<string, unknown>;
    rows.push(MNC_COLUMNS.map((c) => {
      const v = row[c as string];
      if (Array.isArray(v)) return `"{${v.join(',')}}"`;
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));

    if (inCtx >= 25) { ctx++; inCtx = 0; }
    t++;
  }
}

for (const ch of CHOOSERS) {
  const seed = `validate-${ch.label}`;
  const specs = contextSpecs(deriveSeed(seed, 'mnc-targets'), 60);
  const trialRng = createRng(deriveSeed(seed, 'mnc-trials'));
  const rewardRng = createRng(deriveSeed(seed, 'mnc-reward'));
  const pickRng = createRng(deriveSeed(seed, 'pick'));
  let ctx = 0, inCtx = 0, pts = 0, t = 0;

  while (t < 400 && ctx < specs.length) {
    const spec = specs[ctx];
    const trial = buildTrial(spec, trialRng);
    const attend = ch.dims(spec.relevant);
    const winner = trial.alternatives[trial.targetPosition];

    let pos: number;
    if (pickRng() < LAPSE) {
      pos = Math.floor(pickRng() * trial.alternatives.length);
    } else {
      const ok = trial.alternatives
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => attend.every((d) => a[d] === winner[d]))
        .map(({ i }) => i);
      pos = ok.length ? ok[Math.floor(pickRng() * ok.length)]
                      : Math.floor(pickRng() * trial.alternatives.length);
    }

    const rec = scoreChoice(trial, spec, pos, 'probabilistic', rewardRng);
    pts += rec.rewarded ? 1 : 0;
    inCtx += 1;

    const row = buildMncRow({
      identity: { participantId: ch.label, prolificPid: ch.label, studyId: 'validate',
                  sessionId: `${ch.label}-sess`, experimentVersion: 'eigen-dynamics-1.1.0' },
      isTest: false, arm: 'probabilistic', elapsedMs: t * 1000, responseTimeMs: 900,
      trialIndex: t, contextIndex: ctx, trialInContext: inCtx,
      contextColor: '#000000', target: winner, spec,
      alternatives: trial.alternatives, targetPosition: trial.targetPosition,
      chosenPosition: pos, correct: rec.correct, rewarded: rec.rewarded,
      pointsTotal: pts, errorDisparity: rec.errorDisparity,
      matched: rec.matched, matchCounts: rec.matchCounts, advancedAfter: null,
    }) as unknown as Record<string, unknown>;

    rows.push(MNC_COLUMNS.map((c) => {
      const v = row[c as string];
      if (Array.isArray(v)) return `"{${v.join(',')}}"`;      // postgres array literal
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));

    if (inCtx >= MNC_CONFIG.maxTrialsPerContext || inCtx >= 25) { ctx++; inCtx = 0; }
    t++;
  }
}
console.log(rows.join('\n'));
