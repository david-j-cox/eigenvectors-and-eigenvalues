import { useEffect } from 'react';

import { COLORS } from '../../config/task';
import type { SessionPlan, Side } from '../../engine/types';
import type { TaskState } from '../useTask';

interface Props {
  state: TaskState;
  respond: (side: Side) => void;
  plan: SessionPlan;
}

/**
 * The task display.
 *
 * The two panels are visually identical; only the background carries the
 * context. Progress is shown as a coarse bar rather than a trial counter,
 * because a visible countdown within a block would give participants a cue
 * marking each context change that the design does not otherwise provide.
 */
export function TaskScreen({ state, respond }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'f') respond('A');
      else if (key === 'j') respond('B');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [respond]);

  // The block names its own color, practice included, so what is displayed and
  // what is logged cannot come apart.
  const spec = COLORS[state.color];
  const progress = state.totalTrials ? state.trialIndex / state.totalTrials : 0;

  return (
    <main
      className={`task pattern-${spec.pattern}`}
      style={{ background: spec.hex }}
      data-context={spec.id}
      /* Exposed for the pilot: lets a screenshot or a test say exactly which
         response and block produced the display, without adding a visible
         trial counter that would cue participants to the block boundaries. */
      data-trial={state.trialIndex}
      data-block={state.blockIndex}
    >
      <header className="hud">
        <span className="points" aria-live="polite">
          {state.points} points
        </span>
        {state.part === 'practice' && <span className="tag">Practice</span>}
      </header>

      <div className="panels">
        <button
          className="panel"
          onClick={() => respond('A')}
          aria-label="Left option"
        >
          <span className="hint">F</span>
        </button>
        <button
          className="panel"
          onClick={() => respond('B')}
          aria-label="Right option"
        >
          <span className="hint">J</span>
        </button>
      </div>

      <div
        key={state.feedbackToken}
        className={state.lastRewarded ? 'flash on' : 'flash'}
        aria-hidden="true"
      />

      <footer className="progress">
        <div className="bar" style={{ width: `${Math.round(progress * 100)}%` }} />
      </footer>
    </main>
  );
}
