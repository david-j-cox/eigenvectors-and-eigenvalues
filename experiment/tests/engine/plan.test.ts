import { describe, expect, it } from 'vitest';
import { buildSessionPlan, plannedResponses } from '../../src/engine/plan';
import { DEFAULT_DESIGN } from '../../src/config/task';

const SEEDS = Array.from({ length: 40 }, (_, i) => `participant-${i}`);

describe('buildSessionPlan', () => {
  it('is fully reproducible from the seed', () => {
    const a = buildSessionPlan('abc123');
    const b = buildSessionPlan('abc123');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('counterbalances the color-to-contingency mapping across participants', () => {
    const seen = new Set(
      SEEDS.map((s) => JSON.stringify(buildSessionPlan(s).colorToContingency)),
    );
    expect(seen.size).toBe(2);
  });

  it('never repeats a color on consecutive blocks within the reversal part', () => {
    for (const seed of SEEDS) {
      const blocks = buildSessionPlan(seed).blocks.filter((b) => b.part === 'reversal');
      for (let i = 1; i < blocks.length; i++) {
        expect(blocks[i].color).not.toBe(blocks[i - 1].color);
      }
    }
  });

  it('alternates the mapping across all four stages (ABAB)', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const plan = buildSessionPlan(seed);
      const at = (stage: number, color: string) =>
        plan.blocks.find((b) => b.reversalStage === stage && b.color === color)!;

      for (const color of ['green', 'blue'] as const) {
        const [s1, s2, s3, s4] = [1, 2, 3, 4].map((n) => at(n, color));
        expect(s2.contingency).not.toBe(s1.contingency);
        // Restoring the first mapping is what breaks the confound between
        // "different contingency" and "later in the session".
        expect(s3.contingency).toBe(s1.contingency);
        expect(s4.contingency).toBe(s2.contingency);
      }
    }
  });

  it('repeats the A-to-B transition so a single odd reversal cannot pass for a real one', () => {
    const plan = buildSessionPlan('seed');
    const green = [1, 2, 3, 4].map(
      (n) => plan.blocks.find((b) => b.reversalStage === n && b.color === 'green')!.contingency,
    );
    const transitions = green.slice(1).map((c, i) => `${green[i]}->${c}`);
    // A-to-B occurs at stages 1-2 and 3-4; B-to-A at stages 2-3.
    const forward = transitions.filter((t) => t === transitions[0]);
    expect(forward).toHaveLength(2);
    expect(transitions).toHaveLength(3);
  });

  it('gives every color x contingency cell the same amount of data', () => {
    // The weakest cell sets what the design can claim. Under the earlier ABA
    // arrangement the reversed cells got half the exposures of the original
    // ones, so the binding constraint was worse than the headline figure.
    const plan = buildSessionPlan('seed');
    const counts = new Map<string, number>();
    for (const b of plan.blocks) {
      if (b.part !== 'reversal') continue;
      const key = `${b.color}|${b.contingency}`;
      counts.set(key, (counts.get(key) ?? 0) + b.targetResponses);
    }
    expect(counts.size).toBe(4);
    expect(new Set(counts.values()).size).toBe(1);
  });

  it('gives every color x contingency x stage cell the planned number of exposures', () => {
    const plan = buildSessionPlan('seed');
    for (const stage of [1, 2, 3, 4]) {
      for (const color of ['green', 'blue'] as const) {
        const cells = plan.blocks.filter(
          (b) => b.reversalStage === stage && b.color === color,
        );
        expect(cells).toHaveLength(DEFAULT_DESIGN.exposuresPerColorPerStage);
      }
    }
  });

  it('holds total programmed reinforcement rate constant across contingencies', () => {
    const plan = buildSessionPlan('seed');
    const rates = new Set(
      plan.blocks
        .filter((b) => b.part !== 'practice')
        .map((b) => (1000 / b.viAMs + 1000 / b.viBMs).toFixed(6)),
    );
    // Any difference between contexts must be in distribution, not richness.
    expect(rates.size).toBe(1);
  });

  it('places every perturbation inside the perturbation part', () => {
    for (const seed of SEEDS.slice(0, 15)) {
      const plan = buildSessionPlan(seed);
      for (const p of plan.perturbations) {
        expect(plan.blocks[p.blockIndex].part).toBe('perturbation');
      }
    }
  });

  it('keeps perturbations clear of the reversal stages the replication test uses', () => {
    const plan = buildSessionPlan('seed');
    const perturbedBlocks = new Set(plan.perturbations.map((p) => p.blockIndex));
    for (const b of plan.blocks) {
      if (b.part === 'reversal') expect(perturbedBlocks.has(b.index)).toBe(false);
    }
  });

  it('leaves the first perturbation block unperturbed as a local baseline', () => {
    for (const seed of SEEDS.slice(0, 15)) {
      const plan = buildSessionPlan(seed);
      const first = plan.blocks.find((b) => b.part === 'perturbation')!;
      expect(plan.perturbations.some((p) => p.blockIndex === first.index)).toBe(false);
    }
  });

  it('balances perturbation types and numbers repetitions within type', () => {
    const plan = buildSessionPlan('seed');
    const ext = plan.perturbations.filter((p) => p.type === 'extinction');
    const rev = plan.perturbations.filter((p) => p.type === 'contingency_reversal');
    expect(ext).toHaveLength(DEFAULT_DESIGN.nExtinctionPerturbations);
    expect(rev).toHaveLength(DEFAULT_DESIGN.nReversalPerturbations);
    expect(ext.map((p) => p.repetitionNumber).sort()).toEqual([1, 2, 3, 4]);
    expect(rev.map((p) => p.repetitionNumber).sort()).toEqual([1, 2, 3, 4]);
  });

  it('never overlaps two perturbations in the same block', () => {
    for (const seed of SEEDS) {
      const plan = buildSessionPlan(seed);
      const byBlock = new Map<number, typeof plan.perturbations>();
      for (const p of plan.perturbations) {
        byBlock.set(p.blockIndex, [...(byBlock.get(p.blockIndex) ?? []), p]);
      }
      for (const [, ps] of byBlock) {
        const sorted = [...ps].sort((a, b) => a.onsetResponseInBlock - b.onsetResponseInBlock);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i].onsetResponseInBlock).toBeGreaterThanOrEqual(
            sorted[i - 1].onsetResponseInBlock + sorted[i - 1].durationResponses,
          );
        }
      }
    }
  });

  it('keeps every perturbation and its recovery window inside its block', () => {
    for (const seed of SEEDS) {
      const plan = buildSessionPlan(seed);
      for (const p of plan.perturbations) {
        const block = plan.blocks[p.blockIndex];
        expect(p.onsetResponseInBlock + p.durationResponses).toBeLessThanOrEqual(
          block.targetResponses,
        );
      }
    }
  });

  it('yields blocks that divide evenly into state bins', () => {
    const plan = buildSessionPlan('seed');
    for (const b of plan.blocks) {
      expect(b.targetResponses % DEFAULT_DESIGN.stateBinResponses).toBe(0);
    }
  });

  it('produces the transitions per cell the design simulation assumed', () => {
    const bin = DEFAULT_DESIGN.stateBinResponses;
    // Each block contributes (responses / bin) - 1 within-block transitions;
    // the transition across a block boundary belongs to a different analysis.
    const perBlock = DEFAULT_DESIGN.blockResponses / bin - 1;
    const perCellPerStage = perBlock * DEFAULT_DESIGN.exposuresPerColorPerStage;

    expect(perCellPerStage).toBe(36);
    // Under ABAB each cell occurs in two stages, so it pools to 72 -- the
    // AUC ~0.82 operating point the design was sized to, and now the same for
    // every cell rather than only the unreversed ones.
    expect(perCellPerStage * 2).toBe(72);
  });

  it('stays inside the session response budget', () => {
    const plan = buildSessionPlan('seed');
    const total = plannedResponses(plan);
    expect(total).toBe(
      DEFAULT_DESIGN.practiceResponses +
        DEFAULT_DESIGN.nStages *
          DEFAULT_DESIGN.exposuresPerColorPerStage *
          2 *
          DEFAULT_DESIGN.blockResponses +
        DEFAULT_DESIGN.perturbationBlocks * DEFAULT_DESIGN.perturbationBlockResponses,
    );
    // At the 2.84 responses/s that responders calibrated to the previous
    // study's participants produce, this is about 24 minutes of responding.
    // The ceiling the session was sized to is 30.
    expect(total / 2.84 / 60).toBeLessThan(30);
  });
});
