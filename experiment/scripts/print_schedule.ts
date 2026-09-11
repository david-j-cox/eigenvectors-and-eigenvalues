#!/usr/bin/env tsx
/** Print a participant's full condition sequence, for design review and audit. */
import { buildSessionPlan, plannedResponses } from '../src/engine/plan';
import { CONTINGENCIES } from '../src/config/task';

const seed = process.argv[2] ?? 'participant-001';
const plan = buildSessionPlan(seed);

console.log(`seed: ${seed}`);
console.log(`color -> contingency (stage 1): ${JSON.stringify(plan.colorToContingency)}`);
console.log(`reversals begin at block: ${plan.reversalBlockIndices.join(', ')}`);
console.log(`total responses: ${plannedResponses(plan)}\n`);

console.log('blk  part          stage  color  contingency  VI A / VI B      resp  exposure');
for (const b of plan.blocks) {
  const spec = CONTINGENCIES[b.contingency];
  const vi = `${(spec.viAMs / 1000).toFixed(1)}s / ${(spec.viBMs / 1000).toFixed(1)}s`;
  const perts = plan.perturbations
    .filter((p) => p.blockIndex === b.index)
    .map((p) => `${p.type}@${p.onsetResponseInBlock}`)
    .join(', ');
  console.log(
    `${String(b.index).padStart(3)}  ${b.part.padEnd(13)} ${String(b.reversalStage ?? '-').padStart(4)}   ` +
      `${b.color.padEnd(7)} ${b.contingency.padEnd(12)} ${vi.padEnd(16)} ${String(b.targetResponses).padStart(4)}  ` +
      `${String(b.exposureNumber).padStart(3)}${perts ? '   ' + perts : ''}`,
  );
}
