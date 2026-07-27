/**
 * MathBlockView - React NodeView for the math formula block.
 *
 * Interaction model:
 *   - When NOT selected: shows rendered KaTeX output (display mode).
 *   - When selected & empty: auto-enters edit mode with a textarea.
 *   - When selected & non-empty: shows rendered KaTeX; click to edit.
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
import katex from 'katex';

import { useNodeSelected } from '../hooks/useNodeSelected';

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

  // Sync draft from external latex changes when not editing
  useEffect(() => {
    if (!isEditing) setDraft(latex);
  }, [latex, isEditing]);

  // Auto-enter edit mode when the node is selected and has no formula yet
  useEffect(() => {
    if (selected && !latex && !isEditing) {
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
          onClick={() => setIsEditing(true)}
          dangerouslySetInnerHTML={{
            __html: renderedHtml || '<span class="math-block-placeholder">点击编辑公式</span>',
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
