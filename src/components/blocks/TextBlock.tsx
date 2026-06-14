import { useRef } from 'react';
import type { BaseBlockProps } from './types';
import BlockLine from './BlockLine';

/**
 * TYPE: text — the default paragraph block.
 *
 * In the unified surface architecture, this is just a styled <div>
 * inside the single contentEditable surface. All keyboard/input logic
 * is handled by useSurfaceEditor at the container level.
 */
export default function TextBlock({ block }: BaseBlockProps) {
  return (
    <BlockLine
      tagName="div"
      html={block.content}
      placeholder="输入 / 唤出命令"
      className="w-full text-sm text-[var(--vscode-foreground)] leading-relaxed py-0.5"
    />
  );
}
