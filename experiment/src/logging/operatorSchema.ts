// ============================================================
// One row per response.
//
// Every quantity the analysis needs is on the row, including the arranged
// state that produced it. The schedule is generated from the seed, so it could
// in principle be reconstructed, but a row that carries what was arranged
// alongside what happened lets a disagreement between them be detected instead
// of assumed away.
// ============================================================

import type { RichSide, StimulusKind } from '../config/operator';
import type { ResponseSlot } from '../engine/operator';

export interface OperatorEventRow {
  participant_id: string;
  prolific_pid: string | null;
  study_id: string | null;
  session_id: string;
  experiment_version: string;
  is_test: 0 | 1;

  timestamp_utc: string;
  elapsed_ms: number;
  response_time_ms: number;
  trial_index: number;

  block_index: number;
  index_in_block: number;
  is_practice: 0 | 1;

  /** Panel favoured by the block state, before any perturbation. */
  block_rich: RichSide;
  /** Panel favoured on this response, after any perturbation. */
  effective_rich: RichSide;
  perturbation_active: 0 | 1;
  responses_since_perturbation: number | null;

  stimulus: StimulusKind;
  stimulus_side: string | null;
  /** Whether the stimulus sat on the panel the block state favoured. */
  stimulus_congruent: 0 | 1 | null;

  p_left: number;
  p_right: number;

  chosen_side: string;
  previous_side: string | null;
  switched: 0 | 1;
  chose_rich: 0 | 1;
  chose_stimulus_side: 0 | 1 | null;

  rewarded: 0 | 1;
  points_delta: number;
  points_total: number;
  p_used: number;
}

export const OPERATOR_COLUMNS: (keyof OperatorEventRow)[] = [
  'participant_id', 'prolific_pid', 'study_id', 'session_id',
  'experiment_version', 'is_test',
  'timestamp_utc', 'elapsed_ms', 'response_time_ms', 'trial_index',
  'block_index', 'index_in_block', 'is_practice',
  'block_rich', 'effective_rich', 'perturbation_active',
  'responses_since_perturbation',
  'stimulus', 'stimulus_side', 'stimulus_congruent',
  'p_left', 'p_right',
  'chosen_side', 'previous_side', 'switched', 'chose_rich', 'chose_stimulus_side',
  'rewarded', 'points_delta', 'points_total', 'p_used',
];

export function buildOperatorRow(a: {
  identity: {
    participantId: string; prolificPid: string | null; studyId: string | null;
    sessionId: string; experimentVersion: string;
  };
  isTest: boolean;
  slot: ResponseSlot;
  elapsedMs: number;
  responseTimeMs: number;
  chosen: 'left' | 'right';
  previous: 'left' | 'right' | null;
  rewarded: boolean;
  pointsDelta: number;
  pointsTotal: number;
  pUsed: number;
}): OperatorEventRow {
  const b = (x: boolean): 0 | 1 => (x ? 1 : 0);
  const s = a.slot;
  return {
    participant_id: a.identity.participantId,
    prolific_pid: a.identity.prolificPid,
    study_id: a.identity.studyId,
    session_id: a.identity.sessionId,
    experiment_version: a.identity.experimentVersion,
    is_test: b(a.isTest),
    timestamp_utc: new Date().toISOString(),
    elapsed_ms: Math.round(a.elapsedMs),
    response_time_ms: Math.round(a.responseTimeMs),
    trial_index: s.index,
    block_index: s.block,
    index_in_block: s.indexInBlock,
    is_practice: b(s.isPractice),
    block_rich: s.blockRich,
    effective_rich: s.effectiveRich,
    perturbation_active: b(s.perturbationActive),
    responses_since_perturbation: s.sincePerturbation,
    stimulus: s.stimulus,
    stimulus_side: s.stimulusSide,
    stimulus_congruent:
      s.stimulusSide === null ? null : b(s.stimulusSide === s.blockRich),
    p_left: s.pLeft,
    p_right: s.pRight,
    chosen_side: a.chosen,
    previous_side: a.previous,
    switched: b(a.previous !== null && a.previous !== a.chosen),
    chose_rich: b(a.chosen === s.effectiveRich),
    chose_stimulus_side:
      s.stimulusSide === null ? null : b(a.chosen === s.stimulusSide),
    rewarded: b(a.rewarded),
    points_delta: a.pointsDelta,
    points_total: a.pointsTotal,
    p_used: a.pUsed,
  };
}
