/**
 * ESTIMATOR VERIFICATION. Not a behavioral simulation, and no design decision
 * rests on it.
 *
 * The "chooser" below is a fixed rule, not a model of a person. The question
 * is whether a statistic recovers an arrangement that is known because the
 * code made it -- a property of the measure, decidable without any claim about
 * people. Anything about how participants actually behave comes from the
 * collected data, never from here.
 *
 * Question: if a chooser uses ONLY the relevant dimensions, does the logged
 * per-dimension lift correctly report zero control for the irrelevant ones?
 * That is a property of the statistic and the trial construction, decidable
 * without any claim about people.
 */
import { contextSpecs, buildTrial, scoreChoice } from '../src/engine/mnc';
import { createRng } from '../src/utils/rng';
import { DIMENSIONS } from '../src/config/mnc';

const rnd = createRng('verify');
const specs = contextSpecs('verify-specs', 40);
const N = 300;

const sum = { m: [0,0,0,0], nav: [0,0,0,0], n: [0,0,0,0] };
const relSum = { m: [0,0,0,0], nav: [0,0,0,0], n: [0,0,0,0] };

for (const spec of specs) {
  for (let i = 0; i < N; i++) {
    const t = buildTrial(spec, rnd);
    // a chooser that reads ONLY the relevant dimensions: picks the rule-satisfier
    const pick = t.targetPosition;
    const rec = scoreChoice(t, spec, pick, 'deterministic', rnd);
    DIMENSIONS.forEach((_, d) => {
      const bucket = spec.relevant.includes(d) ? relSum : sum;
      bucket.m[d] += rec.matched[d] ? 1 : 0;
      bucket.nav[d] += rec.matchCounts[d] / 4;
      bucket.n[d] += 1;
    });
  }
}

console.log('A chooser using ONLY the relevant dimensions.\n');
console.log('  dimension      role          matched   chance   LIFT');
DIMENSIONS.forEach((dim, d) => {
  for (const [label, b] of [['RELEVANT', relSum], ['irrelevant', sum]] as const) {
    if (!b.n[d]) continue;
    const m = b.m[d]/b.n[d], c = b.nav[d]/b.n[d];
    console.log(`  ${dim.id.padEnd(14)}${label.padEnd(14)}`
      + `${(100*m).toFixed(0).padStart(6)}%${(100*c).toFixed(0).padStart(8)}%`
      + `${(100*(m-c)).toFixed(0).padStart(7)}%`);
  }
});
console.log('\n  If the irrelevant rows show a large positive lift, the measure');
console.log('  cannot separate relevant from irrelevant and the analysis is wrong.');
