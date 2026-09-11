// Replay real participants' recorded choices and timing through the current
// engine. Their behaviour is fixed; only the schedule differs. This is the
// cheapest available test of a schedule change, and it uses the responding
// people actually produced rather than what a calibrated agent would produce.
import { readFileSync } from 'node:fs';
import { buildSessionPlan } from '../src/engine/plan';
import { Session } from '../src/engine/session';
import { ENGINE, EXPERIMENT_VERSION } from '../src/config/task';
import type { Side } from '../src/engine/types';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!files.length) { console.error('usage: replay_real.ts <events.csv>...'); process.exit(1); }

interface Row { pid: string; side: Side; ici: number }
const bySubject = new Map<string, Row[]>();

for (const f of files) {
  const lines = readFileSync(f, 'utf8').trim().split('\n');
  const head = lines[0].split(',');
  const iPid = head.indexOf('participant_id');
  const iOpt = head.indexOf('chosen_option');
  const iIci = head.indexOf('ici_ms');
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    const pid = c[iPid];
    if (!bySubject.has(pid)) bySubject.set(pid, []);
    bySubject.get(pid)!.push({
      pid, side: c[iOpt] as Side, ici: Number(c[iIci]) || 250,
    });
  }
}

const emit = process.argv.includes('--csv');
if (emit) console.log('participant_id,trial_index,chosen_option,reward_outcome,switched,richness,ici_ms');
else console.log('  subject     n   medICI   richness   reward   switch   rew/bin');
for (const [pid, rows] of bySubject) {
  const plan = buildSessionPlan(`${EXPERIMENT_VERSION}::${pid}`);
  const s = new Session(plan, ENGINE);
  let t = 0, n = 0, rewards = 0, rich = 0, switches = 0;
  let prev: Side | null = null;
  for (const r of rows) {
    t += Math.max(r.ici, 1);
    const o = s.respond(r.side, t);
    if (!o) continue;
    n++; rewards += o.rewardOutcome;
    rich += r.side === 'A' ? o.richnessA : o.richnessB;
    const sw = prev && prev !== r.side ? 1 : 0;
    if (sw) switches++;
    if (emit) {
      console.log(`${pid},${n - 1},${r.side},${o.rewardOutcome},${sw},` +
        `${(r.side === 'A' ? o.richnessA : o.richnessB).toFixed(4)},${r.ici}`);
    }
    prev = r.side;
  }
  if (emit) continue;
  const icis = rows.map((r) => r.ici).sort((a, b) => a - b);
  const med = icis[Math.floor(icis.length / 2)];
  console.log(
    `  ${pid.slice(0, 8)}  ${String(n).padStart(4)}  ${String(med).padStart(6)}` +
    `  ${(rich / n).toFixed(3).padStart(9)}  ${(rewards / n).toFixed(3).padStart(7)}` +
    `  ${(switches / n).toFixed(3).padStart(7)}  ${((rewards / n) * 10).toFixed(2).padStart(8)}`);
}
