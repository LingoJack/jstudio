/**
 * mermaidImageClipboard.ts — 把渲染好的 mermaid SVG 以 PNG 形式写入系统剪贴板。
 *
 * 光栅化路径：serialize SVG → blob URL → <img> → 2× canvas（与
 * assets/skillhub/mermaid-to-png 的默认像素倍率一致）→ PNG 字节 → Electron
 * main 的 clipboard.writeImage 落入系统剪贴板。渲染进程内直接写图片剪贴板
 * 在跨 WebView 场景下不可靠，主进程 writeImage 是 Electron 的规范路径。
 *
 * SVG 本身是透明底：先铺一块与当前主题一致的实底（深色 #1e1e1e / 浅色
 * #ffffff），保证贴进白底文档里依旧可读 —— 对应 skill 的 --bg 参数。
 */

import { writeImagePng } from "../../../../lib/core/tauriShim/plugin-clipboard-manager";

const PNG_SCALE = 2;

/** Rasterize `svg` over `backdrop` and copy the PNG to the system clipboard. */
export async function copyMermaidPngToClipboard(
  svg: string,
  backdrop: string,
): Promise<void> {
  const png = await rasterizeMermaidSvg(svg, backdrop);
  await writeImagePng(png);
}

async function rasterizeMermaidSvg(
  svg: string,
  backdrop: string,
): Promise<Uint8Array> {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const el = doc.querySelector("svg");
  if (!el) throw new Error("mermaid svg: no <svg> root");

  // Size: viewBox is authoritative (same rule as the mermaid-to-png skill);
  // force explicit width/height so the <img> decodes at natural size instead
  // of whatever percentage attributes the render left behind.
  const viewBox = (el.getAttribute("viewBox") ?? "")
    .split(/[\s,]+/)
    .map(Number);
  const hasBox =
    viewBox.length === 4 && viewBox.every((n) => Number.isFinite(n));
  const width = hasBox && viewBox[2] > 0 ? viewBox[2] : 800;
  const height = hasBox && viewBox[3] > 0 ? viewBox[3] : 600;
  el.setAttribute("width", String(width));
  el.setAttribute("height", String(height));

  const markup = new XMLSerializer().serializeToString(el);
  const url = URL.createObjectURL(
    new Blob([markup], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const img = new Image();
    img.src = url;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * PNG_SCALE);
    canvas.height = Math.round(height * PNG_SCALE);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("mermaid svg: no 2d context");
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("mermaid svg: canvas.toBlob returned null");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
