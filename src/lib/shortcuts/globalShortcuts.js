import { invoke } from "@tauri-apps/api/core";
const ACTION_REGISTRY = /* @__PURE__ */ new Map();
function registerActionDef(def) {
  if (ACTION_REGISTRY.has(def.type)) {
    console.warn(`[globalShortcuts] Action type "${def.type}" is already registered. Overwriting.`);
  }
  ACTION_REGISTRY.set(def.type, def);
}
function getActionDef(type) {
  return ACTION_REGISTRY.get(type);
}
function getAllActionDefs() {
  return Array.from(ACTION_REGISTRY.values());
}
async function executeAction(config, ctx) {
  const def = getActionDef(config.actionType);
  if (!def) {
    console.warn(
      `[globalShortcuts] Unknown action type "${config.actionType}" for shortcut "${config.shortcut}". The action handler may not have been registered yet.`
    );
    return;
  }
  try {
    await def.handler(config.actionParams ?? {}, ctx);
  } catch (err) {
    console.error(
      `[globalShortcuts] Action "${config.actionType}" failed:`,
      err
    );
  }
}
async function syncGlobalShortcuts(configs) {
  try {
    await invoke("unregister_all_global_shortcuts");
  } catch (err) {
    console.error("[globalShortcuts] Failed to unregister all shortcuts:", err);
  }
  const toRegister = configs.filter((c) => c.enabled && c.shortcut);
  for (const config of toRegister) {
    try {
      await invoke("register_global_shortcut", {
        shortcutStr: config.shortcut,
        actionConfigJson: config
      });
    } catch (err) {
      console.error(
        `[globalShortcuts] Failed to register shortcut "${config.shortcut}" (${config.actionType}):`,
        err
      );
    }
  }
}
function findShortcutConflict(binding, configs, selfId) {
  const normalized = binding.toLowerCase().trim();
  return configs.find(
    (c) => c.id !== selfId && c.enabled && c.shortcut.toLowerCase().trim() === normalized
  ) ?? null;
}
export {
  executeAction,
  findShortcutConflict,
  getActionDef,
  getAllActionDefs,
  registerActionDef,
  syncGlobalShortcuts
};
