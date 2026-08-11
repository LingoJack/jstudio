const LANGUAGES = [
  { value: "", label: "Plain Text" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "jsx", label: "JSX" },
  { value: "tsx", label: "TSX" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "ruby", label: "Ruby" },
  { value: "php", label: "PHP" },
  { value: "swift", label: "Swift" },
  { value: "kotlin", label: "Kotlin" },
  { value: "sql", label: "SQL" },
  { value: "cql", label: "CQL" },
  { value: "bash", label: "Bash" },
  { value: "shell", label: "Shell" },
  { value: "makefile", label: "Makefile" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "scss", label: "SCSS" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "xml", label: "XML" },
  { value: "markdown", label: "Markdown" },
  { value: "dockerfile", label: "Dockerfile" },
  { value: "graphql", label: "GraphQL" },
  { value: "proto", label: "Protocol Buffers" },
  { value: "toml", label: "TOML" },
  { value: "diff", label: "Diff" },
  { value: "ini", label: "INI" },
  { value: "lua", label: "Lua" },
  { value: "r", label: "R" },
  { value: "perl", label: "Perl" },
  { value: "arduino", label: "Arduino" },
  { value: "mermaid", label: "Mermaid" }
];
function getLanguageLabel(value) {
  const found = LANGUAGES.find((l) => l.value === value);
  return found ? found.label : value || "Plain Text";
}
export {
  LANGUAGES,
  getLanguageLabel
};
