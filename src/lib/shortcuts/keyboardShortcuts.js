const SHORTCUTS = [
  // ── General ──
  {
    id: "app.commandPalette",
    category: "general",
    scope: "global",
    defaultBinding: "mod+p",
    customizable: true,
    labelKey: "shortcut.app.commandPalette",
    descKey: "shortcut.app.commandPalette.desc"
  },
  {
    id: "app.newDocument",
    category: "general",
    scope: "global",
    defaultBinding: "mod+n",
    customizable: true,
    labelKey: "shortcut.app.newDocument",
    descKey: "shortcut.app.newDocument.desc"
  },
  {
    id: "app.toggleSidebar",
    category: "general",
    scope: "global",
    defaultBinding: "mod+b",
    customizable: true,
    labelKey: "shortcut.app.toggleSidebar",
    descKey: "shortcut.app.toggleSidebar.desc"
  },
  {
    id: "app.toggleOutline",
    category: "general",
    scope: "global",
    defaultBinding: "mod+shift+o",
    customizable: true,
    labelKey: "shortcut.app.toggleOutline",
    descKey: "shortcut.app.toggleOutline.desc"
  },
  {
    id: "app.openSettings",
    category: "general",
    scope: "global",
    defaultBinding: "mod+,",
    customizable: true,
    labelKey: "shortcut.app.openSettings",
    descKey: "shortcut.app.openSettings.desc"
  },
  {
    id: "app.find",
    category: "general",
    scope: "global",
    defaultBinding: "mod+f",
    customizable: true,
    labelKey: "shortcut.app.find",
    descKey: "shortcut.app.find.desc"
  },
  // ── Navigation ──
  {
    id: "app.goToDocuments",
    category: "navigation",
    scope: "global",
    defaultBinding: "",
    customizable: true,
    labelKey: "shortcut.app.goToDocuments",
    descKey: "shortcut.app.goToDocuments.desc"
  },
  {
    id: "app.goToTerminal",
    category: "navigation",
    scope: "global",
    defaultBinding: "",
    customizable: true,
    labelKey: "shortcut.app.goToTerminal",
    descKey: "shortcut.app.goToTerminal.desc"
  },
  // ── Workspace · Tabs ──
  {
    id: "app.cycleTabLeft",
    category: "navigation",
    scope: "global",
    defaultBinding: "mod+alt+arrowleft",
    customizable: true,
    labelKey: "shortcut.app.cycleTabLeft",
    descKey: "shortcut.app.cycleTabLeft.desc"
  },
  {
    id: "app.cycleTabRight",
    category: "navigation",
    scope: "global",
    defaultBinding: "mod+alt+arrowright",
    customizable: true,
    labelKey: "shortcut.app.cycleTabRight",
    descKey: "shortcut.app.cycleTabRight.desc"
  },
  {
    id: "app.closeTab",
    category: "navigation",
    scope: "global",
    defaultBinding: "mod+w",
    customizable: true,
    labelKey: "shortcut.app.closeTab",
    descKey: "shortcut.app.closeTab.desc"
  },
  // ── Document ──
  {
    id: "app.importMarkdown",
    category: "general",
    scope: "global",
    defaultBinding: "",
    customizable: true,
    labelKey: "shortcut.app.importMarkdown",
    descKey: "shortcut.app.importMarkdown.desc"
  },
  // ── Appearance ──
  {
    id: "app.toggleDarkMode",
    category: "appearance",
    scope: "global",
    defaultBinding: "",
    customizable: true,
    labelKey: "shortcut.app.toggleDarkMode",
    descKey: "shortcut.app.toggleDarkMode.desc"
  },
  {
    id: "app.setDarkTheme",
    category: "appearance",
    scope: "global",
    defaultBinding: "",
    customizable: true,
    labelKey: "shortcut.app.setDarkTheme",
    descKey: "shortcut.app.setDarkTheme.desc"
  },
  {
    id: "app.setLightTheme",
    category: "appearance",
    scope: "global",
    defaultBinding: "",
    customizable: true,
    labelKey: "shortcut.app.setLightTheme",
    descKey: "shortcut.app.setLightTheme.desc"
  },
  {
    id: "app.setSystemTheme",
    category: "appearance",
    scope: "global",
    defaultBinding: "",
    customizable: true,
    labelKey: "shortcut.app.setSystemTheme",
    descKey: "shortcut.app.setSystemTheme.desc"
  },
  // ── Terminal · Tabs ──
  // (cycleTabLeft/Right and closeTab are now global workspace shortcuts:
  //  app.cycleTabLeft, app.cycleTabRight, app.closeTab)
  // Cmd+T is handled by the native menu (id "app.newTab") which dispatches
  // context-aware: terminal view -> new terminal session, otherwise -> open
  // document dialog. terminal.newTab is kept for customization but unbound
  // from the DOM (the menu intercepts Cmd+T before the DOM keydown fires).
  {
    id: "terminal.newTab",
    category: "terminal-tabs",
    scope: "terminal",
    defaultBinding: "",
    customizable: true,
    labelKey: "shortcut.terminal.newTab"
  },
  {
    id: "terminal.detachTab",
    category: "terminal-tabs",
    scope: "terminal",
    defaultBinding: "mod+shift+d",
    customizable: true,
    labelKey: "shortcut.terminal.detachTab"
  },
  // ── Document · Open ──
  // Cmd+T is intercepted by the native menu (id "app.newTab"). The menu emits
  // a `native-command` which the ShortcutManager dispatches via commandRegistry.
  // The DOM keydown handler also matches this as a fallback (e.g. if the menu
  // doesn't intercept on some platforms).
  {
    id: "app.newTab",
    category: "general",
    scope: "global",
    defaultBinding: "mod+t",
    customizable: true,
    labelKey: "shortcut.app.newTab",
    descKey: "shortcut.app.newTab.desc"
  },
  // ── Terminal · Panes ──
  {
    id: "terminal.splitPane",
    category: "terminal-panes",
    scope: "terminal",
    defaultBinding: "mod+enter",
    customizable: true,
    labelKey: "shortcut.terminal.splitPane"
  },
  {
    id: "terminal.closePane",
    category: "terminal-panes",
    scope: "terminal",
    defaultBinding: "mod+shift+w",
    customizable: true,
    labelKey: "shortcut.terminal.closePane"
  },
  {
    id: "terminal.focusPrevPane",
    category: "terminal-panes",
    scope: "terminal",
    defaultBinding: "mod+arrowleft",
    customizable: true,
    labelKey: "shortcut.terminal.focusPrevPane"
  },
  {
    id: "terminal.focusNextPane",
    category: "terminal-panes",
    scope: "terminal",
    defaultBinding: "mod+arrowright",
    customizable: true,
    labelKey: "shortcut.terminal.focusNextPane"
  },
  {
    id: "terminal.cycleLayout",
    category: "terminal-panes",
    scope: "terminal",
    defaultBinding: "mod+shift+l",
    customizable: true,
    labelKey: "shortcut.terminal.cycleLayout"
  },
  {
    id: "terminal.movePane",
    category: "terminal-panes",
    scope: "terminal",
    defaultBinding: "mod+shift+f",
    customizable: true,
    labelKey: "shortcut.terminal.movePane"
  },
  // ── Editor · Blocks ──
  {
    id: "editor.insertBlockBelow",
    category: "editor-blocks",
    scope: "editor",
    defaultBinding: "mod+enter",
    customizable: true,
    labelKey: "shortcut.editor.insertBlockBelow"
  },
  {
    id: "editor.insertBlockAbove",
    category: "editor-blocks",
    scope: "editor",
    defaultBinding: "mod+shift+enter",
    customizable: true,
    labelKey: "shortcut.editor.insertBlockAbove"
  },
  {
    id: "editor.inlineCode",
    category: "editor-blocks",
    scope: "editor",
    defaultBinding: "mod+`",
    customizable: true,
    labelKey: "shortcut.editor.inlineCode"
  }
];
const REFERENCE_SHORTCUTS = [
  {
    category: "shortcut.ref.editorFormatting",
    items: [
      { labelKey: "shortcut.ref.bold", binding: "mod+b" },
      { labelKey: "shortcut.ref.italic", binding: "mod+i" },
      { labelKey: "shortcut.ref.underline", binding: "mod+u" },
      { labelKey: "shortcut.ref.strikethrough", binding: "mod+shift+s" },
      { labelKey: "shortcut.ref.undo", binding: "mod+z" },
      { labelKey: "shortcut.ref.redo", binding: "mod+shift+z" },
      { labelKey: "shortcut.ref.selectAll", binding: "mod+a" }
    ]
  },
  {
    category: "shortcut.ref.markdown",
    items: [
      { labelKey: "shortcut.ref.heading1", display: "# " },
      { labelKey: "shortcut.ref.heading2", display: "## " },
      { labelKey: "shortcut.ref.heading3", display: "### " },
      { labelKey: "shortcut.ref.quote", display: "> " },
      { labelKey: "shortcut.ref.bulletList", display: "- " },
      { labelKey: "shortcut.ref.orderedList", display: "1. " },
      { labelKey: "shortcut.ref.codeBlock", display: "``` " },
      { labelKey: "shortcut.ref.divider", display: "---" }
    ]
  }
];
const MODIFIER_KEYS = /* @__PURE__ */ new Set([
  "shift",
  "control",
  "alt",
  "meta",
  "altgraph",
  "fn",
  "capslock"
]);
function normalizeKey(e) {
  const key = e.key;
  if (MODIFIER_KEYS.has(key.toLowerCase())) return null;
  const specialMap = {
    "Enter": "enter",
    "Backspace": "backspace",
    "Tab": "tab",
    "Escape": "escape",
    "Delete": "delete",
    "Insert": "insert",
    "Home": "home",
    "End": "end",
    "PageUp": "pageup",
    "PageDown": "pagedown",
    "ArrowUp": "arrowup",
    "ArrowDown": "arrowdown",
    "ArrowLeft": "arrowleft",
    "ArrowRight": "arrowright",
    " ": "space"
  };
  if (specialMap[key]) return specialMap[key];
  if (key.length === 1) return key.toLowerCase();
  if (e.code) {
    const code = e.code.toLowerCase();
    if (code.startsWith("key")) return code.slice(3);
    if (code.startsWith("digit")) return code.slice(5);
  }
  return key.toLowerCase();
}
function eventToBinding(e) {
  if (e.isComposing || e.keyCode === 229) return null;
  const key = normalizeKey(e);
  if (!key) return null;
  const parts = [];
  if (e.metaKey || e.ctrlKey) parts.push("mod");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const DISPLAY_MAP = {
  mod: isMac ? "\u2318" : "Ctrl",
  alt: isMac ? "\u2325" : "Alt",
  shift: isMac ? "\u21E7" : "Shift",
  enter: isMac ? "\u21B5" : "Enter",
  backspace: isMac ? "\u232B" : "Backspace",
  tab: isMac ? "\u21E5" : "Tab",
  escape: isMac ? "\u238B" : "Esc",
  delete: isMac ? "\u2326" : "Del",
  space: isMac ? "\u2423" : "Space",
  arrowup: "\u2191",
  arrowdown: "\u2193",
  arrowleft: "\u2190",
  arrowright: "\u2192",
  home: "Home",
  end: "End",
  pageup: isMac ? "\u21DE" : "PgUp",
  pagedown: isMac ? "\u21DF" : "PgDn"
};
function bindingToDisplay(binding) {
  const parts = binding.split("+");
  return parts.map((part) => {
    if (DISPLAY_MAP[part]) return DISPLAY_MAP[part];
    if (part.length === 1) return part.toUpperCase();
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join(" ");
}
function resolveBinding(id, overrides) {
  const def = SHORTCUTS.find((s) => s.id === id);
  if (!def) return "";
  if (overrides && id in overrides) {
    return overrides[id];
  }
  return def.defaultBinding;
}
function detectConflicts(overrides) {
  const scopeMap = /* @__PURE__ */ new Map();
  for (const def of SHORTCUTS) {
    const binding = resolveBinding(def.id, overrides);
    if (!binding) continue;
    let scopeBindings = scopeMap.get(def.scope);
    if (!scopeBindings) {
      scopeBindings = /* @__PURE__ */ new Map();
      scopeMap.set(def.scope, scopeBindings);
    }
    let defs = scopeBindings.get(binding);
    if (!defs) {
      defs = [];
      scopeBindings.set(binding, defs);
    }
    defs.push(def);
  }
  const conflicts = /* @__PURE__ */ new Map();
  for (const scopeBindings of scopeMap.values()) {
    for (const [binding, defs] of scopeBindings) {
      if (defs.length > 1) {
        conflicts.set(binding, defs);
      }
    }
  }
  return conflicts;
}
function checkBindingConflict(binding, scope, excludeId, overrides) {
  for (const def of SHORTCUTS) {
    if (def.id === excludeId) continue;
    if (def.scope !== scope) continue;
    const otherBinding = resolveBinding(def.id, overrides);
    if (!otherBinding) continue;
    if (otherBinding === binding) return def;
  }
  return null;
}
function toTauriAccelerator(binding) {
  if (!binding) return null;
  const keyMap = {
    mod: "CmdOrCtrl",
    alt: "Alt",
    shift: "Shift",
    enter: "Enter",
    backspace: "Backspace",
    tab: "Tab",
    escape: "Escape",
    delete: "Delete",
    insert: "Insert",
    home: "Home",
    end: "End",
    pageup: "PageUp",
    pagedown: "PageDown",
    arrowup: "ArrowUp",
    arrowdown: "ArrowDown",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight",
    space: "Space"
  };
  return binding.split("+").map((part) => keyMap[part] ?? (part.length === 1 ? part.toUpperCase() : part)).join("+");
}
function toTiptapBinding(binding) {
  const TIPTAP_KEY_MAP = {
    enter: "Enter",
    backspace: "Backspace",
    tab: "Tab",
    escape: "Escape",
    delete: "Delete",
    space: "Space",
    arrowup: "ArrowUp",
    arrowdown: "ArrowDown",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight",
    home: "Home",
    end: "End",
    pageup: "PageUp",
    pagedown: "PageDown"
  };
  return binding.split("+").map((part) => {
    if (part === "mod") return "Mod";
    if (part === "alt") return "Alt";
    if (part === "shift") return "Shift";
    if (TIPTAP_KEY_MAP[part]) return TIPTAP_KEY_MAP[part];
    if (part.length === 1) return part.toUpperCase();
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join("-");
}
const CATEGORY_ORDER = [
  "general",
  "navigation",
  "appearance",
  "terminal-tabs",
  "terminal-panes",
  "editor-blocks"
];
const CATEGORY_LABEL_KEYS = {
  general: "shortcut.category.general",
  navigation: "shortcut.category.navigation",
  appearance: "shortcut.category.appearance",
  "terminal-tabs": "shortcut.category.terminalTabs",
  "terminal-panes": "shortcut.category.terminalPanes",
  "editor-blocks": "shortcut.category.editorBlocks"
};
function getShortcutsByCategory() {
  const map = /* @__PURE__ */ new Map();
  for (const cat of CATEGORY_ORDER) {
    map.set(cat, []);
  }
  for (const def of SHORTCUTS) {
    map.get(def.category)?.push(def);
  }
  return map;
}
export {
  CATEGORY_LABEL_KEYS,
  CATEGORY_ORDER,
  REFERENCE_SHORTCUTS,
  SHORTCUTS,
  bindingToDisplay,
  checkBindingConflict,
  detectConflicts,
  eventToBinding,
  getShortcutsByCategory,
  resolveBinding,
  toTauriAccelerator,
  toTiptapBinding
};
