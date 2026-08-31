# Data Model: 代码块内 Cmd+A 全选代码

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

本功能不引入任何持久化数据结构变更（不涉及 SQLite 表、文件系统格式或
Tauri IPC payload）。以下实体均为**运行时概念模型**（ProseMirror/
TipTap 内存态），用于描述本功能操作的对象，非持久化 schema。

## 实体

### 代码块 (Code Block)

对应 ProseMirror 文档树中的 `codeBlock` 类型节点（由
`CodeBlockWithChrome` 扩展定义，见
`src/lib/editor/extensions/codeBlockExtension.tsx`）。

| 属性 | 类型 | 说明 |
|------|------|------|
| `node.type.name` | `string` | 固定为 `'codeBlock'`，用于判断祖先深度遍历是否命中 |
| `node.content` | `Fragment` | 代码块的纯文本内容（不含语言标注），`content.size` 用于计算选区终点 |
| `node.attrs.language` | `string \| undefined` | 语言标注，不影响本功能的选取逻辑 |
| `node.attrs.htmlPreview` / `mermaidPreview` | `boolean` | 是否处于渲染预览模式；不影响 ProseMirror 层的选区可选性（见 research.md §5） |

**关系**：一个文档（`doc`）包含零至多个 `codeBlock` 节点，彼此之间在
选取逻辑上完全独立（研究阶段边界情况已确认）。

**状态转换**：无持久化状态转换。运行时状态仅为"光标/选区当前是否
位于某个 `codeBlock` 内"这一瞬时判断，不跨会话保留。

### 选区 (Selection)

对应 ProseMirror 的 `Selection` 抽象，本功能涉及两种子类型：

| 子类型 | 触发场景 | 本功能的处理方式 |
|--------|----------|------------------|
| `TextSelection`（光标，`empty === true`） | 用户点击代码块内任意位置放置光标 | 通过 `$from.depth` 向上遍历判断是否处于 `codeBlock` 内（现有逻辑） |
| `NodeSelection`（三击选中整块） | 三击代码块触发 `handleTripleClickOn`（见 `codeBlockExtension.tsx`） | **需新增处理**：判断 `selection.node.type.name === 'codeBlock'`，直接选取该节点内容（见 research.md §2） |

**验证规则**（从 FR 派生）：
- 选区终点 MUST 不超过对应 `codeBlock` 节点的 `content.size` 边界
  （FR-003）。
- 选区为空的代码块（`content.size === 0`）时，构造的
  `TextSelection.create(doc, start, start)` MUST 不抛出异常（FR-005，
  ProseMirror 原生支持零长度选区，无需额外处理）。

## 无需数据契约的说明

本功能不产生对外接口（无 REST/GraphQL/Tauri command 变更），因此不生成
传统意义上的 API contract。Phase 1 的 `contracts/` 目录改为记录**键盘
交互行为契约**（见 `contracts/keyboard-interaction.md`），描述
`Mod-a` 在不同选区/焦点状态下的确定性行为映射，供后续实现与手动测试
对照验收标准。
