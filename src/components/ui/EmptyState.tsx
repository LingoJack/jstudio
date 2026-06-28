import { FileText } from 'lucide-react';

/**
 * EmptyState — placeholder shown in the main content area when there is
 * no active document to display.
 *
 * Inspired by VS Code: a single centered icon, nothing else.
 */
export default function EmptyState() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <FileText className="w-12 h-12 text-[var(--vscode-descriptionForeground)] opacity-20" />
    </div>
  );
}
