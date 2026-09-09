// ============================================================
// Perturbations as data, not as branches in the task loop.
//
// A perturbation is a temporary override of the block's
// programmed schedule. Everything else -- block sequencing,
// response handling, logging -- is unaware that a perturbation
// exists; it only ever asks what schedule is in force right now.
// Adding a type means adding one case here.
// ============================================================

import type { Block, Perturbation, Side } from './types';
import { EXTINCTION_MS } from './schedule';

export interface EffectiveSchedule {
  viAMs: number;
  viBMs: number;
  perturbation: Perturbation | null;
}

/** Is this perturbation in force at the given response count within its block? */
export function isActive(
  p: Perturbation,
  blockIndex: number,
  responsesInBlock: number,
): boolean {
  if (p.blockIndex !== blockIndex) return false;
  return (
    responsesInBlock >= p.onsetResponseInBlock &&
    responsesInBlock < p.onsetResponseInBlock + p.durationResponses
  );
}

/**
 * The schedule actually in force for the next response.
 *
 * `preferredSide` is only consulted by the alternative-reinforcement pulse,
 * which by definition enriches whichever option the participant is currently
 * using less.
 */
export function effectiveSchedule(
  block: Block,
  perturbations: readonly Perturbation[],
  responsesInBlock: number,
  preferredSide: Side | null,
): EffectiveSchedule {
  const active = perturbations.find((p) =>
    isActive(p, block.index, responsesInBlock),
  );

  if (!active) {
    return { viAMs: block.viAMs, viBMs: block.viBMs, perturbation: null };
  }

  switch (active.type) {
    case 'extinction':
      return { viAMs: EXTINCTION_MS, viBMs: EXTINCTION_MS, perturbation: active };

    case 'contingency_reversal':
      return { viAMs: block.viBMs, viBMs: block.viAMs, perturbation: active };

    case 'alternative_pulse': {
      // Enrich the less-preferred option, leaving the other untouched.
      const lessPreferred: Side = preferredSide === 'A' ? 'B' : 'A';
      const enriched = Math.min(block.viAMs, block.viBMs) / 2;
      return {
        viAMs: lessPreferred === 'A' ? enriched : block.viAMs,
        viBMs: lessPreferred === 'B' ? enriched : block.viBMs,
        perturbation: active,
      };
    }

    case 'rich_pulse':
      return {
        viAMs: block.viAMs / 2,
        viBMs: block.viBMs / 2,
        perturbation: active,
      };
  }
}

/** Responses since a perturbation started, or null if none is in force. */
export function trialsSinceOnset(
  p: Perturbation | null,
  responsesInBlock: number,
): number | null {
  return p ? responsesInBlock - p.onsetResponseInBlock : null;
}

/**
 * Responses since the most recent perturbation in this block ended.
 *
 * This is the recovery clock: the analysis aligns every recovery trajectory on
 * it, so it must be computed from the schedule rather than reconstructed later
 * from the reinforcement record.
 */
export function trialsSinceOffset(
  perturbations: readonly Perturbation[],
  blockIndex: number,
  responsesInBlock: number,
): number | null {
  let best: number | null = null;
  for (const p of perturbations) {
    if (p.blockIndex !== blockIndex) continue;
    const offset = p.onsetResponseInBlock + p.durationResponses;
    if (responsesInBlock < offset) continue;
    const since = responsesInBlock - offset;
    if (best === null || since < best) best = since;
  }
  return best;
}
