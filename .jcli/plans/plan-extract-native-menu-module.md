# 抽取原生菜单模块到独立文件

## 目标

将 `src-tauri/src/lib.rs` 中的原生菜单相关代码（构建、安装、事件路由、macOS 系统菜单项清理）抽取到独立的 `src-tauri/src/menu.rs` 文件，使 `lib.rs` 只保留应用入口编排逻辑。

## 搬迁内容

从 `lib.rs` 移到 `menu.rs`：

| 代码块 | lib.rs 行号 | 说明 |
|--------|------------|------|
| `mod macos_menu_cleanup` | 9-76 | macOS 系统注入菜单项清理（NSMenu 原生操作） |
| `build_app_menu` 函数 | 119-264 | 构建完整 macOS 应用菜单（App/Edit/Window 三个子菜单） |
| 菜单安装逻辑（setup 闭包内） | 291-303 | 调用 build_app_menu、manage NativeMenuState、set_menu、schedule cleanup |
| `on_menu_event` 闭包逻辑 | 336-441 | 菜单事件路由（link-preview / browser-panel / select-all / native-command 转发） |

保留在 `lib.rs`：

| 代码块 | 说明 |
|--------|------|
| `FocusedWindow` struct | 窗口焦点跟踪状态，被窗口事件处理器和菜单事件处理器共同使用，改为 `pub(crate)` |
| `on_window_close_requested` | 窗口关闭行为，与菜单无关 |
| `run()` | 应用入口编排器，调用 `menu::setup_menu` 和传入 `menu::on_menu_event` |
| 窗口事件处理器 | `WindowEvent::Focused` 更新 FocusedWindow，`CloseRequested` 调用 on_window_close_requested |
| invoke_handler | Tauri 命令注册表 |

## 新文件结构：`src-tauri/src/menu.rs`

```
//! 原生 macOS 应用菜单：构建、安装与事件路由。

// ── macOS 系统菜单项清理 ──────────────────────────────────
#[cfg(target_os = "macos")]
mod macos_menu_cleanup { ... }          // 原样搬迁

// ── 菜单构建 ──────────────────────────────────────────────
#[cfg(target_os = "macos")]
pub fn build_app_menu<R: Runtime>(...)  // 原样搬迁

// ── 菜单安装（从 run() setup 闭包抽取）────────────────────
#[cfg(target_os = "macos")]
pub fn setup_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
    let (menu, find_item, inline_code_item) = build_app_menu(app)?;
    app.manage(commands::window::NativeMenuState { find_item, inline_code_item });
    app.set_menu(menu)?;
    macos_menu_cleanup::schedule();
    Ok(())
}

// ── 菜单事件路由（从 run() on_menu_event 闭包抽取）─────────
pub fn on_menu_event(app: &tauri::AppHandle, event: &tauri::menu::MenuEvent) {
    // 原样搬迁闭包体
}
```

## lib.rs 改动

1. 顶部新增 `mod menu;`（`#[cfg(target_os = "macos")]` 守卫）
2. 删除 `macos_menu_cleanup` 模块、`build_app_menu` 函数
3. `FocusedWindow` 改为 `pub(crate)`
4. 删除不再需要的菜单导入（`Menu`, `MenuItem`, `PredefinedMenuItem`, `Submenu`）
5. setup 闭包中 `#[cfg(target_os = "macos")]` 块简化为 `menu::setup_menu(app.handle())?;`
6. `.on_menu_event(|app, event| { ... })` 替换为 `.on_menu_event(menu::on_menu_event)`

## 验证

`cargo check` 编译通过，无新 warning。
