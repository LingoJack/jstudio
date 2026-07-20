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
 *
 * -----------------------------------------------------------------------
 * INCREMENTAL LOWLIGHT PLUGIN
 * -----------------------------------------------------------------------
 * The official @tiptap/extension-code-block-lowlight ships a ProseMirror
 * plugin whose `apply` re-runs `lowlight.highlight()` synchronously on EVERY
 * code block in the document whenever the caret is inside one (or a block is
 * added/removed). Pasting into a document with N code blocks re-highlights
 * all N of them, even the ones that didn't change — a CPU spike that freezes
 * the UI for tens to hundreds of ms.
 *
 * We override `addProseMirrorPlugins` to drop the official plugin and install
 * an incremental one instead:
 *   - `apply` first maps the existing DecorationSet through the transaction
 *     (cheap, O(changed decorations)).
 *   - Then it re-highlights ONLY code blocks whose range intersects a
 *     `transaction.changedRanges()` entry; all other blocks keep their
 *     existing decorations.
 *   - Full re-highlight happens only once, on `init`.
 *
 * This makes paste / typing O(changed blocks) instead of O(all blocks).
 */

import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Plugin, PluginKey, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';
import { findChildren } from '@tiptap/core';
import CodeBlockView from '../../../components/editor/nodes/CodeBlockView';
import { GRAMMAR_ALIASES } from './lowlight';
import { enrichShellTokens } from './bashTokens';
import { blockBehaviorRegistry } from '../blockBehaviorRegistry';

export interface CodeBlockNodeAttributes {
  language?: string;
  /** HTML code blocks: whether the rendered (iframe) preview is shown instead of the source. */
  htmlPreview?: boolean;
  /** Mermaid code blocks: whether the rendered SVG diagram is shown instead of the source. */
  mermaidPreview?: boolean;
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

/* --------------------------------------------------------------------- */
/* Incremental Lowlight plugin internals                                  */
/* --------------------------------------------------------------------- */

/** Structural subset of a lowlight instance we depend on. */
interface LowlightLike {
  highlight(language: string, value: string): { value?: HlNode[]; children?: HlNode[] };
  highlightAuto(value: string): { value?: HlNode[]; children?: HlNode[] };
  listLanguages(): string[];
  registered?(language: string): boolean;
}

/** A node in lowlight / hljs's output tree. */
interface HlNode {
  properties?: { className?: string[] };
  children?: HlNode[];
  value?: string;
}

/** A located code block: { node, pos } as returned by findChildren. */
interface LocatedBlock {
  node: PmNode;
  pos: number;
}

/** Flattens lowlight's nested output tree into a flat list of {text, classes}. */
function parseHlNodes(
  nodes: HlNode[],
  className: string[] = [],
): { text: string; classes: string[] }[] {
  return nodes.flatMap((node) => {
    const classes = [...className, ...(node.properties?.className ?? [])];
    if (node.children) {
      return parseHlNodes(node.children, classes);
    }
    return { text: node.value ?? '', classes };
  });
}

/** Picks the highlighted node list out of a lowlight highlight result. */
function getHlNodes(result: { value?: HlNode[]; children?: HlNode[] }): HlNode[] {
  return result.value ?? result.children ?? [];
}

/**
 * Build ProseMirror inline decorations for a single code block.
 * `from` starts at block.pos + 1 to skip past the code block node itself
 * into its text content.
 */
function highlightBlockDecorations(
  block: LocatedBlock,
  lowlight: LowlightLike,
  defaultLanguage: string | null,
): Decoration[] {
  const decorations: Decoration[] = [];
  let from = block.pos + 1;
  // Resolve the stored/selected language to the grammar we can actually run
  // (e.g. `shell` → `bash`, `html` → `xml`). Keeps the user-facing badge as-is
  // while ensuring the content is highlighted with the nearest real grammar.
  const rawLang = (block.node.attrs?.language as string | undefined) || defaultLanguage;
  const language = (rawLang && GRAMMAR_ALIASES[rawLang]) || rawLang;

  let nodes: HlNode[];
  try {
    const isRegistered =
      language &&
      (lowlight.listLanguages().includes(language) || lowlight.registered?.(language));
    if (isRegistered) {
      nodes = getHlNodes(lowlight.highlight(language as string, block.node.textContent));
    } else {
      nodes = getHlNodes(lowlight.highlightAuto(block.node.textContent));
    }
  } catch {
    // Defensive: if highlight throws (e.g. bad grammar), fall back to auto.
    nodes = getHlNodes(lowlight.highlightAuto(block.node.textContent));
  }

  // Flatten the lowlight tree, then — for shell content — re-tokenize the
  // plain (uncoloured) segments so operators / flags / variable expansions /
  // command substitution also get colour. Segments hljs already coloured are
  // left untouched.
  let segments = parseHlNodes(nodes);
  if (language === 'bash') segments = enrichShellTokens(segments);

  segments.forEach((node) => {
    const to = from + node.text.length;
    if (node.classes.length) {
      decorations.push(Decoration.inline(from, to, { class: node.classes.join(' ') }));
    }
    from = to;
  });
  return decorations;
}

/** Plugin key shared between the plugin and its `decorations` prop. */
const lowlightPluginKey = new PluginKey<DecorationSet>('lowlight');

/**
 * Build the incremental Lowlight ProseMirror plugin.
 *
 * State (a DecorationSet) is updated incrementally per transaction:
 *   1. Map the existing set through the transaction (cheap).
 *   2. If the doc changed, find code blocks whose range intersects any
 *      `transaction.changedRanges()` entry.
 *   3. For each affected block: remove its old decorations, re-highlight,
 *      and add the new decorations back.
 * Blocks that didn't change keep their decorations untouched — no
 * `lowlight.highlight()` call for them.
 */
function createIncrementalLowlightPlugin(opts: {
  name: string;
  lowlight: LowlightLike;
  defaultLanguage: string | null;
}): Plugin {
  const { name, lowlight, defaultLanguage } = opts;

  return new Plugin<DecorationSet>({
    key: lowlightPluginKey,
    state: {
      // Full highlight once on init — unavoidable, but only once.
      init: (_config, { doc }) => {
        const decorations: Decoration[] = [];
        findChildren(doc, (node) => node.type.name === name).forEach((block) => {
          decorations.push(...highlightBlockDecorations(block, lowlight, defaultLanguage));
        });
        return DecorationSet.create(doc, decorations);
      },
      apply: (transaction, oldDecoSet, _oldState, newState) => {
        // 1. Always map the existing decoration set through the transaction.
        // This keeps decorations aligned with moved/inserted/deleted text and
        // automatically drops decorations whose positions no longer exist.
        let decoSet = oldDecoSet.map(transaction.mapping, newState.doc);

        // No document content change → selection-only transaction. Mapping
        // already handled everything; return as-is.
        if (!transaction.docChanged) return decoSet;

        // 2. Find which code blocks were actually touched.
        //
        // `changedRange()` returns the single (merged) span that covers all
        // document changes, in the NEW document's coordinate system. For a
        // paste inside one block this is just that block's range, so only it
        // gets re-highlighted. For a full-doc replace (e.g. setContent / doc
        // switch) it expands to cover everything — the correct full re-highlight
        // fallback. We then walk the new doc only inside that span, which is
        // far cheaper than scanning the whole document every transaction.
        const changed = transaction.changedRange();
        if (!changed) return decoSet;
        const { from, to } = changed;

        // Collect affected code blocks, keyed by their document position so
        // a block intersecting multiple changed ranges is only re-highlighted
        // once.
        const affected = new Map<number, LocatedBlock>();
        newState.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type.name === name) {
            affected.set(pos, { node, pos });
          }
          return true;
        });

        if (affected.size === 0) return decoSet;

        // 3. For each affected block: drop its old decorations, re-highlight,
        //    and add the fresh ones back.
        affected.forEach((block) => {
          const blockStart = block.pos;
          const blockEnd = block.pos + block.node.nodeSize;
          // find() returns decorations whose ranges intersect [start, end].
          const oldDecos = decoSet.find(blockStart + 1, blockEnd - 1);
          if (oldDecos.length) decoSet = decoSet.remove(oldDecos);

          const newDecos = highlightBlockDecorations(block, lowlight, defaultLanguage);
          if (newDecos.length) decoSet = decoSet.add(newState.doc, newDecos);
        });

        return decoSet;
      },
    },
    props: {
      decorations(state) {
        return lowlightPluginKey.getState(state);
      },
    },
  });
}

/* --------------------------------------------------------------------- */

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
      mermaidPreview: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-mermaid-preview') === 'true',
        renderHTML: (attrs) => {
          if (!attrs.mermaidPreview) return {};
          return { 'data-mermaid-preview': 'true' };
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
      // Enter inside a code block inserts a newline ("\n") and stays inside
      // the block. The base CodeBlock extension's Enter handler only acts
      // when `exitOnTripleEnter` is true (to detect triple-Enter exit); with
      // it disabled (our config) it returns false and ProseMirror's default
      // splitBlock takes over, which splits/converts the block and ejects
      // the cursor out of the code block. We explicitly insert "\n" so Enter
      // never leaves the block. Users exit via Escape / ArrowDown (last
      // line) / Mod-Enter / clicking outside, matching the existing design
      // (exitOnTripleEnter is intentionally disabled).
      Enter: ({ editor }) => {
        const { selection } = editor.state;
        const { $from, empty } = selection;
        if (!empty || $from.parent.type.name !== this.name) return false;
        // Insert a newline and explicitly place the caret AFTER it (start of
        // the new line). Use TipTap's command pipeline (not raw view.dispatch)
        // so state synchronization and the editor's own update cycle run in
        // the correct order — raw dispatch from inside a keymap shortcut can
        // leave the DOM caret out of sync with the PM selection (caret
        // visually lags one position behind). scrollIntoView keeps the new
        // line on screen.
        return editor.commands.command(({ tr }) => {
          const pos = $from.pos;
          tr.insertText('\n', pos);
          tr.setSelection(TextSelection.create(tr.doc, pos + 1));
          tr.scrollIntoView();
          return true;
        });
      },
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
   * ProseMirror plugins.
   *
   * We intentionally do NOT spread `this.parent?.()` here, because the parent
   * (CodeBlockLowlight) only registers the official full-document Lowlight
   * plugin, and we are replacing it with our incremental variant above.
   * (CodeBlockLowlight's base class — `CodeBlock` — registers no ProseMirror
   * plugins of its own; it uses inputRules / keyboardShortcuts instead, which
   * are unaffected by this override.)
   *
   * The triple-click handler below is preserved unchanged.
   */
  addProseMirrorPlugins() {
    const nodeName = this.name;
    const lowlight = this.options.lowlight as LowlightLike;
    const defaultLanguage = (this.options.defaultLanguage as string | null) ?? null;

    return [
      createIncrementalLowlightPlugin({
        name: nodeName,
        lowlight,
        defaultLanguage,
      }),
      /**
       * Triple-click anywhere inside a code block selects the WHOLE block as a
       * ProseMirror `NodeSelection` (shows the `.is-selected` ring). Once the
       * node itself is selected, the built-in `Backspace` / `Delete` keymap
       * removes the entire block in one keystroke — no extra handler needed.
       *
       * This is scoped to code blocks only: the handler bails out (returns
       * false) for any other node type, so other blocks keep their own
       * behavior. We use ProseMirror's `handleTripleClickOn` editor prop rather
       * than counting DOM `mousedown` events, so there is no mouseup race and
       * no text-selection flash (returning `true` consumes the event before
       * the default text selection).
       */
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

/* --------------------------------------------------------------------- */
/* BlockBehaviorRegistry — delete empty codeBlock on Backspace          */
/* --------------------------------------------------------------------- */

/**
 * Register deletion behavior for codeBlock.
 *
 * When the user presses Backspace inside an EMPTY code block (content.size === 0),
 * delete the whole block instead of leaving a ghost empty block.
 */
blockBehaviorRegistry.register({
  nodeType: 'codeBlock',
  canDelete: (editor, $head) => {
    // Only delete when inside an empty code block
    const parent = $head.parent;
    if (parent.type.name !== 'codeBlock') return false;
    // content.size === 0 means completely empty (no text)
    return parent.content.size === 0;
  },
  delete: (editor, $head) => {
    // Find the code block's position and delete it
    const blockPos = $head.before(1);
    editor
      .chain()
      .focus()
      .setNodeSelection(blockPos)
      .deleteSelection()
      .run();
    return true;
  },
});
