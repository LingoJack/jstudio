/**
 * FormatBubbleMenu — selection-triggered formatting toolbar.
 *
 * Shows a small floating toolbar above the current text selection with
 * toggles for Bold, Italic, Strike, and inline Code.
 *
 * The marks themselves are provided by StarterKit (Bold, Italic, Strike,
 * Code extensions). This component only renders the BubbleMenu UI.
 */

import { type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Bold, Italic, Strikethrough, Code } from 'lucide-react';

interface FormatBubbleMenuProps {
  editor: Editor;
}

export default function FormatBubbleMenu({ editor }: FormatBubbleMenuProps) {
  const isMarkActive = (markName: string) => editor.isActive(markName);
  const toggleMark = (markName: string) => {
    editor.chain().focus().toggleMark(markName).run();
  };

  const items = [
    { name: 'bold', label: '加粗', Icon: Bold },
    { name: 'italic', label: '斜体', Icon: Italic },
    { name: 'strike', label: '删除线', Icon: Strikethrough },
    { name: 'code', label: '行内代码', Icon: Code },
  ] as const;

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ state }) => {
        const { empty, from, to } = state.selection;
        if (empty || from === to) return false;

        // Walk every node covered by the selection.  If the range includes
        // any non-text block node (image / file / code-block), suppress the
        // menu.  Text inside paragraphs, headings, and table cells is fine.
        const blockedTypes = new Set(['image', 'fileBlock', 'codeBlock']);
        let hasNonText = false;

        state.doc.nodesBetween(from, to, (node) => {
          if (blockedTypes.has(node.type.name)) {
            hasNonText = true;
            return false; // stop traversing this branch
          }
          return true; // keep descending into children
        });

        return !hasNonText;
      }}
      className="bubble-menu"
    >
      {items.map(({ name, label, Icon }) => (
        <button
          key={name}
          type="button"
          title={label}
          aria-label={label}
          onMouseDown={(e) => {
            // Prevent the editor from losing selection when clicking the button
            e.preventDefault();
            toggleMark(name);
          }}
          className={`bubble-menu-btn ${isMarkActive(name) ? 'is-active' : ''}`}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </BubbleMenu>
  );
}
