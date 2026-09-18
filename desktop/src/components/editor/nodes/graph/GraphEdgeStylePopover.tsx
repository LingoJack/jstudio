/**
 * GraphEdgeStylePopover - 连线样式选择 popover（选中连线时显示）。
 *
 * 结构同 GraphFillPopover（触发按钮 + popover + 外层 ref 容器）。三组选项：
 *   - 箭头样式：maxGraph 内置 marker 类型（register.js registerDefaultEdgeMarkers）
 *     叠加"无箭头"，应用于选中边线的 endArrow；
 *   - 线型：实线 / 虚线（dashed）；
 *   - 粗细：细 / 标准 / 粗（strokeWidth）。
 * 每项带小图示直观预览；起点箭头（startArrow）暂不在此调整。
 */

import type { RefObject } from "react";
import { EdgeStyleGlyph } from "./ShapeGlyph";

/** 可选箭头样式（type 为 maxGraph marker 名）。 */
const ARROW_TYPES: { type: string; label: string }[] = [
  { type: "classic", label: "经典实心" },
  { type: "classicThin", label: "经典细箭" },
  { type: "block", label: "实心块" },
  { type: "blockThin", label: "细块" },
  { type: "open", label: "镂空" },
  { type: "diamond", label: "菱形" },
  { type: "none", label: "无箭头" },
];

/** 可选线型（dashed）。 */
const DASH_TYPES: { dashed: boolean; label: string }[] = [
  { dashed: false, label: "实线" },
  { dashed: true, label: "虚线" },
];

/** 可选线宽（strokeWidth）。 */
const WIDTH_TYPES: { width: number; label: string }[] = [
  { width: 1, label: "细" },
  { width: 1.5, label: "标准" },
  { width: 2.5, label: "粗" },
];

/** 24x12 小图示：横线 + 右端箭头样式示意（观感对齐 maxGraph marker）。 */
function ArrowGlyph({ type }: { type: string }) {
  const line = (
    <line x1="1" y1="6" x2="13" y2="6" stroke="currentColor" strokeWidth={1.5} />
  );
  switch (type) {
    case "classic":
      return (
        <svg width={24} height={12} viewBox="0 0 24 12" fill="none" aria-hidden>
          {line}
          <path d="M22 6 L13 1.5 L15.5 6 L13 10.5 Z" fill="currentColor" />
        </svg>
      );
    case "classicThin":
      return (
        <svg width={24} height={12} viewBox="0 0 24 12" fill="none" aria-hidden>
          {line}
          <path d="M22 6 L13 3 L15.5 6 L13 9 Z" fill="currentColor" />
        </svg>
      );
    case "block":
      return (
        <svg width={24} height={12} viewBox="0 0 24 12" fill="none" aria-hidden>
          {line}
          <path d="M22 6 L13 1 L13 11 Z" fill="currentColor" />
        </svg>
      );
    case "blockThin":
      return (
        <svg width={24} height={12} viewBox="0 0 24 12" fill="none" aria-hidden>
          {line}
          <path d="M22 6 L13 3.5 L13 8.5 Z" fill="currentColor" />
        </svg>
      );
    case "open":
      return (
        <svg width={24} height={12} viewBox="0 0 24 12" fill="none" aria-hidden>
          {line}
          <path
            d="M21 1.5 L14 6 L21 10.5"
            stroke="currentColor"
            strokeWidth={1.5}
          />
        </svg>
      );
    case "diamond":
      return (
        <svg width={24} height={12} viewBox="0 0 24 12" fill="none" aria-hidden>
          {line}
          <path d="M17.5 1.5 L22 6 L17.5 10.5 L13 6 Z" fill="currentColor" />
        </svg>
      );
    case "none":
    default:
      return (
        <svg width={24} height={12} viewBox="0 0 24 12" fill="none" aria-hidden>
          {line}
        </svg>
      );
  }
}

/** 线型小图示：实线 / 虚线。 */
function DashGlyph({ dashed }: { dashed: boolean }) {
  return (
    <svg width={24} height={12} viewBox="0 0 24 12" fill="none" aria-hidden>
      <line
        x1="1"
        y1="6"
        x2="23"
        y2="6"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray={dashed ? "4 3" : undefined}
      />
    </svg>
  );
}

/** 粗细小图示：同长度横线，粗细不同。 */
function WidthGlyph({ width }: { width: number }) {
  return (
    <svg width={24} height={12} viewBox="0 0 24 12" fill="none" aria-hidden>
      <line x1="1" y1="6" x2="23" y2="6" stroke="currentColor" strokeWidth={width} />
    </svg>
  );
}

export interface GraphEdgeStylePopoverProps {
  selectedStyle: {
    endArrow: string;
    dashed: boolean;
    strokeWidth: number;
  } | null;
  open: boolean;
  pickerRef: RefObject<HTMLDivElement | null>;
  onToggle: () => void;
  onSetStyle: (patch: {
    endArrow?: string;
    dashed?: boolean;
    strokeWidth?: number;
  }) => void;
}

export function GraphEdgeStylePopover({
  selectedStyle,
  open,
  pickerRef,
  onToggle,
  onSetStyle,
}: GraphEdgeStylePopoverProps) {
  return (
    <div className="jgraph-fill-picker" ref={pickerRef}>
      <button
        type="button"
        className={`jgraph-tool-btn ${open ? "is-active" : ""}`}
        title="连线样式"
        onClick={onToggle}
      >
        <EdgeStyleGlyph />
      </button>
      {open && selectedStyle && (
        <div className="jgraph-edge-style-popover" role="presentation">
          <div className="jgraph-edge-style-label">箭头</div>
          <div className="jgraph-edge-style-grid">
            {ARROW_TYPES.map(({ type, label }) => (
              <button
                key={type}
                type="button"
                className={`jgraph-edge-style-item ${
                  selectedStyle.endArrow === type ? "is-active" : ""
                }`}
                title={label}
                onClick={() => onSetStyle({ endArrow: type })}
              >
                <ArrowGlyph type={type} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="jgraph-edge-style-label">线型</div>
          <div className="jgraph-edge-style-grid">
            {DASH_TYPES.map(({ dashed, label }) => (
              <button
                key={label}
                type="button"
                className={`jgraph-edge-style-item ${
                  selectedStyle.dashed === dashed ? "is-active" : ""
                }`}
                title={label}
                onClick={() => onSetStyle({ dashed })}
              >
                <DashGlyph dashed={dashed} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="jgraph-edge-style-label">粗细</div>
          <div className="jgraph-edge-style-grid">
            {WIDTH_TYPES.map(({ width, label }) => (
              <button
                key={label}
                type="button"
                className={`jgraph-edge-style-item ${
                  selectedStyle.strokeWidth === width ? "is-active" : ""
                }`}
                title={label}
                onClick={() => onSetStyle({ strokeWidth: width })}
              >
                <WidthGlyph width={width} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
