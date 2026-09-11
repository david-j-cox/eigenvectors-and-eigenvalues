// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { EndScreen } from '../../src/ui/screens/EndScreen';

/**
 * A participant wrote in about "1 responses have not yet uploaded" on a session
 * whose 4,260 responses had in fact all arrived. Two faults in one message: it
 * was ungrammatical, and it was rendered from a count read once, so a warning
 * about a batch that cleared seconds later stayed on screen indefinitely --
 * under text telling them to wait for it to clear.
 */
describe('the end screen upload notice', () => {
  const props = { points: 900, completionCode: 'C1ABCDEF', onDownload: vi.fn() };

  it('says nothing about uploads when nothing is queued', () => {
    render(<EndScreen {...props} pending={0} />);
    expect(screen.queryByText(/uploading/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull();
  });

  it('uses the singular for one queued response', () => {
    render(<EndScreen {...props} pending={1} />);
    expect(screen.getByText(/One response is\s+still uploading/i)).toBeDefined();
  });

  it('uses the plural for more than one', () => {
    render(<EndScreen {...props} pending={4} />);
    expect(screen.getByText(/4 responses are\s+still uploading/i)).toBeDefined();
  });

  it('clears the notice when the count reaches zero', () => {
    // What the participant was told would happen, and could not.
    const { rerender } = render(<EndScreen {...props} pending={1} />);
    expect(screen.getByText(/still uploading/i)).toBeDefined();
    rerender(<EndScreen {...props} pending={0} />);
    expect(screen.queryByText(/still uploading/i)).toBeNull();
  });

  it('always shows the completion code, queued or not', () => {
    const { rerender } = render(<EndScreen {...props} pending={7} />);
    expect(screen.getByText('C1ABCDEF')).toBeDefined();
    rerender(<EndScreen {...props} pending={0} />);
    expect(screen.getByText('C1ABCDEF')).toBeDefined();
  });
});
