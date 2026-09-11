import { readFileSync } from 'node:fs';
import { buildSessionPlan } from '../src/engine/plan';
import { Session } from '../src/engine/session';
import { ENGINE, EXPERIMENT_VERSION } from '../src/config/task';
import type { Side } from '../src/engine/types';

const file = process.argv[2];
const lines = readFileSync(file, 'utf8').trim().split('\n');
const head = lines[0].split(',');
const col = (n: string) => head.indexOf(n);
const iPid = col('participant_id'), iOpt = col('chosen_option'), iIci = col('ici_ms');
const iRew = col('reward_outcome'), iRa = col('richness_a'), iRb = col('richness_b');
const iCod = col('cod_active'), iWith = col('reinforcer_withheld_by_cod');
const iEa = col('effective_rate_a_per_s'), iEb = col('effective_rate_b_per_s');
const iPts = col('points_earned'), iCum = col('cumulative_points');

const bySubject = new Map<string, string[][]>();
for (const line of lines.slice(1)) {
  const c = line.split(',');
  if (!bySubject.has(c[iPid])) bySubject.set(c[iPid], []);
  bySubject.get(c[iPid])!.push(c);
}

console.log(lines[0]);
for (const [pid, rows] of bySubject) {
  const plan = buildSessionPlan(`${EXPERIMENT_VERSION}::${pid}`);
  const s = new Session(plan, ENGINE);
  let t = 0, cum = 0;
  for (const c of rows) {
    t += Math.max(Number(c[iIci]) || 250, 1);
    const o = s.respond(c[iOpt] as Side, t);
    if (!o) continue;
    cum += o.pointsEarned;
    c[iRew] = String(o.rewardOutcome);
    c[iRa] = o.richnessA.toFixed(4);
    c[iRb] = o.richnessB.toFixed(4);
    c[iCod] = o.codActive ? '1' : '0';
    c[iWith] = o.reinforcerWithheldByCod ? '1' : '0';
    c[iEa] = String(o.richnessA);
    c[iEb] = String(o.richnessB);
    c[iPts] = String(o.pointsEarned);
    c[iCum] = String(cum);
    console.log(c.join(','));
  }
}
