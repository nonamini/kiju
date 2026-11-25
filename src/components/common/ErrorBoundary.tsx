/**
 * Application Error Boundary Component.
 * Catches unhandled React render errors, displays fallback UI with error details,
 * and logs error and component stack to the browser console.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-rose-500/50 bg-rose-950/20 p-6 text-slate-100 max-w-2xl mx-auto my-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">⚠️</span>
            <div>
              <h2 className="text-base font-bold text-rose-400">
                {this.props.fallbackTitle ?? 'An unexpected error occurred'}
              </h2>
              <p className="text-xs text-slate-400">
                The component encountered an error during rendering.
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-slate-950/90 border border-slate-800 p-4 font-mono text-xs overflow-x-auto text-rose-300 mb-4 whitespace-pre-wrap">
            {this.state.error?.name}: {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
            {this.state.errorInfo?.componentStack && (
              <>
                {'\n\nComponent Stack:'}
                {this.state.errorInfo.componentStack}
              </>
            )}
          </div>

          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-lg bg-rose-600 hover:bg-rose-500 px-4 py-2 text-xs font-bold text-white transition shadow"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
