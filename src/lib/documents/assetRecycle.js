import { ipc } from "../core/ipc";
function collectReferencedAssets(doc) {
  const json = JSON.stringify(doc);
  const refs = /* @__PURE__ */ new Set();
  const re = /assets\/([A-Za-z0-9._-]+)/g;
  let m;
  while ((m = re.exec(json)) !== null) {
    refs.add(m[1]);
  }
  return refs;
}
async function gcDocumentAssets(doc) {
  let trashed = 0;
  try {
    const onDisk = await ipc.listDocAssets(doc.id);
    if (onDisk.length === 0) return 0;
    const referenced = collectReferencedAssets(doc);
    const orphans = onDisk.filter((a) => !referenced.has(a.fileName));
    for (const orphan of orphans) {
      try {
        await ipc.trashDocAsset(doc.id, orphan.fileName);
        trashed++;
      } catch {
      }
    }
  } catch {
  }
  return trashed;
}
export {
  collectReferencedAssets,
  gcDocumentAssets
};
