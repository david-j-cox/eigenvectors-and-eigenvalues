// ============================================================
// Prolific integration and participant identity.
//
// The seed is derived from the participant identifier rather than
// from the clock, so a participant who refreshes returns to the
// same schedule instead of a fresh randomization. Re-randomizing on
// reconnect would give one person two different block orders in a
// single session and quietly break the balance the design depends on.
// ============================================================

export interface ProlificParams {
  prolificPid: string | null;
  studyId: string | null;
  sessionId: string | null;
}

export function readProlificParams(search = window.location.search): ProlificParams {
  const q = new URLSearchParams(search);
  const pick = (...names: string[]) => {
    for (const n of names) {
      const v = q.get(n);
      if (v) return v;
    }
    return null;
  };
  return {
    prolificPid: pick('PROLIFIC_PID', 'prolific_pid'),
    studyId: pick('STUDY_ID', 'study_id'),
    sessionId: pick('SESSION_ID', 'session_id'),
  };
}

/** Stable participant id: the Prolific PID when present, otherwise a local one. */
export function resolveParticipantId(
  params: ProlificParams,
  storageKey = 'bd_participant_id',
): string {
  if (params.prolificPid) return params.prolificPid;
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing) return existing;
    const generated = `local-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(storageKey, generated);
    return generated;
  } catch {
    return `anon-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * The randomization seed.
 *
 * Built only from the participant identifier and the experiment version, so it
 * is reproducible offline: given those two strings the entire schedule can be
 * regenerated later and checked against what was logged.
 */
export function sessionSeed(participantId: string, experimentVersion: string): string {
  return `${experimentVersion}::${participantId}`;
}
