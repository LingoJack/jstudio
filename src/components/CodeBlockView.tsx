/**
 * CodeBlockView — React NodeView for the code block node.
 *
 * Layout (multi-line, default):
 *   ┌──────────────────────────────┐
 *   │                  [lang ▾]    │  ← language badge (top-right)
 *   │  const x = 1;                │
 *   │  console.log(x);             │
 *   │                      [copy]  │  ← copy icon (below badge, hover)
 *   └──────────────────────────────┘
 *
 * Layout (single line / too short):
 *   ┌──────────────────────────────┐
 *   │  const x = 1;      [copy][lang ▾] │  ← both in top-right toolbar
 *   └──────────────────────────────┘
 *
 * A ResizeObserver watches the code body height. When it's too short to
 * fit the copy button below the badge (< 60px), the button moves inline
 * next to the badge to avoid overflowing the wrapper.
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

export default function CodeBlockView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const language = (node.attrs?.language as string | undefined) || '';
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLPreElement>(null);

  // Whether the code block has non-empty content (controls copy-button visibility)
  const hasContent = node.textContent.trim().length > 0;

  // Whether the code body is tall enough to host the copy button below the
  // language badge (badge bottom ~30px + copy button 26px + margin ≈ 60px).
  // When too short (single line), we render the copy button inline next to
  // the language badge instead of absolutely below it.
  const [canFitBelow, setCanFitBelow] = useState(true);
  useEffect(() => {
    const el = codeRef.current;
    if (!el) return;
    const update = () => setCanFitBelow(el.scrollHeight >= 60);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- Language dropdown state ----
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const badgeRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const savedSelectionRef = useRef<number | null>(null);

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
      setHighlightedIndex(0);

      // Restore editor focus after the dropdown closes. Use a microtask
      // so React has time to unmount the search input first.
      const savedPos = savedSelectionRef.current;
      queueMicrotask(() => {
        editor.commands.focus();
        if (savedPos != null) {
          // Place cursor at the saved position (clamped to the code block).
          try {
            const codeBlockPos = typeof getPos === 'function' ? getPos() : null;
            if (codeBlockPos != null) {
              const nodeStart = codeBlockPos + 1; // +1 to enter the node
              const nodeEnd = nodeStart + node.content.size;
              const clamped = Math.max(nodeStart, Math.min(savedPos, nodeEnd));
              editor.commands.setTextSelection(clamped);
            }
          } catch {
            // best-effort; focus alone is sufficient fallback
          }
        }
      });
    },
    [updateAttributes, editor, getPos, node],
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
        setHighlightedIndex(0);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
        setSearchQuery('');
        setHighlightedIndex(0);
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
    setDropdownOpen((prev) => {
      if (!prev) {
        // Opening — save current editor selection so we can restore it later
        savedSelectionRef.current = editor.state.selection.from;
      }
      return !prev;
    });
  }, [editor]);

  const filteredLanguages = searchQuery
    ? LANGUAGES.filter(({ label, value }) => {
        const q = searchQuery.toLowerCase();
        return label.toLowerCase().includes(q) || value.toLowerCase().includes(q);
      })
    : LANGUAGES;

  // Reset highlight when the filtered list changes
  useEffect(() => {
    if (!dropdownOpen) return;
    // Default to the currently selected language if it's in the filtered
    // list, otherwise fall back to the first item.
    const currentIdx = filteredLanguages.findIndex((l) => l.value === language);
    setHighlightedIndex(currentIdx >= 0 ? currentIdx : 0);
  }, [searchQuery, dropdownOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll highlighted item into view
  useEffect(() => {
    if (!dropdownOpen) return;
    const list = listRef.current;
    if (!list) return;
    const item = list.children[highlightedIndex] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, dropdownOpen]);

  return (
    <NodeViewWrapper as="div" className="code-block-wrapper">
      {/* Top-right toolbar: always holds the language badge.
          When the code body is too short (single line), the copy button
          also lives here, to the left of the badge. */}
      <div className="code-toolbar" contentEditable={false}>
        {hasContent && !canFitBelow && (
          <button
            type="button"
            onClick={handleCopy}
            className="code-copy-btn"
            title="复制代码"
            aria-label="Copy code"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        )}
        <div
          ref={badgeRef}
          className="code-lang-badge"
          onClick={toggleDropdown}
          role="button"
          tabIndex={0}
        >
          <span className="code-lang-label">{getLanguageLabel(language)}</span>
          <ChevronDown size={12} className="code-lang-chevron" />
        </div>
      </div>

      {/* Copy button — only when content exists AND there is room below the badge */}
      {hasContent && canFitBelow && (
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
      )}

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
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (filteredLanguages.length === 0) return;
                  setHighlightedIndex((prev) =>
                    prev >= filteredLanguages.length - 1 ? 0 : prev + 1,
                  );
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (filteredLanguages.length === 0) return;
                  setHighlightedIndex((prev) =>
                    prev <= 0 ? filteredLanguages.length - 1 : prev - 1,
                  );
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  const item = filteredLanguages[highlightedIndex] ?? filteredLanguages[0];
                  if (item) selectLanguage(item.value);
                }
              }}
              placeholder="搜索语言…"
              className="code-lang-search-input"
            />
          </div>
          <div ref={listRef} className="code-lang-list">
            {filteredLanguages.length === 0 ? (
              <div className="code-lang-empty">无匹配语言</div>
            ) : (
              filteredLanguages.map(({ value, label }, index) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => selectLanguage(value)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`code-lang-option ${value === language ? 'is-active' : ''} ${index === highlightedIndex ? 'is-highlighted' : ''}`}
                >
                  {label}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Code content — highlighted by lowlight */}
      <pre ref={codeRef} className="code-block-body">
        <NodeViewContent as="div" className={`hljs language-${language || 'plaintext'}`} />
      </pre>
    </NodeViewWrapper>
  );
}
