let _active = false;
function setPlainTextPaste() {
  _active = true;
}
function isPlainTextPaste() {
  return _active;
}
function consumePlainTextPaste() {
  const v = _active;
  _active = false;
  return v;
}
if (typeof window !== "undefined") {
  window.__setPlainTextPaste = setPlainTextPaste;
}
export {
  consumePlainTextPaste,
  isPlainTextPaste,
  setPlainTextPaste
};
