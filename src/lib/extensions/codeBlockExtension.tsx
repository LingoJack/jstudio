/**
 * CodeBlockWithChrome — CodeBlockLowlight extension with a React NodeView.
 *
 * Adds a language selector (top-right) and a copy button (bottom-right,
 * hover-only) on top of CodeBlockLowlight's syntax highlighting.
 *
 * Resize model (unified with File / Image / Diagram blocks):
 *   width / widthPct  — figure width (px legacy / percentage of editor width)
 *   height / heightPct — body (or HTML preview) height (px legacy / pct of editor width)
 *
 * `maxHeightPct` is kept only for backward-compatible parsing of older
 * documents; the NodeView no longer applies it.
 */

import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Plugin, NodeSelection } from '@tiptap/pm/state';
import CodeBlockView from '../../components/editor/nodes/CodeBlockView';

export interface CodeBlockNodeAttributes {
  language?: string;
  /** HTML code blocks: whether the rendered (iframe) preview is shown instead of the source. */
  htmlPreview?: boolean;
  /** Legacy: maximum body height as a percentage of viewport height (0-100). Parsed for backward-compat only. */
  maxHeightPct?: number | null;
  /** Legacy pixel width (kept for backward-compat migration). */
  width?: number | null;
  /** Width as a percentage of the editor surface width (0-100). Preferred. */
  widthPct?: number | null;
  /** Legacy pixel height (kept for backward-compat migration). */
  height?: number | null;
  /** Height as a percentage of the editor surface width (0-100). Preferred. */
  heightPct?: number | null;
}

export const CodeBlockWithChrome = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      htmlPreview: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-html-preview') === 'true',
        renderHTML: (attrs) => {
          if (!attrs.htmlPreview) return {};
          return { 'data-html-preview': 'true' };
        },
      },
      maxHeightPct: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute('data-max-height-pct');
          return v ? Number(v) : null;
        },
        renderHTML: (attrs) => {
          if (attrs.maxHeightPct == null) return {};
          return { 'data-max-height-pct': attrs.maxHeightPct };
        },
      },
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute('data-width');
          return w ? Number(w) : null;
        },
        renderHTML: (attrs) => {
          if (!attrs.width) return {};
          return { 'data-width': attrs.width };
        },
      },
      widthPct: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute('data-width-pct');
          return v ? Number(v) : null;
        },
        renderHTML: (attrs) => {
          if (attrs.widthPct == null) return {};
          return { 'data-width-pct': attrs.widthPct };
        },
      },
      height: {
        default: null,
        parseHTML: (el) => {
          const h = el.getAttribute('data-height');
          return h ? Number(h) : null;
        },
        renderHTML: (attrs) => {
          if (!attrs.height) return {};
          return { 'data-height': attrs.height };
        },
      },
      heightPct: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute('data-height-pct');
          return v ? Number(v) : null;
        },
        renderHTML: (attrs) => {
          if (attrs.heightPct == null) return {};
          return { 'data-height-pct': attrs.heightPct };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },

  /**
   * Escape — cancel the code block's "focused / selected" state, mirroring how
   * Image / File blocks behave (their Escape is handled by useNodeToolbarNav).
   *
   * It covers two states (both require ProseMirror to hold focus):
   *   (a) the caret is editing inside a code block, or
   *   (b) the whole block is NodeSelection-selected (e.g. after clicking the
   *       HTML-preview overlay) — this is the "html 渲染时候" case.
   *
   * In either case we move the caret to just after the block, so the user
   * leaves the code/preview. If the code block is the last node (no block to
   * land in), we append an empty paragraph first.
   *
   * NOTE: a cross-origin sandboxed preview <iframe> that has grabbed DOM focus
   * cannot forward its Escape to us; this handler covers every case where the
   * editor itself still owns the keyboard.
   *
   * We spread `this.parent?.()` so CodeBlockLowlight's own shortcuts (Tab
   * indent, Backspace-exit, ArrowDown-exit, Mod-Enter, …) keep working.
   */
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Escape: () => {
        const { editor } = this;
        const { state } = editor;
        const nodeName = this.name;
        const { selection, doc } = state;

        let after: number | null = null;

        if (
          selection instanceof NodeSelection &&
          selection.node.type.name === nodeName
        ) {
          // (b) The code block node itself is selected.
          after = selection.to;
        } else {
          // (a) The caret is inside a code block — walk up the ancestors.
          const { $from } = selection;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === nodeName) {
              after = $from.after(d);
              break;
            }
          }
        }

        // Not in / on a code block — let other Escape handlers run.
        if (after == null) return false;

        // No block after the code block: append an empty paragraph to land in.
        if (after >= doc.content.size) {
          return editor
            .chain()
            .insertContentAt(after, { type: 'paragraph' })
            .setTextSelection(after + 1)
            .focus()
            .run();
        }

        return editor.chain().setTextSelection(after).focus().run();
      },
    };
  },

  /**
   * Triple-click anywhere inside a code block selects the WHOLE block as a
   * ProseMirror `NodeSelection` (shows the `.is-selected` ring). Once the node
   * itself is selected, the built-in `Backspace` / `Delete` keymap removes the
   * entire block in one keystroke — no extra handler needed.
   *
   * This is scoped to code blocks only: the handler bails out (returns false)
   * for any other node type, so other blocks keep their own behavior. We use
   * ProseMirror's `handleTripleClickOn` editor prop rather than counting DOM
   * `mousedown` events, so there is no mouseup race and no text-selection flash
   * (returning `true` consumes the event before the default text selection).
   *
   * NOTE: CodeBlockLowlight registers its own plugins (syntax highlighting),
   * so we MUST spread `this.parent?.()` to keep highlighting working.
   */
  addProseMirrorPlugins() {
    const nodeName = this.name;
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        props: {
          handleTripleClickOn(view, _pos, node, nodePos) {
            if (node.type.name !== nodeName) return false;
            const { state } = view;
            view.dispatch(
              state.tr.setSelection(NodeSelection.create(state.doc, nodePos)),
            );
            return true;
          },
        },
      }),
    ];
  },
});
