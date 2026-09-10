// ============================================================
// The raw event schema.
//
// Every row carries enough information to reconstruct the entire
// experimental state at that moment. Nothing downstream should
// need to consult a separate randomization file or recompute the
// schedule to know what was arranged: if a derived file and the
// raw events ever disagree, the raw events must be able to settle
// it on their own.
// ============================================================

import type { Block, ResponseOutcome, SessionPlan } from '../engine/types';
import { COLORS } from '../config/task';

export interface QualityContext {
  pageVisible: boolean;
  fullscreenActive: boolean;
  focusLostCount: number;
  browserWidth: number;
  browserHeight: number;
  inputMethod: 'keyboard' | 'mouse' | 'touch';
}

export interface SessionIdentity {
  participantId: string;
  prolificPid: string | null;
  studyId: string | null;
  prolificSessionId: string | null;
  sessionId: string;
  experimentVersion: string;
}

export interface EventRow {
  // identifiers
  participant_id: string;
  prolific_pid: string | null;
  study_id: string | null;
  session_id: string;
  experiment_version: string;

  // timing
  timestamp_utc: string;
  elapsed_time_ms: number;
  trial_index: number;
  block_index: number;
  trial_in_block: number;
  response_time_ms: number;
  ici_ms: number;

  // response
  chosen_option: string;
  previous_option: string | null;
  switched: 0 | 1;
  run_length: number;

  // consequence
  reward_outcome: 0 | 1;
  points_earned: number;
  cumulative_points: number;
  /** Programmed VI in force for this response, after any perturbation. */
  vi_a_ms: number;
  vi_b_ms: number;
  /** Momentary reinforcement rate, the interval-schedule analogue of p(reward). */
  rate_a_per_s: number;
  rate_b_per_s: number;
  /** Depletion state, 1 when the alternative is at its programmed richness. */
  richness_a: number;
  richness_b: number;
  /** Effective rate after depletion; this is what the response actually faced. */
  effective_rate_a_per_s: number;
  effective_rate_b_per_s: number;
  cod_active: 0 | 1;
  /**
   * This response met a set-up reinforcer but was ineligible because the
   * changeover delay was running. The reinforcer is not lost -- it stays set up
   * for the next eligible response -- so summing this column counts blocked
   * responses, not forgone reinforcers.
   */
  reinforcer_withheld_by_cod: 0 | 1;

  // context
  part: string;
  physical_context_id: string;
  context_color: string;
  context_pattern: string;
  functional_contingency_id: string;
  exposure_number: number;
  reversal_stage: number | null;
  trials_since_context_switch: number;

  // perturbation
  perturbation_active: 0 | 1;
  perturbation_type: string | null;
  perturbation_id: string | null;
  perturbation_repetition: number | null;
  trials_since_perturbation_onset: number | null;
  trials_since_perturbation_offset: number | null;

  // quality control
  page_visible: 0 | 1;
  fullscreen_active: 0 | 1;
  focus_lost_count: number;
  browser_width: number;
  browser_height: number;
  input_method: string;
}

export const EVENT_COLUMNS: (keyof EventRow)[] = [
  'participant_id', 'prolific_pid', 'study_id', 'session_id', 'experiment_version',
  'timestamp_utc', 'elapsed_time_ms', 'trial_index', 'block_index', 'trial_in_block',
  'response_time_ms', 'ici_ms',
  'chosen_option', 'previous_option', 'switched', 'run_length',
  'reward_outcome', 'points_earned', 'cumulative_points',
  'vi_a_ms', 'vi_b_ms', 'rate_a_per_s', 'rate_b_per_s',
  'richness_a', 'richness_b', 'effective_rate_a_per_s', 'effective_rate_b_per_s',
  'cod_active', 'reinforcer_withheld_by_cod',
  'part', 'physical_context_id', 'context_color', 'context_pattern',
  'functional_contingency_id', 'exposure_number', 'reversal_stage',
  'trials_since_context_switch',
  'perturbation_active', 'perturbation_type', 'perturbation_id',
  'perturbation_repetition',
  'trials_since_perturbation_onset', 'trials_since_perturbation_offset',
  'page_visible', 'fullscreen_active', 'focus_lost_count',
  'browser_width', 'browser_height', 'input_method',
];

const bit = (b: boolean): 0 | 1 => (b ? 1 : 0);
const ratePerS = (viMs: number) => (Number.isFinite(viMs) ? 1000 / viMs : 0);

export function toEventRow(
  outcome: ResponseOutcome,
  block: Block,
  plan: SessionPlan,
  identity: SessionIdentity,
  quality: QualityContext,
  startedAtMs: number,
): EventRow {
  const color = COLORS[block.color];
  const perturbation = outcome.perturbationId
    ? plan.perturbations.find((p) => p.id === outcome.perturbationId) ?? null
    : null;

  return {
    participant_id: identity.participantId,
    prolific_pid: identity.prolificPid,
    study_id: identity.studyId,
    session_id: identity.sessionId,
    experiment_version: identity.experimentVersion,

    timestamp_utc: new Date(startedAtMs + outcome.elapsedMs).toISOString(),
    elapsed_time_ms: Math.round(outcome.elapsedMs),
    trial_index: outcome.trialIndex,
    block_index: outcome.blockIndex,
    trial_in_block: outcome.trialInBlock,
    response_time_ms: Math.round(outcome.responseTimeMs),
    ici_ms: Math.round(outcome.iciMs),

    chosen_option: outcome.chosenOption,
    previous_option: outcome.previousOption,
    switched: bit(outcome.switched),
    run_length: outcome.runLength,

    reward_outcome: outcome.rewardOutcome,
    points_earned: outcome.pointsEarned,
    cumulative_points: outcome.cumulativePoints,
    vi_a_ms: Number.isFinite(outcome.viAMs) ? outcome.viAMs : -1,
    vi_b_ms: Number.isFinite(outcome.viBMs) ? outcome.viBMs : -1,
    rate_a_per_s: ratePerS(outcome.viAMs),
    rate_b_per_s: ratePerS(outcome.viBMs),
    richness_a: outcome.richnessA,
    richness_b: outcome.richnessB,
    effective_rate_a_per_s: ratePerS(outcome.viAMs) * outcome.richnessA,
    effective_rate_b_per_s: ratePerS(outcome.viBMs) * outcome.richnessB,
    cod_active: bit(outcome.codActive),
    reinforcer_withheld_by_cod: bit(outcome.reinforcerWithheldByCod),

    part: block.part,
    physical_context_id: block.color,
    context_color: color?.hex ?? '#000000',
    context_pattern: color?.pattern ?? 'plain',
    functional_contingency_id: block.contingency,
    exposure_number: block.exposureNumber,
    reversal_stage: block.reversalStage,
    trials_since_context_switch: outcome.trialsSinceContextSwitch,

    perturbation_active: bit(outcome.perturbationActive),
    perturbation_type: outcome.perturbationType,
    perturbation_id: outcome.perturbationId,
    perturbation_repetition: perturbation?.repetitionNumber ?? null,
    trials_since_perturbation_onset: outcome.trialsSincePerturbationOnset,
    trials_since_perturbation_offset: outcome.trialsSincePerturbationOffset,

    page_visible: bit(quality.pageVisible),
    fullscreen_active: bit(quality.fullscreenActive),
    focus_lost_count: quality.focusLostCount,
    browser_width: quality.browserWidth,
    browser_height: quality.browserHeight,
    input_method: quality.inputMethod,
  };
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: EventRow[]): string {
  const header = EVENT_COLUMNS.join(',');
  const body = rows.map((r) => EVENT_COLUMNS.map((c) => csvCell(r[c])).join(','));
  return [header, ...body].join('\n');
}

// ============================================================
// The session record.
//
// One row per session, holding the seed and the resolved plan.
// The events alone can reconstruct the schedule -- the seed is
// just `version::participant_id` -- but that reconstruction is
// only trustworthy if there is something independent to check it
// against. This is that something: if a regenerated schedule and
// the stored plan disagree, the discrepancy is visible rather
// than silently absorbed.
//
// It is written twice: once when the participant starts, so an
// abandoned session still leaves a record saying who started and
// what was arranged, and once at the end with the totals.
// ============================================================

export interface SessionOutcomeSummary {
  totalResponses: number;
  totalRewards: number;
  totalPoints: number;
  completionStatus: 'in_progress' | 'complete' | 'declined';
}

export function toSessionRecord(
  identity: SessionIdentity,
  plan: SessionPlan,
  engineConfig: unknown,
  designConfig: unknown,
  quality: Pick<QualityContext, 'browserWidth' | 'browserHeight'>,
  summary: SessionOutcomeSummary,
  completionCode: string,
  isTestSession: boolean,
): Record<string, unknown> {
  return {
    session_id: identity.sessionId,
    participant_id: identity.participantId,
    prolific_pid: identity.prolificPid,
    study_id: identity.studyId,
    prolific_session_id: identity.prolificSessionId,
    experiment_version: identity.experimentVersion,

    seed: plan.seed,
    color_to_contingency: plan.colorToContingency,
    block_plan: plan.blocks,
    perturbation_plan: plan.perturbations,
    engine_config: engineConfig,
    design_config: designConfig,

    ended_at: summary.completionStatus === 'in_progress' ? null : new Date().toISOString(),
    total_responses: summary.totalResponses,
    total_rewards: summary.totalRewards,
    total_points: summary.totalPoints,
    completion_status: summary.completionStatus,
    completion_code: completionCode,

    browser_width: quality.browserWidth,
    browser_height: quality.browserHeight,
    user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent,
    is_test_session: isTestSession,

    updated_at: new Date().toISOString(),
  };
}
