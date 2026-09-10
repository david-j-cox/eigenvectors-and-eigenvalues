// ============================================================
// Concurrent variable-interval schedules with a changeover delay.
//
// VI rather than response-probability reinforcement, because a
// reinforcer set up on the unchosen alternative keeps accruing
// while the participant works the other one. That is what makes
// exclusive preference costly and sustains the switching the
// state vector needs; a ratio or per-response-probability
// schedule drives choice to exclusivity and flattens the very
// dynamics being measured.
//
// The COD withholds reinforcement briefly after a changeover so
// that switching itself is not adventitiously reinforced.
// ============================================================

import type { CodState, EngineConfig, Side, ViState } from './types';

/** Extinction is represented as an infinite mean interval. */
export const EXTINCTION_MS = Number.POSITIVE_INFINITY;

/**
 * Draw an interval from an exponential distribution with the given mean, so
 * that the schedule is genuinely variable and time to the next setup carries
 * no information the participant can exploit.
 */
export function drawInterval(
  meanMs: number,
  rng: () => number,
  cfg: EngineConfig,
): number {
  if (!Number.isFinite(meanMs)) return EXTINCTION_MS;
  const raw = -meanMs * Math.log(1 - rng());
  return Math.min(
    Math.max(raw, meanMs * cfg.viMinMultiple),
    meanMs * cfg.viMaxMultiple,
  );
}

export function createViState(
  intervalMs: number,
  nowMs: number,
  rng: () => number,
  cfg: EngineConfig,
): ViState {
  return {
    intervalMs,
    richness: 1,
    baited: false,
    nextBaitAtMs: nowMs + drawInterval(intervalMs, rng, cfg),
    lastReinforcerAtMs: -Infinity,
  };
}

/** The mean interval actually in force, after depletion. */
export function effectiveIntervalMs(vi: ViState): number {
  if (!Number.isFinite(vi.intervalMs)) return EXTINCTION_MS;
  return vi.intervalMs / Math.max(vi.richness, 1e-6);
}

/**
 * Apply depletion to the harvested alternative and recovery to both.
 *
 * Recovery is applied to the alternative that was not chosen as well, so
 * richness reflects time away rather than merely responses withheld; that is
 * what makes leaving an alternative and returning to it worthwhile.
 */
export function applyDepletion(
  chosen: ViState,
  other: ViState,
  dtSeconds: number,
  cfg: EngineConfig,
): { chosen: ViState; other: ViState } {
  const d = cfg.depletion;
  if (!d.enabled) return { chosen, other };

  const recover = (vi: ViState): number =>
    Math.min(1, vi.richness + d.recoveryPerS * Math.max(0, dtSeconds));

  const chosenRichness = Math.max(
    d.minRichness,
    recover(chosen) * (1 - d.perResponse),
  );

  return {
    chosen: { ...chosen, richness: chosenRichness },
    other: { ...other, richness: recover(other) },
  };
}

/**
 * Advance a schedule to the current time.
 *
 * Baiting is sticky: once a reinforcer is set up it waits until collected, so
 * time spent on the other alternative accumulates value here rather than being
 * discarded.
 */
export function updateBaiting(
  vi: ViState,
  nowMs: number,
  rng: () => number,
  cfg: EngineConfig,
): ViState {
  if (!Number.isFinite(vi.intervalMs)) return vi;
  if (nowMs < vi.nextBaitAtMs) return vi;
  return {
    ...vi,
    baited: true,
    nextBaitAtMs: nowMs + drawInterval(effectiveIntervalMs(vi), rng, cfg),
  };
}

/**
 * Change a schedule's programmed interval without discarding its pending setup.
 *
 * Used when a perturbation overrides the contingency mid-block. The already
 * scheduled bait time is rescaled by the ratio of the new mean to the old, so
 * the transition neither grants a free immediate reinforcer nor imposes an
 * artificial pause that would confound the perturbation with a timing artifact.
 */
export function retargetVi(
  vi: ViState,
  newIntervalMs: number,
  nowMs: number,
  rng: () => number,
  cfg: EngineConfig,
): ViState {
  if (vi.intervalMs === newIntervalMs) return vi;
  if (!Number.isFinite(newIntervalMs)) {
    // Going to extinction: cancel any pending setup as well as future ones.
    return { ...vi, intervalMs: EXTINCTION_MS, baited: false, nextBaitAtMs: Infinity };
  }
  if (!Number.isFinite(vi.intervalMs)) {
    const restored = { ...vi, intervalMs: newIntervalMs };
    return {
      ...restored,
      nextBaitAtMs: nowMs + drawInterval(effectiveIntervalMs(restored), rng, cfg),
    };
  }
  const remaining = Math.max(0, vi.nextBaitAtMs - nowMs);
  const scaled = remaining * (newIntervalMs / vi.intervalMs);
  return { ...vi, intervalMs: newIntervalMs, nextBaitAtMs: nowMs + scaled };
}

export function createCodState(): CodState {
  return {
    active: false,
    side: null,
    startedAtMs: 0,
    durationMs: 0,
    responsesRemaining: 0,
  };
}

export function startCod(
  side: Side,
  nowMs: number,
  durationMs: number,
  responses: number,
): CodState {
  return {
    active: true,
    side,
    startedAtMs: nowMs,
    durationMs,
    responsesRemaining: responses,
  };
}

/** The delay runs until BOTH its time and its response requirement are met. */
export function isCodActive(cod: CodState, nowMs: number): boolean {
  if (!cod.active) return false;
  return nowMs < cod.startedAtMs + cod.durationMs || cod.responsesRemaining > 0;
}

/** Count one response toward satisfying the response half of the delay. */
export function tickCod(cod: CodState): CodState {
  if (!cod.active || cod.responsesRemaining <= 0) return cod;
  return { ...cod, responsesRemaining: cod.responsesRemaining - 1 };
}

/**
 * Collect a reinforcer if one is set up and the COD does not block it.
 *
 * A reinforcer blocked by the COD stays baited rather than being lost, so the
 * arranged reinforcement rate is preserved and the COD only delays delivery.
 */
export function collect(
  vi: ViState,
  nowMs: number,
  codBlocking: boolean,
): { delivered: boolean; withheldByCod: boolean; vi: ViState } {
  if (!vi.baited) return { delivered: false, withheldByCod: false, vi };
  if (codBlocking) return { delivered: false, withheldByCod: true, vi };
  return {
    delivered: true,
    withheldByCod: false,
    vi: { ...vi, baited: false, lastReinforcerAtMs: nowMs },
  };
}

// ============================================================
// Depleting response-probability schedule.
//
// The previous study's mechanism, and the reason its eigenanalysis
// worked. Each alternative carries a latent value in [0, 1] that
// IS the reinforcement probability for a response to it. Harvesting
// subtracts from it; time restores it. The context sets the
// recovery rates, which is how "A-rich" is expressed here.
//
// Why this exists alongside the VI mode: under an interval schedule
// the obtained reinforcement rate is rate-limited by the schedule
// and barely moves, because a pending setup waits however long the
// participant is away. Measured on simulated sessions, the true
// between-bin SD of reward rate is 0.047 under concurrent VI
// against 0.280 in the previous study -- and adding depletion to
// the VI made it worse, not better, because the pending-setup
// buffer absorbs exactly what depletion is trying to create.
//
// That matters because reward rate is not an optional coordinate.
// On the previous study's real data, dropping it takes the state
// from AUC 0.86 to 0.62, the largest loss of any single
// coordinate. A schedule that flattens it removes most of what
// distinguishes one context's dynamics from another.
// ============================================================

/** Latent value of one alternative; this value is its reinforcement probability. */
export interface PatchState {
  /** Current reinforcement probability, in [0, 1]. */
  value: number;
  /** Value regained per second away from, or working, this alternative. */
  recoveryPerS: number;
  /** Value lost each time this alternative is harvested. */
  depletionPerResponse: number;
}

export function createPatchState(
  recoveryPerS: number,
  depletionPerResponse: number,
  startingValue: number,
): PatchState {
  return { value: startingValue, recoveryPerS, depletionPerResponse };
}

/**
 * Recover both alternatives over the interval since the previous response.
 *
 * Both recover, not just the neglected one: the chosen alternative is depleted
 * separately, after its reinforcement probability has been read. Recovering
 * only the unchosen one would make time away doubly valuable and exaggerate the
 * pull back toward a neglected alternative.
 */
export function recoverPatches(
  a: PatchState,
  b: PatchState,
  dtSeconds: number,
): { a: PatchState; b: PatchState } {
  const grow = (p: PatchState): PatchState => ({
    ...p,
    value: Math.min(1, p.value + p.recoveryPerS * Math.max(0, dtSeconds)),
  });
  return { a: grow(a), b: grow(b) };
}

/**
 * Read the reinforcement probability for this response, then deplete.
 *
 * The probability is read BEFORE depletion, so a response is reinforced at the
 * value the alternative held when it was made rather than at the value its own
 * harvest produced.
 */
export function harvestPatch(
  patch: PatchState,
  rng: () => number,
  codBlocking: boolean,
): { delivered: boolean; withheldByCod: boolean; probability: number; patch: PatchState } {
  const probability = patch.value;
  const depleted: PatchState = {
    ...patch,
    value: Math.max(0, patch.value - patch.depletionPerResponse),
  };

  if (codBlocking) {
    // The changeover delay withholds the reinforcer but the alternative is
    // still worked, so it depletes either way.
    return { delivered: false, withheldByCod: true, probability, patch: depleted };
  }
  return {
    delivered: rng() < probability,
    withheldByCod: false,
    probability,
    patch: depleted,
  };
}

/** Effective interval, in ms, equivalent to a probability -- for logging only. */
export function probabilityAsIntervalMs(p: number, meanIciMs: number): number {
  return p > 0 ? meanIciMs / p : EXTINCTION_MS;
}
