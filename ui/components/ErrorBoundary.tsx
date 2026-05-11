'use client';

import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center flex-1 min-w-0 bg-surface">
          <span className="font-mono text-xs text-red">panel error — state inconsistency</span>
        </div>
      );
    }
    return this.props.children;
  }
}
