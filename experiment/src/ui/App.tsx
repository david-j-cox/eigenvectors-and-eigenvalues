import { useEffect, useMemo, useState } from 'react';

import { COMPLETION_CODE, EXPERIMENT_VERSION } from '../config/task';
import { EventLogger, MemoryTransport } from '../logging/logger';
import { transportFromEnv } from '../logging/supabase';
import type { SessionIdentity } from '../logging/schema';
import { readProlificParams, resolveParticipantId, sessionSeed } from '../utils/prolific';
import { useTask } from './useTask';
import { TaskScreen } from './screens/TaskScreen';
import { ConsentScreen } from './screens/ConsentScreen';
import { InstructionsScreen } from './screens/InstructionsScreen';
import { EndScreen } from './screens/EndScreen';

type Phase = 'consent' | 'instructions' | 'task' | 'end' | 'declined';

export function App() {
  const [phase, setPhase] = useState<Phase>('consent');

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

  useEffect(() => {
    if (state.finished && phase === 'task') {
      void logger.flush().then(() => setPhase('end'));
    }
  }, [state.finished, phase, logger]);

  switch (phase) {
    case 'consent':
      return (
        <ConsentScreen
          onAgree={() => setPhase('instructions')}
          onDecline={() => setPhase('declined')}
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
          pending={logger.pendingCount}
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
