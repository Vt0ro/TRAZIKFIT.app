import React from 'react';
import { BrandMark } from './BrandMark';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let msg = error.message || 'Ha ocurrido un error inesperado.';
    try {
      const parsed = JSON.parse(msg);
      if (parsed && parsed.error) {
        msg = `${parsed.error}${parsed.path ? ` (${parsed.operationType} en ${parsed.path})` : ''}`;
      }
    } catch {
      // plain string message
    }
    return { hasError: true, message: msg };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="tf-card max-w-md w-full p-6 text-center space-y-4">
            <BrandMark className="w-12 h-auto mx-auto" />
            <h2 className="font-display text-xl font-bold">Algo salió mal</h2>
            <p className="text-sm text-[var(--mut)] break-words" data-selectable="true">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="tf-btn-pri w-full py-3 rounded-xl font-semibold text-sm cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
