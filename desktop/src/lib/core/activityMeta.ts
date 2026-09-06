import type { ComponentType } from "react";
import {
  PenLine,
  Terminal,
  Bot,
  Settings,
} from "lucide-react";
import { GlobeIcon } from "../../components/ui/icons";
import type { ActivityItemId } from "../../types/settings";
import type { TranslationKey } from "./i18n";

/**
 * Activity Bar 图标的公共类型 —— lucide 图标与 ui/icons.tsx 的自定义
 * SVG 图标（用 className 或 size 定尺寸）都能赋值，消费方一律
 * `<Icon className="..." />` 或 `<Icon size={n} />` 渲染。
 */
export type ActivityBarIcon = ComponentType<{
  className?: string;
  size?: number | string;
}>;

/**
 * Activity Bar item metadata — single source of truth.
 *
 * 这个常量统一维护左侧活动栏（Activity Bar）每个入口的图标和显示文案。
 * 所有需要展示活动栏图标的地方都必须引用此常量，禁止各处自行定义。
 *
 * 当前消费方：
 * - `components/ActivityBar.tsx`     — 活动栏主体，渲染图标 + tooltip
 * - `components/settings/GeneralSection.tsx` — 设置页「活动栏顺序与可见性」拖拽列表
 * - `lib/core/commandRegistry.ts`         — 命令面板「转到文档 / 终端 / 设置」命令的图标
 *
 * 字段说明：
 * - `icon`     — lucide-react 图标组件，用于活动栏图标、设置列表预览、命令面板图标
 * - `labelKey` — i18n 翻译键，用于活动栏 tooltip 和设置列表的显示名称
 */
export const ACTIVITY_ITEM_META: Record<
  ActivityItemId,
  { icon: ActivityBarIcon; labelKey: TranslationKey }
> = {
  /** 文档 — 笔形图标，点击进入笔记编辑器 */
  documents: { icon: PenLine, labelKey: "app.documents" },
  /** 终端 — 终端图标，点击进入内置终端 */
  terminal: { icon: Terminal, labelKey: "app.terminal" },
  /** 智能体 — Bot 图标，点击进入智能体聊天 */
  agent: { icon: Bot, labelKey: "app.agent" },
  /** 浏览器 — 线框地球图标（GlobeIcon），点击打开/聚焦内置浏览器窗口 */
  browser: { icon: GlobeIcon, labelKey: "app.browser" },
  /** 设置 — 齿轮图标，点击进入设置页 */
  settings: { icon: Settings, labelKey: "app.settings" },
};
