/**
 * graphTextFit - 图形尺寸跟随文字（打字实时跟手 + 导入图一次性适配）。
 *
 * 背景：自由画布的框体尺寸由用户手画 / 导入端给定，文字是后到的，二者会失配，
 * 长文字溢出框体很扎眼（自动上色后尤甚）。本模块让框体像 mermaid 一样从
 * 文字反推尺寸：
 *   - 内联编辑输入时实时重算（容器捕获 input 事件，测量 contentEditable 里
 *     的当前文本，按形状规则放大框体。实时放大不入撤销栈——文字值本身在
 *     确认时由 labelChanged 正常记账；Esc 取消时静默恢复会话起点几何）；
 *   - Mermaid / AI 导入时在导入 batch 内对全图适配一次（与导入同一撤销步）。
 *
 * 尺寸规则（只放大不缩小，尊重用户已摆好的框体）：
 *   - 矩形 / 圆角矩形：内宽贴最长行（超过 TEXT_FIT_MAX_INNER_WIDTH 折行），
 *     高度跟行数；上边、左边为锚（向下、向右生长）。
 *   - 菱形：文字可用面积是内接矩形（宽高各占一半），按 (文字尺寸 + 内距) × 2 放大。
 *   - 生命线：头部只加宽，且左右对称扩（中心线不动，激活框 / 消息端点不偏）。
 */

import type {
  Cell,
  CellStyle,
  Geometry,
  Graph,
  CellEditorHandler,
} from '@maxgraph/core';
import type { GraphSetupFn } from './graphSetup/types';

/** 参与文字适配的形状（maxGraph shape 名）。'rectangle' 覆盖矩形与圆角矩形。 */
const TEXT_FIT_SHAPES = new Set(['rectangle', 'rhombus', 'lifeline']);

/** 单行内宽上限：超过则折行（防止一个长 URL 把框拉成超宽条）。 */
const TEXT_FIT_MAX_INNER_WIDTH = 240;

/** 矩形 / 圆角矩形的文字内距（水平 / 垂直）。 */
const RECT_TEXT_PAD_X = 12;
const RECT_TEXT_PAD_Y = 10;

/** 菱形：内接矩形换算的文字内距与系数（内接宽高 = 框体宽高的一半）。 */
const DIAMOND_TEXT_PAD_X = 8;
const DIAMOND_TEXT_PAD_Y = 4;
const DIAMOND_INSCRIBE_FACTOR = 2;

/** 生命线头部的文字水平内距。 */
const LIFELINE_TEXT_PAD_X = 16;

/** 判断 cell 是否参与文字适配。 */
export function isTextFitCell(cell: Cell): boolean {
  if (!cell.isVertex()) return false;
  const style = cell.getStyle() as CellStyle & Record<string, unknown>;
  if (typeof style.shape !== 'string' || !TEXT_FIT_SHAPES.has(style.shape)) {
    return false;
  }
  // 思维导图 topic 的尺寸由 mindmapSpawn 管理，不参与。
  if (style.isTopic) return false;
  return true;
}

/** 收集画布上参与文字适配的 cell（递归含泳道等容器的子级）。 */
export function collectTextFitCells(graph: Graph): Cell[] {
  const result: Cell[] = [];
  const walk = (parent: Cell) => {
    for (const cell of graph.getChildCells(parent, true, false)) {
      if (isTextFitCell(cell)) result.push(cell);
      walk(cell);
    }
  };
  walk(graph.getDefaultParent());
  return result;
}

/* ------------------------------------------------------------------ */
/* 文本测量                                                            */
/* ------------------------------------------------------------------ */

/** 测量用隐藏单例（挂在 body 上，跨画板实例复用）。 */
let measureEl: HTMLDivElement | null = null;

function getMeasureEl(): HTMLDivElement {
  if (!measureEl) {
    measureEl = document.createElement('div');
    measureEl.style.position = 'absolute';
    measureEl.style.top = '-9999px';
    measureEl.style.left = '-9999px';
    measureEl.style.visibility = 'hidden';
    document.body.appendChild(measureEl);
  }
  return measureEl;
}

/**
 * 按指定字体测量文本尺寸。
 * 先按不折行量自然宽高（\n 视为显式换行）；超上限时改按 capWidth 折行量高度。
 * fontEl 提供字体参考（取渲染中的 label 节点的计算样式，保证测量与实际一致）。
 */
function measureText(
  text: string,
  fontEl: HTMLElement | null,
  capWidth: number,
): { w: number; h: number } {
  const el = getMeasureEl();
  if (fontEl) {
    const cs = getComputedStyle(fontEl);
    el.style.fontFamily = cs.fontFamily;
    el.style.fontSize = cs.fontSize;
    el.style.fontWeight = cs.fontWeight;
    el.style.lineHeight = cs.lineHeight;
    el.style.letterSpacing = cs.letterSpacing;
  }
  el.style.width = 'auto';
  el.style.whiteSpace = 'pre';
  el.style.wordBreak = 'normal';
  el.replaceChildren();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) el.appendChild(document.createElement('br'));
    el.appendChild(document.createTextNode(lines[i]));
  }
  const naturalW = el.offsetWidth;
  const naturalH = el.offsetHeight;
  if (naturalW <= capWidth) return { w: naturalW, h: naturalH };
  // 超上限：按 capWidth 折行量高度（与 HTML label 的折行行为一致）。
  el.style.whiteSpace = 'pre-wrap';
  el.style.wordBreak = 'break-word';
  el.style.width = `${capWidth}px`;
  return { w: capWidth, h: el.offsetHeight };
}

/* ------------------------------------------------------------------ */
/* 尺寸适配                                                            */
/* ------------------------------------------------------------------ */

/**
 * 把 cell 的框体放大到贴合 text（只放大不缩小；不满足放大条件时不动）。
 * 调用方决定事务与 undo 语义（实时路径挂起撤销，导入路径随导入 batch 入栈）。
 */
export function fitCellToText(graph: Graph, cell: Cell, text: string): void {
  const geo = cell.getGeometry();
  if (!geo) return;
  const style = cell.getStyle() as CellStyle & Record<string, unknown>;
  const shape = typeof style.shape === 'string' ? style.shape : '';
  if (!TEXT_FIT_SHAPES.has(shape)) return;

  const state = graph.getView().getState(cell);
  // text.node 按类型是 SVG 元素，html 标签模式下实际是 HTML div；测量只需要读计算样式。
  const fontEl = (state?.text?.node ?? null) as unknown as HTMLElement | null;
  const m = measureText(text, fontEl, TEXT_FIT_MAX_INNER_WIDTH);

  let w = geo.width;
  let h = geo.height;
  let x = geo.x;
  if (shape === 'rhombus') {
    w = Math.max(w, (m.w + DIAMOND_TEXT_PAD_X) * DIAMOND_INSCRIBE_FACTOR);
    h = Math.max(h, (m.h + DIAMOND_TEXT_PAD_Y) * DIAMOND_INSCRIBE_FACTOR);
  } else if (shape === 'lifeline') {
    w = Math.max(w, m.w + LIFELINE_TEXT_PAD_X * 2);
    // 左右对称扩：中心线不动，激活框与消息端点才不偏。
    x -= (w - geo.width) / 2;
  } else {
    w = Math.max(w, m.w + RECT_TEXT_PAD_X * 2);
    h = Math.max(h, m.h + RECT_TEXT_PAD_Y * 2);
  }
  if (w === geo.width && h === geo.height && x === geo.x) return;
  const next: Geometry = geo.clone();
  next.x = x;
  next.width = w;
  next.height = h;
  graph.getDataModel().setGeometry(cell, next);
}

/**
 * 对一批 cell 按其在模型中的当前值做适配（导入路径用；
 * 实时编辑路径用编辑器里的最新文本，走 fitCellToText）。
 */
export function fitCellsToText(graph: Graph, cells: Cell[]): void {
  for (const cell of cells) {
    const label = graph.getLabel(cell);
    const text =
      typeof label === 'string'
        ? label
        : ((label as HTMLElement | null)?.textContent ?? '');
    fitCellToText(graph, cell, text);
  }
}

/* ------------------------------------------------------------------ */
/* 内联编辑实时跟手                                                    */
/* ------------------------------------------------------------------ */

/**
 * 内联编辑输入时框体实时贴合文字。
 * 容器捕获 input 事件（编辑器 div 挂在 container 下且会冒泡）：
 *   - 会话首个输入记录起点几何，Esc 取消时静默恢复；
 *   - 每次输入按编辑器当前文本放大框体（撤销挂起，不入栈）；
 *   - IME 组合输入期间不跟手，compositionend 后的 input 再量。
 */
export const setupTextAutoSize: GraphSetupFn = (ctx) => {
  const { graph, container, undoSuspendedRef } = ctx;
  const cellEditor = graph.getPlugin<CellEditorHandler>('CellEditorHandler');
  if (!cellEditor) return;

  let session: { cell: Cell; geo: Geometry } | null = null;

  const resizeSuspended = (fn: () => void) => {
    undoSuspendedRef.current = true;
    try {
      fn();
    } finally {
      undoSuspendedRef.current = false;
    }
  };

  const onInput = (e: Event) => {
    const cell = cellEditor.getEditingCell();
    if (!cell) return;
    if ((e as InputEvent).isComposing) return;
    if (session?.cell !== cell) {
      const geo = cell.getGeometry();
      if (!geo) return;
      session = { cell, geo: geo.clone() };
    }
    const state = graph.getView().getState(cell);
    if (!state) return;
    const text = cellEditor.getCurrentValue(state) ?? '';
    resizeSuspended(() => fitCellToText(graph, cell, text));
  };

  const onEscape = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !session) return;
    if (cellEditor.getEditingCell() !== session.cell) return;
    const restored = session.geo.clone();
    const cell = session.cell;
    resizeSuspended(() => {
      graph.getDataModel().setGeometry(cell, restored);
    });
    session = null;
  };

  container.addEventListener('input', onInput, true);
  container.addEventListener('keydown', onEscape, true);
  return () => {
    container.removeEventListener('input', onInput, true);
    container.removeEventListener('keydown', onEscape, true);
    session = null;
  };
};
