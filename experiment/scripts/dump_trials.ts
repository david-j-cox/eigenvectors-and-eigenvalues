/**
 * Dump real engine-generated choice sets so an estimator can be checked
 * against ground truth.
 *
 * ESTIMATOR VERIFICATION, not a behavioral simulation. These are the actual
 * trials the task builds; what varies in the check is the statistic, not an
 * invented participant. No design decision rests on it.
 */
import { contextSpecs, buildTrial, type ContextSpec } from '../src/engine/mnc';
import { createRng } from '../src/utils/rng';

const rnd = createRng('dump');
const specs = contextSpecs('dump-specs', 40);
const out: unknown[] = [];
for (const spec of specs) {
  for (let i = 0; i < 60; i++) {
    const t = buildTrial(spec, rnd);
    out.push({
      relevant: spec.relevant,
      alts: t.alternatives.map((a) => [...a]),
      winner: t.targetPosition,
    });
  }
}
console.log(JSON.stringify(out));
