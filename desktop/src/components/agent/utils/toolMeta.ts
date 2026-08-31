import {
  Terminal,
  FileText,
  FilePlus2,
  FilePen,
  Search,
  Globe,
} from 'lucide-react';

/** Tool icon + color mapping */
export const TOOL_META: Record<string, { icon: typeof Terminal; color: string }> = {
  Shell: { icon: Terminal, color: 'var(--vscode-terminal-ansiGreen)' },
  Read: { icon: FileText, color: 'var(--vscode-terminal-ansiBlue)' },
  Write: { icon: FilePlus2, color: 'var(--vscode-terminal-ansiGreen)' },
  Edit: { icon: FilePen, color: 'var(--vscode-terminal-ansiYellow)' },
  Glob: { icon: Search, color: 'var(--vscode-terminal-ansiCyan)' },
  Grep: { icon: Search, color: 'var(--vscode-terminal-ansiCyan)' },
  WebFetch: { icon: Globe, color: 'var(--vscode-terminal-ansiBlue)' },
  WebSearch: { icon: Globe, color: 'var(--vscode-terminal-ansiBlue)' },
};

export interface ParsedToolArgs {
  primary?: { label: string; value: string };
  fields?: { label: string; value: string }[];
  codeBlock?: { label: string; content: string; maxLines?: number };
  diffBlocks?: { label: string; content: string; tone: 'old' | 'new' }[];
}

/** Parse JSON arguments and produce a structured, human-readable display. */
export function parseToolArgs(name: string, rawArgs: string): ParsedToolArgs {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs);
  } catch {
    return { codeBlock: { label: 'JSON', content: rawArgs } };
  }

  const str = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''));

  switch (name) {
    case 'Shell':
      return {
        primary: { label: 'command', value: str(args.command) },
        fields: [
          args.cwd ? { label: 'cwd', value: str(args.cwd) } : null,
          args.timeout ? { label: 'timeout', value: `${args.timeout}s` } : null,
          args.run_in_background ? { label: 'background', value: 'true' } : null,
        ].filter(Boolean) as { label: string; value: string }[],
      };

    case 'Read':
      return {
        primary: { label: 'path', value: str(args.path || args.file_path) },
        fields: [
          args.offset != null ? { label: 'offset', value: str(args.offset) } : null,
          args.limit != null ? { label: 'limit', value: str(args.limit) } : null,
        ].filter(Boolean) as { label: string; value: string }[],
      };

    case 'Write':
      return {
        primary: { label: 'path', value: str(args.path) },
        codeBlock: { label: 'content', content: str(args.content), maxLines: 30 },
      };

    case 'Edit':
      return {
        primary: { label: 'path', value: str(args.path) },
        diffBlocks: [
          { label: 'old_string', content: str(args.old_string), tone: 'old' as const },
          { label: 'new_string', content: str(args.new_string), tone: 'new' as const },
        ],
      };

    case 'Glob':
      return {
        primary: { label: 'pattern', value: str(args.pattern) },
        fields: [
          args.path ? { label: 'path', value: str(args.path) } : null,
        ].filter(Boolean) as { label: string; value: string }[],
      };

    case 'Grep':
      return {
        primary: { label: 'pattern', value: str(args.pattern) },
        fields: [
          args.path ? { label: 'path', value: str(args.path) } : null,
          args.glob ? { label: 'glob', value: str(args.glob) } : null,
          args.type ? { label: 'type', value: str(args.type) } : null,
          args.output_mode ? { label: 'mode', value: str(args.output_mode) } : null,
        ].filter(Boolean) as { label: string; value: string }[],
      };

    case 'WebFetch':
      return {
        primary: { label: 'url', value: str(args.url) },
        fields: [
          args.extract_mode ? { label: 'mode', value: str(args.extract_mode) } : null,
        ].filter(Boolean) as { label: string; value: string }[],
      };

    case 'WebSearch':
      return {
        primary: { label: 'query', value: str(args.query) },
        fields: [
          args.count ? { label: 'count', value: str(args.count) } : null,
          args.type ? { label: 'type', value: str(args.type) } : null,
        ].filter(Boolean) as { label: string; value: string }[],
      };

    case 'TodoWrite':
      return {
        codeBlock: {
          label: 'todos',
          content: Array.isArray(args.todos)
            ? (args.todos as Record<string, unknown>[])
                .map((t) => `  [${t.status || 'pending'}] ${t.content || ''}`)
                .join('\n')
            : str(args.todos),
          maxLines: 20,
        },
      };

    case 'Agent':
    case 'Teammate':
      return {
        fields: [
          args.name ? { label: 'name', value: str(args.name) } : null,
          args.role ? { label: 'role', value: str(args.role) } : null,
        ].filter(Boolean) as { label: string; value: string }[],
        codeBlock: { label: 'prompt', content: str(args.prompt), maxLines: 15 },
      };

    default: {
      const fields: { label: string; value: string }[] = Object.entries(args)
        .filter(([, v]) => typeof v !== 'object')
        .map(([k, v]) => ({ label: k, value: str(v) }));
      const hasLongStr = Object.values(args).some(
        (v) => typeof v === 'string' && v.length > 100,
      );
      return {
        fields,
        codeBlock: hasLongStr
          ? { label: 'args', content: JSON.stringify(args, null, 2) }
          : undefined,
      };
    }
  }
}
