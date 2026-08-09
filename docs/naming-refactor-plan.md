# 文件命名清理方案（RENAME PLAN）

> 状态：**仅方案，未改动任何代码**（用户决策：先出方案文档）。
> 改动原则：每个文件重命名都必须同步更新所有 import / `mod` 声明；Rust 命令名（`fetch_link_metadata` 等）与文件名解耦，改 `link.rs` 不影响前端 `invoke` 字符串。
> 已 `grep` 出每个文件的引用点（见各条「引用清单」）。`dist/`、`node_modules/`、历史 `specs/`、`docs/` 中的文字提及不在改动范围，仅作提示。

---

## Tier 1 — 已确认执行（零风险机械修复 + 你拍板的命名统一）

### 1. `src/lib/editor/extensions/codeBlockExtension.tsx` → `codeBlockExtension.ts`
- **理由**：extensions 目录里唯一带 `.tsx` 的文件，且内容**不含任何 JSX**（纯 TS，仅 import 了 `CodeBlockView` 组件）。其余扩展全是 `.ts`。
- **导出符号**：`CodeBlockWithChrome`（不变）。
- **引用清单（需改 import 路径）**：
  - `src/components/editor/sectionEditor/extensions.ts:33` — `import { CodeBlockWithChrome } from '../../../lib/editor/extensions/codeBlockExtension';`
- **仅文字提及（不改）**：`specs/001-codeblock-select-all/*`、`docs/how-to-add-block-type.md`、`useCodeBlockSelectionOverlay.ts:29`、`CodeBlockView.tsx:113`。

### 2. `src/lib/editor/slashMenu/renderer.tsx` → `slashMenuRenderer.tsx`
- **理由**：导出函数即 `createSlashMenuRenderer`，同级 `SlashMenuList.tsx` 带 `SlashMenu` 前缀，本文件应统一前缀。
- **导出符号**：`createSlashMenuRenderer`（不变）。
- **引用清单**：
  - `src/lib/editor/slashMenu/index.ts:6` — `import { createSlashMenuRenderer } from './renderer';`

### 3. `src-tauri/src/commands/link.rs` → `link_preview.rs`
- **理由**：与同目录 `link_tabs.rs` 相比，`link.rs`（单链接预览后端：`fetch_link_metadata` / `open_link_preview`）过于笼统。
- **Rust 命令名不受影响**（命令名 ≠ 文件名）。
- **引用清单（仅 mod 声明）**：
  - `src-tauri/src/commands/mod.rs:8` — `pub mod link;`

### 4. `src/lib/core/activityMeta.ts` → `activityBarMeta.ts`
- **理由**："activity" 歧义（活动栏？行为日志？），实为左侧 Activity Bar 入口的图标/文案元数据。
- **导出符号**：`ACTIVITY_ITEM_META`（不变）。
- **引用清单**：
  - `src/lib/core/commandRegistry.ts:22` — `import { ACTIVITY_ITEM_META } from "./activityMeta";`
  - `src/components/layout/ActivityBar.tsx:3` — `import { ACTIVITY_ITEM_META } from "../../lib/core/activityMeta";`
  - `src/components/settings/ActivityBarItemsSection.tsx:5` — `import { ACTIVITY_ITEM_META } from '../../lib/core/activityMeta';`

### 5. `src/lib/editor/editorForKeyboardTarget.ts` → `resolveKeyboardTargetEditor.ts`
- **理由**：文件名即函数名，实际语义是「按键盘事件的 DOM target 反查对应的 section Editor 实例」。
- **导出符号**：`editorForKeyboardTarget`（函数重命名，调用处一并改）。
- **引用清单**：
  - `src/components/editor/sectionEditor/useEditorKeyboardNav.ts:17` — `import { editorForKeyboardTarget } from '../../../lib/editor/editorForKeyboardTarget';`
  - 同文件 `:51`、`:98` 两处调用 `editorForKeyboardTarget(...)`。
  - 仅文字提及：`src/lib/editor/focusedEditorRegistry.ts:7`。

### 6. `src/lib/documents/assetGc.ts` → `assetCleanup.ts`
- **理由**：`Gc` 缩写对非后端读者不友好（garbage collection）。
- **导出符号**：`collectReferencedAssets` / `gcDocumentAssets`（不变）。
- **引用清单**：
  - `src/store/trashSlice.ts:9` — `import { gcDocumentAssets } from "../lib/documents/assetGc";`

### 7. `src/lib/windows/previewWindow.ts` → `previewDetach.ts`
- **理由**：按你决策，windows 目录统一为 `xxxDetach.ts`（与 `terminalDetach.ts` / `documentDetach.ts` 对齐）。导出函数 `openPreviewWindow` / `openHtmlPreviewWindow` / `fetchPreviewData` / `closePreviewWindow` 名称保留（或一并改为 `openPreviewDetach` 等，见下方附注）。
- **引用清单**：
  - `src/components/windows/PreviewWindowApp.tsx:14` — `import { fetchPreviewData, closePreviewWindow, type PreviewPayload } from '../../lib/windows/previewWindow';`
  - `src/components/editor/nodes/ImageView.tsx:34` — `import { openPreviewWindow } from '../../../lib/windows/previewWindow';`
  - `src/components/editor/nodes/FileView.tsx:66` — `import { openPreviewWindow } from '../../../lib/windows/previewWindow';`
  - `src/components/editor/nodes/CodeBlockView.tsx:48` — `import { openHtmlPreviewWindow } from "../../../lib/windows/previewWindow";`

### 8. `src/lib/windows/diagramWindow.ts` → `diagramDetach.ts`
- **理由**：同上，统一 `xxxDetach.ts`。
- **导出符号**：`openDiagramWindow` 等（保留或一并改，见附注）。
- **引用清单**：
  - `src/components/windows/DiagramWindowApp.tsx:19` — `import { ... } from '../../lib/windows/diagramWindow';`
  - `src/components/editor/hooks/useDiagramWindow.ts:11` — `import { openDiagramWindow } from '../../../lib/windows/diagramWindow';`

> **附注（第 7、8 条二选一）**：
> - 方案 A（推荐，改动最小）：只改文件名 + import 路径，**保留** `openPreviewWindow` / `openDiagramWindow` 等函数名。文件名叫 Detach、函数叫 Window，内部一致即可，Blast radius 最小。
> - 方案 B（更彻底）：文件名 + 函数名一起改（`openPreviewWindow`→`openPreviewDetach` 等），牵涉 `PreviewWindowApp` / `DiagramWindowApp` 组件内的调用与 `?window=preview|diagram` 路由参数（路由参数**不要动**，否则影响已持久化的窗口状态）。

---

## Tier 2 — select-all 三件套轻量改名（已确认方向，本次一并列入）

> 三者是**三种不同职责**，不强行统一为一个名字，只消除各自的误导性：

### 9. `src/lib/editor/extensions/selectAllText.ts` → `selectAllKeymap.ts`
- **理由**："text" 有误导性（实际是 Mod-a 的 keymap 覆盖：代码块内只选代码块内容、否则选整篇为 TextSelection 以规避 WebKit 渲染 bug）。
- **导出符号**：`SelectAllText`（改 `SelectAllKeymap`）。
- **引用清单**：
  - `src/components/editor/sectionEditor/extensions.ts:36` — `import { SelectAllText } from '../../../lib/editor/extensions/selectAllText';`

### 10. `src/lib/shortcuts/nativeSelectAll.ts` → `inputSelectAll.ts`
- **理由**：文件/函数名暗示「原生全选主力路径」，但注释自承已是 legacy 兜底（Cmd+A 现由菜单 → `commandRegistry` → `app.selectAll` 转发）。改名去掉误导性的 "native"，并点明它是 **input/textarea** 专用。
- **导出符号**：`handleNativeSelectAll`（改 `handleInputSelectAll`）。
- **引用清单（共 19 处 import + 注释）**：
  - `src/components/editor/nodes/CollapsibleView.tsx:62`
  - `src/components/windows/LinkPreviewTabsApp.tsx:33`
  - `src/components/editor/nodes/graph/MermaidImportDialog.tsx:15`
  - `src/components/windows/CommandPaletteWindow.tsx:34`
  - `src/components/settings/GlobalShortcutsSection.tsx:39`
  - `src/components/documents/DocumentSidebar.tsx:4`
  - `src/components/editor/nodes/graph/AIGraphImportDialog.tsx:20`
  - `src/components/ui/TabBar.tsx:35`
  - `src/components/ui/FontDropdown.tsx:13`
  - `src/components/documents/DocumentTreeRenderer.tsx:16`
  - `src/components/editor/nodes/CodeBlockView.tsx:50`
  - `src/components/editor/nodes/code-block/LanguageDropdown.tsx:17`
  - `src/components/editor/nodes/LinkView.tsx:48`
  - `src/components/agent/ChatInput.tsx:7`
  - `src/components/editor/sectionEditor/FindBar.tsx:19`（另 `:95` 注释提及 `nativeSelectAll.ts`）
  - `src/components/editor/sectionEditor/DocumentPanel.tsx:38`
  - `src/components/editor/CommandPalette.tsx:26`
  - `src/components/documents/OpenDocumentDialog.tsx:16`
- **保留不动**：`src/lib/editor/selectAllRegistry.ts`（它确实是注册表，命名准确）。

---

## Tier 3 — 提议但建议暂缓（未纳入本次执行，待你确认）

### 11. `src/lib/commandPalette/shared.tsx` → 拆分（非单纯改名）
- **理由**："shared" 是代码异味，内容是互不相干的 helper 大杂烩：
  - `SETTINGS_SECTIONS`（设置区元数据常量）
  - `HighlightedText`（高亮文本组件）
  - `getSessionTitle`（会话标题）
  - `formatDate` / `formatDateOr`（日期格式化，被外部引用）
- **建议拆成**：
  - `paletteSettingsSections.tsx`（`SETTINGS_SECTIONS`）
  - `paletteFormat.ts`（`formatDate` / `formatDateOr` / `getSessionTitle`；注意 `formatDate` 被 `formatRelativeEditedTime.ts:9` 与 `DocumentPanel.tsx:46` 复用）
  - `HighlightedText` 就近内联或保留 `paletteText.tsx`
- **当前引用清单**（改名/拆分都需更新）：
  - `src/lib/documents/formatRelativeEditedTime.ts:9` — `import { formatDate } from '../commandPalette/shared';`
  - `src/components/documents/OpenDocumentDialog.tsx:14` — `import { HighlightedText, formatDateOr } from '../../lib/commandPalette/shared';`
  - `src/components/windows/CommandPaletteWindow.tsx:43` — `import { ... } from '../../lib/commandPalette/shared.tsx';`
  - `src/components/editor/sectionEditor/DocumentPanel.tsx:46` — `import { formatDate } from '../../../lib/commandPalette/shared';`
  - `src/components/editor/CommandPalette.tsx:35` — `import { ... } from '../../lib/commandPalette/shared.tsx';`
- **决策**：因 churn 较大且涉及对外（被 `documents/` 复用 `formatDate`），建议暂缓，先只做 Tier 1+2。

### 12. `extensions/` 目录命名约定（不强行统一，仅补文档）
- 现状：节点扩展用 `xxxExtension.ts`（collapsibleExtension / mathBlockExtension / linkExtension / imageExtension / diagramExtension / fileExtension / blockIdExtension），行为/keymap 扩展用 `xxx.ts`（selectAllKeymap / sectionHighlightSelection / sectionSearchHighlight / taskListMarkdown / customLinkAutolink / bashTokens / imeCapsLockFix / gapCursorClickFix / lowlight）。
- **建议**：这是合理约定（节点 vs 插件），**不强行全加 `Extension` 后缀**（纯噪音）。仅在 `CODEBUDDY.md` 补一句规则说明，并依靠本次已修的 `codeBlockExtension.tsx`  outlier 收口。

### 13. `sectionHighlightSelection.ts` vs `sectionSearchHighlight.ts`
- 名字高度相似、易混。除非后续真被坑过，否则暂缓。

---

## 执行顺序建议（待你确认后开始）
1. Tier 1 第 1–6 条（纯机械，各自 `git mv` + 改 import）。
2. Tier 1 第 7–8 条（`xxxDetach`，按附注方案 A）。
3. Tier 2 第 9–10 条（select-all 轻量改名）。
4. 跑 `npm run lint`（tsc --noEmit）+ `cargo check` 验证无悬空引用。
5. Tier 3 暂缓，后续单独立项。

## 预估改动规模
- 文件重命名：10 个（Tier 1 八个 + Tier 2 两个）。
- 需更新的 import/`mod` 行：约 **32 行**（nativeSelectAll 占 19 处）。
- Rust 侧仅 `commands/mod.rs` 一行。
