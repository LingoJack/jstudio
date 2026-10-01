/**
 * Mermaid configuration - the initialize() config builder.
 *
 * Style source: assets/skillhub/mermaid-to-png/scripts/render.py — the
 * mermaid.initialize() config of the house mermaid-to-PNG pipeline (stock
 * mermaid theme, PingFang SC, 15px, htmlLabels on, useMaxWidth off). Sharing
 * one config keeps inline previews and preview windows looking exactly like
 * the PNGs the skill produces for docs.
 *
 * Deliberate deltas from render.py, both mechanical (not style):
 *   - startOnLoad:false — the app renders explicitly via mermaid.render().
 *   - useMaxWidth:false is also kept for gantt/class/state/pie (render.py
 *     only handles flowchart/sequence/er): the pan/zoom letterbox stage
 *     sizes the SVG from its viewBox, which requires intrinsic sizing.
 *
 * Theme mapping: render.py's --theme takes default/neutral/dark/forest; the
 * app maps light mode → "default" and dark mode → "dark" so diagrams stay
 * legible against the dark shell. No custom themeVariables beyond the
 * skill's font settings — the stock theme owns all colors.
 */

/** themeVariables shared verbatim with render.py's config. */
const SKILL_THEME_VARIABLES = {
  fontFamily: "PingFang SC, Microsoft YaHei, Helvetica, Arial, sans-serif",
  fontSize: "15px",
} as const;

/**
 * Build the configuration object passed to `mermaid.initialize()`.
 *
 * Re-runs when the app toggles dark mode so the global mermaid config picks
 * up the stock theme ("default" / "dark") before the render effect
 * regenerates the SVG.
 */
export function buildMermaidConfig(isDarkMode: boolean) {
  return {
    startOnLoad: false,
    // 解析/渲染失败一律走 mermaid.render 的 Promise 拒绝，由调用方的
    // 错误 UI 展示 —— 绝不让 mermaid 把错误炸弹图注入 DOM。
    suppressErrorRendering: true,
    theme: isDarkMode ? "dark" : "default",
    securityLevel: "loose", // Allow click events / html labels in diagrams
    flowchart: {
      htmlLabels: true,
      useMaxWidth: false, // Intrinsic size - the viewer letterboxes via viewBox
    },
    sequence: {
      useMaxWidth: false,
    },
    er: {
      useMaxWidth: false,
    },
    gantt: {
      useMaxWidth: false,
    },
    class: {
      useMaxWidth: false,
    },
    state: {
      useMaxWidth: false,
    },
    pie: {
      useMaxWidth: false,
    },
    themeVariables: SKILL_THEME_VARIABLES,
  };
}

/**
 * mermaid 的全局配置不可重入：并发 render（多个代码块同时进预览、
 * 复制时的重渲染与预览渲染撞车）会互相踩踏 —— initialize 重置全局
 * 配置会让在途渲染的解析/布局读到错乱状态，表现为成片的
 * "Syntax error in text"。所有 mermaid.render 必须经过这条串行队列。
 */
let renderQueue: Promise<unknown> = Promise.resolve();

export function runExclusiveRender<T>(task: () => Promise<T>): Promise<T> {
  const result = renderQueue.then(task, task);
  renderQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
