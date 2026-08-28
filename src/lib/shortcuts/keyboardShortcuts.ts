/**
 * shortcuts.ts — Unified keyboard shortcut registry, binding normalization,
 * conflict detection, and display helpers.
 *
 * Binding format (internal, normalized lowercase):
 *   "mod+p"               → Cmd/Ctrl + P
 *   "mod+shift+arrowleft" → Cmd/Ctrl + Shift + ←
 *   "mod+enter"           → Cmd/Ctrl + Enter
 *
 * Modifier order is fixed: mod → alt → shift → key
 * "mod" maps to ⌘ on macOS, Ctrl on Windows/Linux.
 */

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

/** Shortcut scope — determines conflict detection boundaries. */
export type ShortcutScope = 'global' | 'terminal' | 'editor';

/** Shortcut category — used for UI grouping. */
export type ShortcutCategory =
  | 'general'
  | 'navigation'
  | 'appearance'
  | 'terminal-tabs'
  | 'terminal-panes'
  | 'editor-blocks';

/** Normalized binding string, e.g. "mod+p". Empty string means unbound. */
export type ShortcutBinding = string;

/** User override map: { "terminal.newTab": "mod+shift+t", ... } */
export type ShortcutOverrides = Record<string, ShortcutBinding>;

/** Single shortcut definition in the registry. */
export interface ShortcutDef {
  /** Unique identifier, e.g. "app.commandPalette" */
  id: string;
  /** UI grouping category */
  category: ShortcutCategory;
  /** Conflict detection scope */
  scope: ShortcutScope;
  /**
   * Default binding, e.g. "mod+p".
   * Empty string means the shortcut is registered but unbound by default —
   * the user can assign one in Settings.
   */
  defaultBinding: ShortcutBinding;
  /** Whether the user can rebind this shortcut */
  customizable: boolean;
  /** i18n key for the display label */
  labelKey: string;
  /** i18n key for the description (optional) */
  descKey?: string;
  /**
   * Action ID to execute when triggered.
   * Defaults to the shortcut ID if not specified.
   * Used by ShortcutManager to dispatch via commandRegistry.
   */
  actionId?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Registry — the single source of truth for all customizable shortcuts
// ────────────────────────────────────────────────────────────────────────────

export const SHORTCUTS: ShortcutDef[] = [
  // ── General ──
  {
    id: 'app.commandPalette',
    category: 'general',
    scope: 'global',
    defaultBinding: 'mod+p',
    customizable: true,
    labelKey: 'shortcut.app.commandPalette',
    descKey: 'shortcut.app.commandPalette.desc',
  },
  {
    id: 'app.newDocument',
    category: 'general',
    scope: 'global',
    defaultBinding: 'mod+n',
    customizable: true,
    labelKey: 'shortcut.app.newDocument',
    descKey: 'shortcut.app.newDocument.desc',
  },
  {
    id: 'app.toggleSidebar',
    category: 'general',
    scope: 'global',
    defaultBinding: 'mod+b',
    customizable: true,
    labelKey: 'shortcut.app.toggleSidebar',
    descKey: 'shortcut.app.toggleSidebar.desc',
  },
  {
    id: 'app.toggleOutline',
    category: 'general',
    scope: 'global',
    defaultBinding: 'mod+shift+o',
    customizable: true,
    labelKey: 'shortcut.app.toggleOutline',
    descKey: 'shortcut.app.toggleOutline.desc',
  },
  {
    id: 'app.openSettings',
    category: 'general',
    scope: 'global',
    defaultBinding: 'mod+,',
    customizable: true,
    labelKey: 'shortcut.app.openSettings',
    descKey: 'shortcut.app.openSettings.desc',
  },
  {
    id: 'app.find',
    category: 'general',
    scope: 'global',
    defaultBinding: 'mod+f',
    customizable: true,
    labelKey: 'shortcut.app.find',
    descKey: 'shortcut.app.find.desc',
  },
  {
    id: 'app.globalSearch',
    category: 'general',
    scope: 'global',
    defaultBinding: 'mod+shift+f',
    customizable: true,
    labelKey: 'shortcut.app.globalSearch',
    descKey: 'shortcut.app.globalSearch.desc',
  },

  // ── Navigation ──
  {
    id: 'app.goToDocuments',
    category: 'navigation',
    scope: 'global',
    defaultBinding: '',
    customizable: true,
    labelKey: 'shortcut.app.goToDocuments',
    descKey: 'shortcut.app.goToDocuments.desc',
  },
  {
    id: 'app.goToTerminal',
    category: 'navigation',
    scope: 'global',
    defaultBinding: '',
    customizable: true,
    labelKey: 'shortcut.app.goToTerminal',
    descKey: 'shortcut.app.goToTerminal.desc',
  },

  // ── Workspace · Tabs ──
  {
    id: 'app.cycleTabLeft',
    category: 'navigation',
    scope: 'global',
    defaultBinding: 'mod+alt+arrowleft',
    customizable: true,
    labelKey: 'shortcut.app.cycleTabLeft',
    descKey: 'shortcut.app.cycleTabLeft.desc',
  },
  {
    id: 'app.cycleTabRight',
    category: 'navigation',
    scope: 'global',
    defaultBinding: 'mod+alt+arrowright',
    customizable: true,
    labelKey: 'shortcut.app.cycleTabRight',
    descKey: 'shortcut.app.cycleTabRight.desc',
  },
  {
    id: 'app.closeTab',
    category: 'navigation',
    scope: 'global',
    defaultBinding: 'mod+w',
    customizable: true,
    labelKey: 'shortcut.app.closeTab',
    descKey: 'shortcut.app.closeTab.desc',
  },

  // ── Document ──
  {
    id: 'app.importMarkdown',
    category: 'general',
    scope: 'global',
    defaultBinding: '',
    customizable: true,
    labelKey: 'shortcut.app.importMarkdown',
    descKey: 'shortcut.app.importMarkdown.desc',
  },

  // ── Appearance ──
  {
    id: 'app.toggleDarkMode',
    category: 'appearance',
    scope: 'global',
    defaultBinding: '',
    customizable: true,
    labelKey: 'shortcut.app.toggleDarkMode',
    descKey: 'shortcut.app.toggleDarkMode.desc',
  },
  {
    id: 'app.setDarkTheme',
    category: 'appearance',
    scope: 'global',
    defaultBinding: '',
    customizable: true,
    labelKey: 'shortcut.app.setDarkTheme',
    descKey: 'shortcut.app.setDarkTheme.desc',
  },
  {
    id: 'app.setLightTheme',
    category: 'appearance',
    scope: 'global',
    defaultBinding: '',
    customizable: true,
    labelKey: 'shortcut.app.setLightTheme',
    descKey: 'shortcut.app.setLightTheme.desc',
  },
  {
    id: 'app.setSystemTheme',
    category: 'appearance',
    scope: 'global',
    defaultBinding: '',
    customizable: true,
    labelKey: 'shortcut.app.setSystemTheme',
    descKey: 'shortcut.app.setSystemTheme.desc',
  },

  // ── Terminal · Tabs ──
  // (cycleTabLeft/Right and closeTab are now global workspace shortcuts:
  //  app.cycleTabLeft, app.cycleTabRight, app.closeTab)
  // Cmd+T is handled by the native menu (id "app.newTab") which dispatches
  // context-aware: terminal view -> new terminal session, otherwise -> open
  // document dialog. terminal.newTab is kept for customization but unbound
  // from the DOM (the menu intercepts Cmd+T before the DOM keydown fires).
  {
    id: 'terminal.newTab',
    category: 'terminal-tabs',
    scope: 'terminal',
    defaultBinding: '',
    customizable: true,
    labelKey: 'shortcut.terminal.newTab',
  },
  {
    id: 'terminal.detachTab',
    category: 'terminal-tabs',
    scope: 'terminal',
    defaultBinding: 'mod+shift+d',
    customizable: true,
    labelKey: 'shortcut.terminal.detachTab',
  },

  // ── Document · Open ──
  // Cmd+T is intercepted by the native menu (id "app.newTab"). The menu emits
  // a `native-command` which the ShortcutManager dispatches via commandRegistry.
  // The DOM keydown handler also matches this as a fallback (e.g. if the menu
  // doesn't intercept on some platforms).
  {
    id: 'app.newTab',
    category: 'general',
    scope: 'global',
    defaultBinding: 'mod+t',
    customizable: true,
    labelKey: 'shortcut.app.newTab',
    descKey: 'shortcut.app.newTab.desc',
  },

  // ── Terminal · Panes ──
  {
    id: 'terminal.splitPane',
    category: 'terminal-panes',
    scope: 'terminal',
    defaultBinding: 'mod+enter',
    customizable: true,
    labelKey: 'shortcut.terminal.splitPane',
  },
  {
    id: 'terminal.closePane',
    category: 'terminal-panes',
    scope: 'terminal',
    defaultBinding: 'mod+shift+w',
    customizable: true,
    labelKey: 'shortcut.terminal.closePane',
  },
  {
    id: 'terminal.focusPrevPane',
    category: 'terminal-panes',
    scope: 'terminal',
    defaultBinding: 'mod+arrowleft',
    customizable: true,
    labelKey: 'shortcut.terminal.focusPrevPane',
  },
  {
    id: 'terminal.focusNextPane',
    category: 'terminal-panes',
    scope: 'terminal',
    defaultBinding: 'mod+arrowright',
    customizable: true,
    labelKey: 'shortcut.terminal.focusNextPane',
  },
  {
    id: 'terminal.cycleLayout',
    category: 'terminal-panes',
    scope: 'terminal',
    defaultBinding: 'mod+shift+l',
    customizable: true,
    labelKey: 'shortcut.terminal.cycleLayout',
  },
  {
    id: 'terminal.movePane',
    category: 'terminal-panes',
    scope: 'terminal',
    defaultBinding: 'mod+shift+f',
    customizable: true,
    labelKey: 'shortcut.terminal.movePane',
  },

  // ── Editor · Blocks ──
  {
    id: 'editor.insertBlockBelow',
    category: 'editor-blocks',
    scope: 'editor',
    defaultBinding: 'mod+enter',
    customizable: true,
    labelKey: 'shortcut.editor.insertBlockBelow',
  },
  {
    id: 'editor.insertBlockAbove',
    category: 'editor-blocks',
    scope: 'editor',
    defaultBinding: 'mod+shift+enter',
    customizable: true,
    labelKey: 'shortcut.editor.insertBlockAbove',
  },
  {
    id: 'editor.inlineCode',
    category: 'editor-blocks',
    scope: 'editor',
    defaultBinding: 'mod+`',
    customizable: true,
    labelKey: 'shortcut.editor.inlineCode',
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Read-only reference shortcuts (not customizable)
// ────────────────────────────────────────────────────────────────────────────

export interface ReferenceShortcut {
  /** i18n key for the label */
  labelKey: string;
  /** Display string (for markdown triggers like "# ") */
  display?: string;
  /** Normalized binding (for keyboard shortcuts like "mod+b"), rendered via bindingToDisplay */
  binding?: ShortcutBinding;
}

export const REFERENCE_SHORTCUTS: { category: string; items: ReferenceShortcut[] }[] = [
  {
    category: 'shortcut.ref.editorFormatting',
    items: [
      { labelKey: 'shortcut.ref.bold', binding: 'mod+b' },
      { labelKey: 'shortcut.ref.italic', binding: 'mod+i' },
      { labelKey: 'shortcut.ref.underline', binding: 'mod+u' },
      { labelKey: 'shortcut.ref.strikethrough', binding: 'mod+shift+s' },
      { labelKey: 'shortcut.ref.undo', binding: 'mod+z' },
      { labelKey: 'shortcut.ref.redo', binding: 'mod+shift+z' },
      { labelKey: 'shortcut.ref.selectAll', binding: 'mod+a' },
    ],
  },
  {
    category: 'shortcut.ref.markdown',
    items: [
      { labelKey: 'shortcut.ref.heading1', display: '# ' },
      { labelKey: 'shortcut.ref.heading2', display: '## ' },
      { labelKey: 'shortcut.ref.heading3', display: '### ' },
      { labelKey: 'shortcut.ref.quote', display: '> ' },
      { labelKey: 'shortcut.ref.bulletList', display: '- ' },
      { labelKey: 'shortcut.ref.orderedList', display: '1. ' },
      { labelKey: 'shortcut.ref.codeBlock', display: '``` ' },
      { labelKey: 'shortcut.ref.divider', display: '---' },
    ],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Key normalization
// ────────────────────────────────────────────────────────────────────────────

/** Keys that should be ignored when pressed alone (modifier-only presses). */
const MODIFIER_KEYS = new Set([
  'shift', 'control', 'alt', 'meta', 'altgraph', 'fn', 'capslock',
]);

/**
 * Maps `e.key` / `e.code` values to their normalized binding token.
 * e.g. "ArrowLeft" → "arrowleft", "Enter" → "enter", " " → "space"
 */
function normalizeKey(e: KeyboardEvent): string | null {
  // Prefer e.key for printable and named keys; fall back to e.code.
  const key = e.key;

  // Ignore pure modifier presses
  if (MODIFIER_KEYS.has(key.toLowerCase())) return null;

  // Special keys — use lowercased key name
  const specialMap: Record<string, string> = {
    'Enter': 'enter',
    'Backspace': 'backspace',
    'Tab': 'tab',
    'Escape': 'escape',
    'Delete': 'delete',
    'Insert': 'insert',
    'Home': 'home',
    'End': 'end',
    'PageUp': 'pageup',
    'PageDown': 'pagedown',
    'ArrowUp': 'arrowup',
    'ArrowDown': 'arrowdown',
    'ArrowLeft': 'arrowleft',
    'ArrowRight': 'arrowright',
    ' ': 'space',
  };

  if (specialMap[key]) return specialMap[key];

  // Single character keys — lowercase
  if (key.length === 1) return key.toLowerCase();

  // Fallback: use e.code (e.g. "KeyP" → "p")
  if (e.code) {
    const code = e.code.toLowerCase();
    if (code.startsWith('key')) return code.slice(3);
    if (code.startsWith('digit')) return code.slice(5);
  }

  // Unknown key — use lowercased key as last resort
  return key.toLowerCase();
}

// ────────────────────────────────────────────────────────────────────────────
// eventToBinding — KeyboardEvent → normalized binding string
// ────────────────────────────────────────────────────────────────────────────

/**
 * Converts a KeyboardEvent into a normalized binding string.
 * Returns null if the event is a modifier-only press, an invalid key,
 * or is fired during IME composition.
 *
 * Output format: "mod+p", "mod+shift+enter", "mod+alt+arrowleft"
 */
export function eventToBinding(e: KeyboardEvent): ShortcutBinding | null {
  // Skip events during IME composition — calling preventDefault() on these
  // would interrupt the composition and cause characters to be lost (especially
  // Shift+key combinations in Chinese/Japanese/Korean input methods).
  if (e.isComposing || e.keyCode === 229) return null;

  const key = normalizeKey(e);
  if (!key) return null;

  const parts: string[] = [];

  // Modifier order: mod → alt → shift → key
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  parts.push(key);

  return parts.join('+');
}

// ────────────────────────────────────────────────────────────────────────────
// bindingToDisplay — binding string → human-readable platform display
// ────────────────────────────────────────────────────────────────────────────

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

const DISPLAY_MAP: Record<string, string> = {
  mod: isMac ? '⌘' : 'Ctrl',
  alt: isMac ? '⌥' : 'Alt',
  shift: isMac ? '⇧' : 'Shift',
  enter: isMac ? '↵' : 'Enter',
  backspace: isMac ? '⌫' : 'Backspace',
  tab: isMac ? '⇥' : 'Tab',
  escape: isMac ? '⎋' : 'Esc',
  delete: isMac ? '⌦' : 'Del',
  space: isMac ? '␣' : 'Space',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  home: 'Home',
  end: 'End',
  pageup: isMac ? '⇞' : 'PgUp',
  pagedown: isMac ? '⇟' : 'PgDn',
};

/**
 * Converts a normalized binding string to a display string.
 * e.g. "mod+p" → "⌘ P", "mod+shift+arrowleft" → "⌘ ⇧ ←"
 */
export function bindingToDisplay(binding: ShortcutBinding): string {
  const parts = binding.split('+');

  return parts
    .map((part) => {
      if (DISPLAY_MAP[part]) return DISPLAY_MAP[part];

      // Single letter — uppercase for display
      if (part.length === 1) return part.toUpperCase();

      // Capitalize first letter for named keys not in map
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

// ────────────────────────────────────────────────────────────────────────────
// resolveBinding — get the effective binding for a shortcut ID
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the current binding for a shortcut ID, considering user overrides.
 * Falls back to the default binding if no override exists.
 */
export function resolveBinding(
  id: string,
  overrides: ShortcutOverrides | undefined,
): ShortcutBinding {
  const def = SHORTCUTS.find((s) => s.id === id);
  if (!def) return '';

  // Use `in` so that an explicit empty-string override (cleared shortcut)
  // is respected rather than falling back to the default.
  if (overrides && id in overrides) {
    return overrides[id];
  }
  return def.defaultBinding;
}

// ────────────────────────────────────────────────────────────────────────────
// Conflict detection
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns the set of shortcut IDs that are in conflict within the same scope.
 * A conflict occurs when two shortcuts in the same scope share the same binding.
 *
 * @returns Map<binding, ShortcutDef[]> — only conflicting entries
 */
export function detectConflicts(
  overrides: ShortcutOverrides | undefined,
): Map<ShortcutBinding, ShortcutDef[]> {
  // Group by scope, then by binding
  const scopeMap = new Map<ShortcutScope, Map<ShortcutBinding, ShortcutDef[]>>();

  for (const def of SHORTCUTS) {
    const binding = resolveBinding(def.id, overrides);
    if (!binding) continue; // skip unbound shortcuts
    let scopeBindings = scopeMap.get(def.scope);
    if (!scopeBindings) {
      scopeBindings = new Map();
      scopeMap.set(def.scope, scopeBindings);
    }
    let defs = scopeBindings.get(binding);
    if (!defs) {
      defs = [];
      scopeBindings.set(binding, defs);
    }
    defs.push(def);
  }

  // Collect only bindings with 2+ shortcuts in the same scope
  const conflicts = new Map<ShortcutBinding, ShortcutDef[]>();
  for (const scopeBindings of scopeMap.values()) {
    for (const [binding, defs] of scopeBindings) {
      if (defs.length > 1) {
        conflicts.set(binding, defs);
      }
    }
  }

  return conflicts;
}

/**
 * Returns the other shortcuts that share `def`'s binding within the same
 * scope, based on a map produced by detectConflicts().
 */
export function conflictingDefs(
  def: ShortcutDef,
  binding: ShortcutBinding,
  conflictMap: Map<ShortcutBinding, ShortcutDef[]>,
): ShortcutDef[] {
  if (!binding) return [];
  return (conflictMap.get(binding) ?? []).filter(
    (d) => d.id !== def.id && d.scope === def.scope,
  );
}

/**
 * Checks whether a specific binding would conflict with other shortcuts
 * in the same scope (excluding the shortcut with `excludeId`).
 *
 * @returns The conflicting ShortcutDef, or null if no conflict.
 */
export function checkBindingConflict(
  binding: ShortcutBinding,
  scope: ShortcutScope,
  excludeId: string,
  overrides: ShortcutOverrides | undefined,
): ShortcutDef | null {
  for (const def of SHORTCUTS) {
    if (def.id === excludeId) continue;
    if (def.scope !== scope) continue;
    const otherBinding = resolveBinding(def.id, overrides);
    if (!otherBinding) continue; // skip unbound shortcuts
    if (otherBinding === binding) return def;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Native / TipTap binding conversion
// ────────────────────────────────────────────────────────────────────────────

/** Convert an internal binding to a Tauri menu accelerator. */
export function toTauriAccelerator(binding: ShortcutBinding): string | null {
  if (!binding) return null;

  const keyMap: Record<string, string> = {
    mod: 'CmdOrCtrl',
    alt: 'Alt',
    shift: 'Shift',
    enter: 'Enter',
    backspace: 'Backspace',
    tab: 'Tab',
    escape: 'Escape',
    delete: 'Delete',
    insert: 'Insert',
    home: 'Home',
    end: 'End',
    pageup: 'PageUp',
    pagedown: 'PageDown',
    arrowup: 'ArrowUp',
    arrowdown: 'ArrowDown',
    arrowleft: 'ArrowLeft',
    arrowright: 'ArrowRight',
    space: 'Space',
  };

  return binding
    .split('+')
    .map((part) => keyMap[part] ?? (part.length === 1 ? part.toUpperCase() : part))
    .join('+');
}

/**
 * Converts an internal binding string to TipTap's keymap format.
 * e.g. "mod+enter" → "Mod-Enter", "mod+shift+arrowleft" → "Mod-Shift-ArrowLeft"
 */
export function toTiptapBinding(binding: ShortcutBinding): string {
  const TIPTAP_KEY_MAP: Record<string, string> = {
    enter: 'Enter',
    backspace: 'Backspace',
    tab: 'Tab',
    escape: 'Escape',
    delete: 'Delete',
    space: 'Space',
    arrowup: 'ArrowUp',
    arrowdown: 'ArrowDown',
    arrowleft: 'ArrowLeft',
    arrowright: 'ArrowRight',
    home: 'Home',
    end: 'End',
    pageup: 'PageUp',
    pagedown: 'PageDown',
  };

  return binding
    .split('+')
    .map((part) => {
      if (part === 'mod') return 'Mod';
      if (part === 'alt') return 'Alt';
      if (part === 'shift') return 'Shift';
      if (TIPTAP_KEY_MAP[part]) return TIPTAP_KEY_MAP[part];
      // Single letter — capitalize
      if (part.length === 1) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('-');
}

// ────────────────────────────────────────────────────────────────────────────
// Category helpers
// ────────────────────────────────────────────────────────────────────────────

export const CATEGORY_ORDER: ShortcutCategory[] = [
  'general',
  'navigation',
  'appearance',
  'terminal-tabs',
  'terminal-panes',
  'editor-blocks',
];

export const CATEGORY_LABEL_KEYS: Record<ShortcutCategory, string> = {
  general: 'shortcut.category.general',
  navigation: 'shortcut.category.navigation',
  appearance: 'shortcut.category.appearance',
  'terminal-tabs': 'shortcut.category.terminalTabs',
  'terminal-panes': 'shortcut.category.terminalPanes',
  'editor-blocks': 'shortcut.category.editorBlocks',
};

/** Returns shortcuts grouped by category, in display order. */
export function getShortcutsByCategory(): Map<ShortcutCategory, ShortcutDef[]> {
  const map = new Map<ShortcutCategory, ShortcutDef[]>();
  for (const cat of CATEGORY_ORDER) {
    map.set(cat, []);
  }
  for (const def of SHORTCUTS) {
    map.get(def.category)?.push(def);
  }
  return map;
}
