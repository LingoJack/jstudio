import { Extension } from "@tiptap/core";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { Plugin, PluginKey } from "@tiptap/pm/state";
const GapCursorValid = GapCursor.valid;
function isContentContainer(view, el) {
  if (!el || !view.dom.contains(el)) return false;
  if (el === view.dom) return true;
  for (let node = el; node && node !== view.dom; node = node.parentElement) {
    const desc = node.pmViewDesc;
    if (desc && desc.contentDOM === el) {
      if (desc.node?.type.isTextblock) return false;
      return true;
    }
  }
  return false;
}
function isValidGapCursorAt($pos) {
  if (GapCursorValid($pos)) return true;
  const parent = $pos.parent;
  if (parent.inlineContent) return false;
  const before = $pos.nodeBefore;
  const after = $pos.nodeAfter;
  const beforeNeedsGap = !!before && (before.isAtom || before.type.spec.isolating);
  const afterNeedsGap = !!after && (after.isAtom || after.type.spec.isolating);
  if (!beforeNeedsGap && !afterNeedsGap) return false;
  const defaultType = parent.contentMatchAt($pos.index()).defaultType;
  return !!(defaultType && defaultType.isTextblock);
}
const GapCursorClickFix = Extension.create({
  name: "gapCursorClickFix",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("gapCursorClickFix"),
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              if (!view.editable) return false;
              if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
                return false;
              }
              const el = document.elementFromPoint(
                event.clientX,
                event.clientY
              );
              if (!isContentContainer(view, el)) {
                return false;
              }
              const clickPos = view.posAtCoords({
                left: event.clientX,
                top: event.clientY
              });
              if (!clickPos) return false;
              const $pos = view.state.doc.resolve(clickPos.pos);
              if (isValidGapCursorAt($pos)) {
                view.dispatch(
                  view.state.tr.setSelection(new GapCursor($pos))
                );
                view.focus();
                event.preventDefault();
                return true;
              }
              if (clickPos.inside > -1) {
                const $insidePos = view.state.doc.resolve(
                  clickPos.inside
                );
                if (isValidGapCursorAt($insidePos)) {
                  view.dispatch(
                    view.state.tr.setSelection(
                      new GapCursor($insidePos)
                    )
                  );
                  view.focus();
                  event.preventDefault();
                  return true;
                }
              }
              if ($pos.parent.inlineContent && $pos.depth > 0) {
                const blockPos = $pos.before($pos.depth);
                const $blockPos = view.state.doc.resolve(blockPos);
                if (isValidGapCursorAt($blockPos)) {
                  view.dispatch(
                    view.state.tr.setSelection(
                      new GapCursor($blockPos)
                    )
                  );
                  view.focus();
                  event.preventDefault();
                  return true;
                }
              }
              return false;
            }
          }
        }
      })
    ];
  }
});
export {
  GapCursorClickFix
};
