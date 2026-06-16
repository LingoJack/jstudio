/**
 * CodeBlockView — React NodeView for the code block node.
 *
 * Wraps CodeBlockLowlight rendering with:
 *   1. A language badge in the top-right corner.
 *   2. A copy-to-clipboard icon button that appears on hover,
 *      positioned just below the language badge (top-right area).
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
      {/* Top bar: language selector (right-aligned) */}
      <div className="code-block-header">
        <select
          value={language}
          onChange={handleLanguageChange}
          contentEditable={false}
          className="lang-select"
        >
          {LANGUAGES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {/* Copy button — right side of the header bar, always subtle,
            becomes prominent on hover */}
        <button
          type="button"
          onClick={handleCopy}
          contentEditable={false}
          className="copy-btn"
          title="复制代码"
          aria-label="Copy code"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>

      {/* Code content — highlighted by lowlight */}
      <pre ref={codeRef} className="code-block-body">
        <NodeViewContent as="div" className={`hljs language-${language || 'plaintext'}`} />
      </pre>
    </NodeViewWrapper>
  );
}
