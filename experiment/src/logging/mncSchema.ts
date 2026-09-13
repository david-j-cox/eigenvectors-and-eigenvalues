// ============================================================
// One row per choice in the Multiple Necessary Cues pilot.
//
// The row carries the whole trial, not a summary of it: every
// alternative that was on screen, which one was the target, which
// was chosen, and the per-dimension match AND its chance baseline.
// The baseline matters because a dimension on which all four
// alternatives agreed carries no evidence about attention to it,
// and no analysis should have to re-derive that from a seed.
// ============================================================

import type { Arm, DimId } from '../config/mnc';
import { DIMENSIONS } from '../config/mnc';
import type { Compound, ContextSpec } from '../engine/mnc';
import { compoundToIndex, describe } from '../engine/mnc';

export interface MncEventRow {
  participant_id: string;
  prolific_pid: string | null;
  study_id: string | null;
  session_id: string;
  experiment_version: string;
  is_test: 0 | 1;

  arm: Arm;
  timestamp_utc: string;
  elapsed_ms: number;
  response_time_ms: number;

  trial_index: number;          // across the whole session
  context_index: number;        // which context/target this is
  trial_in_context: number;

  context_color: string;
  target_index: number;         // 0..15, the winning compound as shown
  target_label: string;         // human-readable, e.g. "circle|large|horizontal|blue"

  /** Which dimensions determined the answer in this context. The rest varied
   *  and carried nothing, so a match on them is chance by construction. */
  relevant_dims: string;        // e.g. "shape|hue"
  rel_shape: 0 | 1;
  rel_size: 0 | 1;
  rel_orientation: 0 | 1;
  rel_hue: 0 | 1;

  /** All alternatives as shown, left-to-right / top-to-bottom. */
  alternatives: number[];
  target_position: number;
  chosen_position: number;
  chosen_index: number;
  chosen_label: string;

  correct: 0 | 1;
  rewarded: 0 | 1;
  points_total: number;
  error_disparity: number;      // dimensions wrong; 0 when correct

  /** Per dimension: did the choice match the target? */
  match_shape: 0 | 1;
  match_size: 0 | 1;
  match_orientation: 0 | 1;
  match_hue: 0 | 1;

  /** Per dimension: how many of the alternatives carried the target's value.
   *  Equal to the number of alternatives => the dimension did not
   *  discriminate on this trial. */
  navail_shape: number;
  navail_size: number;
  navail_orientation: number;
  navail_hue: number;

  advanced_after: 'criterion' | 'cap' | null;
}

export function labelOf(c: Compound): string {
  const d = describe(c);
  return DIMENSIONS.map((dim) => d[dim.id as DimId]).join('|');
}

export function buildMncRow(args: {
  identity: {
    participantId: string;
    prolificPid: string | null;
    studyId: string | null;
    sessionId: string;
    experimentVersion: string;
  };
  isTest: boolean;
  arm: Arm;
  elapsedMs: number;
  responseTimeMs: number;
  trialIndex: number;
  contextIndex: number;
  trialInContext: number;
  contextColor: string;
  target: Compound;
  spec: ContextSpec;
  alternatives: Compound[];
  targetPosition: number;
  chosenPosition: number;
  correct: boolean;
  rewarded: boolean;
  pointsTotal: number;
  errorDisparity: number;
  matched: boolean[];
  matchCounts: number[];
  advancedAfter: 'criterion' | 'cap' | null;
}): MncEventRow {
  const chosen = args.alternatives[args.chosenPosition];
  const b = (x: boolean): 0 | 1 => (x ? 1 : 0);
  return {
    participant_id: args.identity.participantId,
    prolific_pid: args.identity.prolificPid,
    study_id: args.identity.studyId,
    session_id: args.identity.sessionId,
    experiment_version: args.identity.experimentVersion,
    is_test: b(args.isTest),
    arm: args.arm,
    timestamp_utc: new Date().toISOString(),
    elapsed_ms: Math.round(args.elapsedMs),
    response_time_ms: Math.round(args.responseTimeMs),
    trial_index: args.trialIndex,
    context_index: args.contextIndex,
    trial_in_context: args.trialInContext,
    context_color: args.contextColor,
    target_index: compoundToIndex(args.target),
    target_label: labelOf(args.target),
    relevant_dims: args.spec.relevant.map((i) => DIMENSIONS[i].id).join('|'),
    rel_shape: b(args.spec.relevant.includes(0)),
    rel_size: b(args.spec.relevant.includes(1)),
    rel_orientation: b(args.spec.relevant.includes(2)),
    rel_hue: b(args.spec.relevant.includes(3)),
    alternatives: args.alternatives.map(compoundToIndex),
    target_position: args.targetPosition,
    chosen_position: args.chosenPosition,
    chosen_index: compoundToIndex(chosen),
    chosen_label: labelOf(chosen),
    correct: b(args.correct),
    rewarded: b(args.rewarded),
    points_total: args.pointsTotal,
    error_disparity: args.errorDisparity,
    match_shape: b(args.matched[0]),
    match_size: b(args.matched[1]),
    match_orientation: b(args.matched[2]),
    match_hue: b(args.matched[3]),
    navail_shape: args.matchCounts[0],
    navail_size: args.matchCounts[1],
    navail_orientation: args.matchCounts[2],
    navail_hue: args.matchCounts[3],
    advanced_after: args.advancedAfter,
  };
}

/** Column order for the local CSV fallback. Must list every field on the row:
 *  the download exists for the case where the upload failed, so a column
 *  missing here is data lost exactly when it matters. */
export const MNC_COLUMNS: (keyof MncEventRow)[] = [
  'participant_id', 'prolific_pid', 'study_id', 'session_id',
  'experiment_version', 'is_test', 'arm',
  'timestamp_utc', 'elapsed_ms', 'response_time_ms',
  'trial_index', 'context_index', 'trial_in_context',
  'context_color', 'target_index', 'target_label',
  'relevant_dims', 'rel_shape', 'rel_size', 'rel_orientation', 'rel_hue',
  'alternatives', 'target_position', 'chosen_position', 'chosen_index',
  'chosen_label', 'correct', 'rewarded', 'points_total', 'error_disparity',
  'match_shape', 'match_size', 'match_orientation', 'match_hue',
  'navail_shape', 'navail_size', 'navail_orientation', 'navail_hue',
  'advanced_after',
];
