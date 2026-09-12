import { useCallback, useMemo, useRef, useState } from 'react';

import { COMPLETION_CODE, EXPERIMENT_VERSION } from '../config/task';
import { ARMS, MNC_CONFIG, type Arm } from '../config/mnc';
import { EventLogger, MemoryTransport } from '../logging/logger';
import { mncTransportFromEnv } from '../logging/supabase';
import { buildMncRow, type MncEventRow } from '../logging/mncSchema';
import { readProlificParams, resolveParticipantId, sessionSeed } from '../utils/prolific';
import { useMncTask } from './useMncTask';
import { MncTaskScreen } from './screens/MncTaskScreen';
import { MncStimulus } from './screens/MncStimulus';
import { EndScreen } from './screens/EndScreen';
import { hashString } from '../utils/rng';
import { compoundFromIndex } from '../engine/mnc';

type Phase = 'intro' | 'task' | 'end';

/**
 * Arm assignment.
 *
 * An explicit `?arm=` wins, so the two halves of the pilot can be run as two
 * small Prolific studies and the 3/3 split is guaranteed rather than left to
 * chance -- with six participants, hashing could easily give 5 and 1. The
 * hash is the fallback for anyone arriving without the parameter.
 */
function resolveArm(participantId: string): Arm {
  const q = new URLSearchParams(window.location.search).get('arm');
  if (q === 'deterministic' || q === 'probabilistic') return q;
  return hashString(participantId) % 2 === 0 ? 'deterministic' : 'probabilistic';
}

export function MncApp() {
  const [phase, setPhase] = useState<Phase>('intro');

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
      sessionId: sessionSeed(participantId, EXPERIMENT_VERSION),
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
    return new EventLogger<MncEventRow>(
      transport ?? new MemoryTransport<MncEventRow>(),
    );
  }, []);

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
          target: r.target,
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
    void logger.flush();
    setPhase('end');
  }, [logger]);

  const { state, choose } = useMncTask({
    seed: identity.sessionId,
    arm,
    onTrial,
    onFinish,
  });

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
        <h1 style={{ fontSize: 24, marginTop: 0 }}>A shape-picking game</h1>
        <p>
          On each turn you will see four shapes. <b>One of them earns a point.</b> Click
          the one you think it is. You will be told whether you got a point.
        </p>
        <p>
          The shapes differ in four ways &mdash; whether they are round or square, large
          or small, light or dark, and whether the bar across them lies flat or upright.
          The shape that pays depends on <b>all four</b> of those together.
        </p>
        <div style={{ display: 'flex', gap: 12, margin: '18px 0', flexWrap: 'wrap' }}>
          {[0b0000, 0b0011, 0b1101, 0b1010].map((i) => (
            <div key={i} style={{ background: '#EDEFF1', borderRadius: 8, padding: 4 }}>
              <MncStimulus compound={compoundFromIndex(i)} size={72} />
            </div>
          ))}
        </div>
        <p>
          <b>The background colour tells you which rule is running.</b> When the
          background changes, the shape that pays has changed too, and you will need to
          work out the new one.
        </p>
        <p>
          It lasts about {minutes} minutes. Guessing is expected at first &mdash; that is
          how you find out what pays.
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
          Points are for feedback only; your payment does not depend on them.
        </p>
      </div>
    </div>
  );
}

export { ARMS };
