/**
 * CodeBlockView — React NodeView for the code block node.
 *
 * Layout (multi-line, default):
 *   ┌──────────────────────────────┐
 *   │                  [lang ▾]    │  ← language badge (top-right)
 *   │  const x = 1;  [preview][copy]│  ← action buttons (horizontal, below badge)
 *   │  console.log(x);          ◯  │  ← corner resize handle (bottom-right)
 *   └──────────────────────────────┘
 *
 * Layout (single line / too short):
 *   ┌──────────────────────────────────────┐
 *   │  const x = 1;  [preview][copy][lang ▾] │  ← all in top-right toolbar
 *   └──────────────────────────────────────┘
 *
 * A ResizeObserver watches the code body height. The HTML-preview toggle and
 * the copy button always travel together (horizontally) so their positions
 * stay consistent: when the body is tall enough (>= 60px) they sit below the
 * badge; when it's too short they fold inline into the toolbar next to it.
 *
 * Selection / resize chrome is unified with FileView:
 *   - The figure shows a focusBorder when the node is selected (NodeSelection)
 *     or the cursor is inside the code (focus-within).
 *   - A shared bottom-right circular ResizeHandle (the same `block-resize-handle`
 *     used by File / Image / Diagram blocks, positioned at the corner edge)
 *     resizes width + height in pixels via the shared `useNodeResize` hook,
 *     persisted as `widthPct` / `heightPct` (percentage of editor width).
 *   - In HTML-preview mode a transparent overlay (when not selected) lets a
 *     click select the node, mirroring FileView's iframe preview box.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { type NodeViewProps, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { Copy, Check, ChevronDown, Search, Eye, Code2 } from 'lucide-react';
import { ResizeHandle } from '../../ui/ResizeHandle';
import { useNodeResize } from '../hooks/useNodeResize';
import { useEditorWidth } from '../hooks/useEditorWidth';

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

export default function CodeBlockView({ node, selected, updateAttributes, editor, getPos }: NodeViewProps) {
  const language = (node.attrs?.language as string | undefined) || '';
  // Resize attributes (unified with FileView): width/height stored as a
  // percentage of the editor content width, with legacy px fallbacks.
  const widthPct = node.attrs?.widthPct as number | null | undefined;
  const heightPct = node.attrs?.heightPct as number | null | undefined;
  const widthAttr = node.attrs?.width as number | null | undefined;
  const heightAttr = node.attrs?.height as number | null | undefined;
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLPreElement>(null);

  // Whether the code block has non-empty content (controls copy-button visibility)
  const hasContent = node.textContent.trim().length > 0;

  // ---- HTML live preview ----
  // For HTML code blocks we offer a toggle that renders the source in a
  // sandboxed iframe so users can see the result without leaving the editor.
  const isHtml = language === 'html';
  const [showPreview, setShowPreview] = useState(false);
  // The current code text, used as the iframe `srcDoc`. Reading
  // `node.textContent` on every render keeps the preview in sync with edits.
  const htmlSource = node.textContent;

  // Auto-disable preview when the language changes away from HTML.
  useEffect(() => {
    if (!isHtml && showPreview) setShowPreview(false);
  }, [isHtml, showPreview]);

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

  /* -------------------------------------------------------------- */
  /* Resize: drag the bottom-right handle (shared useNodeResize)     */
  /* identical mechanism to FileView — width + height in pixels,     */
  /* committed back as percentages of the editor content width.      */
  /* -------------------------------------------------------------- */

  const editorWidth = useEditorWidth();

  // Pixel width/height from the preferred pct attrs (fallback to legacy px).
  const widthPx =
    widthPct != null ? Math.round((widthPct * editorWidth) / 100) : widthAttr ?? null;
  const heightPx =
    heightPct != null ? Math.round((heightPct * editorWidth) / 100) : heightAttr ?? null;

  // Separate ref for reading the DOM inside maxWidth (before the hook call).
  const figureRefInternal = useRef<HTMLDivElement>(null);

  const { ref: figureRef, displayWidth, displayHeight, onResizeStart } =
    useNodeResize<HTMLDivElement>({
      width: widthPx,
      height: heightPx,
      updateAttributes,
      minWidth: 240,
      minHeight: 80,
      fallbackWidth: editorWidth,
      fallbackHeight: 200,
      maxWidth: () => {
        const el = figureRefInternal.current;
        const editorSurface = el?.closest('.ProseMirror') as HTMLElement | null;
        if (editorSurface) {
          const style = getComputedStyle(editorSurface);
          const padX =
            (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
          return editorSurface.clientWidth - padX;
        }
        return window.innerWidth - 24;
      },
      onCommit: (finalWidth, finalHeight) => {
        const pct =
          editorWidth > 0
            ? Math.min(100, Math.max(1, Math.round((finalWidth / editorWidth) * 100)))
            : 100;
        const attrs: Record<string, number | null> = { widthPct: pct, width: null };
        if (finalHeight !== null) {
          attrs.heightPct =
            editorWidth > 0
              ? Math.min(200, Math.max(1, Math.round((finalHeight / editorWidth) * 100)))
              : null;
          attrs.height = null;
        }
        return attrs;
      },
    });

  // Merge the hook's ref + internal ref onto the same DOM element.
  const setFigureRef = useCallback(
    (el: HTMLDivElement | null) => {
      figureRef.current = el;
      figureRefInternal.current = el;
    },
    [figureRef],
  );

  // Double-click the handle to reset to the default (full width, auto height).
  const onSizeReset = useCallback(() => {
    updateAttributes({ width: null, widthPct: null, height: null, heightPct: null });
  }, [updateAttributes]);

  // Select this code block as a node (mirrors FileView): clicking the preview
  // overlay turns the block into a NodeSelection so the selection border shows
  // and the iframe becomes interactive afterwards.
  const selectNode = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const pos = typeof getPos === 'function' ? getPos() : null;
      if (pos == null) return;
      editor.commands.setNodeSelection(pos);
    },
    [editor, getPos],
  );

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

  // ---- Action buttons (HTML preview toggle + copy) ----
  // These two always travel together so their positions stay consistent.
  // When the code body is tall enough (`canFitBelow`) they sit stacked below
  // the language badge; when it's too short they fold inline into the toolbar
  // to the left of the badge.
  const previewBtn =
    isHtml && hasContent ? (
      <button
        type="button"
        onClick={() => setShowPreview((p) => !p)}
        className={`code-copy-btn code-toggle-btn ${showPreview ? 'is-active' : ''}`}
        title={showPreview ? '显示代码' : '预览 HTML'}
        aria-label={showPreview ? 'Show code' : 'Preview HTML'}
      >
        {showPreview ? <Code2 size={14} /> : <Eye size={14} />}
      </button>
    ) : null;

  const copyBtn = hasContent ? (
    <button
      type="button"
      onClick={handleCopy}
      className="code-copy-btn"
      title="复制代码"
      aria-label="Copy code"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  ) : null;

  // ---- Inline styles driven by displayWidth / displayHeight ----
  // Default: full editor width, content-driven height (scroll past 60vh).
  // After a resize: fixed pixel width / height.
  const figureStyle: React.CSSProperties = {
    width: displayWidth ? `${displayWidth}px` : '100%',
  };
  const bodyStyle: React.CSSProperties = {
    overflow: 'auto',
    ...(displayHeight != null ? { height: `${displayHeight}px` } : { maxHeight: '60vh' }),
    ...(showPreview ? { display: 'none' } : null),
  };
  const previewStyle: React.CSSProperties = {
    height: displayHeight != null ? `${displayHeight}px` : '320px',
  };

  return (
    <NodeViewWrapper as="div" className="code-block-wrapper">
      <div
        ref={setFigureRef}
        className={`code-block-figure ${selected ? 'is-selected' : ''} ${
          showPreview ? 'is-preview' : ''
        }`}
        style={figureStyle}
      >
        {/* Top-right toolbar: always holds the language badge.
            When the code body is too short (single line), the action buttons
            (preview + copy) also live here, to the left of the badge. */}
        <div className="code-toolbar" contentEditable={false}>
          {!canFitBelow && previewBtn}
          {!canFitBelow && copyBtn}
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

        {/* Action buttons below the badge — only when there is room below it.
            Preview toggle and copy stay grouped so they line up consistently. */}
        {canFitBelow && (previewBtn || copyBtn) && (
          <div className="code-actions" contentEditable={false}>
            {previewBtn}
            {copyBtn}
          </div>
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

        {/* Code content — highlighted by lowlight.
            Height is driven by the resize handle (displayHeight); when unset the
            body is content-driven and scrolls past 60vh.
            NodeViewContent must stay mounted for ProseMirror, so in preview
            mode we hide the <pre> instead of unmounting it. */}
        <pre ref={codeRef} className="code-block-body" style={bodyStyle}>
          <NodeViewContent as="div" className={`hljs language-${language || 'plaintext'}`} />
        </pre>

        {/* HTML live preview — sandboxed iframe rendering the source.
            Wrapped in a relative container that mirrors FileView's preview box:
            when NOT selected a transparent overlay sits above the iframe so a
            click selects the node; once selected the overlay disappears and the
            iframe becomes interactive.
            `sandbox` without `allow-same-origin` isolates it from the app. */}
        {isHtml && showPreview && (
          <div className="code-block-preview" contentEditable={false} style={previewStyle}>
            {!selected && (
              <div className="code-block-preview-overlay" onMouseDown={selectNode} />
            )}
            <iframe
              className="code-html-preview"
              title="HTML preview"
              sandbox="allow-scripts allow-forms allow-popups allow-modals"
              srcDoc={htmlSource}
            />
          </div>
        )}

        {/* Resize handle — shared bottom-right circular handle (same as File /
            Image / Diagram). Drag to resize width + height, double-click to
            reset. Revealed on hover / focus / selection (see CSS). */}
        <ResizeHandle
          onPointerDown={onResizeStart}
          onDoubleClick={onSizeReset}
          title="拖拽调节大小，双击重置"
        />
      </div>
    </NodeViewWrapper>
  );
}
