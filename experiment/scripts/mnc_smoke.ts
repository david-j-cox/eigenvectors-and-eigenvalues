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
  advanceDecision, buildTrial, contextTargets, scoreChoice,
} from '../src/engine/mnc';
import { buildMncRow, type MncEventRow } from '../src/logging/mncSchema';
import { createRng, deriveSeed } from '../src/utils/rng';

type Player = 'oracle' | 'random';

function run(seed: string, arm: Arm, player: Player, budgetTrials: number) {
  const targets = contextTargets(deriveSeed(seed, 'mnc-targets'), 24);
  const trialRng = createRng(deriveSeed(seed, 'mnc-trials'));
  const rewardRng = createRng(deriveSeed(seed, 'mnc-reward'));
  const choiceRng = createRng(deriveSeed(seed, 'player'));

  const rows: MncEventRow[] = [];
  let ctx = 0, inCtx = 0, points = 0, t = 0;
  let recent: boolean[] = [];

  while (t < budgetTrials && ctx < targets.length) {
    const target = targets[ctx];
    const trial = buildTrial(target, trialRng);
    const pos = player === 'oracle'
      ? trial.targetPosition
      : Math.floor(choiceRng() * trial.alternatives.length);
    const rec = scoreChoice(trial, target, pos, arm, rewardRng);
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
      target, alternatives: trial.alternatives, targetPosition: trial.targetPosition,
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
    const nMatched = [r.match_shape, r.match_size, r.match_orientation, r.match_hue]
      .filter((x) => x === 1).length;
    if (r.correct === 1 && nMatched !== 4)
      problems.push(`${r.trial_index}: marked correct with ${nMatched}/4 dimensions matched`);
    if (r.correct === 0 && nMatched === 4)
      problems.push(`${r.trial_index}: all dimensions matched but marked incorrect`);
    if (4 - nMatched !== r.error_disparity)
      problems.push(`${r.trial_index}: error_disparity disagrees with the match flags`);
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
console.log(bad ? `\n${bad} PROBLEMS` : '\nall checks passed');
process.exit(bad ? 1 : 0);
