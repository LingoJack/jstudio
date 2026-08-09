/**
 * useEditorKeyboardNav - 从 DocumentPanel 提取的键盘导航逻辑。
 *
 * 职责：
 *   - window 捕获阶段 keydown：Cmd/Ctrl+ArrowLeft/Right 跳转到行首/行尾
 *     （macOS WKWebView 原生拦截 Cmd+Arrow，必须在 capture 阶段处理）
 *   - Cmd/Ctrl+` -> toggle inline code（同样被 WKWebView 拦截）
 *   - Title input 的 Cmd+Arrow -> 跳到标题文本首/尾
 *   - 代码块内使用视觉行边界（visualCodeLineBoundary），回退到逻辑行边界
 */

import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { eventToBinding, resolveBinding } from '../../../lib/shortcuts/keyboardShortcuts';
import { editorForKeyboardTarget } from '../../../lib/editor/editorForKeyboardTarget';
import { logicalCodeLineBoundary, visualCodeLineBoundary } from '../../../lib/editor/codeLineBoundary';
import { useStore } from '../../../store/useStore';
import type { CursorTrailRegistry } from '../CursorTrailContext';

export interface UseEditorKeyboardNavParams {
  readOnly: boolean | undefined;
  titleInputRef: RefObject<HTMLInputElement | null>;
  sectionEditorsRef: RefObject<Map<string, Editor>>;
  cursorTrailRegistry: CursorTrailRegistry;
}

export function useEditorKeyboardNav({
  readOnly,
  titleInputRef,
  sectionEditorsRef,
  cursorTrailRegistry,
}: UseEditorKeyboardNavParams) {
  useEffect(() => {
    if (readOnly) return;

    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      // Cmd+Option+Arrow is the workspace tab-cycle shortcut - let it
      // pass through to the global handler in App.tsx.
      if (e.altKey) return;

      // ── Cmd/Ctrl+` -> toggle inline code (editor.inlineCode) ──
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
      // extending the selection with Shift - NOT move into the sections
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
}
