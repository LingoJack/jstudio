function handleNativeSelectAll(e) {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "a") {
    e.preventDefault();
    const target = e.currentTarget;
    target.select?.();
    return true;
  }
  return false;
}
export {
  handleNativeSelectAll
};
