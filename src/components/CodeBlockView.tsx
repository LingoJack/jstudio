/**
 * CodeBlockView — React NodeView for the code block node.
 *
 * Layout:
 *   ┌──────────────────────────────┐
 *   │                  [lang ▾]    │  ← language selector (top-right, floating)
 *   │  const x = 1;                │
 *   │  console.log(x);             │
 *   │                      [copy]  │  ← copy icon (below lang, hover-only)
 *   └──────────────────────────────┘
 *
 * Both the language selector and the copy button float as absolutely
 * positioned overlays on the code body. The copy button sits directly
 * below the language badge and only appears on hover.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { type NodeViewProps, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { Copy, Check, ChevronDown, Search } from 'lucide-react';

/** Language entries that map to lowlight registered grammars. */
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
  { value: 'makefile', label: 'Makefile' },
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
  { value: 'ini', label: 'INI' },
  { value: 'lua', label: 'Lua' },
  { value: 'r', label: 'R' },
  { value: 'perl', label: 'Perl' },
  { value: 'arduino', label: 'Arduino' },
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

  // ---- Language dropdown state ----
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const badgeRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleCopy = useCallback(() => {
    const codeEl = codeRef.current?.querySelector('.hljs');
    const text = codeEl?.textContent ?? '';
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const selectLanguage = useCallback(
    (value: string) => {
      updateAttributes({ language: value });
      setDropdownOpen(false);
      setSearchQuery('');
    },
    [updateAttributes],
  );

  // Close dropdown on outside click / Escape
  useEffect(() => {
    if (!dropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        badgeRef.current &&
        !badgeRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
        setSearchQuery('');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    // Focus search input when opened
    requestAnimationFrame(() => searchInputRef.current?.focus());

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dropdownOpen]);

  const toggleDropdown = useCallback(() => {
    setDropdownOpen((prev) => !prev);
  }, []);

  const filteredLanguages = searchQuery
    ? LANGUAGES.filter(({ label, value }) => {
        const q = searchQuery.toLowerCase();
        return label.toLowerCase().includes(q) || value.toLowerCase().includes(q);
      })
    : LANGUAGES;

  return (
    <NodeViewWrapper as="div" className="code-block-wrapper">
      {/* Language selector — floats in the top-right corner of the code body */}
      <div
        ref={badgeRef}
        className="code-lang-badge"
        contentEditable={false}
        onClick={toggleDropdown}
        role="button"
        tabIndex={0}
      >
        <span className="code-lang-label">{getLanguageLabel(language)}</span>
        <ChevronDown size={12} className="code-lang-chevron" />
      </div>

      {/* Custom dropdown panel */}
      {dropdownOpen && (
        <div ref={dropdownRef} className="code-lang-dropdown" contentEditable={false}>
          <div className="code-lang-search">
            <Search size={13} className="code-lang-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const first = filteredLanguages[0];
                  if (first) selectLanguage(first.value);
                }
              }}
              placeholder="搜索语言…"
              className="code-lang-search-input"
            />
          </div>
          <div className="code-lang-list">
            {filteredLanguages.length === 0 ? (
              <div className="code-lang-empty">无匹配语言</div>
            ) : (
              filteredLanguages.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => selectLanguage(value)}
                  className={`code-lang-option ${value === language ? 'is-active' : ''}`}
                >
                  {label}
                </button>
              ))
            )}
          </div>
        </div>
      )}

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
