import { useCallback, useEffect, useMemo, useState } from 'react';

import { COMPLETION_CODE, EXPERIMENT_VERSION } from '../config/task';
import { OPERATOR_CONFIG as C } from '../config/operator';
import { EventLogger, MemoryTransport } from '../logging/logger';
import { operatorTransportFromEnv } from '../logging/supabase';
import {
  buildOperatorRow, OPERATOR_COLUMNS, type OperatorEventRow,
} from '../logging/operatorSchema';
import { readProlificParams, resolveParticipantId, sessionSeed } from '../utils/prolific';
import { useOperatorTask } from './useOperatorTask';
import { OperatorTaskScreen } from './screens/OperatorTaskScreen';
import { ConsentScreen } from './screens/ConsentScreen';
import { EndScreen } from './screens/EndScreen';

type Phase = 'consent' | 'instructions' | 'task' | 'end' | 'declined';

function downloadCsv(csv: string, pid: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `operator-${pid}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const runNonce = Math.random().toString(36).slice(2, 10);

export function OperatorApp() {
  const [phase, setPhase] = useState<Phase>('consent');
  const isTest = useMemo(
    () => new URLSearchParams(window.location.search).get('test') === '1', [],
  );

  const identity = useMemo(() => {
    const p = readProlificParams();
    const participantId = resolveParticipantId(p);
    return {
      participantId,
      prolificPid: p.prolificPid,
      studyId: p.studyId,
      // A per-load nonce: a participant who reloads would otherwise restart at
      // trial 0 and collide with their own earlier rows under the
      // (session_id, trial_index) key, which discards them silently.
      sessionId: `${sessionSeed(participantId, EXPERIMENT_VERSION)}::op::${runNonce}`,
      experimentVersion: EXPERIMENT_VERSION,
    };
  }, []);

  const logger = useMemo(() => {
    const t = operatorTransportFromEnv();
    if (!t) {
      console.warn(
        'No Supabase credentials: operator events are in memory only and will ' +
        'be lost when this tab closes.',
      );
    }
    return new EventLogger<OperatorEventRow>(
      t ?? new MemoryTransport<OperatorEventRow>(),
      { storageKey: 'operator-pending-events', csvColumns: OPERATOR_COLUMNS },
    );
  }, []);

  const [pending, setPending] = useState(0);

  useEffect(() => {
    logger.restorePending();
    logger.start();
    const onHide = () => {
      if (document.visibilityState === 'hidden' && logger.pendingCount > 0) {
        void logger.flush();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      logger.stop();
    };
  }, [logger]);

  const onResponse = useCallback(
    (r: Parameters<Parameters<typeof useOperatorTask>[0]['onResponse']>[0]) => {
      logger.log(buildOperatorRow({ identity, isTest, ...r }));
      setPending(logger.pendingCount);
    },
    [identity, isTest, logger],
  );

  const onFinish = useCallback(() => {
    setPhase('end');
    void logger.flush().then(() => setPending(logger.pendingCount));
  }, [logger]);

  // Keep the end screen's count honest: without this it freezes at whatever
  // was buffered on the last response and tells every finisher their data
  // failed to upload.
  useEffect(() => {
    if (phase !== 'end') return;
    const t = window.setInterval(() => {
      setPending(logger.pendingCount);
      if (logger.pendingCount > 0) void logger.flush();
    }, 1000);
    return () => window.clearInterval(t);
  }, [phase, logger]);

  const { state, respond } = useOperatorTask({
    seed: identity.sessionId, onResponse, onFinish,
  });

  if (phase === 'consent') {
    return (
      <ConsentScreen
        onAgree={() => setPhase('instructions')}
        onDecline={() => setPhase('declined')}
        whatYouWillDo={
          <>
            You will play a game (approximately 20 minutes total) in which you
            click one of two panels to earn points. How often each panel pays
            changes during the game, and it is up to you to work out which one
            is paying better at any time.
          </>
        }
      />
    );
  }
  if (phase === 'declined') {
    return (
      <main className="centered prose">
        <h1>Thank you</h1>
        <p>You have declined to participate. You may close this window and
        return the study on Prolific.</p>
      </main>
    );
  }
  if (phase === 'instructions') return <Instructions onStart={() => setPhase('task')} />;
  if (phase === 'end') {
    return (
      <EndScreen
        points={state.points}
        completionCode={COMPLETION_CODE}
        pending={pending}
        onDownload={() => downloadCsv(logger.toCsv(), identity.participantId)}
      />
    );
  }
  return <OperatorTaskScreen state={state} respond={respond} />;
}

function Instructions({ onStart }: { onStart: () => void }) {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 20, boxSizing: 'border-box',
      background: C.background, color: '#E8ECEF',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 520, lineHeight: 1.6 }}>
        <h1 style={{ fontSize: 24, marginTop: 0 }}>Two panels, one pays better</h1>
        <p>
          Click either panel. Sometimes you get a point, sometimes you do not.
          One panel pays better than the other, and <b>which one changes during
          the game without warning</b>. Nothing on screen tells you when it
          changes, so the only way to find out is to keep playing and notice
          where the points are coming from.
        </p>
        <p>
          Occasionally a panel gets a <b style={{ color: C.appetitiveBorder }}>gold
          border</b>. That panel is very likely to pay on that click only.
        </p>
        <p>
          Occasionally a panel gets a <b style={{ color: '#D98A7E' }}>red
          border</b>. Clicking that panel costs you a point on that click only.
        </p>
        <p>
          Both borders disappear as soon as you click. Go at whatever pace you
          like; it lasts about 20 minutes.
        </p>
        <button
          id="op-start" onClick={onStart}
          style={{
            marginTop: 12, padding: '12px 22px', fontSize: 16, borderRadius: 8,
            border: 'none', background: '#2E7D5B', color: 'white', cursor: 'pointer',
          }}
        >
          Start
        </button>
        <p style={{ fontSize: 12, opacity: .6, marginTop: 18 }}>
          Points are feedback only. Your payment does not depend on them.
        </p>
      </div>
    </div>
  );
}
