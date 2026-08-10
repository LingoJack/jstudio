/**
 * MathBlockView - React NodeView for the math formula block.
 *
 * Interaction model (consistent with ImageView / FileView / DiagramBlock):
 *   - Click display -> ProseMirror NodeSelection (via useNodeSelectionClick).
 *   - Selected -> BlockToolbar floats at top-center (align, edit, delete).
 *   - Tab / Shift+Tab -> cycle toolbar buttons; Enter -> enter edit mode;
 *     Escape -> deselect. (useNodeToolbarNav, interactive=true)
 *   - Double-click display -> enter edit mode (interactiveProps.onDoubleClick).
 *   - Edit mode: textarea with live KaTeX preview; Escape / click-outside to
 *     commit and exit.
 *   - Auto-enters edit mode on the FIRST selection after creation (empty
 *     latex) so the user can immediately type after inserting via slash menu.
 *
 * Data flow:
 *   - textarea input -> local draft state -> live preview
 *   - exit editing -> updateAttributes({ latex: draft })
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type NodeViewProps,
  NodeViewWrapper,
  type Editor,
} from '@tiptap/react';
import katex from 'katex';
import { Pencil, Trash2 } from 'lucide-react';

import { useNodeSelected } from '../hooks/useNodeSelected';
import { useNodeSelectionClick } from '../hooks/useNodeSelectionClick';
import { useNodeToolbarNav } from '../hooks/useNodeToolbarNav';
import {
  BlockToolbar,
  AlignButtonGroup,
  BlockToolbarButton,
  BlockToolbarDivider,
} from '../../ui/BlockToolbar';

/** Tags that should be shielded from ProseMirror's event interception. */
const SHIELD_TAGS = new Set(['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT']);

export default function MathBlockView({
  node,
  editor,
  getPos,
  updateAttributes,
  deleteNode,
}: NodeViewProps) {
  const latex = (node.attrs?.latex as string) || '';
  const align = (node.attrs?.align as 'left' | 'center' | null) ?? 'center';
  const effectiveAlign = align === 'left' ? 'left' : 'center';

  const [draft, setDraft] = useState(latex);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** Whether this block has ever been edited (prevents re-auto-entering edit mode). */
  const hasBeenEdited = useRef(false);
  /** Tracks the previous editing state to detect exit-editing transitions. */
  const prevEditing = useRef(false);

  /* -------------------------------------------------------------- */
  /* Selection + toolbar keyboard navigation                        */
  /* -------------------------------------------------------------- */

  const selected = useNodeSelected((editor as Editor | null) ?? null, getPos);

  // Toolbar: align(2) + edit + delete = 4
  const {
    activeIndex,
    registerButton,
    editing,
    enterEditing,
    exitEditing,
    interactiveRef,
    interactiveProps,
  } = useNodeToolbarNav(
    selected,
    (editor as Editor | null) ?? null,
    4,
    true,
  );

  const nav = { activeIndex, registerButton };

  const handleSelectMouseDown = useNodeSelectionClick(editor, getPos, {
    selected,
  });

  /* -------------------------------------------------------------- */
  /* Draft sync + focus management                                   */
  /* -------------------------------------------------------------- */

  // Sync draft from external latex changes when not editing
  useEffect(() => {
    if (!editing) setDraft(latex);
  }, [latex, editing]);

  // Auto-enter edit mode only on the FIRST selection after creation
  // (so the user can immediately type after inserting via slash menu).
  // Subsequent selections keep the block in display mode so it can be
  // deleted with Backspace.
  useEffect(() => {
    if (selected && !latex && !editing && !hasBeenEdited.current) {
      enterEditing();
    }
  }, [selected, latex, editing, enterEditing]);

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      autoResize(textareaRef.current);
    }
  }, [editing]);

  // Commit draft when exiting edit mode (covers Escape, click-outside, etc.)
  useEffect(() => {
    if (prevEditing.current && !editing) {
      updateAttributes({ latex: draft });
      hasBeenEdited.current = true;
    }
    prevEditing.current = editing;
  }, [editing, draft, updateAttributes]);

  /* -------------------------------------------------------------- */
  /* Caret shield (see LinkView for detailed explanation)            */
  /* -------------------------------------------------------------- */

  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const shield = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        SHIELD_TAGS.has(target.tagName) ||
        target.closest('textarea, input, button, a')
      ) {
        e.stopPropagation();
      }
    };

    el.addEventListener('mousedown', shield);
    return () => el.removeEventListener('mousedown', shield);
    // Re-bind whenever the host element is (re)created across states.
  }, [editing]);

  /** Merged ref for the editor host: hostRef + interactiveRef. */
  const setEditorHostRef = useCallback(
    (el: HTMLDivElement | null) => {
      hostRef.current = el;
      interactiveRef(el);
    },
    [interactiveRef],
  );

  /* -------------------------------------------------------------- */
  /* KaTeX rendering                                                 */
  /* -------------------------------------------------------------- */

  const renderedHtml = useMemo(() => {
    const source = editing ? draft : latex;
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
  }, [editing, draft, latex]);

  /* -------------------------------------------------------------- */
  /* Actions                                                         */
  /* -------------------------------------------------------------- */

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Tab: insert two spaces (Escape is handled by the hook's host listener)
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
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
    [draft],
  );

  const handleStartEdit = useCallback(() => {
    setDraft(latex);
    enterEditing();
  }, [latex, enterEditing]);

  const handleDelete = useCallback(() => deleteNode(), [deleteNode]);

  /* -------------------------------------------------------------- */
  /* Render                                                          */
  /* -------------------------------------------------------------- */

  return (
    <NodeViewWrapper
      className="math-block-wrapper"
      data-align={effectiveAlign}
      as="div"
      contentEditable={false}
    >
      {editing ? (
        /* ── Edit mode: textarea + live preview ── */
        <div
          ref={setEditorHostRef}
          className="math-block-editor"
          contentEditable={false}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              autoResize(e.target);
            }}
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
        /* ── Display mode: rendered KaTeX ── */
        <div
          ref={(el) => { hostRef.current = el; }}
          className={`math-block-display ${selected ? 'is-selected' : ''}`}
          contentEditable={false}
          onMouseDown={handleSelectMouseDown}
          {...interactiveProps}
        >
          <BlockToolbar selected={selected}>
            <AlignButtonGroup
              nav={nav}
              align={effectiveAlign}
              onAlignChange={(a) => updateAttributes({ align: a })}
            />
            <BlockToolbarDivider />
            <BlockToolbarButton
              index={2}
              nav={nav}
              title="Edit formula"
              onClick={handleStartEdit}
            >
              <Pencil size={15} />
            </BlockToolbarButton>
            <BlockToolbarButton
              index={3}
              nav={nav}
              title="Delete"
              onClick={handleDelete}
              className="block-toolbar-btn-danger"
            >
              <Trash2 size={15} />
            </BlockToolbarButton>
          </BlockToolbar>

          <div
            className="math-block-display-inner"
            dangerouslySetInnerHTML={{
              __html:
                renderedHtml ||
                '<div class="math-block-placeholder"><span class="math-block-placeholder-icon">∑</span><span>双击或按 Enter 编辑公式</span></div>',
            }}
          />
        </div>
      )}
    </NodeViewWrapper>
  );
}

/** Auto-resize a textarea to fit its content. */
function autoResize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
