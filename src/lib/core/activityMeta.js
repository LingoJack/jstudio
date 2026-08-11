import {
  PenLine,
  Terminal,
  Bot,
  Globe,
  Settings
} from "lucide-react";
const ACTIVITY_ITEM_META = {
  /** 文档 — 笔形图标，点击进入笔记编辑器 */
  documents: { icon: PenLine, labelKey: "app.documents" },
  /** 终端 — 终端图标，点击进入内置终端 */
  terminal: { icon: Terminal, labelKey: "app.terminal" },
  /** 智能体 — Bot 图标，点击进入智能体聊天 */
  agent: { icon: Bot, labelKey: "app.agent" },
  /** 浏览器 — Globe 图标，点击打开/聚焦内置浏览器窗口 */
  browser: { icon: Globe, labelKey: "app.browser" },
  /** 设置 — 齿轮图标，点击进入设置页 */
  settings: { icon: Settings, labelKey: "app.settings" }
};
export {
  ACTIVITY_ITEM_META
};
