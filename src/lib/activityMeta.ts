import { PenLine, Terminal, Settings, type LucideIcon } from 'lucide-react';
import type { ActivityItemId } from './storage';

/**
 * Activity Bar item metadata — single source of truth.
 *
 * 这个常量统一维护左侧活动栏（Activity Bar）每个入口的图标和显示文案。
 * 所有需要展示活动栏图标的地方都必须引用此常量，禁止各处自行定义。
 *
 * 当前消费方：
 * - `components/ActivityBar.tsx`     — 活动栏主体，渲染图标 + tooltip
 * - `components/settings/GeneralSection.tsx` — 设置页「活动栏顺序与可见性」拖拽列表
 * - `lib/commandRegistry.ts`         — 命令面板「转到文档 / 终端 / 设置」命令的图标
 *
 * 字段说明：
 * - `icon`     — lucide-react 图标组件，用于活动栏图标、设置列表预览、命令面板图标
 * - `labelKey` — i18n 翻译键，用于活动栏 tooltip 和设置列表的显示名称
 */
export const ACTIVITY_ITEM_META: Record<
  ActivityItemId,
  { icon: LucideIcon; labelKey: string }
> = {
  /** 文档 — 笔形图标，点击进入笔记编辑器 */
  documents: { icon: PenLine, labelKey: 'app.documents' },
  /** 终端 — 终端图标，点击进入内置终端 */
  terminal: { icon: Terminal, labelKey: 'app.terminal' },
  /** 设置 — 齿轮图标，点击进入设置页 */
  settings: { icon: Settings, labelKey: 'app.settings' },
};
