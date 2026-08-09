/**
 * useCursorTrail - 从 DocumentPanel 提取的光标轨迹逻辑。
 *
 * 职责：
 *   - 创建共享的 EditorCursorTrail（canvas overlay + scroll/click 监听）
 *   - 主题切换时实时更新轨迹颜色（MutationObserver 监听 <html> style）
 *   - 应用光标样式到 trail
 *
 * trailOverlayRef 和 trailRef 由 hook 内部创建并返回，
 * scrollContainerRef / sectionsWrapperRef 从外部传入（JSX 共享）。
 */

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { EditorCursorTrail } from '../../ui/cursor/EditorCursorTrail';
import type { CursorTrailRegistry } from '../CursorTrailContext';
import type { EditorCursorStyle } from '../../../types/settings';

export interface UseCursorTrailParams {
  readOnly: boolean | undefined;
  hasActiveDoc: boolean;
  editorDocId: string | undefined;
  editorCursorAnimationEnabled: boolean | undefined;
  editorCursorStyle: EditorCursorStyle;
  cursorTrailRegistry: CursorTrailRegistry;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  sectionsWrapperRef: RefObject<HTMLDivElement | null>;
}

export function useCursorTrail({
  readOnly,
  hasActiveDoc,
  editorDocId,
  editorCursorAnimationEnabled,
  editorCursorStyle,
  cursorTrailRegistry,
  scrollContainerRef,
  sectionsWrapperRef,
}: UseCursorTrailParams) {
  const trailOverlayRef = useRef<HTMLDivElement | null>(null);
  const trailRef = useRef<EditorCursorTrail | null>(null);

  // ── Create the single shared cursor trail ──
  useEffect(() => {
    if (readOnly) return; // no cursor trail in read-only mode
    if (!hasActiveDoc) return;
    // The animation is opt-out: when disabled, skip creating the canvas /
    // trail entirely and leave the native caret alone (SectionEditor only
    // sets `caretColor: transparent` when this same flag is on - see its
    // own effect). This is the "fall back to the native caret" escape
    // hatch for the trail's known code-block caret-placement bugs.
    if (!editorCursorAnimationEnabled) return;
    const overlay = trailOverlayRef.current;
    const editorEl = sectionsWrapperRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (!overlay || !editorEl || !scrollContainer) return;

    const cssColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--vscode-editorCursor-foreground')
        .trim() ||
      getComputedStyle(document.documentElement)
        .getPropertyValue('--vscode-focusBorder')
        .trim() ||
      '#007fd4';

    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    });
    overlay.appendChild(canvas);

    let trail: EditorCursorTrail;
    try {
      trail = new EditorCursorTrail(canvas, cssColor, editorEl, scrollContainer);
    } catch {
      overlay.removeChild(canvas);
      return;
    }
    trail.resize();
    trail.start();
    trailRef.current = trail;
    cursorTrailRegistry.attachTrail(trail);

    const markDirty = () => cursorTrailRegistry.markDirty();
    // `scroll` events do NOT bubble, so a listener on `scrollContainer` only
    // fires when `scrollContainer` itself is the scrolled element. Code
    // blocks (and any other independently-scrollable NodeView, e.g. wide
    // tables) have their OWN `overflow: auto` region nested inside the
    // editor - scrolling one of those never reaches this listener. That
    // left the cursor trail's cached rect stale whenever the user scrolled
    // a code block directly (mouse wheel / scrollbar drag) without moving
    // the selection, until the 400ms safety tick below happened to catch up.
    // Listening in the CAPTURE phase fixes this: capture-phase listeners
    // fire for events targeting ANY descendant, bubbling or not, so a
    // scroll inside a nested code block now marks the trail dirty
    // immediately instead of drifting for up to 400ms.
    scrollContainer.addEventListener('scroll', markDirty, { passive: true, capture: true });
    const safetyTick = window.setInterval(() => {
      if (editorEl.contains(document.activeElement)) markDirty();
    }, 400);
    const resizeObserver = new ResizeObserver(() => trail.resize());
    resizeObserver.observe(overlay);

    return () => {
      window.clearInterval(safetyTick);
      scrollContainer.removeEventListener('scroll', markDirty, { capture: true });
      resizeObserver.disconnect();
      cursorTrailRegistry.attachTrail(null);
      trail.dispose();
      trailRef.current = null;
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, [readOnly, hasActiveDoc, editorDocId, editorCursorAnimationEnabled, cursorTrailRegistry]);

  // ── Live theme update for cursor trail ──
  // When the app theme changes, update the cursor trail color from CSS variables.
  useEffect(() => {
    if (readOnly) return;
    const trail = trailRef.current;
    if (!trail) return;

    const updateColor = () => {
      const cssColor =
        getComputedStyle(document.documentElement)
          .getPropertyValue('--vscode-editorCursor-foreground')
          .trim() ||
        getComputedStyle(document.documentElement)
          .getPropertyValue('--vscode-focusBorder')
          .trim() ||
        '#007fd4';
      trail.setColor(cssColor);
    };

    // Initial update
    updateColor();

    // Observe CSS variable changes on <html>
    const observer = new MutationObserver(() => {
      updateColor();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style'],
    });

    return () => observer.disconnect();
  }, [readOnly, editorDocId]); // Re-run when document changes (trail may be re-created)

  // Apply cursor style to the shared trail.
  useEffect(() => {
    if (readOnly) return;
    trailRef.current?.setCursorStyle(editorCursorStyle);
  }, [editorCursorStyle, editorDocId, readOnly]);

  return { trailOverlayRef, trailRef };
}
