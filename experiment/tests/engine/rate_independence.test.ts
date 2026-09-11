import { describe, expect, it } from 'vitest';

import { buildSessionPlan } from '../../src/engine/plan';
import { Session } from '../../src/engine/session';
import { ENGINE, EXPERIMENT_VERSION } from '../../src/config/task';

/**
 * The schedule a participant meets must depend on how they allocate, not on how
 * fast they respond.
 *
 * This is the property the first two pilots did not have. Recovery was applied
 * per second while depletion was applied per response, so a slower responder
 * accrued more recovery between their own responses and met a systematically
 * richer schedule. Across six participants, median inter-response time
 * correlated with mean richness at r = 0.992 and with obtained reward rate at
 * r = 0.982: reward rate, the coordinate the whole schedule was chosen to
 * rescue, was very largely a measure of response speed. Observed mean richness
 * ran from 0.192 at a 181 ms median ICI to 0.677 at 527 ms.
 *
 * Holding allocation fixed and varying only the clock must now change nothing.
 */
describe('the schedule is rate-independent', () => {
  const runAt = (iciMs: number) => {
    const plan = buildSessionPlan(`rate::${EXPERIMENT_VERSION}`);
    const session = new Session(plan, ENGINE);
    let t = 0, n = 0, rewards = 0, richness = 0;
    let side: 'A' | 'B' = 'A';
    for (let i = 0; i < 2400; i++) {
      t += iciMs;
      if (i % 12 === 0) side = side === 'A' ? 'B' : 'A';
      const o = session.respond(side, t);
      if (!o) continue;
      n++;
      rewards += o.rewardOutcome;
      richness += side === 'A' ? o.richnessA : o.richnessB;
    }
    return { reward: rewards / n, richness: richness / n };
  };

  it('gives identical richness to identical allocation at any response rate', () => {
    const rates = [150, 250, 400, 700].map(runAt);
    const values = rates.map((r) => r.richness);
    const spread = Math.max(...values) - Math.min(...values);
    // Nothing in the patch dynamics reads the clock, so this is exact.
    expect(spread).toBeLessThan(1e-9);
  });

  it('leaves obtained reward rate without a trend across response rates', () => {
    const values = [150, 250, 400, 700].map((ms) => runAt(ms).reward);
    const spread = Math.max(...values) - Math.min(...values);
    // Sampling noise only: the 4.7x rate range must not move it systematically.
    expect(spread).toBeLessThan(0.1);
  });
});
