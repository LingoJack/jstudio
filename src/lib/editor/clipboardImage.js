import { readImage } from "@tauri-apps/plugin-clipboard-manager";
async function getClipboardImageAsFile() {
  try {
    const img = await readImage();
    const { width, height } = await img.size();
    if (!width || !height) return null;
    const rgba = await img.rgba();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
    ctx.putImageData(imageData, 0, 0);
    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/png");
    });
    if (!blob) return null;
    return new File([blob], `clipboard-${Date.now()}.png`, {
      type: "image/png"
    });
  } catch {
    return null;
  }
}
export {
  getClipboardImageAsFile
};
