# Implementation Plan: 代码块内 Cmd+A 全选代码

**Branch**: `001-codeblock-select-all` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-codeblock-select-all/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command; its definition describes the execution workflow.

## Summary

用户希望光标在代码块内时按下 Cmd+A（macOS）/ Ctrl+A（Windows/Linux）
只选中该代码块内的全部代码文本，而不牵连文档其他内容；光标不在代码块
内时保持现有"全选整篇文档"行为不变。

**关键发现（研究阶段确认）**：该核心行为已经在
`src/lib/editor/extensions/selectAllText.ts`（`SelectAllText` TipTap
扩展）中实现并注册到两条编辑路径（`EditorPanel.tsx` 主编辑器、
`sectionEditor/extensions.ts` 分段编辑器）。因此本次实现的技术方案是
**验证并补齐现有实现相对 spec 边界情况的覆盖缺口**，而非从零编写全选
逻辑。已识别的缺口集中在：
1. 三击整块选中（`NodeSelection`）状态下再按 Cmd+A 未被现有逻辑处理
   （仅处理 `TextSelection` 内的 `$from` 深度遍历）。
2. 语言搜索下拉框（`<input>`）聚焦时，事件仍可能被 TipTap 的
   `Mod-a` keymap 捕获而非交给浏览器原生 input 全选。
3. 跨分段选区（`useCrossSectionSelection`）自身也拦截了 `mod+a`
   （文档级全选），需要确认其与代码块内全选的优先级/触发条件不冲突。
4. HTML/Mermaid 渲染预览模式下（源码 `<pre>` 隐藏）ProseMirror 选区
   仍可能存在，需要确认此时 Cmd+A 不会产生视觉异常。

## Technical Context

**Language/Version**: TypeScript ~5.8 (strict mode), React 19

**Primary Dependencies**: TipTap v3 (`@tiptap/core`, `@tiptap/pm`, `@tiptap/react`), `@tiptap/extension-code-block-lowlight`

**Storage**: N/A — 本功能纯前端交互行为，不涉及持久化数据

**Testing**: 项目当前无前端自动化测试框架（`package.json` 未配置
`test` script，`npm test` 会被 `Makefile` 的 `test-fe` 静默跳过）；验证
方式为手动交互测试（quickstart.md 提供的场景清单）+ `npm run lint:tsc`
类型检查

**Target Platform**: 桌面应用（Tauri v2，macOS / Windows / Linux），
渲染层为 WKWebView（macOS）/ WebView2（Windows）/ webkit2gtk（Linux）

**Project Type**: 桌面应用（单一前端项目 + Rust 后端，本功能只涉及
前端 `src/`）

**Performance Goals**: 键盘事件响应必须与其他编辑器快捷键（如
Mod-b/Mod-i）同等即时（< 一帧，无可感知延迟）；不引入额外的 DOM
查询或计算开销

**Constraints**: 必须兼容现有两条独立编辑器实例路径（主文档编辑器
`EditorPanel.tsx` 与分段编辑器 `sectionEditor/`），两者各自维护独立的
TipTap `Editor` 实例和扩展列表；不能引入与 `useCrossSectionSelection`
（跨分段选区）的 `mod+a` 拦截逻辑相冲突的行为

**Scale/Scope**: 影响面局限于代码块相关的键盘交互（`selectAllText.ts`
扩展 + 可能涉及 `CodeBlockView.tsx` 的语言搜索输入框事件隔离），不涉及
其他块类型或数据模型变更

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

依据 `.specify/memory/constitution.md` v2.0.0 逐项核对：

| 原则 | 适用性 | 结论 |
|------|--------|------|
| I. 混合持久化架构（SQLite + 文件系统） | 不适用 | 本功能是纯前端键盘交互，不涉及任何数据持久化，无需数据库/文件系统改动。 |
| II. 分层架构与单向依赖 | 适用 | 改动位于 `src/lib/editor/extensions/`（逻辑层，TipTap 扩展定义）和可能的 `src/components/editor/nodes/CodeBlockView.tsx`（视图层，输入框事件处理）。扩展定义属于 `lib/` 的合法内容（tiptap 扩展），不反向依赖 `components/` 业务组件。**PASS**。 |
| III. IPC 封装 | 不适用 | 无 Tauri IPC 调用。 |
| IV. 状态管理纪律 | 不适用 | 不涉及 Zustand store 读写；ProseMirror 选区状态由 TipTap `Editor` 实例内部管理，非全局 store 状态。 |
| V. 图模型允许环 | 不适用 | 与画板/图表块、文件夹树无关。 |
| VI. 类型安全与代码质量 | 适用 | 改动必须通过 `tsc` strict 检查；若新增/修改 `CodeBlockView.tsx` 中的逻辑需确认不超出 400 行组件红线（当前 796 行，已超红线——见下方 Complexity Tracking）。 |

**初次结论**：无违反原则的新增设计；`CodeBlockView.tsx` 已经是历史遗留的超红线文件（796 行，早于本功能存在），本功能倾向于最小侵入式修改（仅调整输入框的事件冒泡/阻断），不主动执行全文件拆分（拆分是独立的技术债任务，超出本功能范围）。已在 Complexity Tracking 中记录该既有超线情况以保持透明。

**Phase 1 设计后复审**：research.md 的调研结论表明，边界情况 2（语言
搜索输入框）、边界情况 4（渲染预览模式）均已被现有 DOM/ProseMirror
模型自然满足，**不需要修改 `CodeBlockView.tsx`**——仅需在
`selectAllText.ts` 内新增 `NodeSelection` 分支判断（边界情况 1）。
因此实际改动范围比 Technical Context 最初预估的更小，只集中在单一
逻辑层文件（`src/lib/editor/extensions/selectAllText.ts`），完全符合
原则 II（改动位于 `lib/`，不触及 `components/`）。`CodeBlockView.tsx`
的既有超线问题维持"不在本功能内处理"的结论不变。**PASS，无新增
违规**。

## Project Structure

### Documentation (this feature)

```text
specs/001-codeblock-select-all/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md         # Phase 1 output (/speckit.plan command)
├── quickstart.md         # Phase 1 output (/speckit.plan command)
├── contracts/            # Phase 1 output (/speckit.plan command) — interaction contract only
└── tasks.md              # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── lib/
│   └── editor/
│       └── extensions/
│           └── selectAllText.ts          # 核心逻辑：Mod-a 覆写，需扩展覆盖 NodeSelection 情形
└── components/
    └── editor/
        └── nodes/
            └── CodeBlockView.tsx          # 语言搜索 <input> 焦点场景下需确认/隔离 Mod-a 事件

# 注册点（无需新增文件，仅可能涉及行为确认）：
src/components/editor/EditorPanel.tsx               # 主编辑器扩展列表，已注册 SelectAllText
src/components/editor/sectionEditor/extensions.ts   # 分段编辑器扩展列表，已注册 SelectAllText
src/components/editor/sectionEditor/useCrossSectionSelection.ts  # 跨分段全选（mod+a），需确认无冲突
```

**Structure Decision**: 本功能是单一前端项目（Tauri 桌面应用）内的纯
交互逻辑修改，不引入新目录或新模块。改动集中在既有的 `src/lib/editor/
extensions/selectAllText.ts`（逻辑层，遵循原则 II 的 `lib/` 定位）；若
需要处理语言搜索输入框的事件隔离，则在 `src/components/editor/nodes/
CodeBlockView.tsx`（视图层）内做局部事件处理调整。两条独立编辑器路径
（主文档 / 分段）共享同一个 `SelectAllText` 扩展实例，因此修复一次即可
覆盖两处。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| `CodeBlockView.tsx` 已超过原则 VI 的 400 行组件红线（现状 796 行，早于本功能存在） | 本功能仅需在该文件内做局部的输入框事件处理调整（若研究阶段确认需要），大规模拆分是独立的架构债务，与本功能目标（修复 Cmd+A 选取范围）无关 | 若在本功能中顺带拆分该文件，会显著扩大改动面和回归风险，且需要对 HTML/Mermaid 预览、resize、语言下拉等无关逻辑做全面重测，超出本功能的独立可测试边界（违反 spec 中"最小化影响面"的隐含要求） |
