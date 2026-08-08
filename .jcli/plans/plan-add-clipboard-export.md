# 方案：添加复制到剪贴板功能

## 背景

导出 PNG/SVG 已通过 Tauri `save()` 对话框实现。用户还需要"直接复制到剪贴板"的快捷操作。

## 实现方案

### 1. Rust 后端：新增 `copy_image_bytes_to_clipboard` 命令

**文件**：`src-tauri/src/commands/storage/paths.rs`

现有 `copy_image_to_clipboard(path)` 从文件路径读取图片再写入剪贴板。新增一个接受原始字节的版本，避免写临时文件：

```rust
#[tauri::command]
pub async fn copy_image_bytes_to_clipboard(app: tauri::AppHandle, data: Vec<u8>) -> Result<(), String> {
    // 复用 image::load_from_memory + to_rgba8 + write_image 模式
}
```

**文件**：`src-tauri/src/lib.rs` - 在 `generate_handler!` 注册新命令

### 2. 前端 download.ts：新增剪贴板函数

- `copyImageToClipboard(blob: Blob)` - 把 PNG blob 转为字节数组，invoke `copy_image_bytes_to_clipboard`
- SVG 文本直接用 `navigator.clipboard.writeText()`（项目其他地方已在用，Tauri webview 兼容）

### 3. GraphCanvas.tsx：在"更多"菜单添加两个按钮

在现有"导出 PNG"和"导出 SVG"下方加分隔线 + 两个复制按钮：

```
┌─ 更多 ──────────────────┐
│  AI 生成图表             │
│  ────────────────       │
│  导出 PNG               │
│  导出 SVG               │
│  ────────────────       │
│  复制为图片             │  ← 新增（PNG 到剪贴板）
│  复制 SVG 代码           │  ← 新增（SVG 文本到剪贴板）
└─────────────────────────┘
```

复制成功/失败用项目已有的 `toast` 工具（`src/lib/toast.ts`）显示反馈，图标用 `Clipboard` / `ClipboardCopy`。
