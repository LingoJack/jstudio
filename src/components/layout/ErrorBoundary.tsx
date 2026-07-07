import { Component, type ReactNode } from 'react';
import { useStore } from '../../store';
import { translations, interpolate, type TranslationKey } from '../../lib/core/i18n';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level error boundary — prevents a white/black screen when an
 * unexpected error occurs during rendering. Shows a simple recovery UI
 * with a "reload" button.
 * 
 * Note: This is a class component because error boundaries must be class components
 * in React. We use a non-hook approach to get translations by directly reading from
 * the store.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  // Non-hook translation helper for class components
  t = (key: TranslationKey, vars?: Record<string, string | number>): string => {
    const language = useStore.getState().language;
    const dict = translations[language];
    const value = dict[key] ?? translations.zh[key] ?? key;
    return interpolate(value, vars);
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex flex-col items-center justify-center gap-4 bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)]">
          <p className="text-sm">
            {this.t('error.title')}
          </p>
          <pre className="max-w-lg text-xs text-[var(--vscode-descriptionForeground)] overflow-auto px-4">
            {this.state.error?.message ?? 'Unknown error'}
          </pre>
          <button
            onClick={this.handleReload}
            className="px-4 py-1.5 text-xs rounded border border-[var(--vscode-button-border)] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] cursor-pointer hover:opacity-90"
          >
            {this.t('error.retry')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}