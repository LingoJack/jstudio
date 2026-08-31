/**
 * Global Shortcut Engine — Core types, Action Registry, and OS sync logic.
 *
 * This module is the single source of truth for:
 * 1. **Type definitions** — `GlobalShortcutConfig`, `GlobalShortcutActionDef`, etc.
 * 2. **Action Registry** — a `Map<type, GlobalShortcutActionDef>` that enables
 *    plugin-style extensibility. New actions are registered via
 *    `registerActionDef()` and automatically appear in the settings UI.
 * 3. **OS sync** — `syncGlobalShortcuts()` bridges the frontend config array
 *    with the Rust `tauri-plugin-global-shortcut` backend.
 *
 * ---
 * Architecture flow:
 *
 *   settings.json → GlobalShortcutConfig[]
 *        ↓
 *   syncGlobalShortcuts(configs)
 *        ↓  invoke('register_global_shortcut', ...)  per config
 *   Rust registers OS hotkeys
 *        ↓  OS fires hotkey
 *   Rust emits 'global-shortcut-triggered' event with config payload
 *        ↓  frontend listens (App.tsx)
 *   executeAction(config) → ACTION_REGISTRY.get(config.actionType).handler(...)
 *
 * ---
 * Adding a new action type requires only:
 *
 *   registerActionDef({
 *     type: 'my-action',
 *     labelKey: 'globalShortcut.action.myAction',
 *     icon: MyIcon,
 *     paramFields: [ ... ],
 *     handler: async (params, ctx) => { ... },
 *   });
 *
 * No changes to the core engine, settings UI, or Rust backend are needed.
 */

import { invoke } from '@tauri-apps/api/core';
import type { LucideIcon } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

/** Action type identifier. Built-in types + extensible string. */
export type GlobalShortcutActionType = 'open-panel' | 'open-terminal' | 'toggle-window' | (string & {});

/** Parameter field types that the settings UI knows how to render. */
export type ActionParamFieldType = 'text' | 'select' | 'directory';

/** A single configurable parameter for an action. Drives dynamic UI rendering. */
export interface ActionParamField {
  /** Machine key — maps to the key in `actionParams`. */
  key: string;
  /** i18n key for the field label shown in settings. */
  labelKey: string;
  /** Input type — determines which form control is rendered. */
  type: ActionParamFieldType;
  /** Placeholder text (i18n key or raw string). */
  placeholderKey?: string;
  /** For `select` type — available options. */
  options?: { value: string; labelKey: string }[];
  /** Default value if the user hasn't customized. */
  defaultValue?: unknown;
}

/**
 * Action definition — registered at module load time.
 * Each def knows its param schema (for UI) and its handler (for execution).
 */
export interface GlobalShortcutActionDef {
  /** Unique action type identifier. */
  type: GlobalShortcutActionType;
  /** i18n key for the display name shown in the action dropdown. */
  labelKey: string;
  /** i18n key for a short description shown below the dropdown. */
  descriptionKey?: string;
  /** Lucide icon component for visual identification. */
  icon: LucideIcon;
  /** Parameter schema — the settings UI renders form fields from this. */
  paramFields: ActionParamField[];
  /**
   * Execute the action.
   * Called when the OS hotkey fires OR when the user clicks "Test" in settings.
   */
  handler: (params: Record<string, unknown>, ctx: ActionContext) => void | Promise<void>;
}

/**
 * A single global shortcut configuration entry.
 * Stored in `settings.json` under `globalShortcuts: GlobalShortcutConfig[]`.
 */
export interface GlobalShortcutConfig {
  /** Unique id, e.g. `gs-1700000000000`. */
  id: string;
  /** Whether this shortcut is currently registered with the OS. */
  enabled: boolean;
  /** Key binding in internal format, e.g. `"mod+shift+p"`. */
  shortcut: string;
  /** Action type — must match a registered `GlobalShortcutActionDef.type`. */
  actionType: GlobalShortcutActionType;
  /** User-facing label for this shortcut entry. */
  actionLabel: string;
  /** Action-specific parameters, conforming to the def's `paramFields`. */
  actionParams: Record<string, unknown>;
}

/** Execution context passed to action handlers. */
export interface ActionContext {
  /** The Tauri Window instance of the main window. */
  // Window type from @tauri-apps/api is available at runtime; we use a
  // minimal interface here to avoid a hard import dependency in this file.
  emit: (event: string, payload?: unknown) => Promise<void>;
}

// ──────────────────────────────────────────────────────────────────────────
// Action Registry
// ──────────────────────────────────────────────────────────────────────────

const ACTION_REGISTRY = new Map<string, GlobalShortcutActionDef>();

/**
 * Register an action definition.
 *
 * Call this at module load time (side-effect import) to make a new action
 * type available in the global shortcut settings.
 *
 * @example
 * registerActionDef({
 *   type: 'quick-note',
 *   labelKey: 'globalShortcut.action.quickNote',
 *   icon: PenLine,
 *   paramFields: [],
 *   handler: async (_, ctx) => { ... },
 * });
 */
export function registerActionDef(def: GlobalShortcutActionDef): void {
  if (ACTION_REGISTRY.has(def.type)) {
    console.warn(`[globalShortcuts] Action type "${def.type}" is already registered. Overwriting.`);
  }
  ACTION_REGISTRY.set(def.type, def);
}

/** Look up an action definition by type. */
export function getActionDef(type: string): GlobalShortcutActionDef | undefined {
  return ACTION_REGISTRY.get(type);
}

/** Get all registered action definitions (for settings UI dropdown). */
export function getAllActionDefs(): GlobalShortcutActionDef[] {
  return Array.from(ACTION_REGISTRY.values());
}

// ──────────────────────────────────────────────────────────────────────────
// Action execution
// ──────────────────────────────────────────────────────────────────────────

/**
 * Execute the action associated with a config entry.
 * If the action type is unknown (e.g. plugin was uninstalled), logs a warning.
 */
export async function executeAction(
  config: GlobalShortcutConfig,
  ctx: ActionContext,
): Promise<void> {
  const def = getActionDef(config.actionType);
  if (!def) {
    console.warn(
      `[globalShortcuts] Unknown action type "${config.actionType}" for shortcut "${config.shortcut}". ` +
      'The action handler may not have been registered yet.',
    );
    return;
  }
  try {
    await def.handler(config.actionParams ?? {}, ctx);
  } catch (err) {
    console.error(
      `[globalShortcuts] Action "${config.actionType}" failed:`,
      err,
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────
// OS Sync — bridge between frontend config and Rust backend
// ──────────────────────────────────────────────────────────────────────────

/**
 * Synchronize the frontend config array with the OS-level shortcut registry.
 *
 * Strategy: **unregister all** first, then **register each** enabled config.
 * This is simpler and more robust than diffing, at the cost of a brief
 * re-registration window (acceptable since this only runs on settings change
 * or app startup — not on every keystroke).
 *
 * @param configs The full array from settings.json. Only `enabled` entries
 *                with a non-empty `shortcut` are registered.
 */
export async function syncGlobalShortcuts(configs: GlobalShortcutConfig[]): Promise<void> {
  // 1. Unregister everything — clean slate.
  try {
    await invoke('unregister_all_global_shortcuts');
  } catch (err) {
    console.error('[globalShortcuts] Failed to unregister all shortcuts:', err);
    // Continue anyway — stale registrations will be overwritten.
  }

  // 2. Register each enabled config.
  const toRegister = configs.filter((c) => c.enabled && c.shortcut);

  for (const config of toRegister) {
    try {
      await invoke('register_global_shortcut', {
        shortcutStr: config.shortcut,
        actionConfigJson: config,
      });
    } catch (err) {
      console.error(
        `[globalShortcuts] Failed to register shortcut "${config.shortcut}" (${config.actionType}):`,
        err,
      );
      // Don't abort the loop — other shortcuts should still be registered.
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Conflict detection
// ──────────────────────────────────────────────────────────────────────────

/**
 * Check if a binding string conflicts with existing configs (excluding self).
 * Two configs conflict if they have the exact same shortcut string and both
 * are enabled.
 *
 * @returns The conflicting config, or null if no conflict.
 */
export function findShortcutConflict(
  binding: string,
  configs: GlobalShortcutConfig[],
  selfId: string,
): GlobalShortcutConfig | null {
  const normalized = binding.toLowerCase().trim();
  return (
    configs.find(
      (c) =>
        c.id !== selfId &&
        c.enabled &&
        c.shortcut.toLowerCase().trim() === normalized,
    ) ?? null
  );
}
