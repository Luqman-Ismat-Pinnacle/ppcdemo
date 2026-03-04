'use client';

/**
 * @fileoverview Error Boundary Component for PPC V3.
 * 
 * React class component that catches JavaScript errors in its child
 * component tree, logs them, and displays a fallback UI instead of
 * crashing the entire application.
 * 
 * Features:
 * - Catches rendering errors in child components
 * - Logs errors to console for debugging
 * - Displays customizable fallback UI
 * - Provides reload button to recover from errors
 * 
 * @module components/layout/ErrorBoundary
 * 
 * @example
 * ```tsx
 * <ErrorBoundary fallback={<p>Something went wrong</p>}>
 *   <ChildComponent />
 * </ErrorBoundary>
 * ```
 */

import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isLogging: boolean;
  isLogged: boolean;
  logError: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, isLogging: false, isLogged: false, logError: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, isLogging: false, isLogged: false, logError: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  private logRuntimeIssue = async () => {
    const { error } = this.state;
    if (!error) return;
    this.setState({ isLogging: true, logError: null });
    try {
      const browserInfo = typeof navigator !== 'undefined' ? navigator.userAgent : null;
      const pagePath = typeof window !== 'undefined' ? window.location.pathname : '/';
      const payload = {
        title: `Runtime error on ${pagePath}`,
        description: 'Unhandled runtime error caught by ErrorBoundary.',
        pagePath,
        userAction: 'Unhandled runtime exception during render',
        expectedResult: 'Page should render successfully',
        actualResult: 'Page crashed into ErrorBoundary fallback',
        errorMessage: error.message || 'Unknown runtime error',
        severity: 'high',
        source: 'runtime',
        browserInfo,
        runtimeErrorName: error.name || 'Error',
        runtimeStack: error.stack || null,
      };
      const res = await fetch('/api/feedback/runtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to log runtime issue');
      this.setState({ isLogged: true, isLogging: false, logError: null });
    } catch (e: unknown) {
      const logError = e instanceof Error && e.message ? e.message : 'Failed to log issue';
      this.setState({ isLogging: false, isLogged: false, logError });
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="page-panel" style={{ padding: '2rem', textAlign: 'center' }}>
            <h2 style={{ color: 'var(--color-error)', marginBottom: '1rem' }}>
              Something went wrong
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            {this.state.logError && (
              <p style={{ color: '#FCA5A5', marginBottom: '0.8rem', fontSize: '0.82rem' }}>
                {this.state.logError}
              </p>
            )}
            {this.state.isLogged && (
              <p style={{ color: '#34D399', marginBottom: '0.8rem', fontSize: '0.82rem' }}>
                Runtime issue logged successfully.
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
              <button
                onClick={this.logRuntimeIssue}
                disabled={this.state.isLogging || this.state.isLogged}
                className="btn btn-secondary"
                style={{ opacity: this.state.isLogging || this.state.isLogged ? 0.75 : 1 }}
              >
                {this.state.isLogging ? 'Logging Issue...' : this.state.isLogged ? 'Issue Logged' : 'Add to Issues Log'}
              </button>
              <a href="/feedback" className="btn btn-secondary">
                Open Issues & Features
              </a>
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null, isLogging: false, isLogged: false, logError: null });
                window.location.reload();
              }}
              className="btn btn-primary"
            >
              Reload Page
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

