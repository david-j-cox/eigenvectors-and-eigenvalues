/**
 * What one session ARRANGES. Counts scheduled events only; nothing here is a
 * claim about behaviour, and no design decision rests on simulated responding.
 *
 *   npx tsx scripts/operator_audit.ts
 */
import { buildSession } from '../src/engine/operator';
import { OPERATOR_CONFIG as C } from '../src/config/operator';

const seeds = ['a', 'b', 'c', 'd', 'e'];
const rows = seeds.map((s) => {
  const x = buildSession(s);
  const live = x.filter((v) => !v.isPractice);
  const blocks = new Set(live.map((v) => v.block)).size;
  const app = live.filter((v) => v.stimulus === 'appetitive').length;
  const avr = live.filter((v) => v.stimulus === 'aversive').length;
  let perts = 0;
  for (let i = 1; i < x.length; i++) {
    if (x[i].perturbationActive && !x[i - 1].perturbationActive) perts++;
  }
  const congApp = live.filter((v) => v.stimulus === 'appetitive'
    && v.stimulusSide === v.blockRich).length;
  const congAvr = live.filter((v) => v.stimulus === 'aversive'
    && v.stimulusSide === v.blockRich).length;
  return { seed: s, responses: live.length, blocks, transitions: blocks - 1,
           perts, app, avr,
           congApp: app ? congApp / app : 0, congAvr: avr ? congAvr / avr : 0 };
});

console.log(`Per session: ${C.totalResponses} responses `
  + `(${C.practiceResponses} practice), blocks of ${C.blockResponses}\n`);
console.log('  seed  resp  blocks  transitions  perturb  appetitive  aversive'
  + '  cong(app)  cong(avr)');
for (const r of rows) {
  console.log(`  ${r.seed}   ${String(r.responses).padStart(4)}`
    + `${String(r.blocks).padStart(8)}${String(r.transitions).padStart(13)}`
    + `${String(r.perts).padStart(9)}${String(r.app).padStart(12)}`
    + `${String(r.avr).padStart(10)}${(100 * r.congApp).toFixed(0).padStart(10)}%`
    + `${(100 * r.congAvr).toFixed(0).padStart(10)}%`);
}
const n = rows.length;
console.log(`\n  Per participant this yields ~${Math.round(
  rows.reduce((a, r) => a + r.transitions, 0) / n)} block transitions, `
  + `~${Math.round(rows.reduce((a, r) => a + r.perts, 0) / n)} perturbations,`);
console.log(`  ~${Math.round(rows.reduce((a, r) => a + r.app, 0) / n)} appetitive and `
  + `~${Math.round(rows.reduce((a, r) => a + r.avr, 0) / n)} aversive stimuli, each `
  + `followed by`);
console.log(`  at least ${C.minStimulusGap} clean responses.`);
console.log(`\n  At the 223 responses/min median of the previous study this is `
  + `${(C.totalResponses / 223).toFixed(1)} min;`);
console.log(`  at its slowest observed rate (62/min) the ${
  (C.maxSessionMs / 60000)}-min cap binds first, at ~${
  Math.round(62 * C.maxSessionMs / 60000)} responses.`);
