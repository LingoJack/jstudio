/**
 * HeadingDropdown - 标题级别选择下拉菜单。
 *
 * 抽取自 FormatBubbleMenu。与 TipTap BubbleMenu 紧耦合：
 * - hover 展开（onMouseEnter/onMouseLeave 由父组件控制定时器）
 * - onMouseDown preventDefault 防止编辑器失焦
 * - triggerRef / popoverRef 由父组件持有，用于 outside-click 检测
 *
 * 样式沿用 editor-toolbar-menu 自有体系（紧凑、无 border/shadow）。
 */

import type { RefObject } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useI18n } from '../../lib/core/i18n';

/** Heading levels exposed by the dropdown (matches StarterKit defaults). */
export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

export interface HeadingDropdownProps {
  /** 是否展开 popover。 */
  headingOpen: boolean;
  /** 鼠标 hover 选中索引（H1..H6 = 0..5，Paragraph = 6）。 */
  headingSelIndex: number;
  /** 当前标题级别（undefined 表示非标题）。 */
  currentLevel: number | undefined;
  /** 触发按钮是否处于键盘焦点状态。 */
  isFocused: boolean;
  /** 触发按钮 ref（父组件持有，用于 outside-click 检测）。 */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** popover ref（父组件持有，用于 outside-click 检测）。 */
  popoverRef: RefObject<HTMLDivElement | null>;
  /** hover 进入回调（父组件清除关闭定时器 + 打开）。 */
  onHoverEnter: () => void;
  /** hover 离开回调（父组件启动延迟关闭）。 */
  onHoverLeave: () => void;
  /** 选中某个选项。index 0..5 = H1..H6，6 = Paragraph。 */
  onSelectOption: (index: number, close: boolean) => void;
}

export function HeadingDropdown({
  headingOpen,
  headingSelIndex,
  currentLevel,
  isFocused,
  triggerRef,
  popoverRef,
  onHoverEnter,
  onHoverLeave,
  onSelectOption,
}: HeadingDropdownProps) {
  const { t } = useI18n();

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
    >
      <button
        ref={triggerRef}
        type="button"
        title={t('bubble.headingLevel')}
        aria-label={t('bubble.headingLevel')}
        aria-expanded={headingOpen}
        onMouseDown={(e) => {
          // Prevent the editor from losing selection when clicking the button.
          // The dropdown opens on hover; clicking the trigger is a no-op.
          e.preventDefault();
        }}
        style={{ width: 'auto' }}
        className={`editor-toolbar-btn bubble-menu-btn gap-0.5 px-1 ${
          headingOpen ? 'is-active' : ''
        } ${isFocused ? 'is-focused' : ''}`}
      >
        <span className="text-[11px] font-semibold leading-none">
          {typeof currentLevel === 'number' ? `H${currentLevel}` : 'H'}
        </span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {headingOpen && (
        <div
          ref={popoverRef}
          className="editor-toolbar-menu absolute left-0 top-full z-[101] mt-1 min-w-[120px] py-1"
        >
          {HEADING_LEVELS.map((level, i) => (
            <button
              key={level}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelectOption(i, false);
              }}
              className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[0.78rem] transition-colors hover:bg-[var(--vscode-list-hoverBackground)] ${
                i === headingSelIndex ? 'bg-[var(--vscode-list-hoverBackground)]' : ''
              } ${
                level === currentLevel
                  ? 'text-[var(--vscode-textLink-foreground)]'
                  : 'text-[var(--vscode-editor-foreground)]'
              }`}
            >
              <span>H{level}</span>
              {level === currentLevel && <Check className="w-3 h-3" />}
            </button>
          ))}
          <div className="my-1 h-px bg-[var(--vscode-menu-border)]" />
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onSelectOption(HEADING_LEVELS.length, false);
            }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[0.78rem] transition-colors hover:bg-[var(--vscode-list-hoverBackground)] ${
              HEADING_LEVELS.length === headingSelIndex
                ? 'bg-[var(--vscode-list-hoverBackground)]'
                : ''
            } text-[var(--vscode-editor-foreground)]`}
          >
            <span>{t('bubble.paragraph')}</span>
          </button>
        </div>
      )}
      <div className="mx-1 h-5 w-px bg-[var(--vscode-menu-border)]" />
    </div>
  );
}
