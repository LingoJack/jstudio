import { AlertCircle } from 'lucide-react';

export function SystemMessageBubble({ content }: { content: string }) {
  const isError = content.startsWith('Error:');
  return (
    <div className="flex justify-center px-2 py-1">
      <div
        className="rounded-full px-3.5 py-1.5 text-xs max-w-[80%]"
        style={{
          background: isError
            ? 'var(--vscode-inputValidation-errorBackground)'
            : 'var(--vscode-editor-inactiveSelectionBackground)',
          border: `1px solid ${
            isError
              ? 'var(--vscode-inputValidation-errorBorder)'
              : 'var(--vscode-widget-border)'
          }`,
          color: isError
            ? 'var(--vscode-errorForeground)'
            : 'var(--vscode-descriptionForeground)',
        }}
      >
        {isError ? (
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span>{content.replace(/^Error:\s*/, '')}</span>
          </div>
        ) : (
          content
        )}
      </div>
    </div>
  );
}
