// ============================================================
// The task hook: wires the engine to the browser.
//
// Responses are timestamped from performance.now() rather than
// Date.now(), because the schedules and the inter-response
// intervals are both measured in milliseconds and a wall clock that
// steps backwards over an NTP correction would corrupt both.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Session } from '../engine/session';
import { buildSessionPlan } from '../engine/plan';
import { DEFAULT_DESIGN, ENGINE, EXPERIMENT_VERSION, SESSION_TIME_GUARD } from '../config/task';
import { EventLogger } from '../logging/logger';
import { toEventRow } from '../logging/schema';
import type { QualityContext, SessionIdentity } from '../logging/schema';
import type { Side } from '../engine/types';

export interface TaskState {
  points: number;
  /** Reinforcers delivered so far; stored on the session record at the end. */
  rewards: number;
  blockIndex: number;
  trialInBlock: number;
  trialIndex: number;
  totalTrials: number;
  finished: boolean;
  color: string;
  part: string;
  /** Last reward, used to flash feedback; incremented so repeats still fire. */
  feedbackToken: number;
  lastRewarded: boolean;
  codActive: boolean;
}

export function useTask(identity: SessionIdentity, logger: EventLogger) {
  const plan = useMemo(
    () => buildSessionPlan(identity.participantId + '::' + EXPERIMENT_VERSION),
    [identity.participantId],
  );
  const sessionRef = useRef<Session | null>(null);
  if (sessionRef.current === null) sessionRef.current = new Session(plan, ENGINE);

  const startedAtRef = useRef(Date.now());
  const originRef = useRef(performance.now());
  const focusLost = useRef(0);
  const feedback = useRef(0);
  const guardApplied = useRef(false);

  const [state, setState] = useState<TaskState>(() => snapshot(sessionRef.current!, 0, false));

  useEffect(() => {
    const onBlur = () => {
      focusLost.current += 1;
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);

  // Flush whatever is buffered when the participant leaves, so an abandoned
  // session still delivers everything up to the moment it ended.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void logger.flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [logger]);

  const quality = useCallback(
    (): QualityContext => ({
      pageVisible: document.visibilityState === 'visible',
      fullscreenActive: document.fullscreenElement !== null,
      focusLostCount: focusLost.current,
      browserWidth: window.innerWidth,
      browserHeight: window.innerHeight,
      inputMethod: 'keyboard',
    }),
    [],
  );

  const respond = useCallback(
    (side: Side) => {
      const session = sessionRef.current!;
      const now = performance.now() - originRef.current;

      const block = session.currentBlock();
      const outcome = session.respond(side, now);
      if (!outcome || !block) return;

      logger.log(
        toEventRow(outcome, block, plan, identity, quality(), startedAtRef.current),
      );

      // Time guard: if the session is running long, drop trailing perturbation
      // blocks. That part loses perturbations gracefully; trimming a reversal
      // stage would unbalance the comparison the study exists to make.
      if (!guardApplied.current && now > SESSION_TIME_GUARD.softCapMs) {
        guardApplied.current = true;
        session.dropTrailingBlocks(SESSION_TIME_GUARD.droppablePart, 1);
      }

      if (outcome.rewardOutcome === 1) feedback.current += 1;
      setState(snapshot(session, feedback.current, outcome.rewardOutcome === 1));
    },
    [identity, logger, plan, quality],
  );

  return { plan, state, respond, design: DEFAULT_DESIGN };
}

function snapshot(session: Session, token: number, rewarded: boolean): TaskState {
  const snap = session.snapshot();
  const block = snap.block;
  const total = session.plan.blocks.reduce((s, b) => s + b.targetResponses, 0);

  return {
    points: snap.cumulativePoints,
    rewards: token,
    blockIndex: snap.blockIndex,
    trialInBlock: snap.trialInBlock,
    trialIndex: snap.trialIndex,
    totalTrials: total,
    finished: snap.finished,
    color: block?.color ?? 'green',
    part: block?.part ?? 'done',
    feedbackToken: token,
    lastRewarded: rewarded,
    codActive: snap.codActive,
  };
}
