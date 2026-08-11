function editorForKeyboardTarget(target, editors) {
  const node = target instanceof Node ? target : null;
  const element = node instanceof Element ? node : node?.parentElement;
  if (!element) return null;
  if (element.closest('input, textarea, select, button, [contenteditable="false"]')) {
    return null;
  }
  const editorDom = element.closest("[data-section-id]");
  const sectionId = editorDom?.dataset.sectionId;
  if (!editorDom || !sectionId) return null;
  const editor = editors.get(sectionId);
  if (!editor || editor.isDestroyed || editor.view.dom !== editorDom) return null;
  return editorDom.contains(node) ? editor : null;
}
export {
  editorForKeyboardTarget
};
