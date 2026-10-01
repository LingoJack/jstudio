/**
 * mermaidImageClipboard.ts — 把渲染好的 mermaid SVG 以 PNG 形式写入系统剪贴板。
 *
 * 光栅化路径：serialize SVG → blob URL → <img> → 2× canvas（与
 * assets/skillhub/mermaid-to-png 的默认像素倍率一致）→ PNG 字节 → 统一走
 * Electron 主进程命令 copy_image_bytes_to_clipboard（与 fileExport 的
 * copyImageToClipboard 完全同一条通道）。
 *
 * 关键：WebKit 把含 <foreignObject> 的 SVG（htmlLabels 的标签渲染方式）
 * 画进 canvas 时会标记为 tainted，toBlob 直接抛 SecurityError —— 这就是
 * "图片复制失败"的根因。所以这里先用 htmlLabels:false（mermaid 11 的
 * mindmap/flowchart 都读全局 config.htmlLabels）重渲染一份纯 <text> 的
 * SVG 再栅格化；重渲染失败时退回原 SVG（会复现 taint 失败，但控制台
 * 已有诊断输出）。
 *
 * SVG 本身是透明底：先铺一块与当前主题一致的实底（深色 #1e1e1e / 浅色
 * #ffffff），保证贴进白底文档里依旧可读 —— 对应 skill 的 --bg 参数。
 */

import mermaid from "mermaid";
import type { MermaidConfig } from "mermaid";
import { invoke } from '@tauri-apps/api/core';
import { runExclusiveRender } from "./mermaidConfig";

const PNG_SCALE = 2;

/** Rasterize `svg` over `backdrop` and copy the PNG to the system clipboard. */
export async function copyMermaidPngToClipboard(
  svg: string,
  source: string,
  backdrop: string,
  isDarkMode: boolean,
): Promise<void> {
  try {
    const png = await rasterizeMermaidSvg(svg, source, backdrop, isDarkMode);
    // data 走 Array.from：与 fileExport 的调用方一致，保证 IPC 序列化安全。
    await invoke('copy_image_bytes_to_clipboard', { data: Array.from(png) });
  } catch (err) {
    console.error('[mermaid clipboard] copy failed:', err);
    throw err;
  }
}

/**
 * 复制专用重渲染：htmlLabels:false 生成纯 <text> 的 SVG（WebKit 画布不污染）。
 * 返回原图作为兜底（重渲染失败或结果仍含 foreignObject 时）。
 */
async function renderForeignObjectFree(
  source: string,
  isDarkMode: boolean,
): Promise<string | null> {
  // 离屏容器：不传第三个参数时 mermaid 会把临时测量元素挂到 body（带
  // 百分比高度），触发整页 reflow / 滚动位置跳动 —— 就是点复制时画面
  // 抖一下的来源。传入自备容器后 body 完全不被改动。
  const offscreen = document.createElement("div");
  offscreen.setAttribute(
    "style",
    "position:fixed;left:-99999px;top:0;width:1000px;height:800px;overflow:hidden;pointer-events:none;",
  );
  document.body.appendChild(offscreen);
  // 配置快照：initialize 是整体重置（defaults + options），复制专用的
  // htmlLabels:false 必须在结束后原样恢复，否则会污染所有后续渲染。
  const prevConfig = mermaid.mermaidAPI.getConfig() as MermaidConfig;
  try {
    const { svg } = await runExclusiveRender(async () => {
      mermaid.initialize({
        ...prevConfig,
        htmlLabels: false,
      } as MermaidConfig);
      const id = `mermaid-copy-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      return mermaid.render(id, source, offscreen);
    });
    // 个别图类型可能忽略该配置 —— 结果仍含 foreignObject 就不采用。
    return svg.includes('<foreignObject') ? null : svg;
  } catch (err) {
    console.warn(
      '[mermaid clipboard] htmlLabels:false re-render failed:',
      err,
    );
    return null;
  } finally {
    offscreen.remove();
    mermaid.initialize(prevConfig as MermaidConfig);
  }
}

async function rasterizeMermaidSvg(
  svg: string,
  source: string,
  backdrop: string,
  isDarkMode: boolean,
): Promise<Uint8Array> {
  // 复制路径专用：优先使用 htmlLabels:false 的重渲染（无 foreignObject，
  // WebKit 画布不污染）；失败退回传入的原 SVG。
  const clean = (await renderForeignObjectFree(source, isDarkMode)) ?? svg;
  const doc = new DOMParser().parseFromString(clean, "image/svg+xml");
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

  // 所见即所得的呼吸边距：直接按 viewBox 出图会让内容完全顶到图片边缘
  // （贴进文档里顶着边框很难看），四周留 24px（1×）的边距再绘制。
  const PAD = 24;

  const markup = new XMLSerializer().serializeToString(el);
  const url = URL.createObjectURL(
    new Blob([markup], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const img = new Image();
    img.src = url;
    // WebKit 对含 foreignObject 的 SVG（mermaid htmlLabels），decode() 可能
    // 拒绝而事件加载依旧成功 —— 先走 decode，失败退回 onload/onerror。
    await new Promise<void>((resolve, reject) => {
      img
        .decode()
        .then(() => resolve())
        .catch(() => {
          img.onload = () => resolve();
          img.onerror = () =>
            reject(new Error('mermaid svg: image decode failed'));
        });
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round((width + PAD * 2) * PNG_SCALE);
    canvas.height = Math.round((height + PAD * 2) * PNG_SCALE);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("mermaid svg: no 2d context");
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      img,
      PAD * PNG_SCALE,
      PAD * PNG_SCALE,
      width * PNG_SCALE,
      height * PNG_SCALE,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("mermaid svg: canvas.toBlob returned null");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
