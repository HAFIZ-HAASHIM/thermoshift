import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      showDetails: false
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught component error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false
    });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      const { fallbackTitle = 'An unexpected error occurred in this view' } = this.props;
      const errorMessage = this.state.error?.message || 'Unknown render exception';
      const componentStack = this.state.errorInfo?.componentStack;

      return (
        <div style={{
          margin: '1.5rem',
          padding: '1.5rem',
          backgroundColor: '#FFF7ED',
          border: '1px solid #FED7AA',
          borderRadius: '8px',
          color: '#9A3412',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
            <div style={{
              backgroundColor: '#FFEDD5',
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid #FDBA74',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <AlertTriangle size={20} color="#EA580C" />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1rem', fontWeight: 700, color: '#9A3412' }}>
                {fallbackTitle}
              </h3>
              <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', color: '#7C2D12', lineHeight: '1.4' }}>
                The component encountered an error during rendering. You can retry or reset this component without losing other application state.
              </p>

              <div style={{
                backgroundColor: '#FFFFFF',
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                border: '1px solid #FED7AA',
                fontSize: '0.8rem',
                fontFamily: 'monospace',
                color: '#C2410C',
                wordBreak: 'break-all',
                marginBottom: '1rem'
              }}>
                <strong>Error:</strong> {errorMessage}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  onClick={this.handleReset}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    backgroundColor: '#EA580C',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.5rem 1rem',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <RefreshCw size={14} />
                  <span>Retry / Recover View</span>
                </button>

                {componentStack && (
                  <button
                    onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      backgroundColor: 'transparent',
                      color: '#9A3412',
                      border: '1px solid #FDBA74',
                      borderRadius: '6px',
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    {this.state.showDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span>{this.state.showDetails ? 'Hide Stack Trace' : 'Show Technical Details'}</span>
                  </button>
                )}
              </div>

              {this.state.showDetails && componentStack && (
                <pre style={{
                  marginTop: '1rem',
                  padding: '0.75rem',
                  backgroundColor: '#1E293B',
                  color: '#F1F5F9',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  overflowX: 'auto',
                  maxHeight: '200px'
                }}>
                  {componentStack}
                </pre>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
