import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
async function saveBlob(blob, defaultName, filterName, extensions) {
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: filterName, extensions }]
  });
  if (!path) return;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await invoke("write_file_bytes", { path, data: Array.from(bytes) });
}
async function saveSvg(svgString, defaultName) {
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: "SVG", extensions: ["svg"] }]
  });
  if (!path) return;
  const bytes = new TextEncoder().encode(svgString);
  await invoke("write_file_bytes", { path, data: Array.from(bytes) });
}
async function copyImageToClipboard(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await invoke("copy_image_bytes_to_clipboard", { data: Array.from(bytes) });
}
async function copyTextToClipboard(text) {
  await navigator.clipboard.writeText(text);
}
function svgToPngBlob(svgString, width, height, background = "#ffffff", scale = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob returned null"));
      }, "image/png");
    };
    img.onerror = () => reject(new Error("Failed to load SVG as image"));
    const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
    img.src = dataUrl;
  });
}
export {
  copyImageToClipboard,
  copyTextToClipboard,
  saveBlob,
  saveSvg,
  svgToPngBlob
};
