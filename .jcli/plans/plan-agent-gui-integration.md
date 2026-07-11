# Agent GUI Integration 计划

## 背景

用户希望在 JStudio 中复用 `jcli/j-agent/` 作为 agent 引擎，为 ActivityBar 新增一个 Agent 页面（GUI 版本）。现有 TUI 在 terminal 中运行，GUI 需要将会话内容渲染为 Markdown 气泡（只读，不可编辑）。

## 现状分析

### 已完成的部分

| 层 | 文件 | 状态 | 说明 |
|----|------|------|------|
| **后端 Rust** | `src-tauri/src/commands/agent.rs` | ✅ 完整 | 桥接 j-agent 核心，实现所有 CRUD + 流式命令 |
| **类型定义** | `src/types/agent.ts` | ✅ 完整 | ChatMessage, AgentSession, ToolCallItem 等 |
| **Store slice** | `src/store/agentSlice.ts` | ✅ 完整 | 会话管理、消息发送、事件监听 |
| **主面板** | `src/components/agent/AgentPanel.tsx` | ✅ 完整 | 会话列表（按 workspace 分组）+ 聊天区域 |
| **Markdown 渲染** | `src/components/agent/MarkdownMessage.tsx` | ❌ 缺依赖 | 引用 `./extensions/lowlight` 但文件不存在 |
| **i18n 翻译** | `src/lib/core/i18n.ts` | ✅ 完整 | `agent.*` 翻译已齐全（中/英） |
| **App.tsx** | `src/App.tsx` | ✅ 已集成 | AgentPanel 已挂载，CSS-hide 模式 |
| **ActivityBar** | `src/lib/activityMeta.ts` | ✅ 已配置 | `'agent'` 已在 ActivityItemId 中 |
| **Storage API** | `src/lib/core/storage.ts` | ✅ 完整 | agent* 命令封装已实现 |

### 发现的问题

1. **MarkdownMessage.tsx 导入路径错误** ✅ 已定位
   - 当前引用：`import { lowlight } from './extensions/lowlight'`
   - 实际位置：`src/lib/editor/extensions/lowlight.ts`
   - 修复方案：修改导入路径为 `../../lib/editor/extensions/lowlight`
   - 无需创建新文件，直接复用现有 lowlight 配置

2. **agentSlice.ts 已正确集成** ✅ 已确认
   - `src/store/useStore.ts` 已导入 `createAgentSlice`
   - store 组装正确

3. **依赖已存在** ✅ 已确认
   - `react-markdown: ^10.1.0` ✅
   - `remark-gfm: ^4.0.1` ✅
   - `lowlight` (通过编辑器依赖) ✅

## 待完成的工作

### Phase 1: 修复编译问题（阻塞）⚡ 最高优先级

**唯一阻塞问题**：MarkdownMessage.tsx 的 lowlight 导入路径错误

修复方案：
```typescript
// 当前（错误）
import { lowlight } from './extensions/lowlight';

// 修复后
import { lowlight } from '../../lib/editor/extensions/lowlight';
```

执行步骤：
1. 修改 `src/components/agent/MarkdownMessage.tsx` 第 12 行
2. 运行 `npx tsc --noEmit` 确认零错误
3. 运行 `npm run tauri dev` 验证 Agent 页面可正常切换和显示

### Phase 2: 功能验证与测试

修复编译后需要验证的功能点：

1. **ActivityBar 切换**
   - 点击 Agent 图标切换到 AgentPanel
   - 验证其他视图（文档列表、设置）切换正常

2. **会话管理**
   - 创建新会话（workspace 分组）
   - 切换会话
   - 删除会话

3. **消息发送与接收**
   - 发送用户消息
   - 接收 assistant 响应（流式）
   - Markdown 渲染（代码块高亮、表格、列表、链接）
   - Tool call 显示与确认

4. **样式验证**
   - 4 主题适配（JStudio Light/Dark、Ink Light/Dark）
   - 用户/assistant 消息气泡区分
   - CSS 变量使用正确

### Phase 3: 代码结构整理（可选）

如果用户认为代码结构不规范，可进行以下优化：

1. **agent 组件目录结构**
   ```
   src/components/agent/
   ├── AgentPanel.tsx        # 主面板
   ├── MarkdownMessage.tsx   # Markdown 渲染
   ├── MessageBubble.tsx     # 消息气泡（可选提取）
   ├── ToolCallConfirm.tsx   # 工具确认（可选提取）
   └── index.ts              # barrel export
   ```

2. **添加 agent selectors**
   - `src/store/selectors.ts` 添加 agent 相关 selectors
   - 便于其他组件访问 agent 状态

## 技术方案

### Markdown 渲染方案（已采用）

MarkdownMessage.tsx 已正确使用 `react-markdown` + `remark-gfm` + `lowlight` 组合：

- **react-markdown**: Markdown 解析和渲染
- **remark-gfm**: GitHub Flavored Markdown 支持（表格、任务列表等）
- **lowlight**: 代码块语法高亮（复用编辑器配置）

样式使用 `var(--vscode-*)` CSS 变量，与项目主题系统一致。

### 消息气泡设计

AgentPanel.tsx 已实现：
- 用户消息：右侧对齐，简洁样式
- assistant 消息：左侧对齐，带 Markdown 渲染
- tool call：显示工具名称、参数，确认/拒绝按钮

## 执行步骤

### 立即执行（修复阻塞）

1. 修改 `src/components/agent/MarkdownMessage.tsx` 第 12 行
   - `import { lowlight } from './extensions/lowlight'` → `import { lowlight } from '../../lib/editor/extensions/lowlight'`

2. 验证编译
   ```bash
   npx tsc --noEmit
   ```

3. 运行应用测试
   ```bash
   npm run tauri dev
   ```

### 后续验证

- 切换到 Agent 页面，验证 UI 显示正常
- 创建会话，发送消息，验证 Markdown 渲染
- 切换主题，验证样式适配

## 风险与注意事项

1. **TipTap 版本兼容**
   - 确认 TipTap extensions 版本与 MarkdownMessage 使用一致

2. **依赖冲突**
   - lowlight/highlight.js 可能已存在于编辑器依赖中
   - 需要检查 package.json 避免重复安装

3. **性能考虑**
   - 消息列表可能很长，需要考虑虚拟滚动
   - streaming 时避免频繁重渲染

## 后续优化（可选）

- 消息搜索
- 会话归档/恢复
- 多模型切换（Settings 页已实现）
- 图片支持（多模态）
- 快捷键支持（Cmd+N 新建会话等）