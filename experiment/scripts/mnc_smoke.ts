/**
 * End-to-end smoke test of the MNC loop.
 *
 * This checks that the software does what it says -- rows well formed,
 * bookkeeping self-consistent, advancement firing for the stated reason. It
 * is NOT evidence about how people will behave; the two scripted players
 * below are a best case and a floor, not predictions.
 *
 *   npx tsx scripts/mnc_smoke.ts
 */
import { MNC_CONFIG, type Arm } from '../src/config/mnc';
import {
  advanceDecision, buildTrial, contextSpecs, scoreChoice,
} from '../src/engine/mnc';
import { buildMncRow, type MncEventRow } from '../src/logging/mncSchema';
import { createRng, deriveSeed } from '../src/utils/rng';

type Player = 'oracle' | 'random' | 'decoy';

function run(seed: string, arm: Arm, player: Player, budgetTrials: number) {
  const specs = contextSpecs(deriveSeed(seed, 'mnc-targets'), 80);
  const trialRng = createRng(deriveSeed(seed, 'mnc-trials'));
  const rewardRng = createRng(deriveSeed(seed, 'mnc-reward'));
  const choiceRng = createRng(deriveSeed(seed, 'player'));

  const rows: MncEventRow[] = [];
  let ctx = 0, inCtx = 0, points = 0, t = 0;
  let recent: boolean[] = [];

  while (t < budgetTrials && ctx < specs.length) {
    const spec = specs[ctx];
    const trial = buildTrial(spec, trialRng);
    // 'decoy' attends only to a dimension the context made irrelevant, so it
    // must score at chance; if it does not, the manipulation is broken.
    const decoyDim = [0, 1, 2, 3].find((dd) => !spec.relevant.includes(dd)) ?? 0;
    const pos =
      player === 'oracle' ? trial.targetPosition
      : player === 'decoy' ? Math.max(0, trial.alternatives.findIndex((a) => a[decoyDim] === 0))
      : Math.floor(choiceRng() * trial.alternatives.length);
    const rec = scoreChoice(trial, spec, pos, arm, rewardRng);
    points += rec.rewarded ? 1 : 0;
    inCtx += 1;
    recent = [...recent, rec.correct].slice(-MNC_CONFIG.criterionWindow);
    const d = advanceDecision(recent, inCtx);

    rows.push(buildMncRow({
      identity: { participantId: 'smoke', prolificPid: null, studyId: null,
        sessionId: seed, experimentVersion: 'smoke' },
      isTest: true, arm, elapsedMs: t * 900, responseTimeMs: 900,
      trialIndex: t, contextIndex: ctx, trialInContext: inCtx,
      contextColor: MNC_CONFIG.contextColors[ctx % MNC_CONFIG.contextColors.length],
      target: trial.alternatives[trial.targetPosition], spec,
      alternatives: trial.alternatives, targetPosition: trial.targetPosition,
      chosenPosition: pos, correct: rec.correct, rewarded: rec.rewarded,
      pointsTotal: points, errorDisparity: rec.errorDisparity,
      matched: rec.matched, matchCounts: rec.matchCounts,
      advancedAfter: d.advance ? d.reason : null,
    }));

    if (d.advance) { ctx += 1; inCtx = 0; recent = []; }
    t += 1;
  }
  return rows;
}

function check(name: string, rows: MncEventRow[]) {
  const problems: string[] = [];
  for (const r of rows) {
    if (r.alternatives.length !== MNC_CONFIG.alternativesPerTrial)
      problems.push(`${r.trial_index}: wrong alternative count`);
    if (r.alternatives[r.target_position] !== r.target_index)
      problems.push(`${r.trial_index}: target_position does not point at the target`);
    if (r.alternatives[r.chosen_position] !== r.chosen_index)
      problems.push(`${r.trial_index}: chosen_position does not point at the choice`);
    const rel: number[] = [r.rel_shape, r.rel_size, r.rel_orientation, r.rel_hue];
    const nRel = rel.reduce<number>((a, b) => a + b, 0);
    if (nRel !== MNC_CONFIG.relevantPerContext)
      problems.push(`${r.trial_index}: ${nRel} relevant dimensions, expected ${MNC_CONFIG.relevantPerContext}`);
    const m: number[] = [r.match_shape, r.match_size, r.match_orientation, r.match_hue];
    const relWrong = rel.reduce<number>((n, isRel, i) => n + (isRel === 1 && m[i] === 0 ? 1 : 0), 0);
    if ((relWrong === 0) !== (r.correct === 1))
      problems.push(`${r.trial_index}: correct flag disagrees with the relevant dimensions`);
    if (relWrong !== r.error_disparity)
      problems.push(`${r.trial_index}: error_disparity counts non-relevant dimensions`);
    for (const n of [r.navail_shape, r.navail_size, r.navail_orientation, r.navail_hue]) {
      if (n < 1 || n > MNC_CONFIG.alternativesPerTrial)
        problems.push(`${r.trial_index}: impossible availability count ${n}`);
    }
  }
  const contexts = new Set(rows.map((r) => r.context_index)).size;
  const advances = rows.filter((r) => r.advanced_after);
  const byReason = advances.reduce<Record<string, number>>((a, r) => {
    a[r.advanced_after!] = (a[r.advanced_after!] ?? 0) + 1; return a;
  }, {});
  const acc = rows.filter((r) => r.correct === 1).length / rows.length;
  const rew = rows.filter((r) => r.rewarded === 1).length / rows.length;

  console.log(`\n${name}`);
  console.log(`  trials ${rows.length}   contexts reached ${contexts}`);
  console.log(`  accuracy ${(100 * acc).toFixed(0)}%   reinforced ${(100 * rew).toFixed(0)}%`);
  console.log(`  advances ${JSON.stringify(byReason)}`);
  console.log(problems.length ? `  PROBLEMS:\n   ${problems.slice(0, 5).join('\n   ')}`
                              : `  row bookkeeping self-consistent`);
  return problems.length;
}

// 3 minutes at roughly 1 s per trial, being generous about pace
const BUDGET = 180;
let bad = 0;
bad += check('oracle player, deterministic   (ceiling: how fast can contexts turn over?)',
             run('s1', 'deterministic', 'oracle', BUDGET));
bad += check('oracle player, probabilistic   (same choices, noisier payoff)',
             run('s2', 'probabilistic', 'oracle', BUDGET));
bad += check('random player, deterministic   (floor: must hit the cap, not stall)',
             run('s3', 'deterministic', 'random', BUDGET));
bad += check('random player, probabilistic',
             run('s4', 'probabilistic', 'random', BUDGET));
bad += check('DECOY player: attends only an irrelevant dimension (must be ~25%)',
             run('s5', 'deterministic', 'decoy', BUDGET));
console.log(bad ? `\n${bad} PROBLEMS` : '\nall checks passed');
process.exit(bad ? 1 : 0);
