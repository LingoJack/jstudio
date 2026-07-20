/**
 * SectionedEditorPanel — high-performance editor that renders one document as
 * N independent section editors to fix large-document typing lag.
 *
 * Strategy:
 *   - Split activeDoc.blocks into fixed-size sections (~SECTION_SIZE blocks).
 *   - Render one <SectionEditor> per section, each with its own ProseMirror
 *     instance, so a keystroke only re-lays-out its own ~30-block section
 *     instead of the whole 232KB contenteditable.
 *   - On a section edit, replace that section's slice and write the
 *     reassembled full Block[] back to the store (same debounced save path).
 *
 * Feature set (ported from the retired single-editor implementation; see
 * git history for the original EditorPanel.tsx):
 *   - Shared GPU cursor trail (viewport-sized canvas)
 *   - Title input with Enter → insert paragraph, ArrowDown → enter editor
 *   - SectionOutline panel with toggle button
 *   - FormatBubbleMenu + TableControls (rendered against focused section)
 *   - Paste/drop handlers (image/file special handling)
 *   - BlockNavigation (Tab, Cmd+Enter, Backspace on empty codeBlock, etc.)
 *   - Cross-section caret navigation + Backspace merge
 *   - Cross-section text selection (drag, Cmd+A, copy/cut/delete) via
 *     `useCrossSectionSelection`
 *   - Static/read-only rendering mode via `{ doc, readOnly }` props (used by
 *     HelpSection)
 *
 * Known limitation:
 *   - Sections are recomputed only on document switch, not live re-balanced
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { TextSelection, NodeSelection } from '@tiptap/pm/state';
import { ListTree } from 'lucide-react';

import { useStore } from '../../../store/useStore';
import { useI18n } from '../../../lib/core/i18n';
import { handleNativeSelectAll } from '../../../lib/shortcuts/nativeSelectAll';
import { eventToBinding, resolveBinding } from '../../../lib/shortcuts/keyboardShortcuts';
import { flushDocumentSaves } from '../../../store/storeHelpers';
import { EditorCursorTrail } from '../../ui/cursor/EditorCursorTrail';
import FormatBubbleMenu from '../FormatBubbleMenu';
import TableControls from '../nodes/TableControls';
import type { Block } from '../../../types';
import SectionEditor, { type SectionFocusHandle } from './SectionEditor';
import SectionOutline from './SectionOutline';
import { useCrossSectionSelection, type CrossSelectionContext } from './useCrossSectionSelection';
import { useCrossSectionFind } from './useCrossSectionFind';
import FindBar from './FindBar';
import { splitIntoSections, SECTION_SIZE, SECTION_MAX, SECTION_MERGE_BELOW, type SectionState } from '../../../lib/editor/sectioning';
import { EditorSkeleton } from './SectionSkeleton';
import {
  CursorTrailProvider,
  CursorTrailRegistry,
} from '../CursorTrailContext';

export interface SectionedEditorPanelProps {
  /** When provided, the editor renders this static document instead of the
   *  store's active document. Used by HelpSection. */
  doc?: { title: string; blocks: Block[] };
  /** Render in read-only mode (no editing, no toolbar, no cursor trail). */
  readOnly?: boolean;
}

function editorForKeyboardTarget(
  target: EventTarget | null,
  editors: ReadonlyMap<string, Editor>,
): Editor | null {
  const node = target instanceof Node ? target : null;
  const element = node instanceof Element ? node : node?.parentElement;
  if (!element) return null;
  if (element.closest('input, textarea, select, button, [contenteditable="false"]')) {
    return null;
  }

  const editorDom = element.closest<HTMLElement>('[data-section-id]');
  const sectionId = editorDom?.dataset.sectionId;
  if (!editorDom || !sectionId) return null;

  const editor = editors.get(sectionId);
  if (!editor || editor.isDestroyed || editor.view.dom !== editorDom) return null;
  return editorDom.contains(node) ? editor : null;
}

function logicalCodeLineBoundary(
  text: string,
  offset: number,
  toStart: boolean,
): number {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  if (toStart) {
    const previousNewline =
      safeOffset > 0 ? text.lastIndexOf('\n', safeOffset - 1) : -1;
    return previousNewline === -1 ? 0 : previousNewline + 1;
  }
  const nextNewline = text.indexOf('\n', safeOffset);
  return nextNewline === -1 ? text.length : nextNewline;
}

function visualCodeLineBoundary(
  editor: Editor,
  head: number,
  blockStart: number,
  blockEnd: number,
  toStart: boolean,
): number | null {
  const { view } = editor;
  const nativeSelection = view.dom.ownerDocument.getSelection();
  if (
    !nativeSelection ||
    typeof nativeSelection.modify !== 'function' ||
    typeof nativeSelection.setBaseAndExtent !== 'function' ||
    !nativeSelection.anchorNode ||
    !nativeSelection.focusNode ||
    !view.dom.contains(nativeSelection.focusNode)
  ) {
    return null;
  }

  const saved = {
    anchorNode: nativeSelection.anchorNode,
    anchorOffset: nativeSelection.anchorOffset,
    focusNode: nativeSelection.focusNode,
    focusOffset: nativeSelection.focusOffset,
    range: nativeSelection.rangeCount > 0
      ? nativeSelection.getRangeAt(0).cloneRange()
      : null,
  };

  try {
    const nativeHead = view.posAtDOM(saved.focusNode, saved.focusOffset);
    if (nativeHead !== head) return null;

    nativeSelection.collapse(saved.focusNode, saved.focusOffset);
    nativeSelection.modify('move', toStart ? 'left' : 'right', 'lineboundary');
    const focusNode = nativeSelection.focusNode;
    if (!focusNode || !view.dom.contains(focusNode)) return null;

    const mapped = view.posAtDOM(
      focusNode,
      nativeSelection.focusOffset,
      toStart ? -1 : 1,
    );
    return mapped >= blockStart && mapped <= blockEnd ? mapped : null;
  } catch {
    return null;
  } finally {
    try {
      nativeSelection.setBaseAndExtent(
        saved.anchorNode,
        saved.anchorOffset,
        saved.focusNode,
        saved.focusOffset,
      );
    } catch {
      nativeSelection.removeAllRanges();
      if (saved.range) nativeSelection.addRange(saved.range);
    }
  }
}

export default function SectionedEditorPanel({ doc, readOnly }: SectionedEditorPanelProps = {}) {
  const { t } = useI18n();
  // ── Read-only / static-document mode ──────────────────────────────
  const isStatic = !!doc;
  const activeDocId = useStore((s) => s.activeDocId);
  const activeDocReloadNonce = useStore((s) => s.activeDocReloadNonce);
  const activeDocTitle = useStore((s) => s.activeDoc?.title ?? '');
  const hasActiveDoc = useStore((s) => !!s.activeDoc);
  const updateDocumentMeta = useStore((s) => s.updateDocumentMeta);
  const editorCursorStyle = useStore((s) => s.editorCursorStyle);
  const editorCursorAnimationEnabled = useStore((s) => s.editorCursorAnimationEnabled);
  const isOutlineOpen = useStore((s) => s.isOutlineOpen);
  const toggleOutline = useStore((s) => s.toggleOutline);

  // Sections are built once per document load. We hold them in a ref-backed
  // state so section edits mutate the slice in place without re-rendering
  // (and thus remounting) sibling sections.
  const [sections, setSections] = useState<SectionState[]>([]);
  const sectionsRef = useRef<SectionState[]>([]);
  sectionsRef.current = sections;
  const loadedDocIdRef = useRef<string | null>(null);
  /** `${docId}:${reloadNonce}` — guards against reloading the same doc+nonce.
   *  Separated from `loadedDocIdRef` (pure docId) which is used for flushing
   *  the outgoing doc. When a backup restore bumps the nonce without changing
   *  docId, this guard lets the load effect re-run. */
  const loadTriggerRef = useRef<string | null>(null);
  /** Static-doc identity tracking (isStatic mode only). `doc` is recreated
   *  (new object identity) whenever HelpSection's `useMemo` deps change, e.g.
   *  on a locale switch — `loadedStaticDocRef` detects that and
   *  `staticDocRevRef` produces a fresh key so SectionEditor instances remount
   *  with the new content instead of keeping stale (previous-locale) text. */
  const loadedStaticDocRef = useRef<{ title: string; blocks: Block[] } | undefined>(undefined);
  const staticDocRevRef = useRef(0);
  const [staticDocKey, setStaticDocKey] = useState<string | null>(null);
  /** Unified doc identity used for SectionEditor `key`s and skeleton
   *  comparisons — the static key in static mode, `activeDocId` otherwise. */
  const docKey = isStatic ? staticDocKey : activeDocId;
  /** The doc id whose content has actually finished loading into all
   *  section editors. While this lags behind `activeDocId` we show a
   *  Skeleton overlay so the user doesn't see empty editors / placeholder
   *  text during the load. */
  const [renderedDocId, setRenderedDocId] = useState<string | null>(null);
  /** How many sections have reported "content loaded" for the current
   *  doc. When this reaches the total VISIBLE section count, we set
   *  renderedDocId. */
  const loadedSectionCountRef = useRef(0);
  const expectedSectionCountRef = useRef(0);
  /** How many sections are currently rendered. Grows progressively so we
   *  don't create all N ProseMirror instances at once (which would block the
   *  main thread on large documents). */
  const [visibleCount, setVisibleCount] = useState(0);

  // ── Stable caret-host registry + single shared cursor trail ──
  const cursorTrailRegistry = useMemo(() => new CursorTrailRegistry(), []);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const titleHostDisposerRef = useRef<(() => void) | null>(null);
  const setTitleInputRef = useCallback((el: HTMLInputElement | null) => {
    titleHostDisposerRef.current?.();
    titleHostDisposerRef.current = null;
    titleInputRef.current = el;
    if (el) titleHostDisposerRef.current = cursorTrailRegistry.registerNativeHost(el);
  }, [cursorTrailRegistry]);

  useEffect(() => () => {
    titleHostDisposerRef.current?.();
    cursorTrailRegistry.dispose();
  }, [cursorTrailRegistry]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionsWrapperRef = useRef<HTMLDivElement | null>(null);
  const trailOverlayRef = useRef<HTMLDivElement | null>(null);
  const trailRef = useRef<EditorCursorTrail | null>(null);
  const notifyCaret = useCallback(() => {
    cursorTrailRegistry.markDirty();
  }, [cursorTrailRegistry]);

  // ── Track the currently focused section's editor for FormatBubbleMenu /
  //    TableControls. Each SectionEditor calls onEditorReady when its editor
  //    is ready, and we track which one has focus via the 'focus' event.
  const focusedEditorRef = useRef<Editor | null>(null);
  const [focusedEditor, setFocusedEditor] = useState<Editor | null>(null);
  const sectionEditorsRef = useRef<Map<string, Editor>>(new Map());
  /** Latest `crossSel.selectAll` (declared further down, after the refs it
   *  depends on). Populated on every render so the window-capture Cmd+A
   *  handler below — which is defined earlier in this component and must
   *  stay a stable effect — can always reach the current implementation. */
  const crossSelectAllRef = useRef<(() => void) | null>(null);

  const handleEditorReady = useCallback((sectionId: string, ed: Editor) => {
    sectionEditorsRef.current.set(sectionId, ed);
    // Listen for focus to track which editor is active.
    ed.on('focus', () => {
      focusedEditorRef.current = ed;
      setFocusedEditor(ed);
    });
    // Clean up the map entry + focused refs when this editor is destroyed
    // (section unmounted, e.g. after a re-balance remount) so stale instances
    // don't accumulate or leave a destroyed editor as the "focused" one.
    ed.on('destroy', () => {
      if (sectionEditorsRef.current.get(sectionId) === ed) {
        sectionEditorsRef.current.delete(sectionId);
      }
      if (focusedEditorRef.current === ed) {
        focusedEditorRef.current = null;
        setFocusedEditor((prev) => (prev === ed ? null : prev));
      }
    });
  }, []);

  // -----------------------------------------------------------------
  // Cmd/Ctrl + ArrowLeft / ArrowRight → jump to block/line start / end.
  // Cmd/Ctrl + A → scope "select all" to the current code block.
  //
  // Ported from the retired EditorPanel (see git history for the
  // single-editor version). macOS WKWebView (Tauri's webview) intercepts
  // Cmd+Left/Right and Cmd+A at the native level and calls preventDefault()
  // before the event reaches ProseMirror's handleKeyDown, so we must listen
  // at the window capture phase — the earliest point we can see the event —
  // and handle it ourselves. Route each event through its DOM target so a
  // stale focused-editor ref cannot hijack title, portal, or toolbar inputs.
  //
  // NOTE: Cmd/Ctrl + ArrowUp/Down do NOT need this treatment — WKWebView
  // does not intercept them, and SectionEditor's own `handleKeyDown` already
  // routes them to `onJumpDocStart`/`onJumpDocEnd` at the normal DOM event
  // phase (see SectionEditor.tsx).
  // -----------------------------------------------------------------
  useEffect(() => {
    if (readOnly) return;

    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      // Cmd+Option+Arrow is the workspace tab-cycle shortcut — let it
      // pass through to the global handler in App.tsx.
      if (e.altKey) return;

      // ── Cmd/Ctrl+A → select-all, scoped correctly ──
      // See the retired EditorPanel's equivalent handler / docs/bug-graveyard.md #001
      // for why this reaches here instead of being consumed by the native
      // Edit > Select All menu item.
      //
      // Behaviour: if the caret is inside (or the node itself is) a code
      // block, select ONLY that block's content. Otherwise select the whole
      // document across every section via `crossSel.selectAll()` (see below)
      // — letting the event fall through to ProseMirror's default Mod-a
      // would only select the currently-focused SECTION, not the full doc.
      if (e.key === 'a' || e.key === 'A') {
        // Native inputs (title, portal-based language search, etc.) handle
        // Cmd/Ctrl+A themselves explicitly via `handleNativeSelectAll` in
        // their own onKeyDown — the browser's native select-all can't be
        // relied on here since the app's menu omits Edit > Select All (see
        // nativeSelectAll.ts). Bail out so we don't fight their handling.
        if (e.target === titleInputRef.current) return;

        const editor = editorForKeyboardTarget(e.target, sectionEditorsRef.current);
        if (!editor) return;
        const { state, view } = editor;
        const { selection, doc: pmDoc, tr } = state;

        let codeBlockRange: { from: number; to: number } | null = null;

        if (
          selection instanceof NodeSelection &&
          selection.node.type.name === 'codeBlock'
        ) {
          const pos = selection.from;
          codeBlockRange = {
            from: pos + 1,
            to: pos + 1 + selection.node.content.size,
          };
        } else {
          const { $from } = selection;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === 'codeBlock') {
              const start = $from.start(d);
              codeBlockRange = {
                from: start,
                to: start + $from.node(d).content.size,
              };
              break;
            }
          }
        }

        if (codeBlockRange) {
          tr.setSelection(
            TextSelection.create(pmDoc, codeBlockRange.from, codeBlockRange.to),
          );
          view.dispatch(tr);
          view.focus();
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // Not in a code block → select the ENTIRE document across all
        // sections. Each section is an independent ProseMirror instance with
        // its own contenteditable; letting this event fall through to the
        // default/native Mod-a handling would only select the CURRENTLY
        // FOCUSED section's content (ProseMirror's own `select-all-text`
        // keymap operates on that section's local `doc`, and the browser
        // only ever has one native Selection, scoped to the focused editing
        // host) — which is exactly the "select all only grabs part of the
        // document" bug this branch fixes. `useCrossSectionSelection`
        // already implements a real multi-section select-all (painting a
        // highlight decoration on every section); we just need to trigger it
        // here instead of doing nothing.
        crossSelectAllRef.current?.();
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // ── Cmd/Ctrl+` → toggle inline code (editor.inlineCode) ──
      // macOS/WKWebView intercepts Cmd+` as the system "cycle window"
      // accelerator via performKeyEquivalent:, marking defaultPrevented
      // before ProseMirror's keymap runs (same family as bug-graveyard #001
      // and the Cmd+A menu-item issue). Resolve the effective binding from
      // the shortcut registry so user overrides are respected.
      if (e.key === '`') {
        const editor = editorForKeyboardTarget(e.target, sectionEditorsRef.current);
        if (editor) {
          const binding = eventToBinding(e);
          const overrides = useStore.getState().keyboardShortcuts;
          if (binding === resolveBinding('editor.inlineCode', overrides)) {
            editor.chain().focus().toggleCode().run();
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
      }

      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

      // ── Title <input> branch ──
      // When the title input is focused, Cmd/Ctrl+Arrow should jump to the
      // start / end of the title text (it is a single line), optionally
      // extending the selection with Shift — NOT move into the sections
      // below. WKWebView intercepts Cmd+Arrow natively, so we must drive the
      // input's selection ourselves here at the window capture phase.
      const titleEl = titleInputRef.current;
      if (titleEl && e.target === titleEl) {
        const toStart = e.key === 'ArrowLeft';
        const len = titleEl.value.length;
        const target = toStart ? 0 : len;
        if (e.shiftKey) {
          // Keep the fixed (anchor) end and move the caret end to the edge.
          const s = titleEl.selectionStart ?? 0;
          const en = titleEl.selectionEnd ?? 0;
          const anchor = titleEl.selectionDirection === 'backward' ? en : s;
          titleEl.setSelectionRange(
            Math.min(anchor, target),
            Math.max(anchor, target),
            target < anchor ? 'backward' : 'forward',
          );
        } else {
          titleEl.setSelectionRange(target, target);
        }
        // The trail re-measures on the input's 'select' event; nudge it too
        // in case the selection didn't actually change (already at the edge).
        cursorTrailRegistry.markDirty();
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const editor = editorForKeyboardTarget(e.target, sectionEditorsRef.current);
      if (!editor) return;

      const view = editor.view;
      const { state } = view;
      const { selection } = state;
      if (!(selection instanceof TextSelection)) return;
      const $head = selection.$head;
      if ($head.depth < 1) return;

      const toStart = e.key === 'ArrowLeft';
      const extend = e.shiftKey;
      let edge: number;
      // Code blocks wrap long lines. Ask WebKit for the current visual line
      // boundary, then map that DOM caret back to a ProseMirror position.
      // If the native selection cannot be measured safely, fall back to the
      // source line delimited by \n.
      const inCodeBlock =
        $head.depth > 0 && $head.parent.type.name === 'codeBlock';
      if (inCodeBlock) {
        const codeNode = $head.parent;
        const blockStart = $head.start();
        const blockEnd = blockStart + codeNode.content.size;
        edge =
          visualCodeLineBoundary(
            editor,
            selection.head,
            blockStart,
            blockEnd,
            toStart,
          ) ??
          blockStart +
            logicalCodeLineBoundary(
              codeNode.textContent,
              $head.parentOffset,
              toStart,
            );
      } else {
        // Use $head.start() / $head.end() (defaults to $head.depth) so that we
        // always resolve to the **text block** boundary (paragraph/heading)
        // rather than the top-level node. For list items the paragraph lives at
        // depth 3 (doc > bulletList > listItem > paragraph); using depth 1
        // would jump to the start/end of the *entire list* instead of the
        // current item.
        edge = toStart ? $head.start() : $head.end();
      }

      const tr = extend
        ? state.tr.setSelection(
            TextSelection.create(state.doc, selection.$anchor.pos, edge),
          )
        : state.tr.setSelection(TextSelection.create(state.doc, edge));
      tr.setMeta('addToHistory', false);
      view.dispatch(tr);
      view.focus();
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [readOnly]);

  // ── Load / re-section when the active document changes ──
  useEffect(() => {
    // Static document mode — split once per `doc` identity change. Skips all
    // store reads/writes since the static doc isn't backed by the store.
    if (isStatic) {
      if (!doc || loadedStaticDocRef.current === doc) return;
      loadedStaticDocRef.current = doc;
      staticDocRevRef.current += 1;
      const key = `__static__:${staticDocRevRef.current}`;
      loadedDocIdRef.current = key;
      loadTriggerRef.current = key;
      loadedSectionCountRef.current = 0;
      expectedSectionCountRef.current = 0;
      const newSections = splitIntoSections(doc.blocks);
      expectedSectionCountRef.current = newSections.length;
      setVisibleCount(0);
      setSections(newSections);
      setStaticDocKey(key);
      return;
    }

    if (!hasActiveDoc) {
      loadedDocIdRef.current = null;
      loadTriggerRef.current = null;
      setRenderedDocId(null);
      setVisibleCount(0);
      setSections([]);
      return;
    }
    // Guard on `${docId}:${nonce}` so a backup restore (which bumps the
    // nonce without changing docId) forces a reload.
    const trigger = `${activeDocId}:${activeDocReloadNonce}`;
    if (loadTriggerRef.current === trigger) return;

    // ── Flush the OUTGOING document's pending section edits ──
    // Before switching to the new document, persist the outgoing doc's current
    // blocks to its `documents[]` entry via `flushBlocksToDoc`.
    //
    // We read `s.blocks` from the section state directly — NOT from
    // `editor.getJSON()`. Each SectionEditor's unmount cleanup runs
    // synchronously in the commit phase (BEFORE this passive effect), and
    // already flushed any pending (un-debounced) edits into its section's
    // `blocks` via `handleSectionChange`. So `s.blocks` holds the most recent
    // content.
    //
    // Reading `editor.getJSON()` here would be a DATA-LOSS BUG: when the
    // active doc changes, the SectionEditor keys change
    // (`${activeDocId}:${s.id}`), so React unmounts the old editors and mounts
    // new ones. The newly-mounted editors start with an empty paragraph and
    // load real content via a deferred `setTimeout(0)` setContent — which runs
    // AFTER this passive effect. Calling getJSON() here captures that empty
    // initial state and overwrites the outgoing doc with a single blank block,
    // destroying all its content.
    const outgoingDocId = loadedDocIdRef.current;
    if (outgoingDocId && outgoingDocId !== activeDocId) {
      const current = sectionsRef.current;
      const full = current.flatMap((s) => s.blocks);
      useStore.getState().flushBlocksToDoc(outgoingDocId, full);
    }

    loadTriggerRef.current = trigger;
    loadedDocIdRef.current = activeDocId;
    // Reset loading counters — sections will report back as they finish.
    loadedSectionCountRef.current = 0;
    expectedSectionCountRef.current = 0;
    const blocks = useStore.getState().activeDoc?.blocks ?? [];
    const newSections = splitIntoSections(blocks);
    expectedSectionCountRef.current = newSections.length;
    // Start with 0 visible sections — they will be progressively revealed
    // by the idle callback below. This prevents rendering ALL N ProseMirror
    // instances at once (which blocks the main thread for large documents).
    setVisibleCount(0);
    setSections(newSections);
  }, [activeDocId, hasActiveDoc, activeDocReloadNonce, isStatic, doc]);

  // ── Progressive section mounting ──
  // Reveal sections a few at a time using requestIdleCallback (or setTimeout
  // fallback). Each batch creates a handful of ProseMirror instances — enough
  // to show the first screen of content, but not so many that the main thread
  // stalls. Subsequent batches fill in the rest during idle time.
  const SECTIONS_PER_BATCH = 2;
  useEffect(() => {
    if (visibleCount >= sections.length) return;

    const revealNext = () => {
      setVisibleCount((prev) => {
        const next = Math.min(prev + SECTIONS_PER_BATCH, sections.length);
        // Reset the load counter to match the number we expect to have
        // reported loaded. Only count sections that are actually rendered.
        return next;
      });
    };

    const handle: number | ReturnType<typeof setTimeout> =
      typeof requestIdleCallback !== 'undefined'
        ? requestIdleCallback(revealNext, { timeout: 200 })
        : window.setTimeout(revealNext, 0);

    return () => {
      if (typeof handle === 'number' && typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(handle);
      } else {
        clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
      }
    };
  }, [visibleCount, sections.length]);

  // ── Track section load completion → set renderedDocId when the first
  //    batch of visible sections has loaded. We don't need ALL sections
  //    loaded — just enough to show the first screen of content. Later
  //    sections load progressively during idle time.
  const handleSectionLoaded = useCallback(() => {
    // Once ANY section has loaded, the first screen is ready — hide skeleton.
    // We don't need to wait for all visible sections; the first one to finish
    // means content is now on screen.
    setRenderedDocId(loadedDocIdRef.current);
  }, []);

  // ── Create the single shared cursor trail ──
  useEffect(() => {
    if (readOnly) return; // no cursor trail in read-only mode
    if (!hasActiveDoc) return;
    // The animation is opt-out: when disabled, skip creating the canvas /
    // trail entirely and leave the native caret alone (SectionEditor only
    // sets `caretColor: transparent` when this same flag is on — see its
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
    // editor — scrolling one of those never reaches this listener. That
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
  }, [readOnly, hasActiveDoc, activeDocId, editorCursorAnimationEnabled, cursorTrailRegistry]);

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
  }, [readOnly, activeDocId]); // Re-run when document changes (trail may be re-created)

  // Apply cursor style to the shared trail.
  useEffect(() => {
    if (readOnly) return;
    trailRef.current?.setCursorStyle(editorCursorStyle);
  }, [editorCursorStyle, activeDocId, readOnly]);

  // ── pagehide / beforeunload: flush pending edits + document saves ──
  useEffect(() => {
    if (readOnly) return;
    const handleClose = () => {
      // Flush each section's pending debounce synchronously.
      const current = sectionsRef.current;
      // For each section editor that has pending edits, force a flush.
      // The section's unmount handler already flushes on unmount, but
      // pagehide may not trigger React unmount in time.
      for (const [, ed] of sectionEditorsRef.current) {
        if (ed && !ed.isDestroyed) {
          // Trigger the section's onChange by reading current content.
          // The unmount effect in each SectionEditor handles this; but
          // to be safe, also flush at the store level.
        }
      }
      flushDocumentSaves();
    };
    window.addEventListener('pagehide', handleClose);
    window.addEventListener('beforeunload', handleClose);
    return () => {
      window.removeEventListener('pagehide', handleClose);
      window.removeEventListener('beforeunload', handleClose);
    };
  }, [readOnly]);

  // A section reports new blocks → splice into the full array and persist.
  const handleSectionChange = useCallback(
    (sectionId: string, blocks: Block[]) => {
      const current = sectionsRef.current;
      const idx = current.findIndex((s) => s.id === sectionId);
      if (idx === -1) return;
      // Update the slice in place (do NOT setState — that would remount
      // sibling SectionEditors and destroy their selection/cursor).
      current[idx] = { ...current[idx], blocks };
      const full = current.flatMap((s) => s.blocks);
      useStore.getState().setActiveDocBlocks(full, loadedDocIdRef.current ?? undefined);
    },
    [],
  );

  // ── Live re-balance ──
  // When a section loses focus, check whether it has grown too large (needs
  // splitting) or shrunk too small (should merge with a neighbour). We do this
  // ONLY on blur so we never remount the section the user is actively editing
  // (which would clobber the caret). Splitting a large section back into
  // ~SECTION_SIZE chunks keeps each ProseMirror instance small so typing stays
  // fast even after heavy local editing.
  //
  // A monotonic seq guarantees fresh, unique ids on every re-balance so React
  // remounts exactly the changed sections (new key → remount → reload content).
  const rebalanceSeqRef = useRef(0);
  const handleSectionBlur = useCallback((sectionId: string) => {
    // Defer to idle time — blur often precedes a focus on another section
    // (clicking into a neighbour); doing structural work synchronously here
    // could interrupt that focus transition.
    const run = () => {
      const current = sectionsRef.current;
      const idx = current.findIndex((s) => s.id === sectionId);
      if (idx === -1) return;

      // Never re-balance a section that currently holds focus (the user may
      // have clicked back into it during the idle delay).
      const focusedEd = focusedEditorRef.current;
      const sec = current[idx];

      let next: SectionState[] | null = null;

      // ── Split: section grew beyond SECTION_MAX ──
      if (sec.blocks.length > SECTION_MAX) {
        // Don't split the focused section.
        const edForSec = sectionEditorsRef.current.get(sectionId);
        if (edForSec && edForSec === focusedEd && edForSec.isFocused) return;

        const seq = ++rebalanceSeqRef.current;
        const chunks: SectionState[] = [];
        for (let i = 0; i < sec.blocks.length; i += SECTION_SIZE) {
          chunks.push({
            id: `${sec.id}~s${seq}_${i / SECTION_SIZE}`,
            blocks: sec.blocks.slice(i, i + SECTION_SIZE),
          });
        }
        // Fold a small trailing remainder chunk into the previous one — see
        // the matching comment in `splitIntoSections` (sectioning.ts) for
        // why a tiny/lone leftover section renders a misleading empty-doc
        // placeholder even though the rest of the section had real content.
        if (chunks.length > 1) {
          const lastChunk = chunks[chunks.length - 1];
          if (lastChunk.blocks.length <= SECTION_MERGE_BELOW) {
            const prevChunk = chunks[chunks.length - 2];
            prevChunk.blocks = [...prevChunk.blocks, ...lastChunk.blocks];
            chunks.pop();
          }
        }
        next = [...current.slice(0, idx), ...chunks, ...current.slice(idx + 1)];
      }
      // ── Merge: section shrank and can combine with the next one ──
      else if (
        sec.blocks.length <= SECTION_MERGE_BELOW &&
        idx + 1 < current.length &&
        current[idx].blocks.length + current[idx + 1].blocks.length <= SECTION_SIZE
      ) {
        const nextSec = current[idx + 1];
        // Don't merge if EITHER section is focused (both remount on merge).
        const edA = sectionEditorsRef.current.get(sectionId);
        const edB = sectionEditorsRef.current.get(nextSec.id);
        if (
          (edA && edA === focusedEd && edA.isFocused) ||
          (edB && edB === focusedEd && edB.isFocused)
        ) {
          return;
        }
        const seq = ++rebalanceSeqRef.current;
        const merged: SectionState = {
          id: `${sec.id}~m${seq}`,
          blocks: [...sec.blocks, ...nextSec.blocks],
        };
        next = [...current.slice(0, idx), merged, ...current.slice(idx + 2)];
      }

      if (next) {
        sectionsRef.current = next;
        setSections(next);
        // Keep all sections visible after a re-balance (split increases the
        // count). Re-balance only happens after the doc is fully loaded and
        // the user is editing, so everything should already be mounted; bump
        // visibleCount to cover any newly-split sections immediately.
        setVisibleCount(next.length);
        // Structure changed → the remounted sections reload content via their
        // own setTimeout. renderedDocId stays as-is (doc id unchanged), so no
        // skeleton flash.
      }
    };

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(run, { timeout: 500 });
    } else {
      setTimeout(run, 50);
    }
  }, []);

  // Stable section list for rendering — identity preserved across edits.
  const renderSections = useMemo(() => sections, [sections]);

  // ── Cross-section caret navigation ──
  const focusHandlesRef = useRef<Map<string, SectionFocusHandle>>(new Map());
  const sectionOrderRef = useRef<string[]>([]);
  sectionOrderRef.current = renderSections.map((s) => s.id);

  // ── Cross-section selection ──
  // Each section is an independent contenteditable, so a native Selection
  // stops at the section boundary. This coordinator synthesizes a selection
  // that spans sections (paint highlights on every covered section, keep the
  // native selection inside the anchor section, intercept copy/cut/delete).
  const crossCtx: CrossSelectionContext = useMemo(
    () => ({
      getOrder: () => sectionOrderRef.current,
      getHandle: (id) => focusHandlesRef.current.get(id),
      getEditor: (id) => sectionEditorsRef.current.get(id),
    }),
    [],
  );
  const crossSel = useCrossSectionSelection(crossCtx, activeDocId);
  crossSelectAllRef.current = crossSel.selectAll;

  // ── Cross-section find-in-document ──
  // Reuses the same `crossCtx` as the selection coordinator — both need to
  // walk sections in document order and access each section's Editor / focus
  // handle. `resetKey` is the active doc id (or null in static mode) so the
  // matches clear on document switch; `query` is the live store value.
  //
  // Note on Cmd+F: macOS WKWebView intercepts Cmd+F at the native layer
  // before any DOM keydown is generated. The native Edit > Find menu forwards
  // the shared `app.find` command to the focused WebView, where
  // ShortcutManager dispatches it through the same command registry as DOM
  // shortcuts.
  const findQuery = useStore((s) => s.findQuery);
  const findResetKey = isStatic ? null : activeDocId;
  const find = useCrossSectionFind(crossCtx, findResetKey, findQuery);

  const registerFocus = useCallback(
    (sectionId: string, handle: SectionFocusHandle | null) => {
      if (handle) focusHandlesRef.current.set(sectionId, handle);
      else focusHandlesRef.current.delete(sectionId);
    },
    [],
  );

  const handleCrossUp = useCallback((sectionId: string): boolean => {
    const order = sectionOrderRef.current;
    const idx = order.indexOf(sectionId);
    if (idx <= 0) return false;
    const prev = focusHandlesRef.current.get(order[idx - 1]);
    if (!prev) return false;
    prev.focusEnd();
    return true;
  }, []);

  const handleCrossDown = useCallback((sectionId: string): boolean => {
    const order = sectionOrderRef.current;
    const idx = order.indexOf(sectionId);
    if (idx === -1 || idx >= order.length - 1) return false;
    const next = focusHandlesRef.current.get(order[idx + 1]);
    if (!next) return false;
    next.focusStart();
    return true;
  }, []);

  const handleJumpDocStart = useCallback((): boolean => {
    const first = sectionOrderRef.current[0];
    const handle = first ? focusHandlesRef.current.get(first) : undefined;
    if (!handle) return false;
    handle.focusStart();
    return true;
  }, []);

  const handleJumpDocEnd = useCallback((): boolean => {
    const order = sectionOrderRef.current;
    const last = order[order.length - 1];
    const handle = last ? focusHandlesRef.current.get(last) : undefined;
    if (!handle) return false;
    handle.focusEnd();
    return true;
  }, []);

  const handleMergeUp = useCallback((sectionId: string): boolean => {
    const current = sectionsRef.current;
    const idx = current.findIndex((s) => s.id === sectionId);
    if (idx <= 0) return false;
    const prev = current[idx - 1];
    const cur = current[idx];
    const boundary = prev.blocks.length;
    const merged: SectionState = {
      id: `${prev.id}+m${Date.now()}`,
      blocks: [...prev.blocks, ...cur.blocks],
      pendingMergeBoundary: boundary,
    };
    const next = [...current.slice(0, idx - 1), merged, ...current.slice(idx + 1)];
    sectionsRef.current = next;
    setSections(next);
    const full = next.flatMap((s) => s.blocks);
    useStore.getState().setActiveDocBlocks(full, loadedDocIdRef.current ?? undefined);
    return true;
  }, []);

  const handleMergeApplied = useCallback((sectionId: string) => {
    const current = sectionsRef.current;
    const idx = current.findIndex((s) => s.id === sectionId);
    if (idx === -1 || current[idx].pendingMergeBoundary == null) return;
    current[idx] = { ...current[idx], pendingMergeBoundary: null };
  }, []);

  // ── Title keydown: Enter → insert paragraph at doc start; ArrowDown → enter
  //    the first section's editor. Ported from the retired EditorPanel's
  //    handleTitleKeyDown.
  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (handleNativeSelectAll(e)) return;

    const el = e.currentTarget;
    const len = el.value.length;
    const isAtEnd =
      el.selectionStart === len && el.selectionEnd === len;

    // Enter / Cmd+Enter → insert an empty paragraph at the very top of the
    // first section and focus it.
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      (e.metaKey || e.ctrlKey ? true : !e.repeat)
    ) {
      e.preventDefault();
      e.stopPropagation();
      const firstHandle = focusHandlesRef.current.get(sectionOrderRef.current[0]);
      if (firstHandle) {
        firstHandle.focusStart();
        // Insert a paragraph at position 0 of the first section's editor.
        // We need the actual editor to do insertContentAt — get it from the map.
        const firstEd = sectionEditorsRef.current.get(sectionOrderRef.current[0]);
        firstEd
          ?.chain()
          .focus()
          .insertContentAt(0, { type: 'paragraph' })
          .setTextSelection(1)
          .run();
      }
      return;
    }

    // ArrowDown (anywhere) or ArrowRight (at end) → enter the first section.
    if (e.key === 'ArrowDown' || (e.key === 'ArrowRight' && isAtEnd)) {
      e.preventDefault();
      const firstHandle = focusHandlesRef.current.get(sectionOrderRef.current[0]);
      firstHandle?.focusStart();
      return;
    }
  };

  // ── onExitToTitle: focus the title input at end (called by BlockNavigation
  //    when the caret exits the top of the first block of the first section).
  const handleExitToTitle = useCallback(() => {
    const el = titleInputRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, []);

  // ------------------------------------------------------------------
  // Click on blank area below editor content — focus end of the last section
  //
  // Ported from the retired EditorPanel's handleBlankAreaClick: distinguish a genuine CLICK
  // from a drag-selection by recording the mousedown position; if the mouse
  // moved more than a few pixels, treat it as a drag and do NOT refocus.
  // ------------------------------------------------------------------
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleBlankAreaClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only respond to clicks on the designated trailing blank area.
      const target = e.target as HTMLElement;
      if (!target.closest('.click-to-focus-end')) return;

      // If the mouse moved between mousedown and click, it was a drag-
      // selection, not a click — do not steal focus.
      const down = mouseDownPosRef.current;
      if (down) {
        const dx = Math.abs(e.clientX - down.x);
        const dy = Math.abs(e.clientY - down.y);
        if (dx > 3 || dy > 3) return; // dragged more than 3px → selection
      }
      mouseDownPosRef.current = null;

      // Focus to end of the last visible section's editor.
      const order = sectionOrderRef.current;
      const lastId = order[order.length - 1];
      if (!lastId) return;
      const handle = focusHandlesRef.current.get(lastId);
      handle?.focusEnd();
    },
    [],
  );

  // Show skeleton when the editor body hasn't caught up with the active doc
  // (during a tab switch). renderedDocId is set only after the first batch of
  // visible sections has finished loading their content.
  const showSkeleton = renderedDocId !== docKey;

  // ── Static / read-only mode ──
  if (isStatic) {
    if (!doc) return null;
    return (
      <div ref={rootRef} className="flex h-full bg-transparent overflow-hidden relative">
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto pt-8 pb-8 md:pb-12 bg-[var(--vscode-editor-background)] select-text"
        >
          {/* Document Title (static text, not editable) */}
          <div className="px-4 md:px-12 lg:px-20 pb-4">
            <h1 className="text-4xl font-bold text-[var(--vscode-editor-foreground)] pb-1">
              {doc.title}
            </h1>
          </div>

          {/* One independent (read-only) editor per section — see the
              progressive-mounting comment below for why only `visibleCount`
              are rendered. */}
          <div ref={sectionsWrapperRef} className="tiptap-editor-container relative min-h-[50vh]">
            {renderSections.slice(0, visibleCount).map((s) => (
              <SectionEditor
                key={`${docKey}:${s.id}`}
                sectionId={s.id}
                initialBlocks={s.blocks}
                onSectionChange={handleSectionChange}
                registerFocus={registerFocus}
                onCrossUp={handleCrossUp}
                onCrossDown={handleCrossDown}
                onJumpDocStart={handleJumpDocStart}
                onJumpDocEnd={handleJumpDocEnd}
                notifyCaret={notifyCaret}
                onEditorReady={(ed) => handleEditorReady(s.id, ed)}
                onSectionLoaded={handleSectionLoaded}
                readOnly={readOnly}
              />
            ))}
            {showSkeleton && <EditorSkeleton />}
          </div>
        </div>

        {/* Outline panel (conditional) — same as editing mode, but sourced
            from the static doc's blocks (not the store's activeDoc, which is
            unrelated while viewing a static document like the help guide). */}
        {isOutlineOpen && (
          <SectionOutline
            scrollContainerRef={scrollContainerRef}
            sectionEditorsRef={sectionEditorsRef}
            staticBlocks={doc.blocks}
          />
        )}

        {/* Outline toggle icon */}
        <button
          onClick={toggleOutline}
          title={isOutlineOpen ? t('outline.hide') : t('outline.show')}
          className="absolute top-3 right-3 z-30 p-1.5 rounded-md transition-colors duration-150 cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]"
        >
          <ListTree className="w-4 h-4" />
        </button>

        {/* Floating find-in-document bar (toggled by Cmd/Ctrl+F) */}
        <FindBar find={find} />
      </div>
    );
  }

  // ── Normal editing mode ──
  if (!hasActiveDoc) return null;

  return (
    <CursorTrailProvider registry={cursorTrailRegistry}>
      <div ref={rootRef} className="flex h-full overflow-hidden relative bg-[var(--vscode-editor-background)]">
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto pb-8 md:pb-12 select-text"
        onMouseDown={handleMouseDown}
        onMouseDownCapture={crossSel.onMouseDownCapture}
        onClick={handleBlankAreaClick}
      >
        {/* Document Title */}
        <div className="px-4 md:px-12 lg:px-20 pt-12 pb-4">
          <input
            ref={setTitleInputRef}
            type="text"
            value={activeDocTitle}
            onChange={(e) => updateDocumentMeta({ title: e.target.value })}
            onKeyDown={handleTitleKeyDown}
            placeholder={t('editor.titlePlaceholder')}
            className="text-4xl font-bold text-[var(--vscode-editor-foreground)] bg-transparent border-none focus:outline-none w-full placeholder-[var(--vscode-descriptionForeground)] placeholder-opacity-40 pb-1"
          />
        </div>

        {/* One independent editor per section. Only the first `visibleCount`
            sections are rendered — the rest are progressively mounted via
            requestIdleCallback to avoid creating all N ProseMirror instances
            at once (which would block the main thread on large docs). */}
        <div ref={sectionsWrapperRef} className="tiptap-editor-container relative">
          {renderSections.slice(0, visibleCount).map((s) => (
            <SectionEditor
              key={`${docKey}:${s.id}`}
              sectionId={s.id}
              initialBlocks={s.blocks}
              onSectionChange={handleSectionChange}
              registerFocus={registerFocus}
              onCrossUp={handleCrossUp}
              onCrossDown={handleCrossDown}
              onJumpDocStart={handleJumpDocStart}
              onJumpDocEnd={handleJumpDocEnd}
              onMergeUp={handleMergeUp}
              pendingMergeBoundary={s.pendingMergeBoundary}
              onMergeApplied={handleMergeApplied}
              notifyCaret={notifyCaret}
              onExitToTitle={handleExitToTitle}
              onEditorReady={(ed) => handleEditorReady(s.id, ed)}
              onSectionLoaded={handleSectionLoaded}
              onSectionBlur={handleSectionBlur}
            />
          ))}
          {/* Skeleton overlay while sections are loading content.
              renderedDocId lags behind activeDocId during load — when they
              differ, the editors are still empty (content hasn't been
              setContent'd yet), so we cover them with a skeleton to prevent
              the user from seeing placeholder text / empty editors. */}
          {showSkeleton && <EditorSkeleton />}
        </div>

        {/* Trailing scroll buffer — click here focuses end of last section */}
        <div
          className="min-h-[40vh] click-to-focus-end"
          aria-hidden="true"
        />
      </div>

      {/* Shared GPU cursor-trail overlay */}
      <div
        ref={trailOverlayRef}
        className="absolute inset-0"
        style={{ pointerEvents: 'none', zIndex: 5 }}
      />

      {/* Selection-triggered formatting toolbar.
          Hidden while a cross-section selection is active — formatting only
          the anchor section's slice would be misleading. */}
      {focusedEditor && !crossSel.active && <FormatBubbleMenu editor={focusedEditor} />}

      {/* Table hover controls + context menu */}
      {focusedEditor && !crossSel.active && <TableControls editor={focusedEditor} />}

      {/* Outline panel (conditional) */}
      {isOutlineOpen && (
        <SectionOutline
          scrollContainerRef={scrollContainerRef}
          sectionEditorsRef={sectionEditorsRef}
        />
      )}

      {/* Outline toggle icon */}
      <button
        onClick={toggleOutline}
        title={isOutlineOpen ? t('outline.hide') : t('outline.show')}
        className={`absolute ${isOutlineOpen ? 'top-2.5 right-2' : 'top-3 right-3'} z-30 p-1.5 rounded-md transition-colors duration-150 cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]`}
      >
        <ListTree className="w-4 h-4" />
      </button>

      {/* Floating find-in-document bar (toggled by Cmd/Ctrl+F) */}
      <FindBar find={find} />
      </div>
    </CursorTrailProvider>
  );

}
