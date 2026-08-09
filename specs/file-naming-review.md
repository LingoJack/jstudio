# JStudio `src/` 文件命名评审报告

> 评审日期：2026-08-09 ｜ 范围：`src/` 全部 354 个 .ts/.tsx/.css 文件 ｜ 方法：5 个 thorough agent 分区梳理 + 关键论断交叉验证

## 评审标准

| 代号 | 原则 | 判定 |
|---|---|---|
| 一 | 见名知意 | 只看文件名+目录判断不出管什么 → 该改 |
| 二 | 名实相符 | 名字与实际代码职责不一致（误导/错位/残留）→ 该改 |
| 三 | 合乎约定 | 同目录守某规律唯它例外 → 该改（统一） |
| 四 | 历史遗留 | 无真实使用的遗留文件 → 清理，不考虑向后兼容 |

**成本门**：权衡 import 引用数、git 历史碎片化、review 噪音；成本高 ≠ 禁区，理解收益足够就值得做。
**误判提示**：.tsx↔.ts 互换通常无收益；两派命名若助理解则保留；名字相似职责不同且不混淆则保留。

## 结论速览

共发现 **18 项**（含 `sequence/` 4 文件一组），按收益/成本分级：

- **高收益 · 立即做（2 项）**：`SectionSkeleton` 名实不符、`sequence/` 死代码
- **中收益 · 建议做（10 项）**：归位/对称/职责错位类，多为 1–3 引用，成本低
- **低收益 · 可选/缓做（5 项）**：含 `storage.ts`（39 引用，建议先补 doc comment 缓解）
- **建议不动（1 项）**：`graphHelpers.ts` 拆分属过度工程

整体而言 `src/` 命名质量较高：`store/`、`types/`、`themes/`、`extensions/`、`slashMenu/commands/`、`tiptapAdapter/` 均已成体系，问题集中在少数名实错位与归位缺失。

---

## 一、高收益项（立即做）

### A1. `sectionEditor/SectionSkeleton.tsx` → `EditorSkeleton.tsx`

| 字段 | 值 |
|---|---|
| 违反原则 | 二（名实不符）+ 三（约定例外） |
| 问题 | 同目录 `SectionEditor.tsx`→导出 `SectionEditor`、`SectionOutline.tsx`→导出 `SectionOutline`，文件名=导出名；唯此文件导出 `EditorSkeleton`。且该组件是覆盖**整个编辑器区**的加载骨架（非单个 section），`SectionSkeleton` 名字反而误导 |
| 引用数 | 1 |
| 收益 | 高 |
| 动作 | 重命名文件为 `EditorSkeleton.tsx`（对齐导出名，而非反向改导出名） |

### A2. `lib/editor/sequence/` 4 文件 —— 死代码/WIP，需决策

| 文件 | 状态 |
|---|---|
| `sequence/sequenceConstants.ts` | 头注释自称"唯一常量真源"，但 HEAD_HEIGHT 等仍由 `customShapes.ts` 提供，零外部引用 |
| `sequence/sequenceModel.ts` | 定义 Participant/SeqMessage 接口，零外部引用 |
| `sequence/sequenceLayout.ts` | 头注释自称"唯一入口"，但 `layoutSequence()` 无调用方；三路径（mermaid/aiGraph/`graph/sequenceInteraction.ts`）各有内联实现 |
| `sequence/index.ts` | barrel re-export 上述三文件，零外部引用 |

| 字段 | 值 |
|---|---|
| 违反原则 | 四（历史遗留） |
| 引用数 | 0（已 grep 验证：`src/` 内无任何 `lib/editor/sequence` 的 import） |
| 收益 | 高 |
| 背景 | 存在 `.jcli/plans/plan-unify-sequence-diagram-logic.md` 规划文档，`sequence/` 系该计划产物，但三条消费路径均未接线 |
| 动作 | **二选一**：①完成三路径接线（落地统一抽象）；②删除 4 文件及 plan 文档。当前状态对后续维护者有误导（注释声称 SSOT/唯一入口却无消费方） |

---

## 二、中收益项（建议做）

> 以下多为 1–3 引用，改动成本极低，建议批量处理。

| # | 路径（相对 src/） | 现名 | 原则 | 问题简述 | 建议动作 | 引用数 |
|---|---|---|---|---|---|---|
| B1 | components/editor/nodes/graph/graphShapeMenu.ts | graphShapeMenu | 一+三 | 纯数据（shapeGroups/shapeTitleMap）却名像"菜单"，与组件 `GraphShapesMenu.tsx` 同名易点错。**已验证**：`GraphToolbar.tsx:24-25` 连续 import 二者，仅大小写+"s"之差 | → `shapeMenuData.ts` 或 `shapeCatalog.ts` | 2 |
| B2 | components/editor/nodes/codeBlockLanguages.ts | codeBlockLanguages | 三 | code-block 专属数据（LANGUAGES/getLanguageLabel），却游离在 `code-block/` 目录外 | 移入 `code-block/` | 2 |
| B3 | components/editor/nodes/mermaidConfig.ts | mermaidConfig | 三 | 仅被 `code-block/useMermaidPreview.ts` 引用，属 code-block 专属 | 移入 `code-block/` | 1 |
| B4 | components/editor/nodes/mermaidWindowHtml.ts | mermaidWindowHtml | 三 | 仅被 `CodeBlockView.tsx` 引用，属 code-block 专属 | 移入 `code-block/` | 1 |
| B5 | components/terminal/CursorTrail.ts | CursorTrail | 三 | 与 `ui/cursor/EditorCursorTrail.ts` 不对称；类名 `CursorTrail` 与基类 `BaseCursorTrail` 易混 | → `TerminalCursorTrail.ts`（含类名） | 1 |
| B6 | components/settings/TabBarSettings.tsx | TabBarSettings | 一+三 | 导出 `TabBarGlassOpacitySlider`+`TabBarPositionSelector` 两个 UI 控件，非 settings section；settings/ 约定 `*Section` 后缀，此 `*Settings` 暗示是 section 但实际不是 | → `TabBarControls.tsx` | 1 |
| B7 | components/documents/hooks/useSidebarHover.ts | useSidebarHover | 二 | 文件头自述"被 DocumentSidebar、AgentSidebar、BrowserSidebar 共用"，但路径 `documents/hooks/` 暗示文档专属 | 移至共享 `hooks/` | 3 |
| B8 | components/documents/hooks/useSidebarResize.ts | useSidebarResize | 二 | 被 AgentSidebar+DocumentSidebar 共用却置于 `documents/hooks/` | 移至共享 `hooks/` | 2 |
| B9 | lib/documents/migrate.ts | migrate | 一 | localStorage→FS 一次性迁移，"migrate"过笼统，与 `migrateAssets.ts`（base64→落盘）边界靠注释才能分清 | → `migrateLegacyStore.ts` | 1 |
| B10 | lib/export/download.ts | download | 二 | 单文件既做保存对话框又做图片/文本剪贴板复制，"download"仅覆盖保存半边 | → `fileExport.ts` | 1 |

---

## 三、低收益项（可选 / 缓做）

| # | 路径（相对 src/） | 现名 | 原则 | 问题简述 | 建议动作 | 引用数 | 收益 |
|---|---|---|---|---|---|---|---|
| C1 | lib/core/storage.ts | storage | 一+二 | 唯一 Tauri IPC 闸门（封装所有 `invoke`，含文档/终端/浏览器/设置），"storage"暗示通用存储，掩盖 IPC 边界 | → `ipc.ts`/`backend.ts`；**但 39 引用，建议先在文件头补一句"本模块是 Tauri IPC 唯一闸口"doc comment 作为低成本缓解，真正重命名留大重构窗口** | 39 | 中 |
| C2 | components/editor/nodes/graph/graphCanvasStyle.ts | graphCanvasStyle | 二 | 名为 canvasStyle，实则混装形状尺寸/标签/styleForShape + 网格/缩放/容差/连接点等画布配置常量，名实轻度错位 | → `graphConstants.ts`（或拆为 graphShapeConfig + graphCanvasConfig） | 10 | 低-中 |
| C3 | components/windows/CommandPaletteWindow.tsx | CommandPaletteWindow | 三 | windows/ 中 3/5 文件用 `*WindowApp`，此缺 "App" 后缀 | → `CommandPaletteWindowApp.tsx` | 1 | 低 |
| C4 | components/windows/LinkPreviewTabsApp.tsx | LinkPreviewTabsApp | 三 | 同目录约定 `*WindowApp`，此缺 "Window" | → `LinkPreviewTabsWindowApp.tsx` | 1 | 低 |
| C5 | lib/documents/assetGc.ts | assetGc | 一+二 | "Gc"缩写偏隐晦；实际行为是把孤儿资产移入 `.trash/` 回收站而非真正 GC/删除 | → `assetRecycle.ts` | 1 | 低 |

---

## 四、建议不动（评估后保留）

| 路径 | 现名 | 不动理由 |
|---|---|---|
| components/editor/nodes/graph/graphHelpers.ts | graphHelpers | 文件仅 79 行、3 引用且各取一值（isOnBorder/mindmapEdgeStyle/FLOW_ANIMATION_THRESHOLD/nextCellId 分属不同主题）；拆分有过度工程风险，保留并在 header 注明"杂烩"即可 |
| lib/editor/extensions/ 的 `*Extension` / 无后缀二分命名 | — | `*Extension.ts` 为 Tiptap Node 定义（block 类），无后缀者为 ProseMirror 插件/修复（bashTokens/lowlight/*Fix）；该区分**有助理解**，不应强行统一后缀（误判提示 2） |
| components/editor/sectionEditor/ResizableTableView.ts | ResizableTableView | `.ts + View` 是 ProseMirror NodeView 惯例，非误判（误判提示 1） |
| lib/windows/ 与 components/windows/ 同名 | — | 前者是开窗/分离工具函数与 hook（.ts），后者是窗口内渲染 App 根组件（.tsx）；职责分明，大小写与扩展名区分，不构成混淆 |

---

## 五、cursor 相关三文件关系澄清

三个 agent 均触及 cursor，为避免读者困惑，统一说明三者是**不同层**，非重复：

| 位置 | 角色 | 性质 | 评审结论 |
|---|---|---|---|
| `components/ui/cursor/`（8 文件） | WebGL 渲染库 | 纯 TS：BaseCursorTrail/EditorCursorTrail/shaders/trailMath 等 | 无问题 |
| `components/editor/CursorTrailContext.tsx` | React Context/Provider 桥接层 | 归 editor/ 合理（连接编辑器与渲染库） | 无问题 |
| `components/terminal/CursorTrail.ts` | 终端版光标轨迹 | 应与 EditorCursorTrail 对称 | **见 B5**：→ TerminalCursorTrail.ts |

---

## 六、已确认无问题的目录（占大多数）

以下目录/文件经逐一排查命名成体系、名实相符、引用关系清晰，**无需改动**：

- `src/store/`（16 文件）—— 标准 `useStore + storeHelpers + selectors + index + *Slice` 模式，12 slice 职责清晰
- `src/types/`（9 文件）—— 均以领域命名（agent/browser/document/editor/richText/settings/storage/terminal），无笼统名
- `src/lib/themes/`（8 文件）—— 5 主题 + registry/types/index 成体系
- `src/lib/editor/tiptapAdapter/`（6 文件）—— blocks/richText/table/list/todo 层次分明
- `src/lib/editor/slashMenu/commands/`（20 文件）—— 每文件导出 `{name}Command`，成体系
- `src/lib/editor/aiGraph/`（6 文件）—— Generator/Layout/Prompt/Schema/Validator 职责单一
- `src/lib/editor/mermaid/`（5 文件）—— flowchartConverter/sequenceConverter/mermaidParser 边界清晰
- `src/components/agent/` + `bubbles/` + `utils/` —— 命名一致（bubbles 6/8 守 `*Bubble`，例外有理由）
- `src/components/documents/` + `hooks/`（除 B7/B8）—— 组件与 hook 命名清晰
- `src/components/settings/`（除 B6）—— 14 个 `*Section.tsx` 一致
- `src/components/terminal/`（除 B5）—— 命名一致
- `src/components/ui/` + `ui/cursor/` —— 无问题
- `src/components/layout/`、`panels/`、`workspace/`、`data/`、`src/lib/shortcuts/`、`src/lib/constants/`、`src/lib/commandPalette/`、`src/lib/core/i18n/`、`src/lib/terminal/`、`src/lib/ime/`、`src/lib/windows/`、src 根文件 —— 均无问题

---

## 七、建议执行顺序

1. **先做 A2 决策**：确认 `sequence/` 重构计划是否继续——这是唯一需要你拍板的项，其余皆可直接执行。
2. **批量低成本项**（B1–B10 + C3/C4/C5，共 13 项，均 ≤3 引用）：可一次性提交，review 噪音小。
3. **A1 单独提交**：`SectionSkeleton→EditorSkeleton` 高收益、零外部消费者。
4. **C1 缓解先行**：先给 `storage.ts` 补 doc comment，真正重命名留大重构窗口。
5. **C2 视情**：`graphCanvasStyle` 改名 10 引用，建议结合下次 graph 子系统大改时顺手做。
