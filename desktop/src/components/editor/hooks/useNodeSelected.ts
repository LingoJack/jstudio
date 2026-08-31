/**
 * useNodeSelected — determine whether a NodeView is *genuinely* selected.
 *
 * Why this exists
 * ---------------
 * TipTap's built-in `NodeViewProps.selected` turns true whenever the editor
 * selection RANGE merely *contains* this node — e.g. a Cmd+Shift+Arrow (or
 * click-drag) text selection that sweeps across the block. That causes the
 * block's selected chrome (floating toolbar, selection ring, resize handle)
 * to flash on while the user is really just selecting neighbouring text —
 * the classic "I selected a sentence and the image below lit up too" bug.
 *
 * What this hook does
 * ------------------
 * Reports `true` ONLY for a real `NodeSelection` pointing exactly at this
 * node — the state where the toolbar should show, arrow/Backspace/Tab
 * navigation should apply, and the resize handle is meaningful. Any passing
 * text selection reports `false`.
 *
 * Usage
 * -----
 *   const selected = useNodeSelected(editor, getPos);
 *   // ...use `selected` instead of NodeViewProps.selected everywhere.
 *
 * Note: this re-subscribes on `editor` / `getPos` change. `getPos` from
 * NodeViewProps is a stable closure in practice, so this is cheap.
 */

import { useState, useEffect } from 'react';
import { NodeSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';

export function useNodeSelected(
  editor: Editor | null,
  getPos: NodeViewProps['getPos'],
): boolean {
  const [selected, setSelected] = useState(false);

  useEffect(() => {
    if (!editor) return;
    const compute = () => {
      const pos = typeof getPos === 'function' ? getPos() : null;
      const sel = editor.state.selection;
      setSelected(
        pos != null && sel instanceof NodeSelection && sel.from === pos,
      );
    };
    compute();
    editor.on('selectionUpdate', compute);
    return () => {
      editor.off('selectionUpdate', compute);
    };
  }, [editor, getPos]);

  return selected;
}
