/**
 * CodeBlockView — React NodeView for the code block node.
 *
 * Layout — a dedicated header row sits above the code with the action
 * toolbar pinned to the top-left and the language badge pinned to the
 * top-right, so they never overlap the code:
 *   ┌────────────────────────────────────────┐
 *   │ [preview] [copy]               [lang ▾] │  ← header row
 *   │  const x = 1;                             │
 *   │  console.log(x);                       ◯  │  ← corner resize handle
 *   └────────────────────────────────────────┘
 *
 * The header is a separate strip (not absolutely positioned over the code),
 * eliminating the previous overlap between the top-right icons and the
 * first line of source. The action buttons reuse the shared
 * `block-toolbar-btn` skin so they match Image / File / Diagram blocks.
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
import { createPortal } from 'react-dom';
import { type NodeViewProps, NodeViewWrapper, NodeViewContent, type Editor } from '@tiptap/react';
import { Copy, Check, ChevronDown, Search, Eye, Code2, ExternalLink } from 'lucide-react';
import mermaid from 'mermaid';
import { ResizeHandle } from '../../ui/ResizeHandle';
import { useNodeResize } from '../hooks/useNodeResize';
import { useEditorWidth } from '../hooks/useEditorWidth';
import { useNodeSelected } from '../hooks/useNodeSelected';
import { useCodeBlockSelectionOverlay } from '../hooks/useCodeBlockSelectionOverlay';
import { openHtmlPreviewWindow } from '../../../lib/windows/previewWindow';
import { useI18n } from '../../../lib/core/i18n';

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
  { value: 'mermaid', label: 'Mermaid' },
];

/** Display label for a language value (e.g. "typescript" → "TypeScript"). */
function getLanguageLabel(value: string): string {
  const found = LANGUAGES.find((l) => l.value === value);
  return found ? found.label : value || 'Plain Text';
}

export default function CodeBlockView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const language = (node.attrs?.language as string | undefined) || '';
  const { t } = useI18n();
  // Resize attributes (unified with FileView): width/height stored as a
  // percentage of the editor content width, with legacy px fallbacks.
  const widthPct = node.attrs?.widthPct as number | null | undefined;
  const heightPct = node.attrs?.heightPct as number | null | undefined;
  const widthAttr = node.attrs?.width as number | null | undefined;
  const heightAttr = node.attrs?.height as number | null | undefined;
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLPreElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // Custom selection-highlight overlay: native ::selection under
  // white-space:pre-wrap over-extends to the full container width on
  // wrapped lines (a Chromium/WebKit quirk). This hook computes tight,
  // glyph-accurate rects via Range.getClientRects() instead. See
  // useCodeBlockSelectionOverlay.ts for the full root-cause writeup.
  const selectionOverlayRef = useCodeBlockSelectionOverlay(codeRef);

  // "Real" selection: only a genuine NodeSelection on THIS node counts as
  // selected — NOT a text selection that sweeps across the code block.
  // TipTap's NodeViewProps.selected turns true for the latter, wrongly
  // showing the is-selected ring and dropping the HTML-preview overlay while
  // the user just selects neighbouring text. Note the border highlight while
  // the caret is INSIDE the block (editing) is provided by CSS :focus-within,
  // so swapping the prop here does NOT lose the "active block" border.
  const selected = useNodeSelected((editor as Editor | null) ?? null, getPos);

  // Whether the code block has non-empty content (controls copy-button visibility)
  const hasContent = node.textContent.trim().length > 0;

  // ---- HTML live preview ----
  // For HTML code blocks we offer a toggle that renders the source in a
  // sandboxed iframe so users can see the result without leaving the editor.
  // The choice (source vs rendered) is persisted via the `htmlPreview` attr.
  const isHtml = language === 'html';
  const showHtmlPreview = isHtml && (node.attrs?.htmlPreview as boolean | undefined) === true;
  // The current code text, used as the iframe `srcDoc`. Reading
  // `node.textContent` on every render keeps the preview in sync with edits.
  const htmlSource = node.textContent;

  // ---- Mermaid live preview ----
  // For Mermaid code blocks we offer a toggle that renders the diagram.
  // The choice (source vs rendered) is persisted via the `mermaidPreview` attr.
  const isMermaid = language === 'mermaid';
  const showMermaidPreview = isMermaid && (node.attrs?.mermaidPreview as boolean | undefined) === true;
  const mermaidSource = node.textContent;
  const [mermaidSvg, setMermaidSvg] = useState<string | null>(null);
  const [mermaidError, setMermaidError] = useState<string | null>(null);
  const mermaidPreviewRef = useRef<HTMLDivElement>(null);

  // Initialize mermaid with high-quality rendering settings
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose', // Allow click events in diagrams
      theme: 'base', // Use base theme for customization
      themeVariables: {
        primaryColor: '#4A90D9',
        primaryTextColor: '#333',
        primaryBorderColor: '#2B5F8E',
        lineColor: '#5A5A5A',
        secondaryColor: '#E8F4FD',
        tertiaryColor: '#F5F5F5',
        background: '#FFFFFF',
        mainBkg: '#FFFFFF',
        nodeBorder: '#4A90D9',
        clusterBkg: '#F0F4F8',
        clusterBorder: '#4A90D9',
        titleColor: '#333',
        edgeLabelBackground: '#FFFFFF',
        actorBkg: '#E8F4FD',
        actorBorder: '#4A90D9',
        actorTextColor: '#333',
        actorLineColor: '#5A5A5A',
        signalColor: '#4A90D9',
        signalTextColor: '#333',
        labelBoxBkg: '#E8F4FD',
        labelBoxBorderColor: '#4A90D9',
        labelTextColor: '#333',
        loopTextColor: '#333',
        noteBorderColor: '#4A90D9',
        noteBkgColor: '#FFF9E6',
        noteTextColor: '#333',
        activationBorderColor: '#4A90D9',
        activationBkgColor: '#E8F4FD',
        sequenceNumberColor: '#FFFFFF',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
      flowchart: {
        useMaxWidth: false, // Generate fixed-size SVG for proper scaling
        htmlLabels: true,
        curve: 'basis', // Smooth curved lines
        padding: 15,
        nodeSpacing: 50,
        rankSpacing: 50,
        diagramPadding: 8,
      },
      sequence: {
        useMaxWidth: false, // Generate fixed-size SVG for proper scaling
        diagramMarginX: 8,
        diagramMarginY: 8,
        actorMargin: 50,
        width: 150,
        height: 65,
        boxMargin: 10,
        boxTextMargin: 5,
        noteMargin: 10,
        messageMargin: 35,
        mirrorActors: false,
        bottomMarginAdj: 1,
      },
      gantt: {
        useMaxWidth: false,
        leftPadding: 75,
        gridLineStartPadding: 35,
        barHeight: 20,
        barGap: 4,
        topPadding: 50,
        titleTopMargin: 25,
      },
      class: {
        useMaxWidth: false,
      },
      state: {
        useMaxWidth: false,
      },
      pie: {
        useMaxWidth: false,
      },
    });
  }, []);

  // Render mermaid diagram when preview is shown
  useEffect(() => {
    if (!showMermaidPreview || !mermaidSource.trim()) {
      setMermaidSvg(null);
      setMermaidError(null);
      return;
    }

    const renderMermaid = async () => {
      try {
        // Generate unique id for this diagram
        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, mermaidSource);
        setMermaidSvg(svg);
        setMermaidError(null);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setMermaidError(errorMsg);
        setMermaidSvg(null);
      }
    };

    renderMermaid();
  }, [showMermaidPreview, mermaidSource]);

  // Clear the persisted preview flag when the language changes away from HTML/Mermaid.
  useEffect(() => {
    if (!isHtml && node.attrs?.htmlPreview) updateAttributes({ htmlPreview: false });
    if (!isMermaid && node.attrs?.mermaidPreview) updateAttributes({ mermaidPreview: false });
  }, [isHtml, isMermaid, node.attrs?.htmlPreview, node.attrs?.mermaidPreview, updateAttributes]);

  // ── Native DOM iframe management (React 19 sandbox workaround) ──
  // React 19's development-mode reconciliation traverses DOM trees including
  // sandboxed iframes, triggering SecurityError: Sandbox access violation.
  // We render the iframe via native DOM so React never sees its internals.
  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    // If preview should be shown and iframe doesn't exist yet, create it.
    if (showHtmlPreview && !iframeRef.current) {
      const iframe = document.createElement('iframe');
      iframe.className = 'code-html-preview';
      iframe.title = t('code.previewHtml');
      iframe.sandbox.add(
        'allow-scripts',
        'allow-forms',
        'allow-popups',
        'allow-modals',
        'allow-same-origin',
      );
      iframe.srcdoc = htmlSource;
      container.appendChild(iframe);
      iframeRef.current = iframe;
    }

    // If preview is hidden, remove the iframe.
    if (!showHtmlPreview && iframeRef.current) {
      iframeRef.current.remove();
      iframeRef.current = null;
    }

    // Update srcdoc when htmlSource changes (only if iframe exists).
    if (showHtmlPreview && iframeRef.current && iframeRef.current.srcdoc !== htmlSource) {
      iframeRef.current.srcdoc = htmlSource;
    }
  }, [showHtmlPreview, htmlSource]);

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
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
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
        // Calculate position for portal rendering
        if (badgeRef.current) {
          const badgeRect = badgeRef.current.getBoundingClientRect();
          setDropdownPosition({
            top: badgeRect.bottom + 8,
            right: window.innerWidth - badgeRect.right,
          });
        }
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

  // ---- Action buttons (HTML/Mermaid preview toggle + copy) ----
  // Both reuse the shared `block-toolbar-btn` skin (--sm size variant) so the
  // code block matches Image / File / Diagram toolbars. They live in the
  // right side of the header row. Copy reveals on hover
  // (`code-toolbar-reveal`); the preview toggle is always visible and
  // gets `is-active` while previewing.
  const htmlPreviewBtn =
    isHtml && hasContent ? (
      <button
        type="button"
        onClick={() => updateAttributes({ htmlPreview: !showHtmlPreview })}
        className={`block-toolbar-btn block-toolbar-btn--sm ${showHtmlPreview ? 'is-active' : ''}`}
        title={showHtmlPreview ? t('code.showCode') : t('code.previewHtml')}
        aria-label={showHtmlPreview ? t('code.showCode') : t('code.previewHtml')}
      >
        {showHtmlPreview ? <Code2 size={14} /> : <Eye size={14} />}
      </button>
    ) : null;

  const mermaidPreviewBtn =
    isMermaid && hasContent ? (
      <button
        type="button"
        onClick={() => updateAttributes({ mermaidPreview: !showMermaidPreview })}
        className={`block-toolbar-btn block-toolbar-btn--sm ${showMermaidPreview ? 'is-active' : ''}`}
        title={showMermaidPreview ? t('code.showCode') : t('code.previewMermaid')}
        aria-label={showMermaidPreview ? t('code.showCode') : t('code.previewMermaid')}
      >
        {showMermaidPreview ? <Code2 size={14} /> : <Eye size={14} />}
      </button>
    ) : null;

  // Open the HTML/Mermaid source in a separate OS window for an enlarged preview.
  // Reuses the same Rust-memory transport as file preview (see previewWindow.ts).
  const openWindowBtn =
    isHtml && hasContent ? (
      <button
        type="button"
        onClick={() => openHtmlPreviewWindow(htmlSource)}
        className="block-toolbar-btn block-toolbar-btn--sm code-toolbar-reveal"
        title={t('code.previewNewWindow')}
        aria-label={t('code.previewNewWindow')}
      >
        <ExternalLink size={14} />
      </button>
    ) : isMermaid && hasContent && mermaidSvg ? (
      <button
        type="button"
        onClick={() => {
          const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html,body{margin:0;padding:0;height:100%;overflow:hidden}
    body{background:#fff;cursor:grab;user-select:none}
    body.dragging{cursor:grabbing}
    .w{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}
    svg{display:block}
    .c{position:fixed;top:8px;right:8px;display:flex;gap:2px;opacity:0.5;transition:opacity 0.2s}
    body:hover .c{opacity:1}
    .b{width:28px;height:28px;border:none;border-radius:4px;background:rgba(0,0,0,0.06);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center}
    .b:hover{background:rgba(0,0,0,0.12)}
  </style>
</head>
<body>
  <div class="w" id="w">${mermaidSvg}</div>
  <div class="c">
    <button class="b" onclick="z(0.8)">−</button>
    <button class="b" onclick="z(1.25)">+</button>
    <button class="b" onclick="fit()">⊗</button>
  </div>
  <script>
    const w=document.getElementById('w'),s=document.querySelector('svg');
    let scale=1,px=0,py=0;
    const upd=()=>w.style.transform='translate(-50%,-50%)translate('+px+'px,'+py+'px)scale('+scale+')';
    const z=d=>{scale=Math.max(0.1,Math.min(scale*d,5));upd()};
    const fit=()=>{const v=s.getAttribute('viewBox')?.split(' ').map(Number)||[0,0,s.getBBox().width,s.getBBox().height];const b=document.body.getBoundingClientRect();scale=Math.min((b.width*0.9)/v[2],(b.height*0.9)/v[3],3);px=0;py=0;upd()};
    setTimeout(fit,50);
    addEventListener('wheel',e=>{e.preventDefault();z(e.deltaY>0?0.9:1.1)},{passive:false});
    let drag=0,sx,sy,sp,st;
    onmousedown=e=>{drag=1;sx=e.clientX;sy=e.clientY;sp=px;st=py;document.body.classList.add('dragging')};
    onmousemove=e=>{if(!drag)return;px=sp+e.clientX-sx;py=st+e.clientY-sy;upd()};
    onmouseup=()=>{drag=0;document.body.classList.remove('dragging')};
  </script>
</body>
</html>`;
          openHtmlPreviewWindow(htmlContent, 'Mermaid');
        }}
        className="block-toolbar-btn block-toolbar-btn--sm code-toolbar-reveal"
        title={t('code.previewNewWindow')}
        aria-label={t('code.previewNewWindow')}
      >
        <ExternalLink size={14} />
      </button>
    ) : null;

  const copyBtn = hasContent ? (
    <button
      type="button"
      onClick={handleCopy}
      className="block-toolbar-btn block-toolbar-btn--sm code-toolbar-reveal"
      title={t('code.copy')}
      aria-label={t('code.copy')}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  ) : null;

  // ---- Inline styles driven by displayWidth / displayHeight ----
  // Source mode always grows to the exact wrapped-code height — no internal
  // horizontal or vertical scrolling. A persisted height still applies to
  // HTML/Mermaid preview mode, where the preview itself needs a viewport.
  const showAnyPreview = showHtmlPreview || showMermaidPreview;
  const figureStyle: React.CSSProperties = {
    width: displayWidth ? `${displayWidth}px` : '100%',
  };
  const bodyStyle: React.CSSProperties = {
    overflow: 'visible',
    ...(showAnyPreview ? { display: 'none' } : null),
  };
  const previewStyle: React.CSSProperties = {
    height: displayHeight != null ? `${displayHeight}px` : '320px',
  };

  return (
    <NodeViewWrapper as="div" className="code-block-wrapper">
      <div
        ref={setFigureRef}
        className={`code-block-figure ${selected ? 'is-selected' : ''} ${
          showAnyPreview ? 'is-preview' : ''
        }`}
        style={figureStyle}
      >
        {/* Header row — a dedicated strip above the code, separated from the
          source by a border-bottom divider. Action buttons are pinned to the
          top-left, the language badge to the top-right. Keeping these in
          their own row avoids overlapping the first line of code, which the
          old absolutely-positioned toolbar suffered from. */}
        <div className="code-block-header" contentEditable={false}>
          <div className="code-header-actions">
            {htmlPreviewBtn}
            {mermaidPreviewBtn}
            {openWindowBtn}
            {copyBtn}
          </div>
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

        {/* Custom dropdown panel - rendered via Portal to escape ProseMirror's event handling */}
        {dropdownOpen &&
          createPortal(
            <div
              ref={dropdownRef}
              className="code-lang-dropdown code-lang-dropdown-portal"
              style={{
                position: 'fixed',
                top: dropdownPosition.top,
                right: dropdownPosition.right,
              }}
            >
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
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setDropdownOpen(false);
                      setSearchQuery('');
                      setHighlightedIndex(0);
                    }
                  }}
                  placeholder={t('code.searchLang')}
                  className="code-lang-search-input"
                />
              </div>
              <div ref={listRef} className="code-lang-list">
                {filteredLanguages.length === 0 ? (
                  <div className="code-lang-empty">{t('code.noLangMatch')}</div>
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
            </div>,
            document.body,
          )}

        {/* Code content — highlighted by lowlight.
            Height is driven by the resize handle (displayHeight); when unset the
            body is content-driven and scrolls past 60vh.
            NodeViewContent must stay mounted for ProseMirror, so in preview
            mode we hide the <pre> instead of unmounting it. */}
        {/* Keep NodeViewContent in the root ProseMirror editing host. A nested
            contenteditable=false → true island makes WKWebView focus the inner
            host, which breaks ProseMirror's DOM selection synchronization. */}
        <pre ref={codeRef} className="code-block-body" style={bodyStyle}>
          <div ref={selectionOverlayRef} className="code-block-selection-overlay" aria-hidden="true" />
          <NodeViewContent
            as="div"
            className={`hljs language-${language || 'plaintext'}`}
            style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
          />
        </pre>

        {/* HTML live preview — sandboxed iframe rendering the source.
            Wrapped in a relative container that mirrors FileView's preview box:
            when NOT selected a transparent overlay sits above the iframe so a
            click selects the node; once selected the overlay disappears and the
            iframe becomes interactive.
            `sandbox` without `allow-same-origin` isolates it from the app.
            
            IMPORTANT: The iframe is rendered via native DOM (useEffect below),
            NOT via React JSX. React 19's development-mode reconciliation traverses
            the DOM tree including sandboxed iframes, triggering:
              SecurityError: Sandbox access violation
            This crashes the entire reconciliation loop and blocks ALL user
            interactions. By using native DOM, React never sees the iframe's
            internal structure. */}
        {isHtml && showHtmlPreview && (
          <div
            ref={previewContainerRef}
            className="code-block-preview"
            contentEditable={false}
            style={previewStyle}
          >
            {!selected && (
              <div className="code-block-preview-overlay" onMouseDown={selectNode} />
            )}
            {/* iframe inserted by useEffect below, not JSX */}
          </div>
        )}

        {/* Mermaid live preview — rendered SVG diagram.
            When NOT selected a transparent overlay sits above the diagram so a
            click selects the node; once selected the overlay disappears. */}
        {isMermaid && showMermaidPreview && (
          <div
            ref={mermaidPreviewRef}
            className="code-block-preview code-block-mermaid-preview"
            contentEditable={false}
            style={previewStyle}
          >
            {!selected && (
              <div className="code-block-preview-overlay" onMouseDown={selectNode} />
            )}
            {mermaidError && (
              <div className="code-block-mermaid-error">
                <p>{t('mermaid.renderError')}</p>
                <pre>{mermaidError}</pre>
              </div>
            )}
            {mermaidSvg && (
              <div
                className="code-block-mermaid-content"
                dangerouslySetInnerHTML={{ __html: mermaidSvg }}
              />
            )}
          </div>
        )}

        {/* Resize handle — shared bottom-right circular handle (same as File /
            Image / Diagram). Drag to resize width + height, double-click to
            reset. Revealed on hover / focus / selection (see CSS). */}
        <ResizeHandle
          onPointerDown={onResizeStart}
          onDoubleClick={onSizeReset}
          title={t('code.dragResize')}
        />
      </div>
    </NodeViewWrapper>
  );
}
