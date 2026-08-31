# Agent Chat UI Redesign

## 概述

对 Agent 聊天页面进行全面的视觉和布局升级，涵盖侧边栏、空状态、消息气泡、顶部栏和输入区，打造更现代、更精致的 AI 对话体验。所有改动严格遵循 VS Code 主题变量体系，保持深浅色主题兼容。

---

## 1. 侧边栏 (AgentSidebar + WorkspaceList)

### 1.1 新建任务按钮
- 从纯文本 `SidebarMenuItem` 升级为**带边框/背景的突出按钮**
- 左侧 Plus 图标 + "新建任务" 文字，右侧箭头点缀
- 使用 `--vscode-button-background` 主题色背景，hover 时微微提亮

### 1.2 会话列表项 (SessionItem)
- 增加**运行状态指示点**：左侧 MessageSquare 图标旁显示彩色小圆点（蓝色=运行中，无色=空闲）
- 增加**相对时间**：标题下方一行小字显示"刚刚 / 3分钟前 / 昨天"等
- 标题与时间形成两行布局，信息密度更高但不拥挤
- hover 时删除按钮出现，active 时左侧出现主题色竖条

### 1.3 分组标题 (WorkspaceGroupItem)
- 文件夹图标 + 名称 + 计数 badge，视觉层级更清晰
- 计数从纯文字改为 pill-shaped badge

### 1.4 空状态
- 居中的图标 + 提示文字 + "新建任务" 引导按钮

---

## 2. 空状态 (AgentChatPanel - 无 active session)

- 大尺寸 Bot 图标（带柔和背景圆圈）
- 欢迎标题 + 副标题描述
- 3-4 个**快捷操作建议卡片**（如"帮我分析代码"、"写一个函数"、"解释概念"），点击直接进入新建任务
- 底部小字提示模型信息

---

## 3. 消息气泡 (AgentChat)

### 3.1 用户消息
- 右对齐，保留 `--vscode-button-background` 主题色
- 圆角从 `rounded-2xl` 微调为 `rounded-2xl rounded-br-md`（右下角小圆角，指向用户方向）
- 增加 `max-w-[70%]` 略收窄

### 3.2 助手消息
- 左对齐，增加 **Bot 头像图标**（小圆形背景 + Bot icon）
- 气泡与头像水平排列，气泡 `rounded-2xl rounded-bl-md`
- 推理内容折叠区视觉优化：更精致的左边框 + 背景色

### 3.3 工具调用 (ToolCallBubble)
- 更紧凑的卡片设计，header 行整合图标+名称+状态
- 危险操作 badge 从 `rounded` 改为 `rounded-full` 并增加图标
- 展开参数区增加等宽字体高亮

### 3.4 工具结果 (ToolResultBubble)
- 状态图标 + 工具名 + 状态标签在同一行
- 折叠预览更简洁，展开内容用代码块风格

### 3.5 已完成工具调用 (CompletedToolCallBubble)
- 绿色 CheckCircle + 工具名 + "已完成" badge 一行展示
- 展开折叠箭头移到最右

### 3.6 系统消息
- 居中 pill 风格，错误状态用红色边框+背景，普通状态用灰色

### 3.7 Thinking 指示器
- 三点跳动动画替代单一 Loader2 旋转图标，更生动

---

## 4. 顶部栏 (TopBar)

- 左侧：返回按钮 + 会话标题 + 运行状态 badge
- 运行状态 badge 优化：带动画的小圆点 + 文字，使用 `rounded-full` pill
- 右侧：模型名（可点击切换） · autoApprove 指示 · 消息计数
- 整体高度更紧凑，底部边框更精致

---

## 5. 输入区 (InputArea)

- 保留浮空玻璃风格，微调圆角和阴影
- 底部工具栏重新组织：
  - 左侧：ModelSelector + 附件按钮 + autoApprove 开关
  - 右侧：停止按钮（运行中） + 发送按钮
- 发送按钮：有内容时亮色背景+发光效果，无内容时灰色
- 快捷键提示从输入框上方移到更不显眼的位置或融入设计

---

## 6. 回到底部按钮

- 圆形浮动按钮，增加微妙阴影和半透明背景
- hover 时微微放大

---

## 涉及文件

| 文件 | 改动范围 |
|---|---|
| `src/components/agent/AgentSidebar.tsx` | 新建任务按钮样式、空状态 |
| `src/components/agent/WorkspaceList.tsx` | SessionItem 布局、GroupItem 样式 |
| `src/components/agent/AgentChatPanel.tsx` | 空状态完整重设计 |
| `src/components/agent/AgentChat.tsx` | TopBar、所有消息气泡、InputArea、Thinking 指示器、回到底部按钮 |
| `src/lib/core/i18n/translations.ts` | 新增少量 i18n key（快捷建议文案等） |

## 不变项

- 所有业务逻辑（发送消息、工具审批、计划审阅、Ask 确认等）完全不变
- 组件 props 接口不变
- NavTree/NavRow 基础组件不变
- 主题变量体系不变
