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
import { useCollapseDuration } from "../hooks/useCollapseDuration";
import { LanguageDropdown } from "./code-block/LanguageDropdown";
import MermaidViewer from "./code-block/MermaidViewer";

/** Wrap raw SVG markup in a minimal HTML document for the sandboxed preview
    iframe — centers it on white and scales to fit, mirroring the HTML
    preview's presentation. */
function wrapSvgForPreview(svg: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;display:grid;place-items:center;background:#fff}svg{max-width:100%;max-height:100vh}</style></head><body>${svg}</body></html>`;
}

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
  // ---- SVG live preview ----
  // Same mechanism as the HTML preview: the SVG source is rendered in the
  // sandboxed iframe (wrapped in a minimal HTML document so it centers on
  // white and scales to fit). Tri-state persisted via `svgPreview`.
  const isSvg = language === "svg";
  const showSvgPreview =
    isSvg &&
    hasContent &&
    (node.attrs?.svgPreview as boolean | null | undefined) !== false;
  const svgSource = node.textContent;

  // The current code text, used as the iframe `srcDoc`. Reading
  // `node.textContent` on every render keeps the preview in sync with edits.
  const htmlSource = node.textContent;
  // Active preview document: HTML source as-is; SVG source wrapped in a
  // minimal HTML document (centered on white, scaled to fit) — the sandboxed
  // iframe treats both identically.
  const previewDoc = isHtml
    ? htmlSource
    : isSvg
      ? wrapSvgForPreview(svgSource)
      : "";
  const { previewContainerRef } = useHtmlPreview({
    showHtmlPreview: showHtmlPreview || showSvgPreview,
    htmlSource: previewDoc,
    collapsed,
  });

  // ---- Mermaid live preview ----

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

  // Reset the persisted preview flag when the language changes away from HTML/Mermaid/SVG.
  useEffect(() => {
    if (!isHtml && node.attrs?.htmlPreview != null)
      updateAttributes({ htmlPreview: null });
    if (!isMermaid && node.attrs?.mermaidPreview != null)
      updateAttributes({ mermaidPreview: null });
    if (!isSvg && node.attrs?.svgPreview != null)
      updateAttributes({ svgPreview: null });
  }, [
    isHtml,
    isMermaid,
    isSvg,
    node.attrs?.htmlPreview,
    node.attrs?.mermaidPreview,
    node.attrs?.svgPreview,
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
    fallbackWidth: 240,
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
  const showAnyPreview = showHtmlPreview || showSvgPreview || showMermaidPreview;

  // ── Collapsed-width memory ──
  // 展开态宽度是 fit-content(按最长代码行求值);收起后 body 被高度动画
  // 层裁为 0,内容参照消失,若仍交给布局收缩,收起条会从代码宽度跳变成
  // 全宽/细条。展开期间用 ResizeObserver 把 figure 的实际渲染宽度记进
  // ref(覆盖编辑器宽度变化、内容编辑后的再求值;收起态的回调直接跳过,
  // 不记录动画过程中的中间值),收起时以记录值为显式宽度 —— 收起条与
  // 展开态等宽。读 ref 而非 state:只在收起/展开切换的那次渲染读取,
  // 无需为每次布局变化重渲染。文档加载即收起的块没有记录值,回退全宽,
  // 展开一次后即有正确宽度。
  const expandedWidthRef = useRef<number | null>(null);

  // 收起/展开动画时长 —— 按固定速率折算（见 useCollapseDuration）。
  // 变量挂在 figure 上：折叠块分割线的过渡延迟也要继承同一变量。
  const bodyInnerRef = useRef<HTMLDivElement | null>(null);
  useCollapseDuration(figureRefInternal, bodyInnerRef, collapsed);

  useEffect(() => {
    const el = figureRefInternal.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (!el.classList.contains("is-collapsed")) {
        expandedWidthRef.current = el.offsetWidth;
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Width: explicit (user resized) wins; otherwise the block shrinks to fit
  // its content (capped by .code-block-figure's max-width: 100%, floored by
  // its min-width) instead of always stretching to the full editor width —
  // short snippets keep breathing room aligned with the text. Previews keep
  // full width (their content isn't line-fit); the collapsed strip inherits
  // the last expanded width so it doesn't snap away from the code's width.
  const figureStyle: React.CSSProperties = {
    width: displayWidth
      ? `${displayWidth}px`
      : showAnyPreview
        ? "100%"
        : collapsed
          ? expandedWidthRef.current != null
            ? `${expandedWidthRef.current}px`
            : "100%"
          : "fit-content",
  };
  // 收起不走 display:none(瞬间消失)——由 .code-block-body-clip 的
  // 0fr↔1fr 高度动画接管(见 CSS);预览态仍直接隐藏 pre。
  const bodyStyle: React.CSSProperties = {
    overflow: "visible",
    ...(showAnyPreview ? { display: "none" } : null),
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
            isSvg={isSvg}
            hasContent={hasContent}
            showHtmlPreview={showHtmlPreview}
            showMermaidPreview={showMermaidPreview}
            showSvgPreview={showSvgPreview}
            mermaidSvg={mermaidSvg}
            onToggleHtmlPreview={() => updateAttributes({ htmlPreview: !showHtmlPreview })}
            onToggleMermaidPreview={() => updateAttributes({ mermaidPreview: !showMermaidPreview })}
            onToggleSvgPreview={() => updateAttributes({ svgPreview: !showSvgPreview })}
            onOpenHtmlWindow={() => openHtmlPreviewWindow(htmlSource)}
            onOpenMermaidWindow={() => { if (mermaidSvg) openMermaidPreviewWindow(mermaidSvg); }}
            onOpenSvgWindow={() => openHtmlPreviewWindow(wrapSvgForPreview(svgSource), "SVG")}
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

        {/* Hover title badge — the block's name shown passively at its inner
            top-right (where the title edit popover anchors) while hovering.
            aria-hidden + CSS pointer-events:none: it never intercepts code
            selection; the pill's title slot stays the edit entry point. */}
        {title && !collapsed && (
          <div aria-hidden className="code-block-hover-title">
            {title}
          </div>
        )}

        {/* Collapsed strip — passive identity only: the title text while
            present (click re-opens the edit popover), empty otherwise.
            常驻渲染（不再随 collapsed 卸载）：展开时经 grid 0fr 塌陷收为
            0 高（内容同步淡出、visibility 移出焦点序），收起时再从 0 长出
            —— 与下方内容延伸层衔接，figure 总高全程连续，收起条不会在
            展开瞬间闪没。contain:inline-size 让收起条不参与展开态
            fit-content 的宽度求值（长标题不会撑宽展开的代码块）。 */}
        <div className="code-block-bar-clip">
          <div className="code-block-bar-inner">
            <div ref={collapsedBarRef} className="code-block-collapsed-bar">
              {title && titleSlot}
            </div>
          </div>
        </div>

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

        {/* Code content + previews — wrapped in the height-animation clip
            layer (see .code-block-body-clip CSS): grid-template-rows 0fr↔1fr
            interpolates continuously, so expanding reads as the bottom edge
            naturally growing downward (border included), retracting as it
            shrinks back; the inner row child (min-height:0 + overflow:hidden)
            clips what's beyond the track and fades the content in sync.
            NodeViewContent must stay mounted for ProseMirror, so in preview
            mode we hide the <pre> instead of unmounting it. When collapsed
            React still unmounts the previews (useHtmlPreview drops the
            iframe) — the fade-out masks the unmount inside the retract. */}
        {/* Keep NodeViewContent in the root ProseMirror editing host. A nested
            contenteditable=false → true island makes WKWebView focus the inner
            host, which breaks ProseMirror's DOM selection synchronization. */}
        <div className="code-block-body-clip">
          <div ref={bodyInnerRef} className="code-block-body-inner">
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

            {isSvg && showSvgPreview && !collapsed && (
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
          </div>
        </div>

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
