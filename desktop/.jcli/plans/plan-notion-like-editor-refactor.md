# Notion 风格编辑器重构方案

## 一、当前问题诊断

### 编辑体验问题（核心痛点）
| 问题 | 根因 |
|------|------|
| 光标上下移动不自然 | TextBlock/HeadingBlock 用 `<textarea>`，CalloutBlock/ToggleBlock 用 `<input>`，元素类型不统一，caret 工具函数要兼容三种 DOM |
| 无法选中、复制部分文字 | `<input>` 单行控件无法选中多行内容；`<textarea>` 的选中体验也和 contentEditable 不同 |
| 行内格式化（粗体/代码）只在 blur 时生效 | `formatMarkdown` 在 `onBlur` 时才执行正则替换，用户打字时看不到效果 |
| Wiki-link `[[ ]]` 污染内容 | 引用功能把 `<a>` 标签直接嵌入 content，导致光标移动和编辑混乱 |
| Backspace 合并体验差 | 合并逻辑用 innerHTML 字符串拼接，caret 恢复不可靠 |

### 存储问题
| 问题 | 说明 |
|------|------|
| 图片以 base64 嵌入 JSON | 文档体积膨胀，无法复用，粘贴图片时 JSON 可能超限 |
| 全局共享 assets 目录 | 无法区分哪个文档拥有哪个文件，删除文档后残留垃圾 |

### 过度设计功能
| 功能 | 说明 |
|------|------|
| 知识图谱 / 反向链接 | 右上角点击的图谱视图和 backlinks |
| Wiki-link `[[ ]]` 引用 | 在文本中嵌入 `[[文档名]]` 语法 |
| 右侧大纲面板 (ArticleOutline) | 显示标题层级的大纲 |
| 预设文档 | 首次启动时创建 3 个示例文档 |
| 收藏功能 | isFavorite 字段和相关 UI |

## 二、重构方案

### Phase 1: 统一编辑器核心 — 重写 EditableText 组件

**目标**: 用一个统一的 `contentEditable` 组件替代当前 4 种不同的编辑控件

当前各 block 使用不同的 DOM 元素：
```
TextBlock     → <textarea>     (多行纯文本)
HeadingBlock  → <textarea>     (标题)
CalloutBlock  → <input>        (单行)
ToggleBlock   → <input>        (单行)
```

重构后：
```
所有文本类 block → <EditableText>  (统一的 contentEditable div)
```

**新建 `EditableText.tsx`**（核心组件，约 200 行）：
- `contentEditable` div，通过 `data-placeholder` 实现占位符
- 统一的 `onKeyDown` 处理：上下箭头跨块导航、Enter 新建块、Backspace 合并块
- 统一的 `onInput` 处理：实时更新 store
- 不再做 blur 时格式化（移除 `formatMarkdown`）
- 支持原生浏览器的选中/复制/剪切（contentEditable 天然支持）

**Notion 风格键盘行为**：
| 按键 | 行为 |
|------|------|
| `Enter` | 在当前块下方创建新的文本块，光标移入新块 |
| `Shift+Enter` | 在当前块内插入换行 `<br>` |
| `Backspace`（块首） | 与上一个块合并 |
| `ArrowUp`（首行） | 光标移到上一个块末尾 |
| `ArrowDown`（末行） | 光标移到下一个块开头 |
| `Cmd/Ctrl+B` | 粗体（document.execCommand） |
| `Cmd/Ctrl+I` | 斜体 |
| `Cmd/Ctrl+E` | 行内代码 |
| `# ` 开头 + 空格 | 自动转换为 heading-1 |
| `## ` / `### ` | 转换为 heading-2 / heading-3 |
| `/` | 唤出 Slash 菜单 |

**重写 `useBlockEditor.ts`**（精简为约 150 行）：
- 移除复杂的 `useCaretUtils`（contentEditable 原生支持选中/复制）
- 移除 `formatMarkdown` 中的 wiki-link 处理
- 保留 slash 菜单逻辑和基本的块导航

**删除文件**：
- `useCaretUtils.ts`（311 行）— contentEditable 原生选中能力使这些不再需要
- 简化 `useKeyboardNavigation.ts` — contentEditable 的原生行为减少了自定义逻辑

### Phase 2: 每文档独立文件夹存储

**目标**: 每个文档拥有独立文件夹，图片等附件存在文档自己的文件夹内

**新存储结构**：
```
~/.jdata/studio/
├── index.json                          # 文档索引（元数据列表）
├── settings.json                       # 用户设置
└── documents/
    ├── {docId-1}/
    │   ├── document.json               # 文档数据（blocks 数组）
    │   └── assets/
    │       ├── image-001.png
    │       └── image-002.jpg
    └── {docId-2}/
        ├── document.json
        └── assets/
```

**修改 `lib/storage.ts`**：
- `saveDocument(doc)` → 写入 `documents/{id}/document.json`
- `loadDocument(id)` → 从 `documents/{id}/document.json` 读取
- `deleteDocument(id)` → 删除整个 `documents/{id}/` 文件夹
- 新增 `saveDocumentAsset(docId, fileName, bytes)` → 写入 `documents/{id}/assets/{fileName}`
- 新增 `readDocumentAsset(docId, fileName)` → 读取文档内资源

**修改 ImageBlock**：
- 粘贴图片时：将 base64 解码为二进制，调用 `saveDocumentAsset` 存入文档文件夹，block.content 存储相对路径 `assets/image-xxx.png`
- 显示图片时：从文件系统读取，转为 data URL 显示

**修改编辑器粘贴处理**：
- 在 `EditableText` 的 `onPaste` 中检测剪贴板是否含图片
- 如果是图片 → 保存到文档文件夹 → 在当前块下方插入 ImageBlock

### Phase 3: 移除过度设计功能

**删除的文件**：
| 文件 | 原因 |
|------|------|
| `ArticleOutline.tsx` | 右侧大纲面板 |
| `useCaretUtils.ts` | 被 contentEditable 原生能力替代 |
| `data/defaultData.ts` 中的示例文档 | 不再预设文档 |

**删除的功能模块**：
| 功能 | 涉及文件 |
|------|----------|
| Wiki-link `[[ ]]` | `shared.tsx` 的 `formatMarkdown`、`App.tsx` 的链接点击处理 |
| 反向链接 / Backlinks | `BlockEditor.tsx` 的 backlinks 渲染区域 |
| 知识图谱 | `App.tsx` 中的图谱相关代码 |
| 收藏功能 | `DocumentList.tsx` 的收藏 UI、`documentsSlice.ts` 的 `toggleFavorite` |
| 右侧大纲面板 | `App.tsx` 中 `ArticleOutline` 的渲染、`uiSlice.ts` 的 `isOutlineOpen` |

**App.tsx 简化**：
- 移除右侧大纲面板（`isOutlineOpen`、`ArticleOutline` 组件引用）
- 移除知识图谱 modal
- 移除 backlinks 区域
- 移除 wiki-link 点击事件委托

### Phase 4: 空启动体验

**目标**: 首次启动时不创建预设文档，给用户一个干净的空状态

**修改 `documentsSlice.ts` 的 `init()`**：
- 移除 `DEFAULT_DOCUMENTS` 引用
- 如果 `index.json` 不存在或为空 → 创建一个空的默认文档（标题为空，内容为单个空文本块）
- 不再 seed 3 个示例文档

## 三、修改清单

### 新建文件
| 文件 | 说明 |
|------|------|
| `components/blocks/EditableText.tsx` | 统一的 contentEditable 文本编辑组件 |

### 删除文件
| 文件 | 说明 |
|------|------|
| `components/ArticleOutline.tsx` | 右侧大纲（移除） |
| `components/blocks/useCaretUtils.ts` | 被原生能力替代 |

### 重写文件
| 文件 | 变化 |
|------|------|
| `components/blocks/TextBlock.tsx` | 用 EditableText 替代 textarea |
| `components/blocks/HeadingBlock.tsx` | 用 EditableText 替代 textarea |
| `components/blocks/CalloutBlock.tsx` | 用 EditableText 替代 input |
| `components/blocks/ToggleBlock.tsx` | 用 EditableText 替代 input |
| `components/blocks/useBlockEditor.ts` | 精简为 slash 菜单 + 基本导航 |
| `components/blocks/shared.tsx` | 移除 wiki-link 格式化、更新 SLASH_COMMANDS |
| `lib/storage.ts` | 每文档独立文件夹、资源存储 API |
| `App.tsx` | 移除大纲、图谱、backlinks、wiki-link |

### 修改文件
| 文件 | 变化 |
|------|------|
| `store/documentsSlice.ts` | 移除预设文档、移除 toggleFavorite、适配新存储 |
| `store/editorSlice.ts` | 新增 saveImageToDoc 方法 |
| `store/uiSlice.ts` | 移除 isOutlineOpen |
| `components/DocumentList.tsx` | 移除收藏 UI |
| `components/BlockEditor.tsx` | 移除 backlinks 渲染、适配新 ImageBlock |
| `components/blocks/ImageBlock.tsx` | 从文档文件夹读取图片 |
| `types/document.ts` | 简化 BlockProperties |

## 四、实施顺序

1. **Phase 3 先行** — 移除过度设计功能（减少干扰，降低后续重构的耦合面）
2. **Phase 2** — 存储架构改造（为 Phase 1 的粘贴图片功能做准备）
3. **Phase 1** — 编辑器核心重写（改动面最大，放在最后）
4. **Phase 4** — 空启动体验（收尾）

每个 Phase 完成后运行 `npm run build` 验证。
