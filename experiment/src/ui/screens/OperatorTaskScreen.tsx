import { useEffect } from 'react';

import { OPERATOR_CONFIG as C } from '../../config/operator';
import type { OperatorState } from '../useOperatorTask';

interface Props {
  state: OperatorState;
  respond: (side: 'left' | 'right') => void;
}

/**
 * The task display.
 *
 * Two panels, identical except when a momentary stimulus marks one of them.
 * Nothing on screen marks blocks, the reinforcement state, or responses
 * remaining, so that no event other than those under experimental control can
 * acquire a discriminative function. The point counter is the only running
 * total shown, and it is feedback rather than payment.
 *
 * The border appears BEFORE the response it applies to and is gone
 * afterwards, which is what makes it a momentary stimulus rather than a
 * consequence.
 */
export function OperatorTaskScreen({ state, respond }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'f') respond('left');
      else if (k === 'j') respond('right');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [respond]);

  const { slot, feedback } = state;
  const borderFor = (side: 'left' | 'right') => {
    if (slot.stimulusSide !== side || slot.stimulus === 'none') return 'transparent';
    return slot.stimulus === 'appetitive' ? C.appetitiveBorder : C.aversiveBorder;
  };

  return (
    <div
      style={{
        minHeight: '100dvh', background: C.background,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 28,
        padding: 20, boxSizing: 'border-box',
      }}
    >
      <div style={{
        color: 'rgba(255,255,255,.92)', fontFamily: 'system-ui, sans-serif',
        fontSize: 16, fontVariantNumeric: 'tabular-nums', letterSpacing: '.02em',
      }}>
        Points: <b>{state.points}</b>
      </div>

      <div style={{
        display: 'flex', gap: 24, width: 'min(94vw, 560px)',
      }}>
        {(['left', 'right'] as const).map((side) => {
          const hit = feedback && feedback.side === side;
          return (
            <button
              key={side}
              id={`op-${side}`}
              onClick={() => respond(side)}
              aria-label={side === 'left' ? 'Left panel' : 'Right panel'}
              style={{
                flex: 1, aspectRatio: '3 / 4', borderRadius: 12,
                background: C.panelColor,
                border: `6px solid ${borderFor(side)}`,
                cursor: 'pointer', padding: 0,
                transition: 'border-color 60ms linear',
                display: 'grid', placeItems: 'center',
                fontFamily: 'system-ui, sans-serif', fontSize: 34, fontWeight: 700,
                color: hit
                  ? (feedback!.delta > 0 ? '#1F6F4A'
                     : feedback!.delta < 0 ? '#8C2F27' : 'rgba(0,0,0,.25)')
                  : 'transparent',
              }}
            >
              {hit ? (feedback!.delta > 0 ? '+1'
                    : feedback!.delta < 0 ? '−1' : '·') : ''}
            </button>
          );
        })}
      </div>

      <div style={{
        height: 3, width: 'min(94vw, 560px)', background: 'rgba(255,255,255,.10)',
        borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${Math.round(state.progress * 100)}%`,
          background: 'rgba(255,255,255,.28)',
        }} />
      </div>
    </div>
  );
}
