/**
 * SegmentedToggle — generic fixed-width two-(N-)segment sliding switch.
 *
 * Fixed-width segments + accent sliding thumb (translateX on the compositor
 * thread), same indicator language as TabBar:整齐划一优先, thumb = accent
 * pill, active text = foreground over the thumb.
 */

import type { LucideIcon } from 'lucide-react';

/** Fixed width of each segment (px) — uniform width, never content-sized. */
const SEGMENT_WIDTH_PX = 88;
/** Container padding around the thumb (matches p-0.5). */
const SEGMENT_PAD_PX = 2;
/** Same curve as the TabBar indicator. */
const SEGMENT_INDICATOR_TRANSITION =
  'transform 220ms cubic-bezier(0.33, 1.15, 0.5, 1)';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

interface SegmentedToggleProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: SegmentedToggleProps<T>) {
  const activeIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value),
  );

  return (
    <div
      role="tablist"
      className="relative inline-flex items-center rounded-md border border-[var(--vscode-widget-border)] bg-[var(--vscode-input-background)] p-[2px]"
    >
      {/* Sliding accent thumb (compositor transform, like TabBar) */}
      <div
        className="absolute rounded-[4px] pointer-events-none"
        style={{
          top: SEGMENT_PAD_PX,
          bottom: SEGMENT_PAD_PX,
          left: SEGMENT_PAD_PX,
          width: SEGMENT_WIDTH_PX,
          background: 'var(--vscode-list-activeSelectionBackground)',
          transform: `translateX(${activeIndex * SEGMENT_WIDTH_PX}px)`,
          transition: SEGMENT_INDICATOR_TRANSITION,
          willChange: 'transform',
        }}
      />
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            title={opt.label}
            className="relative z-10 flex items-center justify-center gap-1.5 h-6 rounded-[4px] cursor-pointer transition-colors duration-150"
            style={{ width: SEGMENT_WIDTH_PX }}
          >
            <Icon
              className={`w-3.5 h-3.5 shrink-0 ${
                active
                  ? 'text-[var(--vscode-foreground)]'
                  : 'text-[var(--vscode-descriptionForeground)]'
              }`}
            />
            <span
              className={`text-xs truncate ${
                active
                  ? 'text-[var(--vscode-foreground)] font-medium'
                  : 'text-[var(--vscode-sideBar-foreground)]'
              }`}
            >
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
