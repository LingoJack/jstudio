# 经验索引

一条一行，按时间倒序追加。摘要写「下次什么场景会用到它」。

<!-- entries -->
- 2026-09-05 [子窗口 URL 漏 ?label= 导致 preload 回退 main：数据取不到且 close 误伤主窗口](desktop-electron-子窗口-url-漏-label-导致-preload-回退-main-数据取不到且-close-误伤.md) —— preload 的 windowLabel 从 ?label= 读、缺省回退 'main'；previewWindow 的 URL 曾漏带 label，预览窗口永远 get_preview_data 取空（转圈）且 windowOp('main','close') 会关掉主窗口；新建子窗口 URL 必须显式带 label
- 2026-09-05 [子窗口顶部 overlay 拖拽条压住工具栏：hover/点击被 app-region 吞掉](desktop-electron-子窗口顶部-overlay-拖拽条压住工具栏-hover-点击被-app-region-吞掉.md) —— 分离窗口自绘顶部拖拽条若用 absolute overlay，与浮动工具栏同处一个层叠上下文，z-index 低于工具栏则事件全被吞、高于则画布顶部不可点；最稳做法是布局式条带（真实 flex 行）而非 overlay
- 2026-09-05 [tauriShim WebviewWindow 不触发 tauri://destroyed，分离窗口关闭后调用方状态卡死](desktop-electron-taurishim-webviewwindow-不触发-tauri-destroyed-分离窗口关闭.md) —— 凡依赖 WebviewWindow once('tauri://destroyed') 复位 UI 状态的地方（如画板放大按钮 windowOpen）在 Electron 下永远不触发；根因是 shim once() 只映射 created/error，需 main 在 closed 时广播 window-closed 供 shim 过滤映射
- 2026-09-04 [Cmd+F 不聚焦 FindBar 输入框（重复触发无信号+菜单焦点回移）](desktop-ui-cmd-f-不聚焦-findbar-输入框-重复触发无信号-菜单焦点回移.md) —— app.find 只 setOpen 时，已打开的 FindBar 重复 Cmd+F 无重聚焦信号，且原生菜单关闭后 Chromium 焦点回移可晚于单次重试；改为 focusFindBar() 自增 nonce + 500ms 焦点守护循环
