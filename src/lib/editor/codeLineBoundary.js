function logicalCodeLineBoundary(text, offset, toStart) {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  if (toStart) {
    const previousNewline = safeOffset > 0 ? text.lastIndexOf("\n", safeOffset - 1) : -1;
    return previousNewline === -1 ? 0 : previousNewline + 1;
  }
  const nextNewline = text.indexOf("\n", safeOffset);
  return nextNewline === -1 ? text.length : nextNewline;
}
function visualCodeLineBoundary(editor, head, blockStart, blockEnd, toStart) {
  const { view } = editor;
  const nativeSelection = view.dom.ownerDocument.getSelection();
  if (!nativeSelection || typeof nativeSelection.modify !== "function" || typeof nativeSelection.setBaseAndExtent !== "function" || !nativeSelection.anchorNode || !nativeSelection.focusNode || !view.dom.contains(nativeSelection.focusNode)) {
    return null;
  }
  const saved = {
    anchorNode: nativeSelection.anchorNode,
    anchorOffset: nativeSelection.anchorOffset,
    focusNode: nativeSelection.focusNode,
    focusOffset: nativeSelection.focusOffset,
    range: nativeSelection.rangeCount > 0 ? nativeSelection.getRangeAt(0).cloneRange() : null
  };
  try {
    const nativeHead = view.posAtDOM(saved.focusNode, saved.focusOffset);
    if (nativeHead !== head) return null;
    nativeSelection.collapse(saved.focusNode, saved.focusOffset);
    nativeSelection.modify("move", toStart ? "left" : "right", "lineboundary");
    const focusNode = nativeSelection.focusNode;
    if (!focusNode || !view.dom.contains(focusNode)) return null;
    const mapped = view.posAtDOM(
      focusNode,
      nativeSelection.focusOffset,
      toStart ? -1 : 1
    );
    return mapped >= blockStart && mapped <= blockEnd ? mapped : null;
  } catch {
    return null;
  } finally {
    try {
      nativeSelection.setBaseAndExtent(
        saved.anchorNode,
        saved.anchorOffset,
        saved.focusNode,
        saved.focusOffset
      );
    } catch {
      nativeSelection.removeAllRanges();
      if (saved.range) nativeSelection.addRange(saved.range);
    }
  }
}
export {
  logicalCodeLineBoundary,
  visualCodeLineBoundary
};
