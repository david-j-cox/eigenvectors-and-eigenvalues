import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * A render error must not leave a participant on a blank page.
 *
 * Without a boundary, React unmounts the whole tree when a render throws, and
 * the participant sees nothing and has no completion code. They then either
 * return the submission or contact the researcher, and in both cases the
 * responses they already gave are treated as a failure. The code is shown here
 * because the data up to the error is already stored and the participant has
 * earned payment for it.
 */
interface Props { children: ReactNode; completionCode: string }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('task crashed', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="centered prose">
        <h1>Something went wrong</h1>
        <p>
          The task stopped unexpectedly. Your responses up to this point were
          saved, and you should still be paid for them.
        </p>
        <p>
          Your completion code is{' '}
          <code className="code">{this.props.completionCode}</code>. Enter it in
          Prolific.
        </p>
        <p style={{ fontSize: 13, opacity: 0.7 }}>
          If Prolific will not accept the code, message the researcher and
          mention this screen; nothing further is needed from you.
        </p>
      </main>
    );
  }
}
