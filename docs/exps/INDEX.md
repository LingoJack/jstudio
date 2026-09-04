# 经验索引

一条一行，按时间倒序追加。摘要写「下次什么场景会用到它」。

<!-- entries -->
- 2026-09-04 [Cmd+F 不聚焦 FindBar 输入框（重复触发无信号+菜单焦点回移）](desktop-ui-cmd-f-不聚焦-findbar-输入框-重复触发无信号-菜单焦点回移.md) —— app.find 只 setOpen 时，已打开的 FindBar 重复 Cmd+F 无重聚焦信号，且原生菜单关闭后 Chromium 焦点回移可晚于单次重试；改为 focusFindBar() 自增 nonce + 500ms 焦点守护循环
