import { ipc } from "../core/ipc";
import { useStore } from "../../store/useStore";
async function saveBytesAsAsset(bytes, mime, activeDocId, storedName) {
  if (activeDocId && storedName) {
    const finalName = await ipc.saveDocAsset(activeDocId, storedName, bytes);
    return `assets/${finalName}`;
  }
  const binary = String.fromCharCode(...bytes);
  return `data:${mime};base64,${btoa(binary)}`;
}
async function fileToAssetRef(file, activeDocId, prefix = "file") {
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const mime = file.type || "application/octet-stream";
  const arrayBuffer = await file.arrayBuffer();
  const bytes = Array.from(new Uint8Array(arrayBuffer));
  if (activeDocId) {
    const storedName = genStoredName(prefix, ext);
    return saveBytesAsAsset(bytes, mime, activeDocId, storedName);
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}
function genStoredName(prefix, ext) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext || "bin"}`;
}
async function uploadImage(file) {
  const activeDocId = useStore.getState().activeDocId;
  return fileToAssetRef(file, activeDocId, "image");
}
async function uploadAttachment(file) {
  const activeDocId = useStore.getState().activeDocId;
  const originalName = file.name || "file";
  const ext = originalName.split(".").pop()?.toLowerCase() || "bin";
  const mime = file.type || "application/octet-stream";
  const arrayBuffer = await file.arrayBuffer();
  const bytes = Array.from(new Uint8Array(arrayBuffer));
  const sizeBytes = bytes.length;
  const storedName = genStoredName("file", ext);
  const src = await saveBytesAsAsset(bytes, mime, activeDocId, storedName);
  return {
    src,
    fileName: originalName,
    fileSize: sizeBytes,
    fileType: mime
  };
}
export {
  fileToAssetRef,
  genStoredName,
  saveBytesAsAsset,
  uploadAttachment,
  uploadImage
};
