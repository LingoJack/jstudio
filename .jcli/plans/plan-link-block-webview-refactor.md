# Plan: Preview 模式改用真实 WebviewWindow（废弃 iframe 代理）

## 核心变化

**废弃** iframe + `webpreview://` 自定义协议代理方案。
**改用** Tauri 原生 `WebviewWindow` 加载真实 URL + `initialization_script` 注入 Chrome cookies。

## 为什么用 WebviewWindow

Tauri 没有 `<webview>` DOM 标签（不像 Electron），但可以创建**独立的原生 WebView 窗口**：
- 底层是 WKWebView (macOS) / WebView2 (Windows)，真实浏览器引擎
- 所有 JS/CSS/字体/AJAX/SPA 全部正常工作
- 无 CORS 问题、无 URL 重写、无 monkey-patch
- `initialization_script` 在页面 HTML 解析前注入 `document.cookie`，保证登录态

## 数据流

```
LinkView.tsx (preview 按钮点击)
  ↓ invoke('open_link_preview', { url })
Rust: open_link_preview()
  ├─ 读取 Chrome cookies (复用现有解密逻辑)
  ├─ 构建 initialization_script: document.cookie = "...";
  └─ WebviewWindowBuilder::new(url)
       .initialization_script(cookie_script)
       .user_agent(BROWSER_UA)
       .build()
  ↓ 原生窗口弹出，加载真实 URL
WKWebView 渲染页面 (登录态正常)
```

## 文件变更

### Rust 后端

| 文件 | 变更 |
|------|------|
| `src-tauri/src/commands/link.rs` | **删除** `handle_webpreview_request`、`rewrite_html_urls`、`reconstruct_target_url`、`inject_proxy_script`、`blocking_http_client`、cookie 缓存逻辑。**新增** `open_link_preview` 命令 |
| `src-tauri/src/lib.rs` | **删除** `register_asynchronous_uri_scheme_protocol`。**新增** 注册 `open_link_preview` |
| `src-tauri/Cargo.toml` | **删除** `regex` 依赖 |

### 前端

| 文件 | 变更 |
|------|------|
| `src/lib/storage.ts` | **删除** `buildProxyUrl`。**新增** `openLinkPreview` invoke 封装 |
| `src/components/LinkView.tsx` | 预览模式：不再渲染 iframe，改为点击「预览」按钮调用 `openLinkPreview` 开窗口。编辑器内始终显示卡片 |
| `src/styles/vscode-theme.css` | **删除** `.link-block-preview-*` iframe 相关样式 |
