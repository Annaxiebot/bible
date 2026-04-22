import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  componentStack?: string;
  copied?: boolean;
}

/**
 * ErrorBoundary — the app's last safety net. Previously `componentDidCatch`
 * was an empty stub (ADR-0001 §Error handling R5: "componentDidCatch has
 * '// TODO: use error reporting service' with a `void errorInfo` suppression,
 * so a crash hits the fallback UI with no record kept"). This is the R5
 * silent-swallow bug at its worst — the one place that DOES catch logged
 * nothing. Fix:
 *   - Log with a greppable `[ErrorBoundary]` prefix including error.message,
 *     error.stack, and errorInfo.componentStack so the failure is
 *     investigatable from devtools.
 *   - Render a fallback card that shows the error message (not blank) with
 *     a Copy-Error button so the user can paste into a bug report.
 *   - Expose reset() so the fallback's retry button can un-catch and try
 *     the subtree again (e.g. after the underlying issue is fixed or the
 *     user takes a corrective action).
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // R5: surface the error. `console.error` is not "enough" on its own for
    // arbitrary catches, but for the *top-level* boundary it's the right sink
    // — Sentry/whatever can subscribe to this same channel, and the user's
    // Copy-Error button exports the payload for pasting into bug reports.
    // Prefix is greppable so ops can filter post-crash.
    console.error(
      '[ErrorBoundary] caught render error:',
      error.message,
      '\nstack:', error.stack,
      '\ncomponentStack:', errorInfo.componentStack,
    );
    this.setState({ componentStack: errorInfo.componentStack || undefined });
  }

  /**
   * Drop the error state and retry the subtree. Wired to the fallback UI's
   * "Try again" button; also exported via ref for callers that need to
   * programmatically recover (e.g. after a state-clearing action).
   */
  reset = (): void => {
    this.setState({ hasError: false, error: undefined, componentStack: undefined, copied: false });
  };

  private handleCopy = async (): Promise<void> => {
    const { error, componentStack } = this.state;
    const payload = [
      `[ErrorBoundary] ${error?.message || 'unknown error'}`,
      '',
      'stack:',
      error?.stack || '(no stack)',
      '',
      'componentStack:',
      componentStack || '(no component stack)',
    ].join('\n');
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
      }
      this.setState({ copied: true });
    } catch (copyErr) {
      // Clipboard API can fail (permissions, http context). Surface visibly
      // rather than silently swallowing — R5.
      console.error('[ErrorBoundary] clipboard write failed:', copyErr);
      this.setState({ copied: false });
    }
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback still wins if the caller passed one — they're
      // opting into their own UX. We still logged above, so the failure
      // is not silent.
      if (this.props.fallback) {
        return this.props.fallback;
      }
      const message = this.state.error?.message || '未知错误 / Unknown error';
      return (
        <div
          data-testid="error-boundary-fallback"
          className="min-h-screen flex items-center justify-center bg-slate-50"
        >
          <div className="max-w-lg w-full text-center p-8 bg-white rounded-xl shadow">
            <h2 className="text-2xl font-bold text-red-600 mb-2">出现错误 / Something went wrong</h2>
            <p className="text-gray-600 mb-2">应用遇到问题，请刷新页面重试</p>
            <p className="text-gray-600 mb-4">Please refresh the page. If it happens again, tap "Copy error" and include the text in your bug report.</p>
            <pre
              data-testid="error-boundary-message"
              className="text-xs text-left bg-slate-100 text-slate-800 p-3 rounded mb-4 overflow-auto max-h-40"
            >{message}</pre>
            <div className="flex gap-2 justify-center flex-wrap">
              <button
                data-testid="error-boundary-reset"
                onClick={this.reset}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                重试 / Try again
              </button>
              <button
                data-testid="error-boundary-copy"
                onClick={this.handleCopy}
                className="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300"
              >
                {this.state.copied ? '已复制 / Copied' : '复制错误 / Copy error'}
              </button>
              <button
                data-testid="error-boundary-reload"
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700"
              >
                刷新页面 / Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
