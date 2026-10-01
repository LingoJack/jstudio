/**
 * CodeBlockView — React NodeView for the code block node.
 *
 * Layout — all chrome (action toolbar, title slot, language badge) lives in
 * a floating pill (`.block-float-pill`, same pattern as TableControls) that
 * hovers ABOVE the block's top-right corner and never covers the code:
 *
 *   ┌ (pill: 标题 · ▾ ↗ ⧉ │ MERMAID ∨) ┐  ← hover / focus / selected
 *   │ const x = 1;                     │
 *   │ console.log(x);               ◯  │  ← corner resize handle
 *   └──────────────────────────────────┘
 *
 * Reveal is pure CSS on the figure: :hover / :focus-within / .is-selected /
 * .is-lang-open (the dropdown menu is portaled under document.body, where
 * the figure has no focus). The pill is a DOM child of the figure even
 * though it is rendered above it, so CSS :hover — which propagates up the
 * DOM tree — keeps it open while the cursor is on the pill. Collapsed
 * blocks show a thin title strip only (passive identity); the pill — with
 * the re-expand chevron — still floats above on hover.
 * The pill buttons reuse the shared `block-toolbar-btn` skin so they match
 * Image / File / Diagram blocks.
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
import {
  ChevronDown,
  ChevronRight,
  Search,
  Pencil,
} from "lucide-react";
import { ResizeHandle } from "../../ui/ResizeHandle";
import { useNodeResize } from "../hooks/useNodeResize";
import { useEditorWidth } from "../hooks/useEditorWidth";
import { useNodeSelected } from "../hooks/useNodeSelected";
import { openHtmlPreviewWindow, openMermaidPreviewWindow } from "../../../lib/windows/previewWindow";
import { useI18n } from "../../../lib/core/i18n";
import { handleNativeSelectAll } from "../../../lib/shortcuts/nativeSelectAll";
import { useStore } from "../../../store/useStore";
import { LANGUAGES, getLanguageLabel } from "./code-block/codeBlockLanguages";
import { useMermaidPreview } from "./code-block/useMermaidPreview";
import { useHtmlPreview } from "./code-block/useHtmlPreview";
import { CodeBlockActions } from "./code-block/CodeBlockActions";
import { useCodeBlockTitle } from "./code-block/useCodeBlockTitle";
import { useHeaderEventShield } from "../hooks/useHeaderEventShield";
import { LanguageDropdown } from "./code-block/LanguageDropdown";
import MermaidViewer from "./code-block/MermaidViewer";

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
  const {
    localTitle,
    setLocalTitle,
    isEditingTitle,
    titleInputRef,
    cursorTrailTitleRef,
    startEditingTitle,
    commitTitle,
    cancelEditingTitle,
  } = useCodeBlockTitle({ title, updateAttributes });
  const { t } = useI18n();
  // Subscribe to the primitive (per CODEBUDDY.md gotcha — never the object ref).
  const isDarkMode = useStore((s) => s.isDarkMode);
  // Resize attributes (unified with FileView): width/height stored as a
  // percentage of the editor content width, with legacy px fallbacks.
  const widthPct = node.attrs?.widthPct as number | null | undefined;
  const heightPct = node.attrs?.heightPct as number | null | undefined;
  const widthAttr = node.attrs?.width as number | null | undefined;
  const heightAttr = node.attrs?.height as number | null | undefined;
  const codeRef = useRef<HTMLPreElement>(null);
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
  const { previewContainerRef } = useHtmlPreview({
    showHtmlPreview,
    htmlSource,
    collapsed,
  });

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
  const { mermaidSvg, mermaidError, mermaidPreviewRef } = useMermaidPreview({
    isDarkMode,
    showMermaidPreview,
    mermaidSource,
  });

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

  // ── Native DOM iframe management moved to useHtmlPreview hook ──

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
  // While the dropdown's portal menu is open the figure has no :focus-within
  // (the menu lives under document.body), so the floating pill needs an
  // explicit pin via the `is-lang-open` class.
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  const toggleCollapsed = useCallback(() => {
    updateAttributes({ collapsed: !collapsed });
  }, [updateAttributes, collapsed]);

  // ── Native event shields for the pill / collapsed bar ──
  // Neither uses contentEditable={false} (WKWebView blocks keyboard input
  // inside such "non-editable islands", see the useCodeBlockTitle comment).
  // These bubble-phase listeners stop form-control events from reaching
  // ProseMirror - identical pattern to CollapsibleView.
  const headerRef = useRef<HTMLDivElement | null>(null);
  useHeaderEventShield(headerRef);
  const collapsedBarRef = useRef<HTMLDivElement | null>(null);
  useHeaderEventShield(collapsedBarRef);
  // Title edit popover hosts a real <input> — same shield requirement.
  const titlePopoverRef = useRef<HTMLDivElement | null>(null);
  useHeaderEventShield(titlePopoverRef);

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

  // Pencil affordance — always visible in the pill (both states), so a
  // collapsed block keeps its entry point for adding/editing a title.
  const pencilButton = (
    <button
      type="button"
      onClick={startEditingTitle}
      className="editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm code-title-trigger"
      title={t("code.addTitle")}
      aria-label={t("code.addTitle")}
    >
      <Pencil size={14} />
    </button>
  );

  // Title slot — display-only (title text button / pencil). Clicking either
  // spawns the floating title input popover below (single edit UX for both
  // states — no inline input stretching the collapsed bar or the pill).
  const titleSlot = title ? (
    <button
      type="button"
      onClick={startEditingTitle}
      className="code-block-title-display"
      title={t("code.editTitle")}
    >
      <span className="code-block-title-text">{title}</span>
    </button>
  ) : (
    pencilButton
  );

  return (
    <NodeViewWrapper as="div" className="code-block-wrapper">
      <div
        ref={setFigureRef}
        className={`code-block-figure ${selected ? "is-selected" : ""} ${
          showAnyPreview ? "is-preview" : ""
        } ${collapsed ? "is-collapsed" : ""} ${
          langDropdownOpen ? "is-lang-open" : ""
        }`}
        style={figureStyle}
      >
        {/* Floating action pill — hovers ABOVE the block's top-right corner
          (same pattern as TableControls) so it never covers the code.
          Groups, left to right: content actions (preview / open / copy) │
          block management (collapse toggle, title slot) │ language badge —
          the low-frequency management icons sit on the right, next to the
          language badge. Revealed on hover / focus / selection via the
          shared .block-float-pill CSS. Still shielded by
          useHeaderEventShield below — the pill must NOT use
          contentEditable={false} (WKWebView blocks keyboard input inside
          such islands, see the useCodeBlockTitle comment). Collapsed blocks
          keep the pill in flow (see CSS). */}
        <div ref={headerRef} className="editor-toolbar block-float-pill">
          {/* Collapse toggle */}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm code-collapse-toggle"
            title={collapsed ? t("code.expand") : t("code.collapse")}
            aria-label={collapsed ? t("code.expand") : t("code.collapse")}
            aria-expanded={!collapsed}
          >
            <ChevronRight
              size={14}
              className={`code-collapse-chevron ${collapsed ? "" : "is-open"}`}
            />
          </button>
          <CodeBlockActions
            isHtml={isHtml}
            isMermaid={isMermaid}
            hasContent={hasContent}
            showHtmlPreview={showHtmlPreview}
            showMermaidPreview={showMermaidPreview}
            mermaidSvg={mermaidSvg}
            onToggleHtmlPreview={() => updateAttributes({ htmlPreview: !showHtmlPreview })}
            onToggleMermaidPreview={() => updateAttributes({ mermaidPreview: !showMermaidPreview })}
            onOpenHtmlWindow={() => openHtmlPreviewWindow(htmlSource)}
            onOpenMermaidWindow={() => { if (mermaidSvg) openMermaidPreviewWindow(mermaidSvg); }}
            getCodeText={() => codeRef.current?.querySelector(".hljs")?.textContent ?? ""}
            t={t}
          />
          {/* Collapsed blocks keep the pencil in the pill (see pencilButton);
              expanded blocks swap it for the title slot itself. */}
          {collapsed ? pencilButton : titleSlot}
          <LanguageDropdown
            language={language}
            onSelect={(value) => updateAttributes({ language: value })}
            onOpenChange={setLangDropdownOpen}
            editor={editor}
            getPos={getPos}
            node={node}
            t={t}
          />
        </div>

        {/* Collapsed strip — passive identity only: the title text while
            present (click re-opens the edit popover), empty otherwise. */}
        {collapsed && (
          <div ref={collapsedBarRef} className="code-block-collapsed-bar">
            {title && titleSlot}
          </div>
        )}

        {/* Title edit popover — spawned in place by the pencil / title click,
            anchored at the block's top-right inner edge. One floating input
            for both states instead of stretching the collapsed bar or the
            pill; Enter/blur commits, Escape cancels. Shielded like the pill
            (no contentEditable={false} — WKWebView island problem). */}
        {isEditingTitle && (
          <div ref={titlePopoverRef} className="editor-toolbar-menu code-title-popover">
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
                  cancelEditingTitle();
                }
                e.stopPropagation();
              }}
              onCompositionStart={(e) => e.stopPropagation()}
              onCompositionUpdate={(e) => e.stopPropagation()}
              onCompositionEnd={(e) => e.stopPropagation()}
              className="code-block-title-input"
              placeholder={t("code.addTitle")}
              spellCheck={false}
            />
          </div>
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

        {/* Mermaid live preview — pan/zoom stage (MermaidViewer, built on
            react-zoom-pan-pinch). Cmd/Ctrl+wheel zooms anchored at the
            cursor, drag pans, double-click resets. When NOT selected a
            transparent overlay sits above the diagram so a click selects the
            node; once selected the overlay disappears. */}
        {isMermaid && showMermaidPreview && !collapsed && (
          <MermaidViewer
            className="code-block-preview code-block-mermaid-preview"
            style={previewStyle}
            contentEditable={false}
            containerRef={mermaidPreviewRef}
            svg={mermaidSvg}
            error={mermaidError}
            overlay={
              !selected ? (
                <div
                  className="code-block-preview-overlay"
                  onMouseDown={selectNode}
                />
              ) : null
            }
          />
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
