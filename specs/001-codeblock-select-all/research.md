# Research: 代码块内 Cmd+A 全选代码

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

本文档记录 Phase 0 研究阶段对现状代码的调研结论，解决 Technical Context
中未展开的实现细节问题。核心结论：**核心行为已存在，本次工作是查漏
补缺，而非新建功能**。

---

## 1. 现有实现基线

**Decision**: 以 `src/lib/editor/extensions/selectAllText.ts` 中的
`SelectAllText` TipTap 扩展作为实现基线，在其现有的 `Mod-a` 处理逻辑
上补齐边界情况，而不是重新设计一套全选机制。

**Rationale**: 该扩展已经实现了 spec 中 User Story 1 和 User Story 2
的核心行为：
- 通过 `selection.$from` 向上遍历祖先节点深度，判断光标是否处于
  `codeBlock` 类型节点内（对应 FR-001）。
- 若在代码块内，构造 `TextSelection.create(doc, start, end)` 限定在该
  代码块的 `content.size` 范围内（对应 FR-002、FR-003）。
- 若不在代码块内，回退到"选中从文档开始到最后一个文本节点结束"的全
  文档选取逻辑（对应 FR-007），且特别处理了 WebKit 在 `AllSelection`
  模式下于 `<pre>` 底部 padding 处绘制异常高亮条的已知 bug（对应
  FR-008 的"不产生渲染异常"要求，已被现有实现覆盖）。

该扩展被同时注册在两条独立的编辑器初始化路径中：
- `src/components/editor/EditorPanel.tsx`（主文档编辑器，第 355 行）
- `src/components/editor/sectionEditor/extensions.ts`（分段编辑器，
  第 98 行）

两者共享同一个扩展实现，因此后续任何逻辑修复只需改动
`selectAllText.ts` 一处即可同时生效于两条路径。

**Alternatives considered**:
- *方案 A（否决）：重写一套全新的全选逻辑*——不可取，会重复实现已经
  正确处理的 WebKit 渲染 bug 规避逻辑，且增加不必要的回归风险。
- *方案 B（采纳）：在现有扩展基础上增量修复边界情况*——风险最小，
  改动面可控，符合 spec 中"最小化影响面"的隐含预期。

---

## 2. 边界情况 1：NodeSelection（三击整块选中）状态下按 Cmd+A

**Decision**: 需要在 `selectAllText.ts` 的 `Mod-a` 处理函数中新增对
`NodeSelection` 的分支判断：若当前选区是指向某个 `codeBlock` 节点的
`NodeSelection`，应直接选取该节点内部的文本内容（等价于光标在块内
时的效果），而不是走向"未匹配 codeBlock 深度 → 回退到全文档选取"的
错误路径。

**Rationale**: 现状代码的判断逻辑是
```ts
const { $from } = selection;
let codeBlockDepth = -1;
for (let d = $from.depth; d > 0; d--) {
  if ($from.node(d).type.name === 'codeBlock') { ... }
}
```
`selection.$from` 对 `NodeSelection` 而言指向的是被选中节点的**起始
边界位置**，其 `depth` 是该节点的父级深度，而不是节点内部深度——因此
当三击触发 `handleTripleClickOn`（见 `codeBlockExtension.tsx` 第
425-436 行）产生一个指向 `codeBlock` 节点本身的 `NodeSelection` 后，
现有的深度遍历判断可能无法正确识别"当前选中的节点恰好是 codeBlock"
这一情形，从而错误地走向"未找到 codeBlock → 全文档选取"分支，这正是
spec 中 Edge Case 列出的"三击整块选中后再按 Cmd+A 应选中块内代码而非
全文档"场景。

**Fix approach**: 在遍历祖先深度之前，先检查
`selection instanceof NodeSelection && selection.node.type.name ===
'codeBlock'`；若为真，直接以该节点的 `pos + 1` 到
`pos + 1 + node.content.size` 构造 `TextSelection`，复用现有的选取
构造逻辑分支。

**Alternatives considered**:
- *否决方案：忽略此边界情况*——被 spec 显式列为 Edge Case，且实测行为
  可能观感为"功能不生效"（用户三击选中代码块后再按 Cmd+A 意外全选了
  全文档），影响可信度，不予接受。

---

## 3. 边界情况 2：语言搜索输入框焦点下的 Cmd+A 隔离

**Decision**: 确认 TipTap 的 `addKeyboardShortcuts`（包括
`SelectAllText`）只在 ProseMirror 的 `contentEditable` 表面内触发；
`CodeBlockView.tsx` 中的语言搜索 `<input>`（第 665-697 行）是通过
`createPortal` 渲染到 `document.body` 的独立 DOM 节点，物理上位于
ProseMirror 编辑区域之外，其原生 `keydown` 事件不会被 ProseMirror 的
`handleKeyDown` / `addKeyboardShortcuts` 拦截捕获。

**Rationale**: TipTap/ProseMirror 的键盘快捷键系统通过 `keymap`
ProseMirror 插件监听编辑器 DOM 视图（`view.dom`）上的事件；由于
`createPortal(..., document.body)` 使得下拉搜索框在 DOM 树中脱离了
`.ProseMirror` 容器（尽管在 React 组件树中仍是子组件），其键盘事件
天然不会进入 ProseMirror 的 `handleKeyDown` 链路。因此 FR-006（辅助
控件焦点下应遵循控件自身默认全选行为）**在当前 DOM 结构下已经自然
满足**，不需要额外的事件隔离代码。

**Verification approach**: 该结论属于基于 DOM 事件冒泡模型和 TipTap
实现原理的静态分析，Phase 1 的 quickstart 验证场景中应包含"打开语言
搜索框 → 在搜索框内按 Cmd+A → 确认只选中搜索框文本"的手动测试步骤，
作为该结论的运行时验证，无需修改代码。

**Alternatives considered**:
- *方案（否决）：主动在 input 上加 `stopPropagation`*——不必要的
  防御性代码，可能反而阻断浏览器原生 input 全选的默认行为（原生
  `<input>` 的 Cmd+A 依赖事件正常冒泡到浏览器层，而非被 JS 拦截）。

---

## 4. 边界情况 3：跨分段选区（`useCrossSectionSelection`）的 Cmd+A 拦截

**Decision**: `useCrossSectionSelection.ts` 中监听 `document` 级别
`keydown`（第 341-352 行）拦截 `mod+a` 触发 `selectAll()`（跨分段选中
全文档），但该监听器**只在 `selRef.current` 非空时生效**（第 343 行
`if (!sel) return;`）——即只有当一个跨分段选区已经处于激活状态时，
这个文档级监听器才会拦截 Cmd+A。

**Rationale**: 光标单纯停留在某个代码块内（未发生跨分段拖选）时，
`selRef.current` 为 `null`，该 hook 的 `onKey` 直接 `return`，不会
拦截事件，因此不会与 `SelectAllText` 扩展的 `Mod-a` keymap 产生冲突
——两者的激活条件互斥（一个要求"当前存在跨分段选区"，另一个是
TipTap 编辑器内的常规 keymap，在无跨分段选区时正常触发）。

**Residual risk**: 若用户此前的操作导致了一个跨分段选区处于激活态
（`active === true`），此时点击进入某个代码块（应会通过
`onMouseDownCapture` 或聚焦变化清除跨分段选区状态，需在 Phase 1
quickstart 中加入"先制造跨分段选区，再点击代码块内部，确认跨分段
状态被清除后 Cmd+A 才应用代码块内全选"这一验证场景，以确认两个系统
之间没有状态残留导致的冲突）。

**Alternatives considered**:
- *方案（否决）：在 `SelectAllText` 扩展内主动检测并清除跨分段选区
  状态*——职责越界，`selectAllText.ts` 属于通用 TipTap 扩展，不应
  感知 `sectionEditor` 特有的跨分段选区实现细节；应通过验证现有清除
  时机（聚焦变化）是否已经覆盖该场景来确认，而非新增耦合代码。

---

## 5. 边界情况 4：HTML/Mermaid 渲染预览模式下的选区行为

**Decision**: 不需要为渲染预览模式编写特殊逻辑；ProseMirror 的
`codeBlock` 节点及其 `content`（源码文本）在预览模式下依然存在于
文档模型中，只是对应的 `<pre>` DOM 元素被 CSS
（`bodyStyle` 中 `display: 'none'`，见 `CodeBlockView.tsx` 第
612-616 行）隐藏，选区判断逻辑（基于 ProseMirror 文档位置而非 DOM
可见性）不受影响。

**Rationale**: `selectAllText.ts` 的判断完全基于 ProseMirror 的文档
模型（`$from.node(d)`、`node.content.size`），与 DOM 层的 CSS
显隐状态无关。即便源码 `<pre>` 被隐藏，其底层 ProseMirror 节点内容
仍然完整存在（否则退出预览模式后源码会丢失），因此触发 Cmd+A 时逻辑
行为与非预览模式一致——选中该代码块的文本内容。唯一的差异是选中后
的高亮**视觉上不可见**（因为 `<pre>` 被 `display: none`），这本身
不是错误，而是预期的"预览模式下看不到源码，也看不到源码的选区高亮"
的自然结果，不违反任何 FR。

**Verification approach**: Phase 1 quickstart 中加入"HTML 代码块开启
预览模式后，点击预览覆盖层选中节点、退出预览模式、确认此时代码内容
与 Cmd+A 行为正常"的验证步骤，确保退出预览后功能不受影响。

**Alternatives considered**:
- *方案（否决）：预览模式下禁用 Cmd+A*——过度设计，spec 的 Edge Case
  描述的顾虑（"没有可见文本可选"）在验证后被证明不构成实际问题，无需
  额外拦截逻辑。

---

## 已解决的 NEEDS CLARIFICATION 项

Technical Context 中没有遗留 `NEEDS CLARIFICATION` 标记——所有技术
选型（语言/框架/测试方式）均可从现有项目配置直接确定，无需澄清。
