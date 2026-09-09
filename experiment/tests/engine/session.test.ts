import { describe, expect, it } from 'vitest';
import { Session } from '../../src/engine/session';
import { buildSessionPlan } from '../../src/engine/plan';
import { MatchingAgent, RandomAgent, simulateSession } from '../../src/engine/simulate';
import { DEFAULT_DESIGN, ENGINE } from '../../src/config/task';

describe('Session response handling', () => {
  it('rejects responses inside the cooldown so blocks stay response-exact', () => {
    const session = new Session(buildSessionPlan('s'), ENGINE);
    expect(session.respond('A', 0)).not.toBeNull();
    expect(session.respond('A', ENGINE.responseCooldownMs - 1)).toBeNull();
    expect(session.respond('A', ENGINE.responseCooldownMs)).not.toBeNull();
  });

  it('marks a switch and restarts the run length', () => {
    const session = new Session(buildSessionPlan('s'), ENGINE);
    session.respond('A', 0);
    const second = session.respond('A', 1000)!;
    expect(second.switched).toBe(false);
    expect(second.runLength).toBe(2);

    const third = session.respond('B', 2000)!;
    expect(third.switched).toBe(true);
    expect(third.runLength).toBe(1);
  });

  it('withholds reinforcement during the changeover delay', () => {
    const session = new Session(buildSessionPlan('s'), ENGINE);
    // Work one side long enough for the other to be reliably baited.
    for (let t = 0; t < 40; t++) session.respond('A', t * 500);
    const afterSwitch = session.respond('B', 40 * 500)!;
    expect(afterSwitch.codActive).toBe(true);
    expect(afterSwitch.rewardOutcome).toBe(0);
  });
});

describe('full simulated sessions', () => {
  const result = simulateSession('sim-seed-1', new MatchingAgent(), 500);

  it('completes every planned response exactly once', () => {
    const planned = result.plan.blocks.reduce((s, b) => s + b.targetResponses, 0);
    expect(result.outcomes).toHaveLength(planned);
  });

  it('numbers trials contiguously', () => {
    result.outcomes.forEach((o, i) => expect(o.trialIndex).toBe(i));
  });

  it('gives every block exactly its target number of responses', () => {
    for (const block of result.plan.blocks) {
      const inBlock = result.outcomes.filter((o) => o.blockIndex === block.index);
      expect(inBlock).toHaveLength(block.targetResponses);
      expect(inBlock.map((o) => o.trialInBlock)).toEqual(
        Array.from({ length: block.targetResponses }, (_, i) => i),
      );
    }
  });

  it('logs the schedule actually in force, matching the plan outside perturbations', () => {
    for (const o of result.outcomes) {
      if (o.perturbationActive) continue;
      const block = result.plan.blocks[o.blockIndex];
      expect(o.viAMs).toBe(block.viAMs);
      expect(o.viBMs).toBe(block.viBMs);
    }
  });

  it('applies each perturbation for exactly its programmed duration', () => {
    for (const p of result.plan.perturbations) {
      const active = result.outcomes.filter((o) => o.perturbationId === p.id);
      expect(active).toHaveLength(p.durationResponses);
      expect(active[0].trialInBlock).toBe(p.onsetResponseInBlock);
      expect(active.map((o) => o.trialsSincePerturbationOnset)).toEqual(
        Array.from({ length: p.durationResponses }, (_, i) => i),
      );
    }
  });

  it('delivers no reinforcement during extinction', () => {
    const ext = result.outcomes.filter((o) => o.perturbationType === 'extinction');
    expect(ext.length).toBeGreaterThan(0);
    expect(ext.every((o) => o.rewardOutcome === 0)).toBe(true);
  });

  it('swaps the schedules during a contingency reversal', () => {
    for (const p of result.plan.perturbations) {
      if (p.type !== 'contingency_reversal') continue;
      const block = result.plan.blocks[p.blockIndex];
      const during = result.outcomes.filter((o) => o.perturbationId === p.id);
      expect(during.every((o) => o.viAMs === block.viBMs)).toBe(true);
      expect(during.every((o) => o.viBMs === block.viAMs)).toBe(true);
    }
  });

  it('restores the block schedule once a perturbation ends', () => {
    for (const p of result.plan.perturbations) {
      const block = result.plan.blocks[p.blockIndex];
      const after = result.outcomes.find(
        (o) =>
          o.blockIndex === p.blockIndex &&
          o.trialInBlock === p.onsetResponseInBlock + p.durationResponses,
      );
      expect(after).toBeDefined();
      expect(after!.perturbationActive).toBe(false);
      expect(after!.viAMs).toBe(block.viAMs);
    }
  });

  it('keeps cumulative points consistent with per-response earnings', () => {
    let running = 0;
    for (const o of result.outcomes) {
      running += o.pointsEarned;
      expect(o.cumulativePoints).toBe(running);
    }
  });

  it('produces reinforcement dense enough for the reward-rate coordinate', () => {
    const unperturbed = result.outcomes.filter((o) => !o.perturbationActive);
    const rate = unperturbed.filter((o) => o.rewardOutcome === 1).length / unperturbed.length;
    // The pilot target is 2.5 reinforcers per 10-response bin.
    expect(rate * DEFAULT_DESIGN.stateBinResponses).toBeGreaterThan(2.0);
  });

  it('produces choice allocation that tracks the arranged contingency', () => {
    const share = (contingency: string) => {
      const os = result.outcomes.filter(
        (o) =>
          result.plan.blocks[o.blockIndex].contingency === contingency &&
          !o.perturbationActive,
      );
      return os.filter((o) => o.chosenOption === 'A').length / os.length;
    };
    expect(share('A_rich')).toBeGreaterThan(share('B_rich'));
  });

  it('maintains switching rather than collapsing to exclusive preference', () => {
    const switches = result.outcomes.filter((o) => o.switched).length;
    const rate = switches / result.outcomes.length;
    // A degenerate switch rate would leave that state coordinate with no
    // variance to estimate dynamics from.
    expect(rate).toBeGreaterThan(0.02);
    expect(rate).toBeLessThan(0.6);
  });

  it('is reproducible from the seed', () => {
    const again = simulateSession('sim-seed-1', new MatchingAgent(), 500);
    expect(again.outcomes.map((o) => o.rewardOutcome)).toEqual(
      result.outcomes.map((o) => o.rewardOutcome),
    );
  });

  it('holds up under a random responder too', () => {
    const random = simulateSession('sim-seed-2', new RandomAgent(), 500);
    const planned = random.plan.blocks.reduce((s, b) => s + b.targetResponses, 0);
    expect(random.outcomes).toHaveLength(planned);
  });
});
