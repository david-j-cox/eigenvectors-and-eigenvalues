import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { COMPLETION_CODE, EXPERIMENT_VERSION } from '../config/task';
import { ARMS, MNC_CONFIG, type Arm } from '../config/mnc';
import { EventLogger, MemoryTransport } from '../logging/logger';
import { mncTransportFromEnv } from '../logging/supabase';
import { buildMncRow, MNC_COLUMNS, type MncEventRow } from '../logging/mncSchema';
import { readProlificParams, resolveParticipantId, sessionSeed } from '../utils/prolific';
import { useMncTask } from './useMncTask';
import { MncTaskScreen } from './screens/MncTaskScreen';
import { MncStimulus } from './screens/MncStimulus';
import { EndScreen } from './screens/EndScreen';
import { ConsentScreen } from './screens/ConsentScreen';
import { hashString } from '../utils/rng';
import { compoundFromIndex } from '../engine/mnc';

type Phase = 'consent' | 'intro' | 'task' | 'end' | 'declined';

/**
 * Arm assignment.
 *
 * An explicit `?arm=` wins, so the two halves of the pilot can be run as two
 * small Prolific studies and the 3/3 split is guaranteed rather than left to
 * chance -- with six participants, hashing could easily give 5 and 1. The
 * hash is the fallback for anyone arriving without the parameter.
 */
/** One nonce per page load, so a reload starts a new session rather than
 *  colliding with the old one. Module scope, not component state: StrictMode
 *  mounts the tree twice in development and a nonce in state would differ
 *  between the two mounts. */
const runNonce = Math.random().toString(36).slice(2, 10);

function armForId(participantId: string): Arm {
  return resolveArm(participantId);
}

function resolveArm(participantId: string): Arm {
  const q = new URLSearchParams(window.location.search).get('arm');
  if (q === 'deterministic' || q === 'probabilistic') return q;
  return hashString(participantId) % 2 === 0 ? 'deterministic' : 'probabilistic';
}

export function MncApp() {
  const [phase, setPhase] = useState<Phase>('consent');

  const isTestSession = useMemo(
    () => new URLSearchParams(window.location.search).get('test') === '1',
    [],
  );

  const identity = useMemo(() => {
    const params = readProlificParams();
    const participantId = resolveParticipantId(params);
    return {
      participantId,
      prolificPid: params.prolificPid,
      studyId: params.studyId,
      // The arm is part of the session identity, and so is the run.
      //
      // sessionSeed is a pure function of participant and version, so the same
      // browser running both arms produces one session_id for both -- and with
      // a (session_id, trial_index) primary key and ON CONFLICT DO NOTHING,
      // the second run's trials would silently collide with the first's and be
      // dropped from trial 15 onward. The arm alone is not enough either: a
      // participant who reloads and repeats the same arm would collide with
      // themselves. A per-load nonce makes each run its own session, which is
      // what a session is.
      sessionId: `${sessionSeed(participantId, EXPERIMENT_VERSION)}::${armForId(participantId)}::${runNonce}`,
      experimentVersion: EXPERIMENT_VERSION,
    };
  }, []);

  const arm = useMemo(() => resolveArm(identity.participantId), [identity.participantId]);

  const logger = useMemo(() => {
    const transport = mncTransportFromEnv();
    if (!transport) {
      console.warn(
        'No Supabase credentials: MNC events are being kept in memory only and ' +
          'will be lost when this tab closes.',
      );
    }
    return new EventLogger<MncEventRow>(transport ?? new MemoryTransport<MncEventRow>(), {
      // Without a storage key nothing is kept locally, so a failed upload
      // loses the session outright -- which is exactly what happened on the
      // first run of this pilot, because the database function did not exist
      // yet and there was no backup behind it.
      storageKey: 'mnc-pending-events',
      csvColumns: MNC_COLUMNS,
    });
  }, []);

  // The logger's whole recovery story depends on this lifecycle, and the first
  // pilot run proved it: without start() there is no periodic flush, so a batch
  // that fails is unshifted back to the front of the buffer and then "waits for
  // the timer" -- a timer that never ticks. Three failures later it is
  // quarantined, reachable only through the End screen's download, which a
  // participant who closes the tab never sees. Fifteen trials were lost that
  // way. restorePending() recovers a buffer left behind by a previous tab, and
  // flushing when the page is hidden is what stops there being one.
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

  const [pending, setPending] = useState(0);
  const trialCounter = useRef(0);

  const onTrial = useCallback(
    (r: Parameters<Parameters<typeof useMncTask>[0]['onTrial']>[0]) => {
      logger.log(
        buildMncRow({
          identity,
          isTest: isTestSession,
          arm,
          elapsedMs: r.elapsedMs,
          responseTimeMs: r.responseTimeMs,
          trialIndex: trialCounter.current++,
          contextIndex: r.contextIndex,
          trialInContext: r.trialInContext,
          contextColor: r.contextColor,
          target: r.trial.alternatives[r.trial.targetPosition],
          spec: r.spec,
          alternatives: r.trial.alternatives,
          targetPosition: r.trial.targetPosition,
          chosenPosition: r.chosenPosition,
          correct: r.correct,
          rewarded: r.rewarded,
          pointsTotal: r.pointsTotal,
          errorDisparity: r.errorDisparity,
          matched: r.matched,
          matchCounts: r.matchCounts,
          advancedAfter: r.advancedAfter,
        }),
      );
      setPending(logger.pendingCount);
    },
    [arm, identity, isTestSession, logger],
  );

  const onFinish = useCallback(() => {
    setPhase('end');
    void logger.flush().then(() => setPending(logger.pendingCount));
  }, [logger]);

  // Keep the end screen's count honest.
  //
  // `pending` was previously updated only when a trial was logged, so after the
  // last trial it froze at whatever happened to be buffered -- and the end
  // screen told every participant that responses were still uploading and to
  // email the researcher if the message did not disappear. It could not
  // disappear. One participant in the first live pilot did email, having
  // downloaded a file whose contents were already safely stored.
  useEffect(() => {
    if (phase !== 'end') return;
    const tick = window.setInterval(() => {
      setPending(logger.pendingCount);
      if (logger.pendingCount > 0) void logger.flush();
    }, 1000);
    return () => window.clearInterval(tick);
  }, [phase, logger]);

  const { state, choose } = useMncTask({
    seed: identity.sessionId,
    arm,
    onTrial,
    onFinish,
  });

  if (phase === 'consent') {
    return (
      <ConsentScreen
        onAgree={() => setPhase('intro')}
        onDecline={() => setPhase('declined')}
        // Only the duration and the description of the task differ from the
        // approved text; every other paragraph is the shared wording.
        whatYouWillDo={
          <>
            You will play a game (approximately 5 minutes total) in which you
            click shapes to earn points. On each turn four shapes are shown and
            one of them earns a point; which one changes from time to time, and
            part of the task is working out which.
          </>
        }
      />
    );
  }
  if (phase === 'declined') {
    return (
      <main className="centered prose">
        <h1>Thank you</h1>
        <p>
          You have declined to participate. You may close this window and return
          the study on Prolific.
        </p>
      </main>
    );
  }
  if (phase === 'intro') {
    return <Intro onStart={() => setPhase('task')} />;
  }
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
  return <MncTaskScreen state={state} choose={choose} />;
}

/** A local copy of the participant's own rows, for the case where uploading
 *  failed. Two participants in an earlier pilot recovered their data this way. */
function downloadCsv(csv: string, participantId: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `mnc-${participantId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Intro({ onStart }: { onStart: () => void }) {
  const minutes = Math.round(MNC_CONFIG.taskMs / 60000);
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        boxSizing: 'border-box',
        background: '#12161A',
        color: '#E8ECEF',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 520, lineHeight: 1.6 }}>
        <h1 style={{ fontSize: 24, marginTop: 0 }}>Pick the shape that pays</h1>
        <p>
          Each turn shows four shapes. One of them pays a point. Click the one you
          think it is.
        </p>
        <p>
          The shapes vary in four ways: round or square, large or small, blue or
          orange, and the bar across them flat or upright. <b>Working out which of
          those matter is the task.</b> Some of them do and some of them do not, and
          that changes along with the background.
        </p>
        <div style={{ display: 'flex', gap: 12, margin: '18px 0', flexWrap: 'wrap' }}>
          {[0b0000, 0b0011, 0b1101, 0b1010].map((i) => (
            <div key={i} style={{ background: '#EDEFF1', borderRadius: 8, padding: 4 }}>
              <MncStimulus compound={compoundFromIndex(i)} size={72} />
            </div>
          ))}
        </div>
        <p>
          The background color tells you which combination is paying. When the
          background changes, the combination has changed too, and you have to find
          the new one.
        </p>
        <p>
          About {minutes} minutes. Expect to guess at first. That is how you find out
          what pays.
        </p>
        <button
          id="mnc-start"
          onClick={onStart}
          style={{
            marginTop: 12,
            padding: '12px 22px',
            fontSize: 16,
            borderRadius: 8,
            border: 'none',
            background: '#2E7D5B',
            color: 'white',
            cursor: 'pointer',
          }}
        >
          Start
        </button>
        <p style={{ fontSize: 12, opacity: 0.6, marginTop: 18 }}>
          Points are feedback only. Your payment does not depend on them.
        </p>
      </div>
    </div>
  );
}

export { ARMS };
