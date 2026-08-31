# 迁移计划：BlockNote → TipTap

## 一、现状概述

当前 BlockNote 集成涉及 **3 个核心文件 + 2 个 CSS 文件 + store 层引用**：

| 文件 | 职责 | 迁移动作 |
|------|------|----------|
| `src/components/BlockEditor.tsx` | BlockNoteView 封装、标题输入、文档切换、防抖同步 | **重写** → TipTap Editor |
| `src/lib/blockNoteAdapter.ts` | `Block[] ⟷ PartialBlock[]` 双向转换 | **重写** → `tiptapAdapter.ts`（`Block[] ⟷ TipTap JSON`） |
| `src/lib/codeBlockEnterOverride.ts` | BlockNote Extension 覆盖代码块 Enter | **删除**（TipTap 代码块行为可原生配置） |
| `src/index.css` | BlockNote SideMenu hack | **清理** bn- 相关 CSS |
| `src/styles/vscode-theme.css` | 覆盖 BlockNote/Mantine 样式 | **清理** bn-/mantine 相关样式 |
| `src/store/editorSlice.ts` | `setActiveDocBlocks` 被 BlockEditor 调用 | **保留**（接口不变） |
| `src/store/storeHelpers.ts` | Store 类型定义含 BlockEditor 接口 | **保留** |

**关键约束**：`Block` / `RichText` / `Document` 数据模型（`types/document.ts`, `types/richText.ts`）**完全不变**，所有迁移只涉及编辑器层和适配层。

---

## 二、工作拆分（2 个 Agent 并行）

### Agent A：核心编辑器 + 适配层（lib 层）

**负责文件**：
1. `src/lib/tiptapAdapter.ts`（**新建**）— 替代 `blockNoteAdapter.ts`
2. `src/lib/tiptapExtensions.ts`（**新建**）— 自定义 Node/Mark 扩展
3. 删除 `src/lib/blockNoteAdapter.ts`
4. 删除 `src/lib/codeBlockEnterOverride.ts`
5. 更新 `src/index.css`（清理 bn- CSS hack）
6. 更新 `src/styles/vscode-theme.css`（清理 bn-/mantine 样式覆盖）
7. 更新 `package.json`（卸载 `@blocknote/*`，安装 `@tiptap/*`）

**详细任务**：

#### A1. 安装 TipTap 依赖
```bash
npm uninstall @blocknote/core @blocknote/react @blocknote/mantine
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit \
  @tiptap/extension-placeholder @tiptap/extension-image \
  @tiptap/extension-link @tiptap/extension-color \
  @tiptap/extension-text-style @tiptap/extension-underline \
  @tiptap/extension-code-block-lowlight
```

#### A2. 新建 `src/lib/tiptapAdapter.ts`
实现与 `blockNoteAdapter.ts` 完全对等的对外 API（函数签名不变，内部实现替换）：

```
// Block[] → TipTap JSON
export function ourBlocksToTiptapJSON(blocks: Block[]): JSONContent[]

// TipTap JSON → Block[]
export function tiptapJSONToOurBlocks(json: JSONContent[]): Block[]
```

映射关系：
| 我们的 BlockType | TipTap Node |
|-----------------|-------------|
| `text` | `paragraph` |
| `heading-1/2/3` | `heading` (level 1/2/3) |
| `code` | `codeBlock` |
| `image` | `image` |

内联格式映射（RichText annotations → TipTap marks）：
| RichText annotation | TipTap Mark |
|--------------------|-------------| 
| `bold` | `bold` |
| `italic` | `italic` |
| `underline` | `underline` |
| `strikethrough` | `strike` |
| `color` | `textStyle` + `color` |
| `href` | `link` |

#### A3. 新建 `src/lib/tiptapExtensions.ts`
- Slash Menu 扩展（基于 TipTap Suggestion API）
- 代码块 NodeView 扩展（可选，使用 `@tiptap/extension-code-block-lowlight` 替代）

#### A4. 清理 CSS
- `src/index.css`：删除 `.bn-editor-container` / `.bn-side-menu` hack（第 7-20 行）
- `src/styles/vscode-theme.css`：删除所有 bn-/mantine 样式覆盖，改为 TipTap ProseMirror 类名（`.ProseMirror`）

---

### Agent B：React 组件层 + 集成验证

**负责文件**：
1. `src/components/BlockEditor.tsx`（**重写**）
2. `src/components/index.ts`（检查导出不变）
3. `src/store/editorSlice.ts`（检查 `setActiveDocBlocks` 接口兼容）
4. `src/data/defaultData.ts`（检查数据格式兼容）

**详细任务**：

#### B1. 重写 `BlockEditor.tsx`
用 `@tiptap/react` 的 `useEditor` + `EditorContent` 替代 BlockNoteView，保留全部外部行为：

- 标题输入区域（`<input>` + 键盘导航逻辑）
- 文档切换时加载内容（`editor.commands.setContent()`）
- 防抖同步到 store（`onChange` → `setActiveDocBlocks`）
- 图片上传（复用 `uploadFile` 逻辑，保存到 doc assets 文件夹）
- Slash Menu（`/` 触发命令面板）
- Ctrl+A 全选
- 深色/浅色主题切换
- VSCode CSS 变量样式集成

#### B2. 数据流验证
确保重写后的组件与 store 层接口完全兼容：
- `useStore.getState().setActiveDocBlocks(blocks)` 调用不变
- `useStore.getState().activeDoc.blocks` 读取不变
- `updateDocumentMeta({ title })` 调用不变

---

## 三、执行策略

由于两个 Agent 会修改同一个 `BlockEditor.tsx` 和需要共享 TipTap 适配层 API，存在依赖关系。因此采用 **串行+并行混合策略**：

```
Phase 1（Agent A 独立完成）: 适配层 + 依赖安装 + CSS 清理
    ↓ (Agent A 完成后 Agent B 可以开始)
Phase 2（Agent B 独立完成）: BlockEditor.tsx 重写 + 集成
    ↓
Phase 3（主 Agent 汇总）: 全局验证 + 构建 + 修复
```

### 并行优化方案（推荐）

为了让两个 Agent 真正并行，Agent A 先快速定义好 `tiptapAdapter.ts` 的 **类型接口**（函数签名），然后两个 Agent 各自并行工作：

**Agent A 工作清单**：
1. 安装 TipTap 依赖、卸载 BlockNote 依赖
2. 创建 `tiptapAdapter.ts`（完整实现）
3. 创建 `tiptapExtensions.ts`（Slash Menu 等）
4. 清理 CSS 文件
5. 删除 `blockNoteAdapter.ts` 和 `codeBlockEnterOverride.ts`

**Agent B 工作清单（与 A 并行，使用 worktree 隔离）**：
1. 重写 `BlockEditor.tsx`（基于 TipTap API + 约定的适配层函数签名）
2. 验证 store 层兼容性
3. 确保 `defaultData.ts` 数据格式兼容

**合并**：Agent A 先合并到主分支，Agent B 的 worktree rebase 后合并。

---

## 四、Agent Prompt 设计

### Agent A Prompt（适配层 + 基础设施）

```
你负责将 jstudio 项目的编辑器适配层从 BlockNote 迁移到 TipTap。

## 你的任务

1. 在 package.json 中卸载 @blocknote/* 依赖，安装 @tiptap/* 依赖
2. 新建 src/lib/tiptapAdapter.ts，实现 Block[] ↔ TipTap JSON 双向转换
3. 新建 src/lib/tiptapExtensions.ts，包含 Slash Menu 扩展
4. 删除 src/lib/blockNoteAdapter.ts 和 src/lib/codeBlockEnterOverride.ts
5. 清理 src/index.css 和 src/styles/vscode-theme.css 中的 BlockNote/Mantine 样式

## 关键约束
- 数据模型 types/document.ts 和 types/richText.ts 绝对不能修改
- tiptapAdapter.ts 的导出函数签名必须与原 blockNoteAdapter.ts 对等
- 清理 CSS 后需要保留 TipTap 的 .ProseMirror 基础样式占位
```

### Agent B Prompt（组件层 + 集成）

```
你负责将 jstudio 的 BlockEditor 组件从 BlockNote 迁移到 TipTap。

## 你的任务

1. 重写 src/components/BlockEditor.tsx，用 @tiptap/react 的 useEditor + EditorContent 替代 BlockNoteView
2. 保留全部现有功能：标题输入、文档切换、防抖同步、图片上传、Slash Menu、Ctrl+A、主题切换
3. 验证 store 层（editorSlice.ts）和数据层（defaultData.ts）的接口兼容性

## 关键约束
- 组件对外接口不变：仍是 default export，仍从 useStore 读取 activeDoc
- 数据同步仍通过 setActiveDocBlocks(blocks) 写回 store
- 使用 TipTap 的 onChange 事件 + editor.getJSON() 获取内容
- 适配层函数从 src/lib/tiptapAdapter.ts 导入（Agent A 负责实现）
```

---

## 五、风险与回滚

- **回滚方案**：迁移前打 git tag `pre-tiptap-migration`，如果出问题可以 `git reset`
- **数据兼容**：Block[] 数据格式不变，现有文档无需迁移
- **构建验证**：每个 Agent 完成后运行 `npm run build` 确认无编译错误

---

## 六、验证清单

- [ ] `npm run build` 无编译错误
- [ ] 创建新文档 → 输入文本 → 切换文档 → 切回，内容保留
- [ ] 标题输入正常，Enter 可聚焦编辑器
- [ ] Slash Menu（/ 触发）可创建 heading/code/image
- [ ] 代码块显示正常，Enter 不触发异常行为
- [ ] 图片粘贴/拖拽可插入
- [ ] 深色/浅色主题切换正常
- [ ] Ctrl+A 全选正常
