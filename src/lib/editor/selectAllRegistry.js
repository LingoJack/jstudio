let handler = null;
function registerSelectAllHandler(fn) {
  handler = fn;
}
function getSelectAllHandler() {
  return handler;
}
export {
  getSelectAllHandler,
  registerSelectAllHandler
};
