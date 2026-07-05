# 预览窗口标签页功能计划

## 问题背景

当前链接预览窗口（`LinkView.tsx` → `openLinkPreview`）使用 Tauri `WebviewWindowBuilder` 加载外部 URL。当预览的页面内部调用 `window.open()` 或点击带有 `target="_blank"` 的链接时，WebView 默认阻止这些请求，导致"没反应"。

## 技术调研

### Tauri v2 新增 API（2025年8月合并）

PR #13876 新增了 `WebviewWindowBuilder::on_new_window` 方法：

```rust
builder.on_new_window(move |url, features| {
    // url: 请求打开的 URL
    // features: window.open() 传入的窗口特性（尺寸、位置等）
    
    // 返回值决定如何处理：
    // - NewWindowResponse::Allow: 使用默认行为（通常被阻止）
    // - NewWindowResponse::Deny: 拒绝打开
    // - NewWindowResponse::Create { window }: 使用自定义创建的窗口
})
```

参考文档：
- https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindowBuilder.html#method.on_new_window
- https://docs.rs/tauri/latest/tauri/webview/enum.NewWindowResponse.html
- https://github.com/tauri-apps/tauri/pull/13876

## 实现方案对比

### 方案 A：多独立窗口模式

每个 `window.open()` 请求创建新的独立 `WebviewWindow`。

**优点：**
- 实现简单，代码改动小
- 符合 macOS 多窗口管理习惯
- 每个窗口可独立调整大小、位置

**缺点：**
- 不是真正的"标签页"
- 窗口多时管理不便

**实现示意：**
```rust
// src-tauri/src/commands/link.rs
#[tauri::command]
pub async fn open_link_preview(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let app_handle = app.clone();
    let label = format!("preview-{}", uuid());
    
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url.parse()?))
        .title("Link Preview")
        .inner_size(900.0, 600.0)
        .on_new_window(move |new_url, features| {
            // 创建新的预览窗口作为"新标签页"
            let new_label = format!("preview-{}", uuid());
            let builder = WebviewWindowBuilder::new(
                &app_handle,
                new_label,
                WebviewUrl::External(new_url.clone().parse().unwrap()),
            )
            .title(new_url.as_str())
            .window_features(features);
            
            let window = builder.build().unwrap();
            NewWindowResponse::Create { window }
        })
        .build()?;
    
    Ok(())
}
```

### 方案 B：单窗口多标签页模式

在预览窗口内实现浏览器风格的标签页切换。

**优点：**
- 真正的标签页体验
- 窗口管理更简洁
- 可在同一窗口内切换多个页面

**缺点：**
- 实现复杂度高
- 需要自定义 HTML UI（标签栏）
- 需要管理多个 child webview

**架构示意：**

```
┌──────────────────────────────────────────────────────────┐
│  预览窗口 (Window)                                        │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 标签栏 (HTML/React)                                │  │
│  │ [Tab 1: GitHub] [Tab 2: Google] [+ 新标签]         │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 活动标签内容 (Webview #1 - GitHub)                 │  │
│  │                                                    │  │
│  │  (隐藏的 Webview #2 - Google)                      │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**实现路径：**

1. **预览窗口入口页面**：`src-tauri/preview-tabs.html`（或 `src/components/windows/PreviewTabsApp.tsx`）
   - 标签栏 UI（添加、关闭、切换）
   - 内容区域（占位，用于嵌入 webview）

2. **Rust 端：**
   - 创建 Window（不含默认 webview）
   - 添加第一个 child webview 加载目标 URL
   - `on_new_window` 回调：发送事件到前端 JS 请求添加新标签
   - 响应前端请求添加新 child webview

3. **前端 JS：**
   - 收到"添加标签"事件 → 更新标签栏 UI
   - 点击标签 → 调用 Rust 切换显示的 webview
   - 关闭标签 → 调用 Rust 移除 webview

**关键代码示意：**

```rust
// src-tauri/src/commands/link.rs

// 需要在 preview-tabs.html 中注入初始化脚本
// 将 URL 传递给前端，让前端请求创建第一个 webview

#[tauri::command]
pub async fn open_link_preview(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let label = format!("preview-tabs-{}", uuid());
    
    // 创建 Window（不使用 WebviewWindow，而是 Window + 多个 child Webview）
    let window = WindowBuilder::new(&app, &label)
        .title("Link Preview")
        .inner_size(900.0, 600.0)
        .build()?;
    
    // 设置预览数据，供前端获取
    set_preview_data(label.clone(), json!({ "initialUrl": url }))?;
    
    // 加载自定义 HTML（标签页 UI）
    let webview_builder = WebviewBuilder::new(&label, WebviewUrl::App("preview-tabs.html".into()))
        .on_new_window(|new_url, features| {
            // 这里需要发送事件到前端，让前端决定如何处理
            // 实际上 child webview 的 on_new_window 不能直接创建新窗口
            // 需要通过事件机制
            // ...复杂的事件通信...
        });
    
    window.add_child(webview_builder, LogicalPosition::new(0, 0), window.inner_size()?)?;
    
    Ok(())
}
```

**复杂度分析：**

方案 B 的难点在于：
1. `on_new_window` 在 child webview 上触发时，不能直接创建新 `WebviewWindow`（因为我们要在原窗口内添加标签）
2. 需要事件通信：child webview → Rust → 主 webview（标签 UI）→ Rust → 添加新 child webview
3. webview 的显示/隐藏切换需要手动管理位置和可见性
4. macOS 上 child webview 的 `on_new_window` 可能需要额外配置

## 推荐方案

考虑到实现复杂度和用户体验的平衡，建议：

**第一阶段：方案 A（多独立窗口）**
- 快速解决当前问题
- 用户可以立即获得 `window.open()` 可用的体验
- 代码改动小，风险低

**第二阶段（可选）：方案 B（真正标签页）**
- 如果用户反馈需要标签页切换
- 作为后续优化迭代

## 方案 A 详细实现步骤

### 1. 修改 Rust 端 `link.rs`

```rust
use tauri::webview::{WebviewWindowBuilder, WebviewUrl, NewWindowResponse};
use uuid::Uuid;

#[tauri::command]
pub async fn open_link_preview(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let app_handle = app.clone();
    let label = format!("preview-{}", Uuid::new_v4());
    
    let _window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url.parse()?))
        .title("Link Preview")
        .inner_size(900.0, 600.0)
        .min_inner_size(400.0, 300.0)
        .focused(true)
        .on_new_window(move |new_url, features| {
            // 为 window.open() 请求创建新的预览窗口
            let new_label = format!("preview-{}", Uuid::new_v4());
            let app_ = app_handle.clone();
            
            let builder = WebviewWindowBuilder::new(
                &app_,
                new_label,
                WebviewUrl::External(new_url.clone().parse().unwrap()),
            )
            .title(new_url.as_str())
            .window_features(features) // 应用 window.open() 传入的窗口特性
            .on_new_window(|url, feats| {
                // 递归：新窗口也支持 window.open()
                // 这里需要再次捕获 app_handle... 实际实现需要处理闭包生命周期
                NewWindowResponse::Allow // 暂时简化，实际需要递归处理
            });
            
            match builder.build() {
                Ok(window) => NewWindowResponse::Create { window },
                Err(_) => NewWindowResponse::Deny,
            }
        })
        .build()?;
    
    Ok(())
}
```

### 2. 闭包生命周期处理

上面的代码有问题：`on_new_window` 闭包需要捕获 `app_handle`，但闭包签名要求 `'static` 生命周期。需要使用 `Arc` 或其他方式处理。

实际实现可能需要：
```rust
use std::sync::Arc;

let app_handle = Arc::new(app.clone());

.on_new_window({
    let app_handle = app_handle.clone();
    move |new_url, features| {
        let new_label = format!("preview-{}", Uuid::new_v4());
        // ...
    }
})
```

### 3. 添加 Cargo.toml 依赖

```toml
uuid = { version = "1", features = ["v4"] }
```

### 4. 更新 storage.ts

前端调用方式不变，仍然是 `storage.openLinkPreview(url)`。

## 测试验证

1. 打开一个链接预览窗口
2. 在预览的页面中点击带有 `target="_blank"` 的链接
3. 或触发页面的 `window.open()` JavaScript
4. 验证是否打开新的预览窗口并加载目标 URL

## 后续优化（可选）

如果用户需要更好的标签页体验，可以考虑：
1. 添加窗口标题同步（使用 `on_document_title_changed`）
2. 添加窗口管理面板（列出所有预览窗口）
3. 实现真正的标签页 UI（方案 B）

---

**等待用户确认选择方案后开始实施。**