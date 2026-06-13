import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
import type { BaseBlockProps } from './types';

/**
 * TYPE: whiteboard — a full tldraw canvas embedded as a block.
 *
 * Uses `persistenceKey` so tldraw stores its own snapshot in localStorage
 * keyed by the block id.
 */
export default function WhiteboardBlock({ block }: BaseBlockProps) {
  return (
    <div className="border border-[var(--vscode-widget-border)] rounded-sm overflow-hidden h-[400px] bg-white dark:bg-zinc-900 relative">
      <Tldraw persistenceKey={`tldraw-${block.id}`} />
    </div>
  );
}
