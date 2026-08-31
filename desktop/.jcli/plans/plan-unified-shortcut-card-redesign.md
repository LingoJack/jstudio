# 统一快捷键卡片化重设计

## 核心思路

参照 `AgentModelSection.tsx` 的 Provider 卡片模式，将 `GlobalShortcutsSection.tsx` 从"行列表 + 弹出编辑面板"重设计为"卡片列表 + 内联展开编辑表单"。

### 关键变化

| 当前设计 | 新设计（AgentModelSection 模式） |
|----------|-------------------------------|
| ConfigRow 行 + 独立 EditPanel 弹出 | 卡片 + 点击编辑后卡片原地变为 ShortcutEditForm |
| 编辑时列表中该行消失，替换为 EditPanel | 编辑时卡片展开，列表中位置不变 |
| Toggle 在行右侧 | Toggle 在卡片内，AgentModelSection 风格 ToggleRow |
| 确认删除用 window.confirm | 确认删除用 AgentModelSection 式的 ✓/✗ 内联确认 |
| 添加是独立按钮 + 弹出表单 | 添加是底部虚线按钮 + 内联展开 ShortcutEditForm |

### 具体改动

#### 1. `GlobalShortcutsSection.tsx` — 完全重写

**卡片（非编辑态）参照 AgentModelSection 的 provider card：**
```
┌─────────────────────────────────────────────────────┐
│ [icon]  ⌘⇧P   打开命令面板              [⚡测试] [✏️] [🗑️] │
│                    Open Panel · Global               │
└─────────────────────────────────────────────────────┘
```
- 左侧：icon（动作类型图标）
- 中间：KbdPill（快捷键）+ 动作名称 + 描述/badges
- 右侧：测试按钮 + 编辑按钮 + 删除按钮（删除有 ✓/✗ 二次确认）
- enabled toggle 改为 AgentModelSection 风格的 ToggleRow，嵌入卡片

**编辑态（ShortcutEditForm）参照 ProviderEditForm：**
```
┌─────────────────────────────────────────────────────┐
│  快捷键: [⌘⇧P 或 点击录制]                           │
│  动作:   [打开面板 ▾]                                │
│  ── 动态参数 (根据 paramFields) ──                    │
│  面板: [命令面板 ▾]                                   │
│  ──────────────────────────                          │
│  [取消]                                    [保存]     │
└─────────────────────────────────────────────────────┘
```
- 焦点边框 (`border-[var(--vscode-focusBorder)]`)
- 内联展开在卡片列表中的原位置
- 保存/取消按钮在底部，AgentModelSection 风格

**添加模式：** 底部虚线 "+ 添加全局快捷键" 按钮 → 点击后内联展开 ShortcutEditForm（同 ProviderEditForm 模式）

#### 2. 提取公共组件

将 AgentModelSection 中的 `ToggleRow` 和 `FormField` 提取为共享，或直接在新文件中重新实现（保持一致性即可）。

#### 3. 不改动的文件

- `globalShortcuts.ts`（核心引擎）— 不变
- `globalShortcutActions.ts`（内置动作）— 不变
- `ShortcutsSection.tsx`（应用内快捷键）— 保留现有跳转链接，不变
- Rust 后端 — 不变
- `App.tsx` 事件监听 — 不变
- `main.tsx` 窗口路由 — 不变
- `i18n.ts` — 可能添加少量新 key（如确认删除提示文案）

### 预计改动量

只重写 1 个文件：`src/components/settings/GlobalShortcutsSection.tsx`，可能微调 i18n。
