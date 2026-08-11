import { ipc } from "../lib/core/ipc";
import { toast } from "../lib/core/toast";
import { logger } from "../lib/core/logger";
function onSaveError(label) {
  return (e) => {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error(`Failed to save ${label}:`, e);
    logger.error("store.save", `Failed to save ${label}: ${msg}`);
    toast.error(`${label}\u4FDD\u5B58\u5931\u8D25`);
  };
}
const docSaveTimers = /* @__PURE__ */ new Map();
const pendingDocs = /* @__PURE__ */ new Map();
let indexTimer = null;
let foldersTimer = null;
function scheduleDocumentSave(doc) {
  const existing = docSaveTimers.get(doc.id);
  if (existing) clearTimeout(existing);
  pendingDocs.set(doc.id, doc);
  const timer = setTimeout(() => {
    docSaveTimers.delete(doc.id);
    pendingDocs.delete(doc.id);
    ipc.saveDocument(doc).catch(onSaveError("\u6587\u6863"));
  }, 500);
  docSaveTimers.set(doc.id, timer);
}
function flushDocumentSaves() {
  for (const [id, timer] of docSaveTimers) {
    clearTimeout(timer);
    const doc = pendingDocs.get(id);
    if (doc) ipc.saveDocument(doc).catch(onSaveError("\u6587\u6863"));
  }
  docSaveTimers.clear();
  pendingDocs.clear();
}
function scheduleIndexSave(metas) {
  if (indexTimer) clearTimeout(indexTimer);
  indexTimer = setTimeout(() => {
    ipc.saveIndex(metas).catch(onSaveError("\u7D22\u5F15"));
  }, 500);
}
function scheduleFoldersSave(folders) {
  if (foldersTimer) clearTimeout(foldersTimer);
  foldersTimer = setTimeout(() => {
    ipc.saveFolders(folders).catch(onSaveError("\u6587\u4EF6\u5939"));
  }, 300);
}
export {
  flushDocumentSaves,
  onSaveError,
  scheduleDocumentSave,
  scheduleFoldersSave,
  scheduleIndexSave
};
