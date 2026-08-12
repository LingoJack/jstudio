import { CellState } from "@maxgraph/core";
import type { ConnectionHandler, Cell } from "@maxgraph/core";
import {
  styleForShape,
  DEFAULT_SIZE,
  SHAPE_LABEL,
  GRID_SIZE,
  MIN_DRAW_SIZE,
  BATCH_FALLBACK_SPACING,
} from "../graphConstants";
import { SHAPE_ARC_SIZE, MINDMAP_ARC_SIZE } from "../graphTheme";
import { logger } from "../../../../../lib/core/logger";
import type { GraphNodeShape } from "../graphSnapshot";
import type { GraphSetupFn } from "./types";

export const setupDragDraw: GraphSetupFn = (ctx) => {
  const { graph, container } = ctx;

  /* ------------------------------------------------------------ */
  /* 拖拽绘制：点了工具栏图形后，在画布上按住拖拽划出位置与大小      */
  /* （飞书 / draw.io 手感）。只点不拖 -> 用默认尺寸落在点击处。      */
  /* ------------------------------------------------------------ */

  // 绘制预览（SVG，跟随当前形状画出真实轮廓，所见即所绘）。
  const SVG_NS = "http://www.w3.org/2000/svg";
  const preview = document.createElementNS(SVG_NS, "svg");
  preview.classList.add("jgraph-draw-preview");
  preview.style.display = "none";
  container.appendChild(preview);

  // 当前预览内部的形状元素。切换形状时重建，移动时只更新坐标/尺寸。
  let previewShapeEl: SVGElement | null = null;

  /** 按当前待绘制形状，在预览 SVG 内创建对应几何元素。 */
  const ensurePreviewShape = (shape: GraphNodeShape) => {
    if (previewShapeEl && previewShapeEl.dataset.shape === shape) return;
    preview.innerHTML = "";
    let el: SVGElement;
    switch (shape) {
      case "ellipse":
        el = document.createElementNS(SVG_NS, "ellipse");
        break;
      case "diamond":
        el = document.createElementNS(SVG_NS, "polygon");
        break;
      case "rounded":
      case "topic":
      case "rectangle":
      case "text":
      default:
        el = document.createElementNS(SVG_NS, "rect");
        break;
    }
    el.classList.add("jgraph-draw-preview-shape");
    if (shape === "text") {
      // text 形状实际无边框，预览用虚线表示"文本区域"而非真实边框。
      el.classList.add("is-text-region");
    }
    preview.appendChild(el);
    previewShapeEl = el;
    previewShapeEl.dataset.shape = shape;
  };

  /** 把拖拽划定的区域（屏幕像素 w/h）应用到当前预览形状上。 */
  const applyPreviewSize = (w: number, h: number, shape: GraphNodeShape) => {
    const el = previewShapeEl;
    if (!el) return;
    switch (shape) {
      case "ellipse": {
        const e = el as SVGEllipseElement;
        e.setAttribute("cx", String(w / 2));
        e.setAttribute("cy", String(h / 2));
        e.setAttribute("rx", String(Math.max(0, w / 2)));
        e.setAttribute("ry", String(Math.max(0, h / 2)));
        break;
      }
      case "diamond": {
        const p = el as SVGPolygonElement;
        const pts = `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`;
        p.setAttribute("points", pts);
        break;
      }
      case "rounded": {
        const r = el as SVGRectElement;
        r.setAttribute("width", String(w));
        r.setAttribute("height", String(h));
        // 圆角随尺寸缩放但封顶，太小则无圆角，避免挤压变形。
        const arc = Math.min(SHAPE_ARC_SIZE, Math.min(w, h) / 3);
        r.setAttribute("rx", String(arc));
        r.setAttribute("ry", String(arc));
        break;
      }
      case "topic": {
        const r = el as SVGRectElement;
        r.setAttribute("width", String(w));
        r.setAttribute("height", String(h));
        // 思维导图节点使用更大的圆角（药丸形态预览）。
        const arc = Math.min(MINDMAP_ARC_SIZE, Math.min(w, h) / 3);
        r.setAttribute("rx", String(arc));
        r.setAttribute("ry", String(arc));
        break;
      }
      case "rectangle":
      case "text":
      default: {
        const r = el as SVGRectElement;
        r.setAttribute("width", String(w));
        r.setAttribute("height", String(h));
        break;
      }
    }
  };

  let drawing = false;
  let startClient = { x: 0, y: 0 }; // 相对 container 的屏幕坐标
  let startGraph = { x: 0, y: 0 }; // 对应的图坐标

  const clientToContainer = (e: MouseEvent) => {
    const rect = container.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const snap = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE;

  const onMouseDown = (e: MouseEvent) => {
    const shape = ctx.pendingShapeRef.current;
    if (!shape) return; // 未处于待绘制态，交给引擎正常处理
    if (e.button !== 0) return;
    // 拦截，阻止 maxGraph 的框选/平移接管本次拖拽。
    e.preventDefault();
    e.stopPropagation();
    drawing = true;
    startClient = clientToContainer(e);
    const p = graph.getPointForEvent(e, false);
    startGraph = { x: p.x, y: p.y };
    ensurePreviewShape(shape);
    applyPreviewSize(0, 0, shape);
    preview.style.left = `${startClient.x}px`;
    preview.style.top = `${startClient.y}px`;
    preview.style.width = "0px";
    preview.style.height = "0px";
    preview.style.display = "block";
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!drawing) return;
    const shape = ctx.pendingShapeRef.current;
    if (!shape) return;
    const cur = clientToContainer(e);
    const x = Math.min(cur.x, startClient.x);
    const y = Math.min(cur.y, startClient.y);
    const w = Math.abs(cur.x - startClient.x);
    const h = Math.abs(cur.y - startClient.y);
    preview.style.left = `${x}px`;
    preview.style.top = `${y}px`;
    preview.style.width = `${w}px`;
    preview.style.height = `${h}px`;
    applyPreviewSize(w, h, shape);
  };

  const finishDraw = (e: MouseEvent) => {
    if (!drawing) return;
    drawing = false;
    // 绘制完成后确保 root 获得焦点，使键盘快捷键（Tab/Enter 等）生效。
    // onMouseDown(capture) 在待绘制态会 stopPropagation，导致 onCanvasMouseDown 不触发，
    // 这里补一次 focus。
    ctx.rootRef.current?.focus({ preventScroll: true });
    preview.style.display = "none";
    const shape = ctx.pendingShapeRef.current;
    if (!shape) return;

    const endPoint = graph.getPointForEvent(e, false);
    const rawW = Math.abs(endPoint.x - startGraph.x);
    const rawH = Math.abs(endPoint.y - startGraph.y);

    // 连线类型：不创建节点，直接退出，让用户手动从节点拖拽连线
    // 连线工具只是改变 ConnectionHandler 的默认连线样式
    if (shape.startsWith("edge-")) {
      const connectionHandler =
        graph.getPlugin<ConnectionHandler>("ConnectionHandler");
      if (connectionHandler) {
        // 设置默认连线样式，用户拖拽连线时会使用这个样式
        const edgeStyle = styleForShape(shape, ctx.darkModeRef.current);
        connectionHandler.createEdgeState = function () {
          const edge = this.graph.createEdge(
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            edgeStyle,
          );
          return new CellState(
            this.graph.view,
            edge,
            this.graph.getCellStyle(edge),
          );
        };
      }
      ctx.setPending(null);
      return;
    }

    // 批量创建分支：Cmd+click 形状 icon N 次后拖框，在划定区域内
    // 排开 N 个该形状。
    // - lifeline：单行横排，固定宽 100、高度=框高（下限 150）。
    // - 其他 vertex：网格排列，cols=ceil(sqrt(N))，单元格内居中，
    //   shape 尺寸取 min(DEFAULT_SIZE, 单元格×0.9) 防溢出。
    // click-without-drag 时以点击点为中心、按 BATCH_FALLBACK_SPACING 排开。
    const batchCount = ctx.pendingBatchCountRef.current;
    if (!shape.startsWith("edge-") && batchCount > 1) {
      let rectX: number;
      let rectY: number;
      let rectW: number;
      let rectH: number;
      const isLifeline = shape === "lifeline";
      const defaultSize = DEFAULT_SIZE[shape];

      // 1. 计算分布矩形 rectX/Y/W/H
      if (rawW < MIN_DRAW_SIZE && rawH < MIN_DRAW_SIZE) {
        // 只点不拖：以点击点为中心构造回退矩形。
        if (isLifeline) {
          // 单行：N 条按 BATCH_FALLBACK_SPACING 排开
          const totalW =
            (batchCount - 1) * BATCH_FALLBACK_SPACING + defaultSize.w;
          rectX = snap(startGraph.x - totalW / 2);
          rectY = snap(startGraph.y - defaultSize.h / 2);
          rectW = totalW;
          rectH = defaultSize.h;
        } else {
          // 网格：cols×rows，每格 BATCH_FALLBACK_SPACING
          const cols = Math.ceil(Math.sqrt(batchCount));
          const rows = Math.ceil(batchCount / cols);
          rectW = cols * BATCH_FALLBACK_SPACING;
          rectH = rows * BATCH_FALLBACK_SPACING;
          rectX = snap(startGraph.x - rectW / 2);
          rectY = snap(startGraph.y - rectH / 2);
        }
      } else {
        rectX = snap(Math.min(startGraph.x, endPoint.x));
        rectY = snap(Math.min(startGraph.y, endPoint.y));
        rectW = Math.max(GRID_SIZE, snap(rawW));
        rectH = Math.max(GRID_SIZE, snap(rawH));
      }

      // 2. 计算每个 shape 的位置和尺寸
      const parent = graph.getDefaultParent();
      const darkMode = ctx.darkModeRef.current;
      const createdCells: Cell[] = [];
      graph.batchUpdate(() => {
        if (isLifeline) {
          // 单行横排：固定宽 100，高度=框高（下限 150）
          const lifelineH = Math.max(rectH, defaultSize.h);
          for (let i = 0; i < batchCount; i++) {
            const x = snap(
              rectX +
                (batchCount === 1
                  ? (rectW - defaultSize.w) / 2
                  : (i * (rectW - defaultSize.w)) / (batchCount - 1)),
            );
            const id =
              "n" +
              Date.now().toString(36) +
              Math.random().toString(36).slice(2, 6);
            const cell = graph.insertVertex({
              parent,
              id,
              value: "",
              position: [x, rectY],
              size: [defaultSize.w, lifelineH],
              style: styleForShape("lifeline", darkMode),
            });
            createdCells.push(cell);
          }
        } else {
          // 网格排列：cols=ceil(sqrt(N))，单元格内居中
          const cols = Math.ceil(Math.sqrt(batchCount));
          const rows = Math.ceil(batchCount / cols);
          const cellW = rectW / cols;
          const cellH = rectH / rows;
          // shape 尺寸：不超过单元格 90%，也不超过默认尺寸
          const drawW = Math.min(defaultSize.w, cellW * 0.9);
          const drawH = Math.min(defaultSize.h, cellH * 0.9);
          for (let i = 0; i < batchCount; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const cellCenterX = rectX + col * cellW + cellW / 2;
            const cellCenterY = rectY + row * cellH + cellH / 2;
            const x = snap(cellCenterX - drawW / 2);
            const y = snap(cellCenterY - drawH / 2);
            const id =
              "n" +
              Date.now().toString(36) +
              Math.random().toString(36).slice(2, 6);
            const cell = graph.insertVertex({
              parent,
              id,
              value: SHAPE_LABEL[shape],
              position: [x, y],
              size: [drawW, drawH],
              style: styleForShape(shape, darkMode),
            });
            createdCells.push(cell);
          }
        }
        graph.setSelectionCells(createdCells);
      });
      // 完成后退出待绘制态 + 清零批量计数（单次批量，与单次绘制一致）。
      ctx.setPending(null);
      ctx.setPendingBatchCount(0);
      return;
    }

    let x: number;
    let y: number;
    let w: number;
    let h: number;
    if (rawW < MIN_DRAW_SIZE && rawH < MIN_DRAW_SIZE) {
      // 只点不拖 -> 用默认尺寸，以点击处为中心。
      const size = DEFAULT_SIZE[shape];
      w = size.w;
      h = size.h;
      x = snap(startGraph.x - w / 2);
      y = snap(startGraph.y - h / 2);
    } else {
      // 拖拽划定的实际区域，对齐网格。
      x = snap(Math.min(startGraph.x, endPoint.x));
      y = snap(Math.min(startGraph.y, endPoint.y));
      w = Math.max(GRID_SIZE, snap(rawW));
      h = Math.max(GRID_SIZE, snap(rawH));
    }

    const parent = graph.getDefaultParent();
    const id =
      "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    graph.batchUpdate(() => {
      const cell = graph.insertVertex({
        parent,
        id,
        value: SHAPE_LABEL[shape],
        position: [x, y],
        size: [w, h],
        style: styleForShape(shape, ctx.darkModeRef.current),
      });
      graph.setSelectionCell(cell);
    });
    // 绘制完自动退出待绘制态（单次绘制，符合飞书手感）。
    ctx.setPending(null);
  };

  container.addEventListener("mousedown", onMouseDown, true);
  container.addEventListener("mousemove", onMouseMove, true);
  container.addEventListener("mouseup", finishDraw, true);

  // 诊断：mouseup 时打印 altKey 与选中数，用于排查 Option+拖动复制不生效。
  // 仅在非绘制态记录（绘制态由 finishDraw 处理）。
  const onMouseUpDiag = (e: MouseEvent) => {
    if (ctx.pendingShapeRef.current) return;
    const g = ctx.graphRef.current;
    if (!g) return;
    const sel = g.getSelectionCells();
    // eslint-disable-next-line no-console
    logger.debug(
      "GraphCanvas",
      "mouseup | metaKey|ctrlKey: " +
        (e.metaKey || e.ctrlKey) +
        " | selCount: " +
        sel.length +
        " | isCloneEvent: " +
        g.isCloneEvent(e),
    );
  };
  container.addEventListener("mouseup", onMouseUpDiag, true);

  return () => {
    container.removeEventListener("mousedown", onMouseDown, true);
    container.removeEventListener("mousemove", onMouseMove, true);
    container.removeEventListener("mouseup", finishDraw, true);
    container.removeEventListener("mouseup", onMouseUpDiag, true);
    preview.remove();
  };
};
