/**
 * MathBlockView - React NodeView for the math formula block.
 *
 * Interaction model:
 *   - When NOT selected: shows rendered KaTeX output (display mode).
 *   - When selected (first time, empty): auto-enters edit mode so the user
 *     can immediately type after creating the block via slash menu.
 *   - When selected (subsequent times): shows rendered KaTeX with selection
 *     border. Backspace/Delete removes the block. Enter/double-click/second
 *     click enters edit mode.
 *   - Edit mode: textarea with live KaTeX preview; Esc / blur to commit.
 *
 * Data flow:
 *   - textarea input -> local draft state -> live preview
 *   - commit (blur/Esc) -> updateAttributes({ latex: draft })
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type NodeViewProps,
  NodeViewWrapper,
  type Editor,
} from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import katex from 'katex';

import { useNodeSelected } from '../hooks/useNodeSelected';
import { MATH_BLOCK_EDIT_EVENT } from '../../../lib/editor/extensions/mathBlockExtension';

export default function MathBlockView({
  node,
  updateAttributes,
  editor,
  getPos,
}: NodeViewProps) {
  const latex = (node.attrs?.latex as string) || '';
  const selected = useNodeSelected((editor as Editor | null) ?? null, getPos);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(latex);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** Whether this block has ever been edited (prevents re-auto-entering edit mode). */
  const hasBeenEdited = useRef(false);
  /** Whether the node was already selected at the moment of mousedown. */
  const wasSelectedAtMousedown = useRef(false);

  // Sync draft from external latex changes when not editing
  useEffect(() => {
    if (!isEditing) setDraft(latex);
  }, [latex, isEditing]);

  // Auto-enter edit mode only on the FIRST selection after creation
  // (so the user can immediately type after inserting via slash menu).
  // Subsequent selections keep the block in display mode so it can be
  // deleted with Backspace.
  useEffect(() => {
    if (selected && !latex && !isEditing && !hasBeenEdited.current) {
      setIsEditing(true);
    }
  }, [selected, latex, isEditing]);

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      autoResize(textareaRef.current);
    }
  }, [isEditing]);

  // Listen for the custom 'mathblock:edit' event (dispatched by the
  // Enter keyboard shortcut when the block has a NodeSelection).
  useEffect(() => {
    const editorDom = editor?.view.dom;
    if (!editorDom) return;

    const handleEdit = () => {
      const pos = typeof getPos === 'function' ? getPos() : null;
      if (pos == null) return;
      const sel = editor.state.selection;
      if (sel instanceof NodeSelection && sel.from === pos) {
        setIsEditing(true);
      }
    };

    editorDom.addEventListener(MATH_BLOCK_EDIT_EVENT, handleEdit);
    return () => {
      editorDom.removeEventListener(MATH_BLOCK_EDIT_EVENT, handleEdit);
    };
  }, [editor, getPos]);

  // Render KaTeX from the current draft (for live preview) or stored latex
  const renderedHtml = useMemo(() => {
    const source = isEditing ? draft : latex;
    if (!source.trim()) return '';
    try {
      return katex.renderToString(source, {
        displayMode: true,
        throwOnError: false,
        errorColor: '#cc0000',
        strict: false,
        trust: true,
      });
    } catch {
      return '<span style="color:#cc0000">渲染失败</span>';
    }
  }, [isEditing, draft, latex]);

  const commit = useCallback(() => {
    updateAttributes({ latex: draft });
    setIsEditing(false);
    hasBeenEdited.current = true;
  }, [draft, updateAttributes]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const el = e.currentTarget;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const next = draft.slice(0, start) + '  ' + draft.slice(end);
        setDraft(next);
        requestAnimationFrame(() => {
          el.selectionStart = el.selectionEnd = start + 2;
        });
      }
    },
    [commit, draft],
  );

  // Record whether the node was already selected at mousedown time.
  // This lets us distinguish "first click = select" from "second click = edit".
  const handleMouseDown = useCallback(() => {
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos != null && editor) {
      const sel = editor.state.selection;
      wasSelectedAtMousedown.current =
        sel instanceof NodeSelection && sel.from === pos;
    }
  }, [editor, getPos]);

  // If the node was already selected when the click started, enter edit mode.
  // Otherwise the click just selects the node (ProseMirror handles this).
  const handleClick = useCallback(() => {
    if (wasSelectedAtMousedown.current) {
      setIsEditing(true);
    }
  }, []);

  // Double-click always enters edit mode.
  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  return (
    <NodeViewWrapper className="math-block-wrapper" as="div" contentEditable={false}>
      {isEditing ? (
        <div className="math-block-editor" contentEditable={false}>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              autoResize(e.target);
            }}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            placeholder="输入 LaTeX 公式，如：x^2 + y^2 = r^2"
            className="math-block-textarea"
            rows={1}
            spellCheck={false}
          />
          {draft.trim() && (
            <div
              className="math-block-preview"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          )}
        </div>
      ) : (
        <div
          className={`math-block-display ${selected ? 'is-selected' : ''}`}
          contentEditable={false}
          onMouseDown={handleMouseDown}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          dangerouslySetInnerHTML={{
            __html:
              renderedHtml ||
              '<div class="math-block-placeholder"><span class="math-block-placeholder-icon">∑</span><span>点击编辑公式</span></div>',
          }}
        />
      )}
    </NodeViewWrapper>
  );
}

/** Auto-resize a textarea to fit its content. */
function autoResize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
