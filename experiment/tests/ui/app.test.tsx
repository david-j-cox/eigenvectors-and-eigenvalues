// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { App } from '../../src/ui/App';
import { EventLogger } from '../../src/logging/logger';
import { COLORS, ENGINE } from '../../src/config/task';

/**
 * These tests exercise the wiring between the browser and the engine, not the
 * engine itself. The properties that matter here are the ones a unit test of
 * the engine cannot see: that a keypress reaches the session, that the context
 * colour actually rendered is the one the plan specifies, and that the
 * participant is never shown a control that logs nothing.
 *
 * The clock is controlled throughout. The engine timestamps every response
 * from performance.now() and rejects any that arrives inside the response
 * cooldown, so a test that fires events as fast as the event loop allows would
 * have all but the first response silently discarded.
 */
describe('App', () => {
  let clock = 0;

  beforeEach(() => {
    clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
  });

  /** Capture session records without reaching into the App's private logger. */
  const captureSessions = () => {
    const records: Record<string, unknown>[] = [];
    vi.spyOn(EventLogger.prototype, 'saveSession').mockImplementation(
      async (record: Record<string, unknown>) => {
        records.push(record);
        return true;
      },
    );
    return records;
  };

  /** Advance past the cooldown so the next response is accepted. */
  const tick = () => {
    clock += ENGINE.responseCooldownMs + 10;
  };

  /** Tick the acknowledgement and agree, as a participant must. */
  const consent = () => {
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /i agree/i }));
  };

  it('starts on consent and does not begin the task until it is given', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /consent/i })).toBeDefined();
    expect(screen.queryByLabelText(/left option/i)).toBeNull();
  });

  it('keeps the approved consent text and its required acknowledgement', () => {
    render(<App />);
    // These elements are what make the screen a consent form rather than a
    // splash page; losing any of them silently would be an ethics problem, not
    // a cosmetic one.
    expect(screen.getByText(/David J. Cox/)).toBeDefined();
    expect(screen.getByText(/dcox@endicott.edu/)).toBeDefined();
    expect(screen.getByText(/entirely voluntary/i)).toBeDefined();
    expect(screen.getByText(/no known risks/i)).toBeDefined();
    expect(screen.getByText(/De-identified data/i)).toBeDefined();

    const agree = screen.getByRole('button', { name: /i agree/i });
    expect(agree).toHaveProperty('disabled', true);
  });

  it('will not let a participant proceed without ticking the acknowledgement', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /i agree/i }));
    // Still on consent: a disabled button must not advance the flow.
    expect(screen.getByRole('heading', { name: /consent/i })).toBeDefined();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /i agree/i }));
    expect(screen.getByRole('heading', { name: /how to play/i })).toBeDefined();
  });

  it('reaches the task through consent and instructions', () => {
    render(<App />);
    consent();
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));
    expect(screen.getByLabelText(/left option/i)).toBeDefined();
    expect(screen.getByLabelText(/right option/i)).toBeDefined();
  });

  it('lets a participant decline without entering the task', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /no thanks/i }));
    expect(screen.getByRole('heading', { name: /thank you/i })).toBeDefined();
    expect(screen.queryByLabelText(/left option/i)).toBeNull();
  });

  it('records responses from both clicks and the F and J keys', () => {
    const { container } = render(<App />);
    consent();
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));

    const trials = () =>
      Number((container.querySelector('main.task') as HTMLElement).dataset.trial);
    expect(trials()).toBe(0);

    for (let i = 0; i < 40; i++) {
      tick();
      act(() => {
        fireEvent.keyDown(window, { key: i % 2 === 0 ? 'f' : 'j' });
      });
    }
    tick();
    act(() => {
      fireEvent.click(screen.getByLabelText(/left option/i));
    });

    expect(trials()).toBe(41);
  });

  it('discards responses that arrive inside the cooldown', () => {
    const { container } = render(<App />);
    consent();
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));
    const trials = () =>
      Number((container.querySelector('main.task') as HTMLElement).dataset.trial);

    // Twenty responses at the same instant, as a stuck key or a double-click
    // would produce. Only the first may be counted: an accepted duplicate would
    // shift every later response into the wrong state bin.
    for (let i = 0; i < 20; i++) {
      act(() => {
        fireEvent.keyDown(window, { key: 'f' });
      });
    }
    expect(trials()).toBe(1);

    tick();
    act(() => {
      fireEvent.keyDown(window, { key: 'f' });
    });
    expect(trials()).toBe(2);
  });

  it('shows the practice context before any experimental colour', () => {
    const { container } = render(<App />);
    consent();
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));

    const main = container.querySelector('main.task') as HTMLElement;
    expect(screen.getByText(/practice/i)).toBeDefined();
    // The practice background must not be one of the signalled contexts, or
    // participants would meet a context before the task has begun.
    expect(main.dataset.context).toBe('neutral');
    const signalled = Object.values(COLORS)
      .filter((c) => c.id !== 'neutral')
      .map((c) => c.hex);
    expect(signalled).not.toContain(main.style.background);
  });

  it('renders the exact colour the block names, so display and log agree', () => {
    const { container } = render(<App />);
    consent();
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));

    const main = container.querySelector('main.task') as HTMLElement;
    const shown = COLORS[main.dataset.context as string];
    expect(shown).toBeDefined();
    // The hex painted on screen is the same constant written to context_color
    // in every event row; a mismatch would put a context in the data that no
    // participant ever saw.
    expect(main.style.background.replace(/\s/g, '')).toBe(
      hexToRgb(shown.hex).replace(/\s/g, ''),
    );
  });

  it('pairs every signalled colour with a distinct texture', () => {
    // Colour alone would make the discrimination unavailable to a participant
    // with a colour-vision deficiency, and would make the three contexts
    // indistinguishable in a greyscale screenshot.
    const signalled = Object.values(COLORS).filter((c) => c.id !== 'neutral');
    const patterns = signalled.map((c) => c.pattern);
    expect(new Set(patterns).size).toBe(signalled.length);
  });

  // The session record is what makes a schedule checkable after the fact, and
  // for a while nothing wrote it at all: the transport had the method and no
  // caller. These pin the three statuses a session can end in.

  it('writes a session record carrying the seed and the colour mapping', () => {
    const records = captureSessions();
    render(<App />);

    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record.completion_status).toBe('in_progress');
    expect(record.seed).toBeTruthy();
    expect(record.color_to_contingency).toBeTruthy();
    expect(record.ended_at).toBeNull();
    expect(record.is_test_session).toBe(false);
  });

  it('marks the record declined when consent is refused', () => {
    const records = captureSessions();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /no thanks/i }));

    expect(records.map((r) => r.completion_status)).toEqual(['in_progress', 'declined']);
    expect(records[1].ended_at).toBeTruthy();
  });

  it('flags a researcher test run so the export can exclude it', () => {
    window.history.replaceState({}, '', '/?test=1');
    const records = captureSessions();
    render(<App />);

    expect(records[0].is_test_session).toBe(true);
  });

  it('does not rewrite the opening record on every response', () => {
    const records = captureSessions();
    const { container } = render(<App />);
    consent();
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));

    for (let i = 0; i < 5; i++) {
      tick();
      act(() => {
        fireEvent.click(container.querySelectorAll('.panel')[0]);
      });
    }

    expect(records).toHaveLength(1);
  });

  // The session clock must not start while the participant is still reading.
  // A pilot participant spent 25 minutes on consent and instructions and was
  // past the 30-minute soft cap before responding once, which cost them four
  // of five perturbation blocks and all 8 of their perturbations.
  it('starts the session clock at the first response, not at mount', () => {
    const logged: { elapsed_time_ms: number }[] = [];
    vi.spyOn(EventLogger.prototype, 'log').mockImplementation((row) => {
      logged.push(row as unknown as { elapsed_time_ms: number });
    });

    const { container } = render(<App />);

    // Time passes while the participant reads consent and instructions.
    clock += 26 * 60 * 1000;
    consent();
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));

    tick();
    act(() => {
      fireEvent.click(container.querySelectorAll('.panel')[0]);
    });

    expect(logged).toHaveLength(1);
    // Elapsed is measured from the first response, so it is near zero rather
    // than the 26 minutes that had passed on the preceding screens.
    expect(logged[0].elapsed_time_ms).toBeLessThan(1000);
  });
});

/** jsdom normalises inline colours to rgb(), so compare in that form. */
function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
