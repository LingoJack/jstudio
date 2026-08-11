import { createLowlight, common } from "lowlight";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import protobuf from "highlight.js/lib/languages/protobuf";
const lowlight = createLowlight(common);
lowlight.register("dockerfile", dockerfile);
lowlight.register("protobuf", protobuf);
const GRAMMAR_ALIASES = {
  // session / shell-family → bash (the real fix for "Shell" looking dead)
  shell: "bash",
  shell_session: "bash",
  "shell-session": "bash",
  sh: "bash",
  "sh-session": "bash",
  zsh: "bash",
  console: "bash",
  "console-session": "bash",
  bash_session: "bash",
  // grammars absent from this trimmed install → nearest registered one
  html: "xml",
  jsx: "javascript",
  tsx: "typescript",
  toml: "ini",
  // CQL (Cassandra Query Language) has no dedicated highlight.js grammar;
  // its syntax is SQL-like enough that the sql grammar highlights it well.
  cql: "sql",
  // `proto` is the alias users pick in the dropdown; the registered grammar's
  // primary name is `protobuf` (registered above). Map so the badge keeps
  // showing "proto" while the highlighter runs the real grammar.
  proto: "protobuf",
  // common runtime / import aliases
  yml: "yaml",
  py: "python",
  python3: "python",
  ts: "typescript",
  js: "javascript",
  node: "javascript",
  nodejs: "javascript",
  jsonc: "json",
  golang: "go",
  cpp: "cpp",
  cs: "csharp",
  shtml: "xml",
  xhtml: "xml"
};
lowlight.highlightAuto = (value) => lowlight.highlight("plaintext", value);
export {
  GRAMMAR_ALIASES,
  lowlight
};
