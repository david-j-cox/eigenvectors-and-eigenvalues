import { useCallback, useMemo, useRef, useState } from 'react';

import { ARMS, MNC_CONFIG, type Arm } from '../config/mnc';
import {
  advanceDecision,
  buildTrial,
  contextTargets,
  scoreChoice,
  type Compound,
  type Trial,
} from '../engine/mnc';
import { createRng, deriveSeed } from '../utils/rng';

export interface MncTrialResult {
  correct: boolean;
  rewarded: boolean;
  targetPosition: number;
  chosenPosition: number;
}

export interface MncState {
  running: boolean;
  finished: boolean;
  trial: Trial;
  target: Compound;
  contextIndex: number;
  contextColor: string;
  trialIndex: number;
  trialInContext: number;
  points: number;
  /** Non-null while feedback for the just-made choice is on screen. */
  feedback: MncTrialResult | null;
  msRemaining: number;
}

// At roughly six trials per context and about one second per trial, a fast
// participant gets through a context every seven seconds, so three minutes can
// exhaust far more than the 24 this used to allow -- and running out ended the
// session early. Sized so the clock is always what stops the task.
const MAX_CONTEXTS = 80;

export interface UseMncArgs {
  seed: string;
  arm: Arm;
  onTrial: (row: {
    trial: Trial;
    target: Compound;
    contextIndex: number;
    contextColor: string;
    trialIndex: number;
    trialInContext: number;
    chosenPosition: number;
    correct: boolean;
    rewarded: boolean;
    errorDisparity: number;
    matched: boolean[];
    matchCounts: number[];
    pointsTotal: number;
    responseTimeMs: number;
    elapsedMs: number;
    advancedAfter: 'criterion' | 'cap' | null;
  }) => void;
  onFinish: () => void;
}

export function useMncTask({ seed, arm, onTrial, onFinish }: UseMncArgs) {
  const targets = useMemo(
    () => contextTargets(deriveSeed(seed, 'mnc-targets'), MAX_CONTEXTS),
    [seed],
  );
  // One stream for trial construction, a separate one for reinforcement, so
  // that changing the arm cannot shift which distractors a participant sees.
  const trialRng = useRef(createRng(deriveSeed(seed, 'mnc-trials')));
  const rewardRng = useRef(createRng(deriveSeed(seed, 'mnc-reward')));

  const [contextIndex, setContextIndex] = useState(0);
  const [trialIndex, setTrialIndex] = useState(0);
  const [trialInContext, setTrialInContext] = useState(0);
  const [points, setPoints] = useState(0);
  const [feedback, setFeedback] = useState<MncTrialResult | null>(null);
  const [finished, setFinished] = useState(false);
  const [msRemaining, setMsRemaining] = useState(MNC_CONFIG.taskMs);

  const recent = useRef<boolean[]>([]);
  // The clock starts at the first response, not at mount. A participant who
  // reads the instructions slowly must not lose task time to them.
  const startedAt = useRef<number | null>(null);
  const shownAt = useRef<number>(performance.now());
  const lockRef = useRef(false);

  const target = targets[Math.min(contextIndex, targets.length - 1)];
  const [trial, setTrial] = useState<Trial>(() =>
    buildTrial(targets[0], trialRng.current),
  );
  const contextColor =
    MNC_CONFIG.contextColors[contextIndex % MNC_CONFIG.contextColors.length];

  const finish = useCallback(() => {
    setFinished(true);
    onFinish();
  }, [onFinish]);

  const choose = useCallback(
    (position: number) => {
      if (finished || lockRef.current) return;
      lockRef.current = true;

      const now = performance.now();
      if (startedAt.current === null) startedAt.current = now;
      const elapsed = now - startedAt.current;
      const rt = now - shownAt.current;

      const rec = scoreChoice(trial, target, position, arm, rewardRng.current);
      const nextPoints = points + (rec.rewarded ? 1 : 0);
      const nextInContext = trialInContext + 1;
      recent.current = [...recent.current, rec.correct].slice(
        -MNC_CONFIG.criterionWindow,
      );
      const decision = advanceDecision(recent.current, nextInContext);

      setPoints(nextPoints);
      setFeedback({
        correct: rec.correct,
        rewarded: rec.rewarded,
        targetPosition: trial.targetPosition,
        chosenPosition: position,
      });

      onTrial({
        trial,
        target,
        contextIndex,
        contextColor,
        trialIndex,
        trialInContext: nextInContext,
        chosenPosition: position,
        correct: rec.correct,
        rewarded: rec.rewarded,
        errorDisparity: rec.errorDisparity,
        matched: rec.matched,
        matchCounts: rec.matchCounts,
        pointsTotal: nextPoints,
        responseTimeMs: rt,
        elapsedMs: elapsed,
        advancedAfter: decision.advance ? decision.reason : null,
      });

      window.setTimeout(() => {
        const remaining = MNC_CONFIG.taskMs - (performance.now() - (startedAt.current ?? now));
        setMsRemaining(Math.max(0, remaining));
        if (remaining <= 0) {
          setFeedback(null);
          finish();
          return;
        }
        let nextContext = contextIndex;
        if (decision.advance) {
          nextContext = contextIndex + 1;
          if (nextContext >= targets.length) {
            setFeedback(null);
            finish();
            return;
          }
          setContextIndex(nextContext);
          setTrialInContext(0);
          recent.current = [];
        } else {
          setTrialInContext(nextInContext);
        }
        setTrialIndex((t) => t + 1);
        setTrial(buildTrial(targets[nextContext], trialRng.current));
        setFeedback(null);
        shownAt.current = performance.now();
        lockRef.current = false;
      }, MNC_CONFIG.feedbackMs);
    },
    [
      arm, contextColor, contextIndex, finish, finished, onTrial, points,
      target, targets, trial, trialInContext, trialIndex,
    ],
  );

  const state: MncState = {
    running: !finished,
    finished,
    trial,
    target,
    contextIndex,
    contextColor,
    trialIndex,
    trialInContext,
    points,
    feedback,
    msRemaining,
  };

  return { state, choose, armSpec: ARMS[arm] };
}
