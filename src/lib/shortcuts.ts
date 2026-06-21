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
  | 'terminal-tabs'
  | 'terminal-panes'
  | 'editor-blocks';

/** Normalized binding string, e.g. "mod+p". */
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
  /** Default binding, e.g. "mod+p" */
  defaultBinding: ShortcutBinding;
  /** Whether the user can rebind this shortcut */
  customizable: boolean;
  /** i18n key for the display label */
  labelKey: string;
  /** i18n key for the description (optional) */
  descKey?: string;
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

  // ── Terminal · Tabs ──
  {
    id: 'terminal.newTab',
    category: 'terminal-tabs',
    scope: 'terminal',
    defaultBinding: 'mod+t',
    customizable: true,
    labelKey: 'shortcut.terminal.newTab',
  },
  {
    id: 'terminal.closeTab',
    category: 'terminal-tabs',
    scope: 'terminal',
    defaultBinding: 'mod+w',
    customizable: true,
    labelKey: 'shortcut.terminal.closeTab',
  },
  {
    id: 'terminal.cycleTabLeft',
    category: 'terminal-tabs',
    scope: 'terminal',
    defaultBinding: 'mod+shift+arrowleft',
    customizable: true,
    labelKey: 'shortcut.terminal.cycleTabLeft',
  },
  {
    id: 'terminal.cycleTabRight',
    category: 'terminal-tabs',
    scope: 'terminal',
    defaultBinding: 'mod+shift+arrowright',
    customizable: true,
    labelKey: 'shortcut.terminal.cycleTabRight',
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
      { labelKey: 'shortcut.ref.inlineCode', binding: 'mod+e' },
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
 * Returns null if the event is a modifier-only press or an invalid key.
 *
 * Output format: "mod+p", "mod+shift+enter", "mod+alt+arrowleft"
 */
export function eventToBinding(e: KeyboardEvent): ShortcutBinding | null {
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

  if (overrides && overrides[id]) {
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
    if (otherBinding === binding) return def;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// TipTap binding conversion
// ────────────────────────────────────────────────────────────────────────────

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
  'terminal-tabs',
  'terminal-panes',
  'editor-blocks',
];

export const CATEGORY_LABEL_KEYS: Record<ShortcutCategory, string> = {
  general: 'shortcut.category.general',
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
