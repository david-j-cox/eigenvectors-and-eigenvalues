import { useCallback, useMemo, useRef, useState } from 'react';

import { OPERATOR_CONFIG as C } from '../config/operator';
import { buildSession, scoreResponse, type ResponseSlot } from '../engine/operator';
import { createRng, deriveSeed } from '../utils/rng';

export interface OperatorState {
  slot: ResponseSlot;
  points: number;
  finished: boolean;
  /** Non-null only while the outcome of the last response is on screen. */
  feedback: { side: 'left' | 'right'; delta: number } | null;
  progress: number;
}

export interface UseOperatorArgs {
  seed: string;
  onResponse: (r: {
    slot: ResponseSlot;
    chosen: 'left' | 'right';
    previous: 'left' | 'right' | null;
    rewarded: boolean;
    pointsDelta: number;
    pointsTotal: number;
    pUsed: number;
    responseTimeMs: number;
    elapsedMs: number;
  }) => void;
  onFinish: () => void;
}

export function useOperatorTask({ seed, onResponse, onFinish }: UseOperatorArgs) {
  const slots = useMemo(() => buildSession(deriveSeed(seed, 'operator')), [seed]);
  const rewardRng = useRef(createRng(deriveSeed(seed, 'operator-reward')));

  const [i, setI] = useState(0);
  const [points, setPoints] = useState(0);
  const [feedback, setFeedback] = useState<OperatorState['feedback']>(null);
  const [finished, setFinished] = useState(false);

  const previous = useRef<'left' | 'right' | null>(null);
  // The clock starts on the first response, not at mount: a participant who
  // reads the instructions slowly must not lose task time to them.
  const startedAt = useRef<number | null>(null);
  const shownAt = useRef(performance.now());
  const lock = useRef(false);

  const respond = useCallback(
    (side: 'left' | 'right') => {
      if (finished || lock.current) return;
      lock.current = true;

      const now = performance.now();
      if (startedAt.current === null) startedAt.current = now;
      const elapsed = now - startedAt.current;
      const slot = slots[i];
      const out = scoreResponse(slot, side, rewardRng.current);
      const total = points + out.pointsDelta;

      setPoints(total);
      setFeedback({ side, delta: out.pointsDelta });
      onResponse({
        slot, chosen: side, previous: previous.current,
        rewarded: out.rewarded, pointsDelta: out.pointsDelta,
        pointsTotal: total, pUsed: out.pUsed,
        responseTimeMs: now - shownAt.current, elapsedMs: elapsed,
      });
      previous.current = side;

      window.setTimeout(() => {
        setFeedback(null);
        const next = i + 1;
        const overTime = elapsed >= C.maxSessionMs;
        if (next >= slots.length || overTime) {
          setFinished(true);
          onFinish();
          return;
        }
        setI(next);
        shownAt.current = performance.now();
        lock.current = false;
      }, C.feedbackMs);
    },
    [finished, i, onFinish, onResponse, points, slots],
  );

  const state: OperatorState = {
    slot: slots[Math.min(i, slots.length - 1)],
    points,
    finished,
    feedback,
    progress: i / slots.length,
  };
  return { state, respond };
}
