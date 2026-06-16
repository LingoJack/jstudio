/**
 * CodeBlockView — React NodeView for the code block node.
 *
 * Layout:
 *   ┌──────────────────────────────┐
 *   │                  [lang ▾]    │  ← language badge (top-right, floating)
 *   │  const x = 1;                │
 *   │  console.log(x);             │
 *   │                      [copy]  │  ← copy icon (below lang, hover-only)
 *   └──────────────────────────────┘
 *
 * Both the language selector and the copy button float as absolutely
 * positioned overlays on the code body. The copy button sits directly
 * below the language badge and only appears on hover.
 */

import { useCallback, useRef, useState } from 'react';
import { type NodeViewProps, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { Copy, Check } from 'lucide-react';

const LANGUAGES: { value: string; label: string }[] = [
  { value: '', label: 'Plain Text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'jsx', label: 'JSX' },
  { value: 'tsx', label: 'TSX' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'shell', label: 'Shell' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'xml', label: 'XML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'graphql', label: 'GraphQL' },
  { value: 'toml', label: 'TOML' },
  { value: 'diff', label: 'Diff' },
];

/** Display label for a language value (e.g. "typescript" → "TypeScript"). */
function getLanguageLabel(value: string): string {
  const found = LANGUAGES.find((l) => l.value === value);
  return found ? found.label : value || 'Plain Text';
}

export default function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const language = (node.attrs?.language as string | undefined) || '';
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLPreElement>(null);

  const handleCopy = useCallback(() => {
    const codeEl = codeRef.current?.querySelector('.hljs');
    const text = codeEl?.textContent ?? '';
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const handleLanguageChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateAttributes({ language: e.target.value });
    },
    [updateAttributes],
  );

  return (
    <NodeViewWrapper as="div" className="code-block-wrapper">
      {/* Language badge — floats in the top-right corner of the code body */}
      <div className="code-lang-badge" contentEditable={false}>
        <span className="code-lang-label">{getLanguageLabel(language)}</span>
        <select
          value={language}
          onChange={handleLanguageChange}
          className="code-lang-select"
          aria-label="Select language"
        >
          {LANGUAGES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Copy button — floats below the language badge, appears on hover */}
      <button
        type="button"
        onClick={handleCopy}
        contentEditable={false}
        className="code-copy-btn"
        title="复制代码"
        aria-label="Copy code"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>

      {/* Code content — highlighted by lowlight */}
      <pre ref={codeRef} className="code-block-body">
        <NodeViewContent as="div" className={`hljs language-${language || 'plaintext'}`} />
      </pre>
    </NodeViewWrapper>
  );
}
