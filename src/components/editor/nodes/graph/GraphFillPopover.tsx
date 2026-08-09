/**
 * GraphFillPopover - 填充颜色选择 popover。
 *
 * 抽取自 GraphToolbar。包含触发按钮 + popover + 外层 ref 容器。
 * 样式沿用 jgraph-fill-picker / jgraph-fill-popover 自有体系。
 */

import type { RefObject } from "react";
import { Palette } from "lucide-react";
import { fillPresetsFor } from "./graphTheme";

export interface GraphFillPopoverProps {
  selectedFillColor: string | null;
  fillPickerOpen: boolean;
  fillPickerRef: RefObject<HTMLDivElement | null>;
  onToggleFillPicker: () => void;
  onSetFillColor: (color: string) => void;
  darkMode: boolean;
}

export function GraphFillPopover({
  selectedFillColor,
  fillPickerOpen,
  fillPickerRef,
  onToggleFillPicker,
  onSetFillColor,
  darkMode,
}: GraphFillPopoverProps) {
  return (
    <div className="jgraph-fill-picker" ref={fillPickerRef}>
      <button
        type="button"
        className={`jgraph-tool-btn ${selectedFillColor !== 'none' ? 'is-active' : ''}`}
        title="填充颜色"
        onClick={onToggleFillPicker}
      >
        <Palette size={16} />
      </button>
      {fillPickerOpen && (
        <div className="jgraph-fill-popover" role="presentation">
          <button
            type="button"
            className={`jgraph-fill-swatch jgraph-fill-none ${selectedFillColor === 'none' ? 'is-active' : ''}`}
            title="无填充"
            onClick={() => onSetFillColor('none')}
          />
          {fillPresetsFor(darkMode).map((c) => (
            <button
              key={c.value}
              type="button"
              className={`jgraph-fill-swatch ${selectedFillColor === c.value ? 'is-active' : ''}`}
              style={{ backgroundColor: c.value }}
              title={c.label}
              onClick={() => onSetFillColor(c.value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
