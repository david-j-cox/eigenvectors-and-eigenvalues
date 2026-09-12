import { useEffect } from 'react';

import type { MncState } from '../useMncTask';
import { MncStimulus } from './MncStimulus';

interface Props {
  state: MncState;
  choose: (position: number) => void;
}

/**
 * The choice display.
 *
 * Four alternatives in a 2x2 grid, on a background that signals which
 * compound currently pays. Nothing on screen counts trials or names the
 * context: a visible marker at each context change would tell participants
 * when the rule moved, and when they notice a change is part of what the
 * session is measuring.
 *
 * Feedback marks only whether a point was earned, not which alternative was
 * the target. Showing the target would turn the task into instructed
 * learning; the participant has to find the rule from the consequences.
 */
export function MncTaskScreen({ state, choose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i >= 0) choose(i);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choose]);

  const fb = state.feedback;

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: state.contextColor,
        transition: 'background 220ms ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 20,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          color: 'rgba(255,255,255,.92)',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 15,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '.02em',
        }}
      >
        Points: <b>{state.points}</b>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 16,
          width: 'min(92vw, 380px)',
        }}
      >
        {state.trial.alternatives.map((alt, i) => {
          const chosen = fb && fb.chosenPosition === i;
          return (
            <button
              key={i}
              id={`mnc-alt-${i}`}
              onClick={() => choose(i)}
              disabled={!!fb}
              aria-label={`Option ${i + 1}`}
              style={{
                display: 'grid',
                placeItems: 'center',
                aspectRatio: '1 / 1',
                background: '#EDEFF1',
                border: chosen
                  ? `4px solid ${fb!.rewarded ? '#2E7D5B' : '#96382F'}`
                  : '4px solid transparent',
                borderRadius: 10,
                cursor: fb ? 'default' : 'pointer',
                padding: 0,
              }}
            >
              <MncStimulus compound={alt} />
            </button>
          );
        })}
      </div>

      <div
        style={{
          minHeight: 26,
          color: 'rgba(255,255,255,.95)',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 17,
          fontWeight: 600,
        }}
      >
        {fb ? (fb.rewarded ? '+1 point' : 'No point') : ' '}
      </div>
    </div>
  );
}
