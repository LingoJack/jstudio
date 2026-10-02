# Tasks

## 1. 前置小改动（迁移外，先行落地）

- [x] 1.1 `desktop/src/components/editor/sectionEditor/EditorScrollCursor.tsx`：滚动光标箭头从 lucide `ArrowLeft` 换成终端提示符同款文本字形 `❯`（U+276F），青色 `#00b8d9`、mono 字体，保留背景色块与定位逻辑。验证：`npm run lint` 通过；滚动长文档右缘显示青色 `❯`。

## 2. 平台模块重组（design D1）

- [x] 2.1 新建 `desktop/src/lib/platform/`：按 design D1 映射搬移 tauriShim 8 文件（core→invoke、event→events、window、webviewWindow、plugin-dialog→dialog、plugin-clipboard-manager→clipboard、plugin-opener→opener、native），建桶文件 `index.ts` 分域再导出；模块内部实现零改动。验证：`npm run lint` 通过（旧 shim 暂存待 2.4 删）。
- [x] 2.2 全量替换调用点：44 个文件的 `@tauri-apps/api/*`、`@tauri-apps/plugin-*` import 改为 `lib/platform` 对应分域导入（调用形态不变，纯机械替换）。验证：`rg -l "@tauri-apps" desktop/src` 仅剩 tauriShim 目录自身；`npm run lint` 通过。
- [x] 2.3 删除 `vite.config.ts` 中 `@tauri-apps` alias 及相关注释；确认 `electron/preload.ts` 注入面未动。验证：`npm run dev` 启动后主窗口与一个预览子窗口正常打开（窗口创建走新平台模块）。
- [x] 2.4 删除 `desktop/src/lib/core/tauriShim/` 目录。验证：`rg -l "tauriShim" desktop/src` 零命中；`npm run lint` + `npm test` 全绿。

## 3. 拖拽区原生化（design D2）

- [x] 3.1 `desktop/src/index.css` 新增 `.drag-region { -webkit-app-region: drag; }`（与既有 `.no-drag` 并列、同注释风格）；删除 `vscode-theme.css` 中 `data-tauri-drag-region` 属性映射桥整块（含注释）。验证：`rg "data-tauri-drag-region" desktop/src/styles` 零命中。
- [x] 3.2 迁移拖拽属性调用点（按 design D2 映射逐点 1:1 替换）：`AppTitleBar.tsx`（3 处 drag）、`TabBar.tsx`（titlebar 胶囊 no-drag）、`BrowserTabStrip.tsx`（1 drag + 2 no-drag）、`ChildWindowDragBar.tsx`、`DiagramWindowApp.tsx`、`DocumentSidebar.tsx`（headerActions no-drag）。验证：`rg "data-tauri-drag-region" desktop/src` 零命中；`npm run lint` 通过。
- [ ] 3.3 标题栏图标点击修复确认：主窗口标题栏空白处拖动/双击最大化正常；搜索、固定、更多三个图标点击均有响应。验证：手工操作逐项通过。

## 4. 事件与加速器更名（design D3/D4）

- [x] 4.1 `tauri://created|error|destroyed` → `jstudio://window-created|window-error|window-destroyed`：改 platform window/webviewWindow 模块派发点 + 消费方（`lib/windows/*.ts`、`diagramWindow.ts`）。验证：`rg "tauri://" desktop/src` 零命中。
- [x] 4.2 `toTauriAccelerator` → `toElectronAccelerator`（函数体不变），更新 `keyboardShortcuts.ts` 及全部调用方。验证：`rg "toTauriAccelerator" desktop/src` 零命中；`npm test` 中 keyboardShortcuts 相关用例全绿。

## 5. 防回归 guard（design D5）

- [x] 5.1 `desktop/package.json` 增加脚本（如 `guard:no-tauri`）：对 `src/` 断言 `@tauri-apps`、`data-tauri-drag-region`、`tauri://` 零命中，挂入 `npm run lint` 链。验证：临时引入一处违例时脚本失败，移除后通过。

## 6. 全量验收（spec 红线）

- [x] 6.1 后端命令面回归：跑既有 sidecar/主进程冒烟（存储读写、设置合并、PTY 生命周期、agent 流式事件）。验证：全部通过，与迁移前一致。
- [ ] 6.2 手工验收清单：主窗口标题栏（拖动/双击/三图标）、浏览器面板（标签点击、面板随窗口缩放贴合）、终端面板（输出流、撕出子窗口）、图表窗口（打开→编辑同步→关闭后轮询停止）、预览/文档子窗口拖拽条、全局快捷键与菜单加速器、文件对话框/剪贴板图片/外链打开。验证：逐项通过且行为与迁移前一致。
- [ ] 6.3 打包链路：`npm run electron:build` 产出本地 app 并启动冒烟。验证：打包产物可打开文档、编辑保存、终端可用。
