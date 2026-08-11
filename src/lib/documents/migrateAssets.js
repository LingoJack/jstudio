import { ipc } from "../core/ipc";
import { genStoredName } from "../editor/upload";
function mimeToExt(mime) {
  const map = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/html": "html",
    "application/json": "json",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx"
  };
  if (map[mime]) return map[mime];
  const slash = mime.indexOf("/");
  if (slash >= 0) {
    const sub = mime.slice(slash + 1).split(/[;+]/)[0];
    if (sub) return sub;
  }
  return "bin";
}
function decodeDataUrl(dataUrl) {
  const commaIdx = dataUrl.indexOf(",");
  const header = dataUrl.substring(5, commaIdx);
  const mime = header.split(";")[0] || "application/octet-stream";
  const payload = dataUrl.substring(commaIdx + 1);
  const binary = atob(payload);
  const bytes = new Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, ext: mimeToExt(mime) };
}
async function migrateDocAssets(doc) {
  let changed = false;
  const blocks = await Promise.all(
    doc.blocks.map(async (b) => {
      if ((b.type === "image" || b.type === "file") && typeof b.content === "string" && b.content.startsWith("data:")) {
        try {
          const { bytes, ext } = decodeDataUrl(b.content);
          const storedName = genStoredName(
            b.type === "image" ? "image" : "file",
            ext
          );
          const finalName = await ipc.saveDocAsset(
            doc.id,
            storedName,
            bytes
          );
          changed = true;
          return {
            ...b,
            content: `assets/${finalName}`,
            properties: {
              ...b.properties,
              ...b.type === "image" ? { imageType: "asset" } : {}
            }
          };
        } catch {
          return b;
        }
      }
      return b;
    })
  );
  return changed ? { ...doc, blocks } : null;
}
export {
  migrateDocAssets
};
