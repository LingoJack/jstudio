import { ipc } from "../core/ipc";
import { toMeta } from "../../types/storage";
const OLD_DOCS_KEY = "omninote_docs";
const OLD_THEME_KEY = "omninote_theme";
async function isFileSystemEmpty() {
  try {
    const index = await ipc.loadIndex();
    return !index || index.length === 0;
  } catch {
    return true;
  }
}
async function migrateFromLocalStorage() {
  const fsEmpty = await isFileSystemEmpty();
  const oldDocs = localStorage.getItem(OLD_DOCS_KEY);
  const oldTheme = localStorage.getItem(OLD_THEME_KEY);
  if (fsEmpty && !oldDocs) {
    return { documentCount: 0 };
  }
  let documentCount = 0;
  if (fsEmpty) {
    let docs = [];
    if (oldDocs) {
      try {
        const parsed = JSON.parse(oldDocs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          docs = parsed;
        }
      } catch {
      }
    }
    if (docs.length === 0) {
      docs = [
        {
          id: `doc-${Date.now()}`,
          title: "",
          emoji: "",
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          blocks: [
            {
              id: `block-${Date.now()}-initial`,
              type: "text",
              content: [],
              properties: {}
            }
          ]
        }
      ];
    }
    const metas = [];
    for (const doc of docs) {
      await ipc.saveDocument(doc);
      metas.push(toMeta(doc));
    }
    await ipc.saveIndex(metas);
    documentCount = docs.length;
  }
  const settings = {};
  try {
    const existing = await ipc.loadSettings();
    Object.assign(settings, existing);
  } catch {
  }
  if (oldTheme) {
    settings.theme = oldTheme === "light" ? "light" : "dark";
  }
  if (Object.keys(settings).length > 0) {
    await ipc.saveSettings(settings);
  }
  if (oldDocs) {
    localStorage.setItem(`${OLD_DOCS_KEY}_migrated_backup`, oldDocs);
    localStorage.removeItem(OLD_DOCS_KEY);
  }
  if (oldTheme) {
    localStorage.removeItem(OLD_THEME_KEY);
  }
  return { documentCount };
}
export {
  migrateFromLocalStorage
};
