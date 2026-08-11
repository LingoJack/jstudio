const REGISTRY = /* @__PURE__ */ new Map();
function registerTerminal(id, entry) {
  REGISTRY.set(id, entry);
}
function unregisterTerminal(id) {
  REGISTRY.delete(id);
}
function serializeSession(id) {
  const entry = REGISTRY.get(id);
  if (!entry) return "";
  try {
    return entry.serialize.serialize() + serializeMouseEncoding(entry.term);
  } catch {
    return "";
  }
}
function serializeMouseEncoding(term) {
  const encoding = term._core?.mouseStateService?.activeEncoding;
  switch (encoding) {
    case "SGR":
      return "\x1B[?1006h";
    case "SGR_PIXELS":
      return "\x1B[?1016h";
    default:
      return "";
  }
}
function __isRegistered(id) {
  return REGISTRY.has(id);
}
export {
  __isRegistered,
  registerTerminal,
  serializeSession,
  unregisterTerminal
};
