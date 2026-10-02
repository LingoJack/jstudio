# Spec Delta

## Purpose

定义渲染层平台接入层的行为契约：应用自有平台模块的模块面唯一性、窗口拖拽区的原生 CSS 语义、窗口生命周期事件契约，以及 shim 移除后行为不变的红线。验收原则是**用户可见行为与移除兼容层前完全一致**。

## ADDED Requirements

### Requirement: 平台调用唯一入口

渲染层 SHALL 只通过应用自有平台模块（`src/lib/platform/*`，按 core / event / window / webviewWindow / dialog / clipboard / opener 分域导出）访问平台能力；平台模块 SHALL 委托 `window.jstudioNative`（preload 注入桥）。源码中 SHALL NOT 存在任何 `@tauri-apps/*` import 路径或 Vite alias；构建产物 MUST NOT 引入 Tauri 运行时。`invoke(方法名, 参数)`、事件 API、窗口 API 的调用签名与返回语义 MUST 与移除兼容层前一致。

#### Scenario: 源码无 Tauri 残留
- **WHEN** 对 `desktop/src` 全量检索 `@tauri-apps` 与检查 Vite alias 配置
- **THEN** 零命中（不含注释），构建通过，所有原有调用点编译无误

#### Scenario: 平台调用行为不变
- **WHEN** 渲染层经新平台模块执行 打开文档 → 保存设置 → 选择文件对话框 → 复制图片到剪贴板
- **THEN** 每一步的结果与移除兼容层前一致（同返回形状、同错误语义）

### Requirement: 窗口拖拽区为原生 CSS 语义

窗口拖拽热区 SHALL 用 Electron 原生 CSS `-webkit-app-region: drag` 声明，热区内的可交互元素 SHALL 用 `-webkit-app-region: no-drag` 覆盖；SHALL NOT 存在基于脚本注入的 `data-tauri-drag-region` 判定逻辑。空白拖拽区 SHALL 支持按住移动窗口与双击最大化；热区内全部按钮、输入框、菜单 SHALL 保持可点击、可聚焦。子窗口（预览/文档/终端/图表/命令面板）的拖拽条行为 MUST 与移除前一致。

#### Scenario: 空白区拖动与双击最大化
- **WHEN** 用户在标题栏空白处按住拖动，随后双击
- **THEN** 窗口跟随移动，双击触发最大化/还原切换

#### Scenario: 热区内控件可点击
- **WHEN** 用户点击标题栏拖拽区内的 搜索图标 / 固定按钮 / 更多菜单 / 标签胶囊 / 浏览器标签条按钮
- **THEN** 每次点击都触发对应控件行为，窗口不发生移动，事件不被拖拽判定吞掉

#### Scenario: 子窗口拖拽条
- **WHEN** 在图表/预览等子窗口的自绘拖拽条上按住拖动、并在其关闭按钮上点击
- **THEN** 拖动移动窗口，关闭按钮正常触发关闭

### Requirement: 窗口生命周期事件契约

子窗口生命周期通知 SHALL 以显式命名事件派发：窗口创建成功、创建失败、窗口销毁分别对应 `jstudio://window-created`、`jstudio://window-error`、`jstudio://window-destroyed`（语义与时序等同原 `tauri://created` / `tauri://error` / `tauri://destroyed`）。依赖销毁通知的派生行为（如图表窗口的更新轮询停止、编辑器侧 onClosed 回调）MUST 继续可靠触发；主窗口销毁广播（`window-closed`）语义不变。

#### Scenario: 子窗口生命周期回调
- **WHEN** 创建预览窗口 → 窗口被用户关闭
- **THEN** 调用方先收到创建成功通知，后收到销毁通知，轮询与回调链路照常终止

#### Scenario: 图表窗口关闭停止轮询
- **WHEN** 图表窗口被关闭（含正常关闭路径）
- **THEN** 编辑器侧 500ms 更新轮询停止，onClosed 回调触发，无泄漏轮询残留

### Requirement: 移除兼容层行为红线

移除 shim 后，以下既有契约 MUST 不变：`invoke` 命令面（方法名、入参/出参、错误语义）、事件通道名（`pty-data-{id}`、`agent:*`、`native-command`、`link-preview:tabs-updated` 等）、`jstudio-asset://` 资源协议、多窗口 label 与 `?window=` 机制、BrowserPanel 的原生 WebContentsView 定位行为、PTY 数据流与全局快捷键/原生菜单加速器行为。

#### Scenario: 后端命令面回归
- **WHEN** 执行既有 sidecar/主进程冒烟（存储读写、设置合并、PTY 生命周期、agent 流式）
- **THEN** 全部通过，与移除 shim 前结果一致

#### Scenario: 浏览器面板定位不回归
- **WHEN** 打开浏览器面板并拖动窗口、开合侧边栏、缩放窗口
- **THEN** 原生 webview 始终贴合 React 工具栏下方区域，无错位或延迟错配
