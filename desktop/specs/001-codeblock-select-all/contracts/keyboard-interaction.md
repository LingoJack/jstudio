# Interaction Contract: Mod-a (Cmd/Ctrl+A) 行为

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

本文档定义 `Mod-a`（macOS: Cmd+A，Windows/Linux: Ctrl+A）键盘事件在
编辑器不同状态下的确定性行为契约。这是本功能面向用户交互层的
"接口契约"（本功能无网络 API，故以键盘交互契约替代）。

**契约的实现位置**：`src/lib/editor/extensions/selectAllText.ts`
（`SelectAllText` TipTap 扩展的 `Mod-a` keymap handler）。

## 前置条件（Preconditions）

- 编辑器（主文档编辑器或分段编辑器）当前持有焦点。
- 事件尚未被 `event.defaultPrevented` 标记（即未被更高优先级的
  处理器消费）。

## 行为矩阵

| # | 输入状态 | 触发前选区/焦点 | 期望输出 | 对应 FR/场景 |
|---|----------|-----------------|----------|--------------|
| 1 | 光标（`TextSelection`，empty）位于某 `codeBlock` 内 | 编辑状态，光标在代码文本中 | 选区变为 `TextSelection(blockStart, blockEnd)`，精确覆盖该代码块全部文本，不含块外内容 | FR-001, FR-002, FR-003 / US1-AS1 |
| 2 | 光标（非空 `TextSelection`）已部分选中某 `codeBlock` 内的一段文本 | 已有局部选区 | 选区扩展为覆盖整个代码块（同 #1） | FR-002 |
| 3 | `NodeSelection` 指向某 `codeBlock` 节点（三击选中整块后） | 整块被选中（`.is-selected` 态） | 选区转换为 `TextSelection(blockStart, blockEnd)`，效果等同 #1，而不是回退到全文档选取 | Edge Case（三击后按 Cmd+A） |
| 4 | 光标位于空代码块内（`content.size === 0`） | 编辑状态，块内无文本 | 选区变为零长度 `TextSelection(blockStart, blockStart)`；不抛异常，不影响块外内容 | FR-005 / Edge Case（空代码块） |
| 5 | 光标位于任意 `codeBlock` 之外（普通段落/标题等） | 编辑状态 | 保持既有行为：选区扩展为覆盖整篇文档最后一个文本节点结束位置（现有全文档全选逻辑，不变） | FR-007 / US2-AS1 |
| 6 | 焦点位于代码块语言搜索 `<input>`（Portal 渲染，DOM 上脱离 `.ProseMirror`） | 下拉框打开，输入框聚焦 | 事件不进入 ProseMirror keymap；浏览器原生 `<input>` 全选行为生效（仅选中输入框内文本） | FR-006 / Edge Case（辅助控件焦点） |
| 7 | 光标位于处于"渲染预览模式"的代码块内（源码 `<pre>` 被 CSS 隐藏，但节点仍在文档模型中） | 预览态 | 行为同 #1（ProseMirror 层选区照常应用），但因源码不可见，用户无法感知高亮——不视为异常 | Edge Case（渲染预览模式） |
| 8 | 一个跨分段选区（`useCrossSectionSelection`）当前处于激活态（`active === true`），且事件被其 `document` 级监听器捕获 | 跨分段拖选后未清除 | 由跨分段选区自身的 `selectAll()` 处理（选中所有分段的全部内容），不进入 `codeBlock` 专属分支——这是既有系统边界，非本功能引入的新行为 | 研究阶段确认，非新增 FR |

## 后置条件（Postconditions，适用于 #1-#4）

- 选区被限定后，标准编辑操作 MUST 正确作用于该选区：
  - 复制（Mod-c）：剪贴板内容与代码块原始文本逐字符一致（FR-004,
    SC-003）。
  - 剪切（Mod-x）：代码块内容清空，光标留在块内空位置。
  - 删除（Backspace/Delete）：代码块内容清空。
  - 输入任意字符：代码块内容被替换为新输入的字符。
- 视觉高亮渲染 MUST 不出现异常溢出区域（例如 WebKit 在 `<pre>` 底部
  padding 处绘制的全宽高亮条问题，已被现有 `TextSelection` 构造方式
  规避，见 FR-008）。

## 不变式（Invariants）

- 任一时刻，`Mod-a` 触发后的选区边界 MUST 完全落在单一语义范围内
  （either 单个代码块，either 整篇文档），不存在"部分代码块 + 部分
  外部内容"的混合选区。
- 本契约的行为矩阵 MUST 同时适用于主文档编辑器（`EditorPanel.tsx`）
  与分段编辑器（`sectionEditor/`）两条路径，因为二者共享同一个
  `SelectAllText` 扩展实例。
