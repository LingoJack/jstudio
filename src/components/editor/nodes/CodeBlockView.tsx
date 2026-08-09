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
 * `block-toolbar-btn` (composed with `editor-toolbar-btn`) skin so they match Image / File / Diagram blocks.
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

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type NodeViewProps,
  NodeViewWrapper,
  NodeViewContent,
  type Editor,
} from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import {
  Copy,
  Check,
  ChevronDown,
  Search,
  Eye,
  Code2,
  ExternalLink,
  ChevronRight,
  Pencil,
} from "lucide-react";
import mermaid from "mermaid";
import { ResizeHandle } from "../../ui/ResizeHandle";
import { useNodeResize } from "../hooks/useNodeResize";
import { useEditorWidth } from "../hooks/useEditorWidth";
import { useNodeSelected } from "../hooks/useNodeSelected";
import { useCodeBlockSelectionOverlay } from "../hooks/useCodeBlockSelectionOverlay";
import { openHtmlPreviewWindow } from "../../../lib/windows/previewWindow";
import { useI18n } from "../../../lib/core/i18n";
import { handleNativeSelectAll } from "../../../lib/shortcuts/nativeSelectAll";
import { useStore } from "../../../store/useStore";
import { useCursorTrailHostRef } from "../CursorTrailContext";
import { LANGUAGES, getLanguageLabel } from "./codeBlockLanguages";
import { buildMermaidConfig } from "./mermaidConfig";
import { buildMermaidPreviewWindowHtml } from "./mermaidWindowHtml";
import { useHeaderEventShield } from "../hooks/useHeaderEventShield";
import { LanguageDropdown } from "./code-block/LanguageDropdown";

export default function CodeBlockView({
  node,
  updateAttributes,
  editor,
  getPos,
}: NodeViewProps) {
  const language = (node.attrs?.language as string | undefined) || "";
  const collapsed = (node.attrs?.collapsed as boolean | undefined) === true;
  const title = (node.attrs?.title as string | undefined) ?? "";

  // ── Title input (local state, committed on blur/Enter) ──
  // Mirrors CollapsibleView's summary input.  The header does NOT use
  // contentEditable={false} (WKWebView blocks keyboard input to <input>
  // inside such "non-editable islands"), so we need native event shields
  // below to keep ProseMirror from intercepting keystrokes.
  //
  // UX: when there is no title a small pencil-icon button is shown instead
  // of an always-visible empty input (avoids a noisy placeholder). Clicking
  // the icon - or the title text itself - enters edit mode and auto-focuses
  // the input.
  const [localTitle, setLocalTitle] = useState(title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const cursorTrailTitleRef = useCursorTrailHostRef(titleInputRef);

  // Sync local state when the title changes from outside (e.g. undo/redo).
  useEffect(() => {
    setLocalTitle(title);
  }, [title]);

  // Auto-focus + select-all when entering edit mode.
  useEffect(() => {
    if (isEditingTitle) {
      const el = titleInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    }
  }, [isEditingTitle]);

  const startEditingTitle = useCallback(() => {
    setLocalTitle(title);
    setIsEditingTitle(true);
  }, [title]);

  const commitTitle = useCallback(() => {
    const trimmed = localTitle.trim();
    if (trimmed !== title) {
      updateAttributes({ title: trimmed });
    } else {
      // Re-sync in case the user typed then reverted.
      setLocalTitle(title);
    }
    setIsEditingTitle(false);
  }, [localTitle, title, updateAttributes]);
  const { t } = useI18n();
  // Subscribe to the primitive (per CODEBUDDY.md gotcha — never the object ref).
  const isDarkMode = useStore((s) => s.isDarkMode);
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
  // "Real" selection: only a genuine NodeSelection on THIS node counts as
  // selected — NOT a text selection that sweeps across the code block.
  // TipTap's NodeViewProps.selected turns true for the latter, wrongly
  // showing the is-selected ring and dropping the HTML-preview overlay while
  // the user just selects neighbouring text. Note the border highlight while
  // the caret is INSIDE the block (editing) is provided by CSS :focus-within,
  // so swapping the prop here does NOT lose the "active block" border.
  const selected = useNodeSelected((editor as Editor | null) ?? null, getPos);

  // Custom selection-highlight overlay: native ::selection under
  // white-space:pre-wrap over-extends to the full container width on
  // wrapped lines (a Chromium/WebKit quirk). This hook computes tight,
  // glyph-accurate rects via Range.getClientRects() instead. See
  // useCodeBlockSelectionOverlay.ts for the full root-cause writeup.
  //
  // A real NodeSelection (e.g. triple-click, see `handleTripleClickOn` in
  // codeBlockExtension.tsx) should show only the border-only NodeSelection
  // chrome — otherwise the native DOM Range ProseMirror syncs for a
  // NodeSelection gets painted here as a full-block highlight too. Checked
  // live against `editor.state.selection` (NOT the `selected` React state
  // above) so it's always in sync at the moment `selectionchange` fires,
  // regardless of React's render/commit timing.
  const isNodeSelected = useCallback(() => {
    const pos = typeof getPos === "function" ? getPos() : null;
    const sel = editor.state.selection;
    return pos != null && sel instanceof NodeSelection && sel.from === pos;
  }, [editor, getPos]);
  const selectionOverlayRef = useCodeBlockSelectionOverlay(
    codeRef,
    isNodeSelected,
  );

  // Whether the code block has non-empty content (controls copy-button visibility)
  const hasContent = node.textContent.trim().length > 0;

  // ---- HTML live preview ----
  // For HTML code blocks we offer a toggle that renders the source in a
  // sandboxed iframe so users can see the result without leaving the editor.
  // The choice (source vs rendered) is persisted via the `htmlPreview` attr
  // (tri-state: null = default preview, true = preview, false = source).
  const isHtml = language === "html";
  const showHtmlPreview =
    isHtml &&
    hasContent &&
    (node.attrs?.htmlPreview as boolean | null | undefined) !== false;
  // The current code text, used as the iframe `srcDoc`. Reading
  // `node.textContent` on every render keeps the preview in sync with edits.
  const htmlSource = node.textContent;

  // ---- Mermaid live preview ----
  // For Mermaid code blocks we offer a toggle that renders the diagram.
  // The choice (source vs rendered) is persisted via the `mermaidPreview` attr
  // (tri-state: null = default preview, true = preview, false = source).
  const isMermaid = language === "mermaid";
  const showMermaidPreview =
    isMermaid &&
    hasContent &&
    (node.attrs?.mermaidPreview as boolean | null | undefined) !== false;
  const mermaidSource = node.textContent;
  const [mermaidSvg, setMermaidSvg] = useState<string | null>(null);
  const [mermaidError, setMermaidError] = useState<string | null>(null);
  const mermaidPreviewRef = useRef<HTMLDivElement>(null);

  // Initialize mermaid with high-quality rendering settings. Re-runs when the
  // app toggles dark mode so the global mermaid config picks up the new
  // themeVariables before the render effect below regenerates the SVG.
  useEffect(() => {
    mermaid.initialize(buildMermaidConfig(isDarkMode));
  }, [isDarkMode]);

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
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        setMermaidError(errorMsg);
        setMermaidSvg(null);
      }
    };

    renderMermaid();
  }, [showMermaidPreview, mermaidSource, isDarkMode]);

  // Reset the persisted preview flag when the language changes away from HTML/Mermaid.
  useEffect(() => {
    if (!isHtml && node.attrs?.htmlPreview != null)
      updateAttributes({ htmlPreview: null });
    if (!isMermaid && node.attrs?.mermaidPreview != null)
      updateAttributes({ mermaidPreview: null });
  }, [
    isHtml,
    isMermaid,
    node.attrs?.htmlPreview,
    node.attrs?.mermaidPreview,
    updateAttributes,
  ]);

  // ── Native DOM iframe management (React 19 sandbox workaround) ──
  // React 19's development-mode reconciliation traverses DOM trees including
  // sandboxed iframes, triggering SecurityError: Sandbox access violation.
  // We render the iframe via native DOM so React never sees its internals.
  useEffect(() => {
    const container = previewContainerRef.current;
    // When collapsed, the preview container is unmounted - drop the iframe
    // so we don't keep a detached iframe (and its srcdoc) around.
    if (collapsed && iframeRef.current) {
      iframeRef.current.remove();
      iframeRef.current = null;
      return;
    }
    // If preview is hidden (or content emptied), remove the iframe before
    // the early return below - the container may have already unmounted,
    // leaving a dangling ref to a detached iframe.
    if (!showHtmlPreview && iframeRef.current) {
      iframeRef.current.remove();
      iframeRef.current = null;
    }
    if (!container) return;

    // If preview should be shown and iframe doesn't exist yet, create it.
    if (showHtmlPreview && !iframeRef.current) {
      const iframe = document.createElement("iframe");
      iframe.className = "code-html-preview";
      iframe.title = t("code.previewHtml");
      iframe.sandbox.add(
        "allow-scripts",
        "allow-forms",
        "allow-popups",
        "allow-modals",
        "allow-same-origin",
      );
      iframe.srcdoc = htmlSource;
      container.appendChild(iframe);
      iframeRef.current = iframe;
    }

    // Update srcdoc when htmlSource changes (only if iframe exists).
    if (
      showHtmlPreview &&
      iframeRef.current &&
      iframeRef.current.srcdoc !== htmlSource
    ) {
      iframeRef.current.srcdoc = htmlSource;
    }
  }, [showHtmlPreview, htmlSource, collapsed]);

  /* -------------------------------------------------------------- */
  /* Resize: drag the bottom-right handle (shared useNodeResize)     */
  /* identical mechanism to FileView — width + height in pixels,     */
  /* committed back as percentages of the editor content width.      */
  /* -------------------------------------------------------------- */

  const editorWidth = useEditorWidth();

  // Pixel width/height from the preferred pct attrs (fallback to legacy px).
  const widthPx =
    widthPct != null
      ? Math.round((widthPct * editorWidth) / 100)
      : (widthAttr ?? null);
  const heightPx =
    heightPct != null
      ? Math.round((heightPct * editorWidth) / 100)
      : (heightAttr ?? null);

  // Separate ref for reading the DOM inside maxWidth (before the hook call).
  const figureRefInternal = useRef<HTMLDivElement>(null);

  const {
    ref: figureRef,
    displayWidth,
    displayHeight,
    onResizeStart,
  } = useNodeResize<HTMLDivElement>({
    width: widthPx,
    height: heightPx,
    updateAttributes,
    minWidth: 240,
    minHeight: 80,
    fallbackWidth: editorWidth,
    fallbackHeight: 200,
    maxWidth: () => {
      const el = figureRefInternal.current;
      const editorSurface = el?.closest(".ProseMirror") as HTMLElement | null;
      if (editorSurface) {
        const style = getComputedStyle(editorSurface);
        const padX =
          (parseFloat(style.paddingLeft) || 0) +
          (parseFloat(style.paddingRight) || 0);
        return editorSurface.clientWidth - padX;
      }
      return window.innerWidth - 24;
    },
    onCommit: (finalWidth, finalHeight) => {
      const pct =
        editorWidth > 0
          ? Math.min(
              100,
              Math.max(1, Math.round((finalWidth / editorWidth) * 100)),
            )
          : 100;
      const attrs: Record<string, number | null> = {
        widthPct: pct,
        width: null,
      };
      if (finalHeight !== null) {
        attrs.heightPct =
          editorWidth > 0
            ? Math.min(
                200,
                Math.max(1, Math.round((finalHeight / editorWidth) * 100)),
              )
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
    updateAttributes({
      width: null,
      widthPct: null,
      height: null,
      heightPct: null,
    });
  }, [updateAttributes]);

  // Select this code block as a node (mirrors FileView): clicking the preview
  // overlay turns the block into a NodeSelection so the selection border shows
  // and the iframe becomes interactive afterwards.
  const selectNode = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const pos = typeof getPos === "function" ? getPos() : null;
      if (pos == null) return;
      editor.commands.setNodeSelection(pos);
    },
    [editor, getPos],
  );

  // ---- Language dropdown ---- (extracted to <LanguageDropdown />)

  const handleCopy = useCallback(() => {
    const codeEl = codeRef.current?.querySelector(".hljs");
    const text = codeEl?.textContent ?? "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const toggleCollapsed = useCallback(() => {
    updateAttributes({ collapsed: !collapsed });
  }, [updateAttributes, collapsed]);

  // ── Native event shields for the header ──
  // The header no longer uses contentEditable={false} (see comment above
  // the title state).  These bubble-phase listeners stop form-control
  // events from reaching ProseMirror - identical pattern to CollapsibleView.
  const headerRef = useRef<HTMLDivElement | null>(null);
  useHeaderEventShield(headerRef);

  // ---- Action buttons (HTML/Mermaid preview toggle + copy) ----
  // Both reuse the shared `editor-toolbar-btn block-toolbar-btn` skin (--sm size variant) so the
  // code block matches Image / File / Diagram toolbars. They live in the
  // right side of the header row. Copy reveals on hover
  // (`code-toolbar-reveal`); the preview toggle is always visible and
  // gets `is-active` while previewing.
  const htmlPreviewBtn =
    isHtml && hasContent ? (
      <button
        type="button"
        onClick={() => updateAttributes({ htmlPreview: !showHtmlPreview })}
        className={`editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm ${showHtmlPreview ? "is-active" : ""}`}
        title={showHtmlPreview ? t("code.showCode") : t("code.previewHtml")}
        aria-label={
          showHtmlPreview ? t("code.showCode") : t("code.previewHtml")
        }
      >
        {showHtmlPreview ? <Code2 size={14} /> : <Eye size={14} />}
      </button>
    ) : null;

  const mermaidPreviewBtn =
    isMermaid && hasContent ? (
      <button
        type="button"
        onClick={() =>
          updateAttributes({ mermaidPreview: !showMermaidPreview })
        }
        className={`editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm ${showMermaidPreview ? "is-active" : ""}`}
        title={
          showMermaidPreview ? t("code.showCode") : t("code.previewMermaid")
        }
        aria-label={
          showMermaidPreview ? t("code.showCode") : t("code.previewMermaid")
        }
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
        className="editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm code-toolbar-reveal"
        title={t("code.previewNewWindow")}
        aria-label={t("code.previewNewWindow")}
      >
        <ExternalLink size={14} />
      </button>
    ) : isMermaid && hasContent && mermaidSvg ? (
      <button
        type="button"
        onClick={() => {
          openHtmlPreviewWindow(buildMermaidPreviewWindowHtml(mermaidSvg, isDarkMode), "Mermaid");
        }}
        className="editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm code-toolbar-reveal"
        title={t("code.previewNewWindow")}
        aria-label={t("code.previewNewWindow")}
      >
        <ExternalLink size={14} />
      </button>
    ) : null;

  const copyBtn = hasContent ? (
    <button
      type="button"
      onClick={handleCopy}
      className="editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm code-toolbar-reveal"
      title={t("code.copy")}
      aria-label={t("code.copy")}
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
    width: displayWidth ? `${displayWidth}px` : "100%",
  };
  const bodyStyle: React.CSSProperties = {
    overflow: "visible",
    ...(showAnyPreview || collapsed ? { display: "none" } : null),
  };
  const previewStyle: React.CSSProperties = {
    height: displayHeight != null ? `${displayHeight}px` : "320px",
  };

  return (
    <NodeViewWrapper as="div" className="code-block-wrapper">
      <div
        ref={setFigureRef}
        className={`code-block-figure ${selected ? "is-selected" : ""} ${
          showAnyPreview ? "is-preview" : ""
        } ${collapsed ? "is-collapsed" : ""}`}
        style={figureStyle}
      >
        {/* Header row — a dedicated strip above the code, separated from the
          source by a border-bottom divider. The collapse toggle is pinned to
          the far left, action buttons next to it, and the language badge to
          the top-right. */}
        <div ref={headerRef} className="code-block-header">
          <div className="code-header-actions">
            <button
              type="button"
              onClick={toggleCollapsed}
              className="editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm code-toolbar-reveal code-collapse-toggle"
              title={collapsed ? t("code.expand") : t("code.collapse")}
              aria-label={collapsed ? t("code.expand") : t("code.collapse")}
              aria-expanded={!collapsed}
            >
              <ChevronRight
                size={14}
                className={`code-collapse-chevron ${collapsed ? "" : "is-open"}`}
              />
            </button>
            {htmlPreviewBtn}
            {mermaidPreviewBtn}
            {openWindowBtn}
            {copyBtn}
            <button
              type="button"
              onClick={startEditingTitle}
              className="editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm code-toolbar-reveal code-title-trigger"
              style={isEditingTitle ? { pointerEvents: "none" } : undefined}
              title={title ? t("code.editTitle") : t("code.addTitle")}
              aria-label={title ? t("code.editTitle") : t("code.addTitle")}
              tabIndex={isEditingTitle ? -1 : 0}
            >
              <Pencil size={14} />
            </button>
          </div>
          {isEditingTitle ? (
            <input
              ref={cursorTrailTitleRef}
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (handleNativeSelectAll(e)) return;
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTitle();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setLocalTitle(title);
                  setIsEditingTitle(false);
                }
                e.stopPropagation();
              }}
              onCompositionStart={(e) => e.stopPropagation()}
              onCompositionUpdate={(e) => e.stopPropagation()}
              onCompositionEnd={(e) => e.stopPropagation()}
              className="code-block-title-input"
              spellCheck={false}
            />
          ) : title ? (
            <button
              type="button"
              onClick={startEditingTitle}
              className="code-block-title-display"
              title={t("code.editTitle")}
            >
              <span className="code-block-title-text">{title}</span>
            </button>
          ) : null}
          <LanguageDropdown
            language={language}
            onSelect={(value) => updateAttributes({ language: value })}
            editor={editor}
            getPos={getPos}
            node={node}
            t={t}
          />
        </div>

        {/* Code content — highlighted by lowlight.
            Height is driven by the resize handle (displayHeight); when unset the
            body is content-driven and scrolls past 60vh.
            NodeViewContent must stay mounted for ProseMirror, so in preview
            mode we hide the <pre> instead of unmounting it. */}
        {/* Keep NodeViewContent in the root ProseMirror editing host. A nested
            contenteditable=false → true island makes WKWebView focus the inner
            host, which breaks ProseMirror's DOM selection synchronization. */}
        <pre ref={codeRef} className="code-block-body" style={bodyStyle}>
          <div
            ref={selectionOverlayRef}
            className="code-block-selection-overlay"
            aria-hidden="true"
          />
          <NodeViewContent
            as="div"
            className={`hljs language-${language || "plaintext"}`}
            // `overflow-wrap: anywhere` alone lets WebKit pick either visual
            // line's rect for the caret at a forced (space-less) wrap point,
            // which is what causes the "needs an extra arrow-key press, then
            // lands too far right" symptom on long unbroken runs (tokens,
            // base64, hashes). `word-break: break-all` reclassifies every
            // character boundary as a real line-break opportunity instead of
            // an ambiguous last-resort one, which WebKit's caret/rect hit
            // -testing handles deterministically. Keep `overflowWrap` as a
            // fallback for engines where `word-break` isn't applied.
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              overflowWrap: "anywhere",
            }}
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
        {isHtml && showHtmlPreview && !collapsed && (
          <div
            ref={previewContainerRef}
            className="code-block-preview"
            contentEditable={false}
            style={previewStyle}
          >
            {!selected && (
              <div
                className="code-block-preview-overlay"
                onMouseDown={selectNode}
              />
            )}
            {/* iframe inserted by useEffect below, not JSX */}
          </div>
        )}

        {/* Mermaid live preview — rendered SVG diagram.
            When NOT selected a transparent overlay sits above the diagram so a
            click selects the node; once selected the overlay disappears. */}
        {isMermaid && showMermaidPreview && !collapsed && (
          <div
            ref={mermaidPreviewRef}
            className="code-block-preview code-block-mermaid-preview"
            contentEditable={false}
            style={previewStyle}
          >
            {!selected && (
              <div
                className="code-block-preview-overlay"
                onMouseDown={selectNode}
              />
            )}
            {mermaidError && (
              <div className="code-block-mermaid-error">
                <p>{t("mermaid.renderError")}</p>
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
            reset. Revealed on hover / focus / selection (see CSS). Hidden
            when the block is collapsed. */}
        {!collapsed && (
          <ResizeHandle
            onPointerDown={onResizeStart}
            onDoubleClick={onSizeReset}
            title={t("code.dragResize")}
          />
        )}
      </div>
    </NodeViewWrapper>
  );
}
