# 重构方案：将 sandbox 拆分为「网页嵌入」和「附件」块

## 背景

当前 `html-render` 块（即 sandbox）把三种功能混在一起，导致代码臃肿、职责不清：
1. HTML/CSS/JS **代码编辑器** + 实时预览
2. **URL 网页嵌入**（iframe 加载外部 URL）
3. **文件上传预览**（上传 HTML 文件，iframe 预览）

## 目标拆分

将原来的 `html-render` 块彻底移除，拆分为**三个**各司其职的块：

| 新块类型 | 职责 | 说明 |
|---------|------|------|
| `web-embed`（网页） | 内嵌一个网页（URL） | 纯 URL 输入 + iframe 预览 + 独立窗口打开 |
| `attachment`（附件） | 文件附件容器 | 支持各种文件（含 HTML 文件预览、图片预览、其他文件卡片展示） |
| `code`（代码块 - 复用现有） | HTML 代码渲染 | 在现有代码块中，当语言为 HTML 时增加"渲染预览"能力 |

> 说明：用户确认 HTML 代码编辑/预览可以放到「代码块」中实现（类似 Python 可以运行，HTML 可以渲染），不再单独保留代码沙盒。

---

## 详细设计

### 1. 新增 `web-embed` 块（网页嵌入）

**类型**：`web-embed`

**BlockProperties 新增字段**：
- `embedUrl?: string` — 要嵌入的网页 URL

**UI 设计**：
- 顶部紧凑工具栏：URL 输入框 + "打开独立窗口"按钮 + 刷新按钮 + 清除按钮
- 下方 iframe 预览区域（高度 400px）
- URL 自动补全 `https://` 前缀
- 空状态：提示输入 URL
- 支持拖放 URL 到预览区

**复用现有代码**：
- `normalizeSandboxUrl()` 函数
- `openSandboxWebPreviewWindow()` 的逻辑（Tauri WebviewWindow 独立窗口）

### 2. 新增 `attachment` 块（文件附件）

**类型**：`attachment`

**BlockProperties 新增字段**：
- `attachmentName?: string` — 文件名
- `attachmentType?: string` — MIME 类型
- `attachmentSize?: string` — 文件大小（人类可读）
- `attachmentMode?: 'preview' | 'card'` — 展示模式

**Block.content**：存储文件的 data URL（base64），**不持久化到 localStorage**（大文件会导致 localStorage 溢出）。文件数据仅保存在组件 state 中，localStorage 只存元信息。

**展示模式**：

#### A. 预览模式（preview）— 部分文件类型支持
- **HTML 文件**：iframe 渲染预览
- **图片文件**：`<img>` 展示
- **其他文件**：自动回退到卡片模式

#### B. 卡片模式（card）— 所有文件通用
- 显示文件图标（根据 MIME 类型选择）
- 文件名
- 文件大小、类型、创建时间
- "下载"按钮、"重新上传"按钮
- 用户可手动切换到卡片模式（即使可预览的文件）

**UI 设计**：
- 上传入口：点击选择文件 或 拖放文件
- 顶部工具栏：文件名显示 + 模式切换（预览/卡片）+ 重新上传 + 清除
- 默认：可预览文件类型自动选 preview，不可预览类型自动选 card

### 3. 代码块增强（CodeBlock.tsx）

在现有 CodeBlock 中，当语言为 `html` 时，增加一个"渲染"按钮/标签页，可以切换查看代码的渲染效果。

**实现方式**：
- 在 CodeBlock header 增加一个"预览"切换按钮（仅 HTML 语言时显示）
- 点击后展开一个 iframe 区域，srcDoc 为代码内容
- 复用 sandbox iframe 安全配置

### 4. 类型定义调整（types.ts）

```typescript
export type BlockType =
  | 'text' | 'heading-1' | 'heading-2' | 'heading-3'
  | 'code' | 'table' | 'canvas' | 'callout' | 'image'
  | 'toggle' | 'whiteboard'
  | 'web-embed'    // 新增：网页嵌入
  | 'attachment';  // 新增：文件附件
  // 移除 'html-render'

export interface BlockProperties {
  // ... 保留现有字段
  // 新增 web-embed 字段
  embedUrl?: string;
  // 新增 attachment 字段
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: string;
  attachmentMode?: 'preview' | 'card';
  // 移除所有 sandbox* 字段和 cssCode/jsCode/sandboxTheme
}
```

### 5. 数据迁移与兼容

- 斜杠菜单 `/` 更新：移除"HTML 沙盒"，新增"网页"和"附件"
- 默认文档数据中 `html-render` 类型的块需要迁移为新的块类型

---

## 实施步骤

### Step 1: 更新类型定义（types.ts）
- 移除 `html-render`，新增 `web-embed` 和 `attachment`
- 移除旧的 sandbox 相关 properties，新增对应字段

### Step 2: 创建 WebEmbedBlock 组件
- 新文件：`src/components/WebEmbedBlock.tsx`
- 从 BlockItem 中提取 URL 嵌入相关逻辑
- 实现：URL 输入 + iframe 预览 + 独立窗口 + 拖放

### Step 3: 创建 AttachmentBlock 组件
- 新文件：`src/components/AttachmentBlock.tsx`
- 实现：文件上传 + 双模式展示（预览/卡片）

### Step 4: 重构 BlockItem.tsx
- 移除所有 `html-render` / sandbox 相关代码（约 600 行）
- 新增 `web-embed` 和 `attachment` 块的渲染分支
- 更新斜杠菜单命令列表

### Step 5: 增强 CodeBlock.tsx
- 为 HTML 语言添加渲染预览功能

### Step 6: 更新默认文档数据（defaultData.ts）
- 将 `html-render` 块迁移为新的块类型

### Step 7: 更新 App.tsx 的 handleInsertAssetAsBlock
- 将非图片附件的插入逻辑改为创建 `attachment` 块而非 `callout` 块

---

## 预期收益

1. **职责清晰**：每个块只做一件事
2. **代码精简**：BlockItem.tsx 从 ~2140 行减少约 600 行
3. **体验提升**：附件块提供更专业的文件管理卡片视图
4. **可扩展**：附件块后续可方便扩展更多文件类型的预览支持
