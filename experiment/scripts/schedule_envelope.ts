// Does the schedule hold across the whole range of responding real people
// produce? Both schedule bugs so far were visible without participants, at the
// edges of that range. Run this before any pilot.
import { buildSessionPlan } from '../src/engine/plan';
import { Session } from '../src/engine/session';
import { ENGINE, EXPERIMENT_VERSION } from '../src/config/task';
import type { Side } from '../src/engine/types';

// Envelope observed across the six pilot participants, widened a little.
const ICIS = [150, 200, 250, 350, 450, 550, 700];
const RUNS = [4, 6, 8, 12, 20, 30];   // mean responses per stay = 1/switch rate

console.log('  ICI  run   switch   richness   reward  rew/bin');
let worstRew = 1, bestRew = 0, worstBin = 99;
for (const ici of ICIS) {
  for (const run of RUNS) {
    const plan = buildSessionPlan(`env::${ici}::${run}::${EXPERIMENT_VERSION}`);
    const s = new Session(plan, ENGINE);
    let t = 0, n = 0, rw = 0, rich = 0, sw = 0;
    let side: Side = 'A';
    for (let i = 0; i < 2400; i++) {
      t += ici;
      if (i % run === 0 && i > 0) { side = side === 'A' ? 'B' : 'A'; sw++; }
      const o = s.respond(side, t);
      if (!o) continue;
      n++; rw += o.rewardOutcome;
      rich += side === 'A' ? o.richnessA : o.richnessB;
    }
    const reward = rw / n, bin = reward * 10;
    worstRew = Math.min(worstRew, reward); bestRew = Math.max(bestRew, reward);
    worstBin = Math.min(worstBin, bin);
    console.log(
      `  ${String(ici).padStart(3)}  ${String(run).padStart(3)}  ${(sw / n).toFixed(3).padStart(6)}` +
      `  ${(rich / n).toFixed(3).padStart(9)}  ${reward.toFixed(3).padStart(7)}  ${bin.toFixed(2).padStart(7)}`);
  }
}
console.log(`\n  reward rate spans ${worstRew.toFixed(3)}-${bestRew.toFixed(3)} across the envelope`);
console.log(`  worst reinforcers per bin: ${worstBin.toFixed(2)}  (design floor 2.0)`);
