import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { COMPLETION_CODE, DEFAULT_DESIGN, ENGINE, EXPERIMENT_VERSION } from '../config/task';
import { EventLogger, MemoryTransport } from '../logging/logger';
import { transportFromEnv } from '../logging/supabase';
import { toSessionRecord, type SessionIdentity } from '../logging/schema';
import { readProlificParams, resolveParticipantId, sessionSeed } from '../utils/prolific';
import { useTask } from './useTask';
import { TaskScreen } from './screens/TaskScreen';
import { ConsentScreen } from './screens/ConsentScreen';
import { InstructionsScreen } from './screens/InstructionsScreen';
import { EndScreen } from './screens/EndScreen';

type Phase = 'consent' | 'instructions' | 'task' | 'end' | 'declined';

export function App() {
  const [phase, setPhase] = useState<Phase>('consent');

  // Marks a run as the researcher's own rather than a participant's, so the
  // export can exclude it. Without this a pre-launch check of the live study
  // is indistinguishable from participant 1.
  const isTestSession = useMemo(
    () => new URLSearchParams(window.location.search).get('test') === '1',
    [],
  );

  const identity = useMemo<SessionIdentity>(() => {
    const params = readProlificParams();
    const participantId = resolveParticipantId(params);
    return {
      participantId,
      prolificPid: params.prolificPid,
      studyId: params.studyId,
      prolificSessionId: params.sessionId,
      sessionId: sessionSeed(participantId, EXPERIMENT_VERSION),
      experimentVersion: EXPERIMENT_VERSION,
    };
  }, []);

  const logger = useMemo(() => {
    // Falling back to an in-memory transport keeps the task runnable for local
    // development and piloting without credentials. It is deliberately loud in
    // the console so an unconfigured deployment cannot be mistaken for a
    // working one.
    const transport = transportFromEnv();
    if (!transport) {
      console.warn(
        'No Supabase credentials found. Events are being kept in memory only ' +
          'and will be lost when this tab closes.',
      );
    }
    return new EventLogger(transport ?? new MemoryTransport(), {
      storageKey: `bd_pending_${identity.sessionId}`,
    });
  }, [identity]);

  useEffect(() => {
    logger.restorePending();
    logger.start();
    return () => logger.stop();
  }, [logger]);

  const { plan, state, respond } = useTask(identity, logger);

  const saveSession = useCallback(
    (status: 'in_progress' | 'complete' | 'declined') =>
      logger.saveSession(
        toSessionRecord(
          identity,
          plan,
          ENGINE,
          DEFAULT_DESIGN,
          { browserWidth: window.innerWidth, browserHeight: window.innerHeight },
          {
            totalResponses: state.trialIndex,
            totalRewards: state.rewards,
            totalPoints: state.points,
            completionStatus: status,
          },
          COMPLETION_CODE,
          isTestSession,
        ),
      ),
    [identity, logger, plan, state, isTestSession],
  );

  // Written once at the start so an abandoned session still leaves a record of
  // who began and what was arranged, and again at the end with the totals.
  // The ref keeps the opening write from firing again on every response, since
  // saveSession closes over the changing task state.
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    void saveSession('in_progress');
  }, [saveSession]);

  // The end screen reports how many responses are still queued. That number
  // has to keep being read: a participant who finishes mid-batch sees a
  // non-zero count that the next flush clears seconds later, and a screen
  // rendered once says so forever. One wrote in to ask about a single pending
  // response that had in fact uploaded, because the text tells them to wait for
  // a message that could never change.
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (phase !== 'end') return;
    const tick = () => {
      setPending(logger.pendingCount);
      if (logger.pendingCount > 0) void logger.flush();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [phase, logger]);

  useEffect(() => {
    if (state.finished && phase === 'task') {
      void logger
        .flush()
        .then(() => saveSession('complete'))
        .then(() => setPhase('end'));
    }
  }, [state.finished, phase, logger, saveSession]);

  switch (phase) {
    case 'consent':
      return (
        <ConsentScreen
          onAgree={() => setPhase('instructions')}
          onDecline={() => {
            void saveSession('declined');
            setPhase('declined');
          }}
        />
      );
    case 'instructions':
      return <InstructionsScreen onStart={() => setPhase('task')} />;
    case 'task':
      return <TaskScreen state={state} respond={respond} plan={plan} />;
    case 'end':
      return (
        <EndScreen
          points={state.points}
          completionCode={COMPLETION_CODE}
          pending={pending}
          onDownload={() => downloadCsv(logger, identity.participantId)}
        />
      );
    case 'declined':
      return (
        <main className="centered">
          <h1>Thank you</h1>
          <p>You have declined to take part. You may close this window.</p>
        </main>
      );
  }
}

/** Last-resort export if uploads never landed. */
function downloadCsv(logger: EventLogger, participantId: string): void {
  const blob = new Blob([logger.toCsv()], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dynamics_${participantId}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
