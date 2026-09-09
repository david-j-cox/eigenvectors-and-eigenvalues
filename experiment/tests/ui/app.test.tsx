// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { App } from '../../src/ui/App';
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
  });

  /** Advance past the cooldown so the next response is accepted. */
  const tick = () => {
    clock += ENGINE.responseCooldownMs + 10;
  };

  it('starts on consent and does not begin the task until it is given', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /consent/i })).toBeDefined();
    expect(screen.queryByLabelText(/left option/i)).toBeNull();
  });

  it('reaches the task through consent and instructions', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /i agree/i }));
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));
    expect(screen.getByLabelText(/left option/i)).toBeDefined();
    expect(screen.getByLabelText(/right option/i)).toBeDefined();
  });

  it('lets a participant decline without entering the task', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /do not agree/i }));
    expect(screen.getByRole('heading', { name: /thank you/i })).toBeDefined();
    expect(screen.queryByLabelText(/left option/i)).toBeNull();
  });

  it('records responses from both clicks and the F and J keys', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /i agree/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /i agree/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /i agree/i }));
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));

    const main = container.querySelector('main.task') as HTMLElement;
    expect(main.dataset.context).toBeDefined();
    expect(screen.getByText(/practice/i)).toBeDefined();
    // The practice background must not be one of the signalled contexts, or
    // participants would meet a context before the task has begun.
    const experimental = Object.values(COLORS).map((c) => c.hex);
    expect(experimental).not.toContain(main.style.background);
  });
});
