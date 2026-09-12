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
 * Feedback is the ring around the chosen tile and nothing else: green when a
 * point was earned, red when it was not. An earlier version also disabled the
 * buttons during feedback, which the browser renders by dimming them -- and a
 * dimmed screen is exactly as visible as a colored ring, so the two signals
 * competed and the ring was hard to read. Clicks during feedback are ignored
 * by the task hook, so nothing needs to be disabled to make that safe.
 *
 * The ring reports whether a POINT was earned, not whether the choice was
 * correct. In the probabilistic arm those differ, and reinforcement is what
 * the participant actually has to learn from. The target is never revealed;
 * showing it would make this instructed learning rather than discovery.
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
              aria-disabled={!!fb}
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
                transition: 'border-color 90ms ease',
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
