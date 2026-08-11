let focusedEditor = null;
function setFocusedEditor(editor) {
  focusedEditor = editor;
}
function clearFocusedEditor(editor) {
  if (focusedEditor === editor) {
    focusedEditor = null;
  }
}
function getFocusedEditor() {
  return focusedEditor;
}
export {
  clearFocusedEditor,
  getFocusedEditor,
  setFocusedEditor
};
