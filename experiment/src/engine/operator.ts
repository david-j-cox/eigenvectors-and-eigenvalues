// ============================================================
// The schedule for the free-operant operator-estimation procedure.
//
// The whole session is generated in advance from the participant's seed, one
// entry per response, rather than decided response by response. Three reasons.
// The momentary stimuli have to be visible BEFORE the response they apply to,
// so what a response will be worth must be known before it is emitted.
// Perturbations and their recovery windows have placement constraints that are
// easier to satisfy by construction than by rejection at runtime. And a
// schedule that exists as data can be checked against the logged events after
// the fact, so a disagreement between what was arranged and what was recorded
// is detectable rather than assumed away.
// ============================================================

import { createRng } from '../utils/rng';
import { OPERATOR_CONFIG as C, type RichSide, type StimulusKind } from '../config/operator';

export interface ResponseSlot {
  index: number;
  block: number;
  indexInBlock: number;
  /** Which panel the block state favours, before any perturbation. */
  blockRich: RichSide;
  /** Which panel is favoured on THIS response, after any perturbation. */
  effectiveRich: RichSide;
  perturbationActive: boolean;
  /** Responses since the most recent perturbation ended; null before the first. */
  sincePerturbation: number | null;
  stimulus: StimulusKind;
  /** Panel the stimulus is on; null when there is none. */
  stimulusSide: 'left' | 'right' | null;
  pLeft: number;
  pRight: number;
  isPractice: boolean;
}

function probabilities(
  rich: RichSide,
  stimulus: StimulusKind,
  side: 'left' | 'right' | null,
): { pLeft: number; pRight: number } {
  // An appetitive stimulus supersedes the block state for its one response.
  if (stimulus === 'appetitive' && side) {
    return side === 'left'
      ? { pLeft: C.pAppetitiveSignalled, pRight: C.pAppetitiveOther }
      : { pLeft: C.pAppetitiveOther, pRight: C.pAppetitiveSignalled };
  }
  // An aversive stimulus does not change what either panel pays; its cost is
  // applied at scoring. The unmarked panel keeps the block rate.
  if (rich === 'left') return { pLeft: C.pRich, pRight: C.pLean };
  if (rich === 'right') return { pLeft: C.pLean, pRight: C.pRich };
  return { pLeft: C.pNeutral, pRight: C.pNeutral };
}

/** Draw a gap with a hard floor: floor + exponential(mean - floor). */
function drawGap(rnd: () => number): number {
  const extra = -(C.meanStimulusGap - C.minStimulusGap) * Math.log(1 - rnd());
  return C.minStimulusGap + Math.floor(extra);
}

export function buildSession(seed: string): ResponseSlot[] {
  const rnd = createRng(seed);
  const slots: ResponseSlot[] = [];

  const nBlocks = Math.ceil(
    (C.totalResponses - C.practiceResponses) / C.blockResponses,
  );

  // Block states alternate so that every boundary is a reversal; that is what
  // makes each boundary a within-subject replication rather than a
  // no-op. Which side starts is randomised per participant.
  let rich: RichSide = rnd() < 0.5 ? 'left' : 'right';

  // Perturbation placement. It must fall entirely inside the block and leave
  // the recovery window inside it too, so the onset is drawn from the range
  // that satisfies both.
  const perturbOnsets = new Set<number>();
  for (let b = 0; b < nBlocks; b++) {
    const first = 10;
    const last = C.blockResponses - C.perturbationResponses - C.perturbationRecovery;
    if (last <= first) continue;
    for (let k = 0; k < C.perturbationsPerBlock; k++) {
      const at = first + Math.floor(rnd() * (last - first));
      perturbOnsets.add(C.practiceResponses + b * C.blockResponses + at);
    }
  }

  let nextAppetitive = C.practiceResponses + drawGap(rnd);
  let nextAversive = C.practiceResponses + drawGap(rnd);
  let lastPerturbEnd: number | null = null;
  let perturbUntil = -1;

  for (let i = 0; i < C.totalResponses; i++) {
    const isPractice = i < C.practiceResponses;
    const rel = i - C.practiceResponses;
    const block = isPractice ? -1 : Math.floor(rel / C.blockResponses);
    const indexInBlock = isPractice ? i : rel % C.blockResponses;

    if (!isPractice && indexInBlock === 0 && rel > 0) {
      rich = rich === 'left' ? 'right' : 'left';
    }

    if (perturbOnsets.has(i)) {
      perturbUntil = i + C.perturbationResponses;
    }
    const perturbationActive = i < perturbUntil;
    if (!perturbationActive && perturbUntil === i && perturbUntil > 0) {
      lastPerturbEnd = i;
    }

    const blockRich: RichSide = isPractice ? 'neutral' : rich;
    const effectiveRich: RichSide = perturbationActive
      ? blockRich === 'left' ? 'right' : 'left'
      : blockRich;

    const since = lastPerturbEnd === null ? null : i - lastPerturbEnd;
    // No momentary stimulus during a perturbation or its recovery window: the
    // return has to be observed without further disturbance.
    const inRecovery =
      perturbationActive || (since !== null && since < C.perturbationRecovery);

    let stimulus: StimulusKind = 'none';
    let stimulusSide: 'left' | 'right' | null = null;

    if (!isPractice && !inRecovery) {
      if (i >= nextAppetitive) {
        stimulus = 'appetitive';
        const congruent = rnd() < C.appetitiveCongruence;
        const favoured = blockRich === 'right' ? 'right' : 'left';
        stimulusSide = congruent
          ? favoured
          : favoured === 'left' ? 'right' : 'left';
        nextAppetitive = i + drawGap(rnd);
      } else if (i >= nextAversive) {
        stimulus = 'aversive';
        const congruent = rnd() < C.aversiveCongruence;
        const favoured = blockRich === 'right' ? 'right' : 'left';
        stimulusSide = congruent
          ? favoured
          : favoured === 'left' ? 'right' : 'left';
        nextAversive = i + drawGap(rnd);
      }
    } else if (!isPractice) {
      // Push both schedules past the window rather than letting them fire the
      // instant it ends, which would cluster stimuli at recovery offsets.
      if (i >= nextAppetitive) nextAppetitive = i + drawGap(rnd);
      if (i >= nextAversive) nextAversive = i + drawGap(rnd);
    }

    const { pLeft, pRight } = probabilities(effectiveRich, stimulus, stimulusSide);
    slots.push({
      index: i, block, indexInBlock, blockRich, effectiveRich,
      perturbationActive, sincePerturbation: since,
      stimulus, stimulusSide, pLeft, pRight, isPractice,
    });
  }
  return slots;
}

export interface Outcome {
  rewarded: boolean;
  pointsDelta: number;
  pUsed: number;
}

export function scoreResponse(
  slot: ResponseSlot,
  side: 'left' | 'right',
  rnd: () => number,
): Outcome {
  // The aversive stimulus costs a point when its panel is chosen and pays
  // nothing extra otherwise; it never alters what either panel pays.
  if (slot.stimulus === 'aversive' && slot.stimulusSide === side) {
    return { rewarded: false, pointsDelta: -C.aversiveCost, pUsed: 0 };
  }
  const p = side === 'left' ? slot.pLeft : slot.pRight;
  const rewarded = rnd() < p;
  return { rewarded, pointsDelta: rewarded ? 1 : 0, pUsed: p };
}
