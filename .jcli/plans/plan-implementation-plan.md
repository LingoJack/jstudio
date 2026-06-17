# 实现计划：File Block 对齐 Image Block + 可维护性重构

## 问题诊断

### Bug 1：iframe 吞掉鼠标事件导致无法选中/删除
- **根因**：HTML/PDF 预览使用 `<iframe>`，点击 iframe 内部不会触发父文档的 mousedown，ProseMirror 无法感知点击 → 节点无法被选中 → 无法 Backspace 删除
- **修复**：当节点未被选中时，在 iframe 上方覆盖一层透明 `pointer-events: auto` 的 `<div>` 拦截点击 → 选中节点；选中后移除覆盖层让用户交互预览内容

### Bug 2：常态无边框
- **根因**：`.file-block-figure` 当前 `border: 2px solid transparent`，与 image 一样不显示常态边框
- **修复**：改为 `border: 1px solid var(--vscode-widget-border)`（常态可见），选中时升级为 `2px solid var(--vscode-focusBorder)`

### Bug 3：无法调节大小
- **根因**：FileView 完全没有 resize 逻辑
- **修复**：仿照 ImageView 添加 `width` 属性 + pointer-drag resize handle

### 可维护性问题
1. **UploadIcon** 在 ImageView 和 FileView 中逐字节重复
2. **上传管线**（Tauri dialog → readFileBytes → saveDocAsset → base64 dataURL）在 ImageView、FileView、BlockEditor 中重复 3 次
3. **文件工具函数**（formatFileSize、getExtension、MIME 映射）散落在 FileView 内部

---

## 改动清单（7 项）

### 1. 新建 `src/lib/upload.ts` — 统一上传管线
提取共享逻辑：
```
uploadFileViaDialog(extensions: string[]): Promise<{dataUrl, fileName, fileSize, mime} | null>
bytesToDataUrl(bytes: number[], mime: string): string
```
- 封装 Tauri dialog open + readFileBytes + saveDocAsset + readDocAssetBase64
- ImageView / FileView / BlockEditor 三处复用

### 2. 新建 `src/lib/fileUtils.ts` — 共享文件工具函数
提取 FileView 内部的函数：
```
formatFileSize(bytes: number): string
getExtension(fileName: string): string
getMimeType(ext: string): string
```
ImageView 中内联的 mime 推断也可复用。

### 3. 新建 `src/components/shared/icons.tsx` — 共享图标组件
提取 ImageView/FileView 重复的 `UploadIcon`，以及可能复用的其他 SVG。

### 4. 重写 `src/components/FileView.tsx`
**核心改动**：
- 移除内联的 UploadIcon / formatFileSize / getExtension / MIME 映射 → 引用共享模块
- **iframe 覆盖层**：`{!selected && <div className="file-block-preview-overlay" />}` 透明覆盖层，仅未选中时存在，拦截点击使节点被选中
- **常态边框**：CSS `.file-block-figure` 改为 `1px solid widget-border`
- **resize 功能**：添加 `width` 属性 + displayWidth 状态 + resize handle（仿 ImageView）
- **resize handle** 仅在 preview 模式且 selected 时显示
- toolbar（card/preview 切换）改为 `{selected && ...}`，与 ImageView 的 toolbar 一致

### 5. 更新 `src/lib/fileExtension.ts`
- `addAttributes` 新增 `width` 属性（number | null）
- `setFile` 命令的默认 attrs 中加入 `width: null`

### 6. 更新 `src/components/ImageView.tsx` + `src/components/BlockEditor.tsx`
- 引用 `upload.ts` 和 `icons.tsx`，删除内部重复代码

### 7. 更新 `src/styles/vscode-theme.css`
- `.file-block-figure` 常态边框 `1px solid widget-border`，选中 `2px solid focusBorder`
- 新增 `.file-block-preview-overlay`（透明全屏覆盖，pointer-events auto）
- 新增 `.file-block-resize-handle`（复用 image-resize-handle 样式）
- `.file-block-preview-frame` 支持 `height` 由 `width` attr 驱动（通过 inline style）

---

## 文件影响一览

| 文件 | 操作 |
|------|------|
| `src/lib/upload.ts` | **新建** |
| `src/lib/fileUtils.ts` | **新建** |
| `src/components/shared/icons.tsx` | **新建** |
| `src/components/FileView.tsx` | **重写** |
| `src/lib/fileExtension.ts` | 修改（加 width） |
| `src/components/ImageView.tsx` | 修改（引用共享模块） |
| `src/components/BlockEditor.tsx` | 修改（引用共享模块） |
| `src/styles/vscode-theme.css` | 修改（边框/覆盖层/handle） |

## 验证
- `npx tsc --noEmit` 类型检查通过
- `npm run build` 构建通过
