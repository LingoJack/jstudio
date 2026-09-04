/**
 * InlineMathView - React NodeView for the inline LaTeX formula atom.
 *
 * Interaction model (compact inline counterpart of MathBlockView):
 *   - Display mode: KaTeX inline rendering. Click selects the node (via
 *     useNodeSelectionClick on mousedown) and enters edit mode on the
 *     subsequent click event. The split matters: useNodeSelectionClick's
 *     mouseup handler calls view.focus() (activeElement == view.dom), so
 *     entering edit on mousedown would have the input immediately blurred;
 *     onClick fires after that handoff and the input keeps focus.
 *   - Edit mode: single-line input sized to the LaTeX source. Enter commits
 *     and exits; Escape reverts and exits; blur commits (same "commit on
 *     exit" contract as MathBlockView).
 *   - Auto-enters edit mode on the FIRST selection after insertion with
 *     empty latex (mirrors MathBlockView) so the slash-menu flow lands the
 *     user directly in the input. This path has no mouse press, so the
 *     focus handoff above does not apply.
 *
 * Events from the form controls never reach ProseMirror: tiptap's NodeView
 * stopEvent returns true for INPUT/TEXTAREA/BUTTON/SELECT targets inside
 * contentEditable=false node views.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Editor,
  type NodeViewProps,
  NodeViewWrapper,
} from "@tiptap/react";
import katex from "katex";

import { useNodeSelected } from "../hooks/useNodeSelected";
import { useNodeSelectionClick } from "../hooks/useNodeSelectionClick";

/** Input width in ch units: latex length + editing headroom, bounded below. */
const INLINE_MATH_INPUT_MIN_CH = 12;
const INLINE_MATH_INPUT_PAD_CH = 4;

export default function InlineMathView({
  node,
  editor,
  getPos,
  updateAttributes,
}: NodeViewProps) {
  const latex = (node.attrs?.latex as string) || "";

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(latex);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Prevents re-auto-entering edit mode after the first edit. */
  const hasBeenEdited = useRef(false);
  /** Detects exit-editing transitions to commit the draft. */
  const prevEditing = useRef(false);

  const selected = useNodeSelected(editor ?? null, getPos);
  const handleSelectMouseDown = useNodeSelectionClick(editor, getPos, {
    selected,
  });

  // Sync draft from external latex changes when not editing (e.g. undo).
  useEffect(() => {
    if (!editing) setDraft(latex);
  }, [latex, editing]);

  const enterEditing = useCallback(() => {
    setDraft(latex);
    setEditing(true);
  }, [latex]);

  const exitEditing = useCallback(() => {
    setEditing(false);
  }, []);

  // Auto-enter edit mode on the FIRST selection after insertion (empty
  // latex, slash-menu insert selects the node). Skipped once edited.
  useEffect(() => {
    if (selected && !latex && !editing && !hasBeenEdited.current) {
      setDraft("");
      setEditing(true);
    }
  }, [selected, latex, editing]);

  // Focus the input when entering edit mode (runs after any view.focus()
  // handoff from the click path, since React effects run post-event).
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Commit on exit (Enter, blur, click-away). Escape reverts first.
  useEffect(() => {
    if (prevEditing.current && !editing) {
      updateAttributes({ latex: draft });
      hasBeenEdited.current = true;
    }
    prevEditing.current = editing;
  }, [editing, draft, updateAttributes]);

  const renderedHtml = useMemo(() => {
    const source = editing ? draft : latex;
    if (!source.trim()) return "";
    try {
      return katex.renderToString(source, {
        displayMode: false,
        throwOnError: false,
        errorColor: "#cc0000",
        strict: false,
        trust: true,
      });
    } catch {
      return '<span style="color:#cc0000">渲染失败</span>';
    }
  }, [editing, draft, latex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter") {
        e.preventDefault();
        exitEditing();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setDraft(latex);
        exitEditing();
      }
    },
    [latex, exitEditing],
  );

  return (
    <NodeViewWrapper
      as="span"
      className="inline-math-wrapper"
      contentEditable={false}
    >
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={exitEditing}
          spellCheck={false}
          placeholder="LaTeX"
          aria-label="LaTeX formula"
          className="inline-math-input"
          style={{
            width: `${Math.max(INLINE_MATH_INPUT_MIN_CH, draft.length + INLINE_MATH_INPUT_PAD_CH)}ch`,
          }}
        />
      ) : (
        <span
          className={`inline-math ${selected ? "is-selected" : ""} ${latex ? "" : "is-empty"}`}
          contentEditable={false}
          onMouseDown={handleSelectMouseDown}
          onClick={enterEditing}
          title={latex || "输入 LaTeX 公式"}
        >
          {renderedHtml ? (
            <span dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          ) : (
            <span className="inline-math-placeholder">∑</span>
          )}
        </span>
      )}
    </NodeViewWrapper>
  );
}
