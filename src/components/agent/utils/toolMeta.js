import {
  Terminal,
  FileText,
  FilePlus2,
  FilePen,
  Search,
  Globe
} from "lucide-react";
const TOOL_META = {
  Shell: { icon: Terminal, color: "var(--vscode-terminal-ansiGreen)" },
  Read: { icon: FileText, color: "var(--vscode-terminal-ansiBlue)" },
  Write: { icon: FilePlus2, color: "var(--vscode-terminal-ansiGreen)" },
  Edit: { icon: FilePen, color: "var(--vscode-terminal-ansiYellow)" },
  Glob: { icon: Search, color: "var(--vscode-terminal-ansiCyan)" },
  Grep: { icon: Search, color: "var(--vscode-terminal-ansiCyan)" },
  WebFetch: { icon: Globe, color: "var(--vscode-terminal-ansiBlue)" },
  WebSearch: { icon: Globe, color: "var(--vscode-terminal-ansiBlue)" }
};
function parseToolArgs(name, rawArgs) {
  let args;
  try {
    args = JSON.parse(rawArgs);
  } catch {
    return { codeBlock: { label: "JSON", content: rawArgs } };
  }
  const str = (v) => typeof v === "string" ? v : String(v ?? "");
  switch (name) {
    case "Shell":
      return {
        primary: { label: "command", value: str(args.command) },
        fields: [
          args.cwd ? { label: "cwd", value: str(args.cwd) } : null,
          args.timeout ? { label: "timeout", value: `${args.timeout}s` } : null,
          args.run_in_background ? { label: "background", value: "true" } : null
        ].filter(Boolean)
      };
    case "Read":
      return {
        primary: { label: "path", value: str(args.path || args.file_path) },
        fields: [
          args.offset != null ? { label: "offset", value: str(args.offset) } : null,
          args.limit != null ? { label: "limit", value: str(args.limit) } : null
        ].filter(Boolean)
      };
    case "Write":
      return {
        primary: { label: "path", value: str(args.path) },
        codeBlock: { label: "content", content: str(args.content), maxLines: 30 }
      };
    case "Edit":
      return {
        primary: { label: "path", value: str(args.path) },
        diffBlocks: [
          { label: "old_string", content: str(args.old_string), tone: "old" },
          { label: "new_string", content: str(args.new_string), tone: "new" }
        ]
      };
    case "Glob":
      return {
        primary: { label: "pattern", value: str(args.pattern) },
        fields: [
          args.path ? { label: "path", value: str(args.path) } : null
        ].filter(Boolean)
      };
    case "Grep":
      return {
        primary: { label: "pattern", value: str(args.pattern) },
        fields: [
          args.path ? { label: "path", value: str(args.path) } : null,
          args.glob ? { label: "glob", value: str(args.glob) } : null,
          args.type ? { label: "type", value: str(args.type) } : null,
          args.output_mode ? { label: "mode", value: str(args.output_mode) } : null
        ].filter(Boolean)
      };
    case "WebFetch":
      return {
        primary: { label: "url", value: str(args.url) },
        fields: [
          args.extract_mode ? { label: "mode", value: str(args.extract_mode) } : null
        ].filter(Boolean)
      };
    case "WebSearch":
      return {
        primary: { label: "query", value: str(args.query) },
        fields: [
          args.count ? { label: "count", value: str(args.count) } : null,
          args.type ? { label: "type", value: str(args.type) } : null
        ].filter(Boolean)
      };
    case "TodoWrite":
      return {
        codeBlock: {
          label: "todos",
          content: Array.isArray(args.todos) ? args.todos.map((t) => `  [${t.status || "pending"}] ${t.content || ""}`).join("\n") : str(args.todos),
          maxLines: 20
        }
      };
    case "Agent":
    case "Teammate":
      return {
        fields: [
          args.name ? { label: "name", value: str(args.name) } : null,
          args.role ? { label: "role", value: str(args.role) } : null
        ].filter(Boolean),
        codeBlock: { label: "prompt", content: str(args.prompt), maxLines: 15 }
      };
    default: {
      const fields = Object.entries(args).filter(([, v]) => typeof v !== "object").map(([k, v]) => ({ label: k, value: str(v) }));
      const hasLongStr = Object.values(args).some(
        (v) => typeof v === "string" && v.length > 100
      );
      return {
        fields,
        codeBlock: hasLongStr ? { label: "args", content: JSON.stringify(args, null, 2) } : void 0
      };
    }
  }
}
export {
  TOOL_META,
  parseToolArgs
};
