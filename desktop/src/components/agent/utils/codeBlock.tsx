import { useState } from 'react';

/** Truncate text to a max number of lines */
export function truncateLines(text: string, maxLines: number): string {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join('\n') + `\n… (+${lines.length - maxLines} lines)`;
}

/** A labeled code/terminal block with monospace font. */
export function CodeBlock({
  label,
  content,
  maxLines,
  tone,
}: {
  label?: string;
  content: string;
  maxLines?: number;
  tone?: 'old' | 'new' | 'neutral';
}) {
  const [expanded, setExpanded] = useState(false);
  const display = maxLines && !expanded ? truncateLines(content, maxLines) : content;
  const hasMore = maxLines ? content.split('\n').length > maxLines : false;

  const toneStyle = {
    old: {
      bg: 'rgba(244, 135, 113, 0.08)',
      border: 'rgba(244, 135, 113, 0.2)',
      color: 'var(--vscode-descriptionForeground)',
    },
    new: {
      bg: 'rgba(55, 148, 255, 0.08)',
      border: 'rgba(55, 148, 255, 0.2)',
      color: 'var(--vscode-descriptionForeground)',
    },
    neutral: {
      bg: 'var(--vscode-editor-background)',
      border: 'var(--vscode-widget-border)',
      color: 'var(--vscode-descriptionForeground)',
    },
  }[tone || 'neutral'];

  return (
    <div className="mt-1.5">
      {label && (
        <div
          className="text-[10px] font-semibold uppercase tracking-wider mb-0.5 px-0.5"
          style={{ color: 'var(--vscode-descriptionForeground)', opacity: 0.6 }}
        >
          {label}
        </div>
      )}
      <div
        className="relative rounded-md overflow-hidden"
        style={{ background: toneStyle.bg, border: `1px solid ${toneStyle.border}` }}
      >
        <pre
          className="text-xs whitespace-pre-wrap break-words font-mono overflow-x-auto p-2.5 max-h-60"
          style={{ color: toneStyle.color }}
        >
          {display}
        </pre>
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="sticky bottom-0 left-0 right-0 w-full py-1 text-[10px] font-medium text-center transition-colors"
            style={{
              background: 'var(--vscode-editor-background)',
              color: 'var(--vscode-descriptionForeground)',
              borderTop: `1px solid ${toneStyle.border}`,
            }}
          >
            {expanded ? '\u25B2 Collapse' : `\u25BC Show all (${content.split('\n').length} lines)`}
          </button>
        )}
      </div>
    </div>
  );
}

/** A key-value field row. */
export function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span
        className="shrink-0 font-mono text-[10px] uppercase tracking-wider"
        style={{ color: 'var(--vscode-descriptionForeground)', opacity: 0.5 }}
      >
        {label}
      </span>
      <span
        className="font-mono break-all"
        style={{ color: 'var(--vscode-textPreformat-foreground)' }}
      >
        {value}
      </span>
    </div>
  );
}
