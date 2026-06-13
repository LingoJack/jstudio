import type { BlockType } from '../../types';
import {
  Code,
  Table as TableIcon,
  MessageSquare,
  ChevronRight,
  Edit2,
  Globe,
  Paperclip,
} from 'lucide-react';

/** Small heading icon for slash menu. */
export function HeadingIcon({ className }: { className?: string }) {
  return <span className={`text-[10px] font-black ${className}`}>H</span>;
}

/** Slash command menu item descriptor. */
export interface SlashCommand {
  type: BlockType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** The list shown in the `/` slash menu popover. */
export const SLASH_COMMANDS: SlashCommand[] = [
  { type: 'text', label: '文本', icon: MessageSquare },
  { type: 'heading-1', label: '标题1', icon: HeadingIcon },
  { type: 'heading-2', label: '标题2', icon: HeadingIcon },
  { type: 'toggle', label: '折叠主题', icon: ChevronRight },
  { type: 'code', label: '代码块', icon: Code },
  { type: 'table', label: '表格', icon: TableIcon },
  { type: 'web-embed', label: '网页', icon: Globe },
  { type: 'attachment', label: '附件', icon: Paperclip },
  { type: 'whiteboard', label: '画板', icon: Edit2 },
];

/**
 * Default properties for each block type.
 * Used when converting a block via slash command or inserting a new one.
 */
export function getDefaultProperties(type: BlockType): Record<string, unknown> {
  switch (type) {
    case 'table':
      return {
        tableData: [
          ['标题 A', '标题 B', '标题 C'],
          ['数据 1', '数据 2', '数据 3'],
        ],
      };
    case 'callout':
      return { emoji: '' };
    case 'image':
      return { caption: '示例插图' };
    case 'canvas':
    case 'whiteboard':
      return { drawingPaths: [] };
    case 'web-embed':
      return { embedUrl: '' };
    case 'attachment':
      return {
        attachmentName: '',
        attachmentType: '',
        attachmentSize: '',
        attachmentMode: 'preview' as const,
      };
    case 'toggle':
      return { isOpen: true };
    default:
      return {};
  }
}

/**
 * Apply light Markdown auto-formatting (bold, code, wiki-links) to raw HTML.
 * Called on blur from text/heading blocks.
 */
export function formatMarkdown(
  raw: string,
  documents: { id: string; title: string }[],
): string {
  let formatted = raw;
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  formatted = formatted.replace(
    /`([^`]+)`/g,
    '<code class="px-1 py-0.5 mx-0.5 rounded bg-[var(--vscode-textCodeBlock-background)] text-[var(--vscode-textPreformat-foreground)] font-mono text-[13px]">$1</code>',
  );
  formatted = formatted.replace(
    /\[\[([^\]]+)\]\]/g,
    (match, titleStr: string) => {
      const title = titleStr.trim();
      const matchedDoc = documents.find(
        (d) => d.title.toLowerCase() === title.toLowerCase(),
      );
      if (matchedDoc) {
        return `<a href="#" data-doc-id="${matchedDoc.id}" class="wiki-link px-1.5 py-0.5 mx-0.5 rounded border-b border-[var(--vscode-textLink-foreground)] font-semibold text-[var(--vscode-textLink-foreground)] cursor-pointer text-xs inline-flex items-center gap-1 transition-colors" style="background-color: color-mix(in srgb, var(--vscode-textLink-foreground) 12%, transparent)"><span>${title}</span></a>`;
      }
      return match;
    },
  );
  return formatted;
}
