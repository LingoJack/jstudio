# 计划：终端 Template + Tab 架构重构

## 目标

把当前的"扁平 session list"重构为 **Template + Tab** 两层架构：

1. **Sidebar（TerminalTemplateList）**：模板列表 — `terminal - ~/work` 这样的预设。用户可以 CRUD 模板，后续可扩展 SSH 类型。
2. **Panel 顶部（TerminalTabs）**：活跃 session 的 Tab 栏 — 点击模板 `+` 时从模板 spawn 一个 PTY 实例，以 tab 展示。支持 `Cmd+Opt+←/→` 切换 tab。

```
┌──────┬────────────────────┬──────────────────────────────────┐
│      │  TEMPLATES         │  [tab1: ~/work] [tab2: ~/proj] + │
│ Act. │                    ├──────────────────────────────────┤
│ Bar  │  ▸ ~/work    [+]   │                                  │
│      │  ▸ ~/proj          │         xterm.js terminal        │
│ 48px │  ▸ ssh dev         │                                  │
│      │  240px             │                                  │
└──────┴────────────────────┴──────────────────────────────────┘
```

---

## 数据模型

### TerminalTemplate（持久化到 settings.json）

```typescript
interface TerminalTemplate {
  id: string;          // "tmpl-{timestamp}"
  name: string;        // "workdir" / "dev-server" 等
  type: 'local';       // 当前只有 local，后续可扩展 'ssh'
  cwd: string;         // 工作目录，如 "~" / "~/dev"
  createdAt: number;
}
```

### TerminalSession（活跃实例，内存态，不变）

```typescript
interface TerminalSession {
  id: string;          // PTY session id
  title: string;       // tab 显示名，从 template.name 或 cwd 推导
  templateId: string | null;  // 来源模板（用于 tab 图标/标识）
  cwd: string;         // 实际启动的工作目录
  createdAt: number;
}
```

### 持久化

- **模板**：存到 `settings.json` 的 `terminalTemplates` 字段。`AppSettings` 已有 `[key: string]: unknown` 索引签名，无需新增 Rust 命令。
- **Session**：纯内存态（PTY 进程重启即失效），不持久化。

---

## 实施步骤

### Phase 1: Store 层重构 — terminalSlice

**`src/store/terminalSlice.ts`**

1. 新增 `TerminalTemplate` 接口
2. 新增 state：`templates: TerminalTemplate[]`
3. 新增 template actions：
   - `addTemplate(name, cwd)` — 创建模板 + 持久化
   - `removeTemplate(id)` — 删除模板 + 持久化
   - `renameTemplate(id, name)` — 重命名 + 持久化
   - `initTemplates()` — 从 settings.json 加载模板
4. 修改 `createSession(templateId?)`：
   - 接收可选 templateId，查找 template 获取 cwd
   - 调用 `storage.ptyCreate({ cwd })`
   - session 新增 `templateId` 和 `cwd` 字段
5. 持久化 helper：`saveTemplates()` → `storage.saveSettings({ terminalTemplates })`

**`src/store/storeHelpers.ts`** — StoreState 接口扩展：
- `templates: TerminalTemplate[]`
- template action 方法签名

**`src/store/documentsSlice.ts`** — init 函数中加载 templates

### Phase 2: Sidebar — TerminalTemplateList

**重写 `src/components/TerminalSessionList.tsx` → `TerminalTemplateList.tsx`**

- 头部："Templates" 标题 + `+` 按钮（新建模板，弹出 inline input 输入 name + cwd）
- 列表：每个模板显示 `type` 图标 + `name` + `cwd` 副标题
- 每个模板行右侧有 `[+]` 按钮 — **点击从模板创建一个 session 实例**
- 右键菜单：编辑 / 删除模板
- 双击行体：编辑模板（name + cwd）

图标映射：
- `local` → `Folder` (lucide-react)
- `ssh` (预留) → `Server`

### Phase 3: Panel — TerminalTabs

**新建 `src/components/TerminalTabs.tsx`**

- 横向 tab 栏，每个 tab 显示 session title + `×` 关闭按钮
- tab 按来源 template 的 type 显示小图标
- 当前 active tab 高亮
- 右侧 `+` 按钮：快速创建（用第一个模板或默认 cwd）
- **键盘快捷键**：`Cmd+Opt+←/→` 切换 tab
- tab 溢出时横向滚动

**修改 `src/components/TerminalPanel.tsx`**

- 顶部 bar 区域替换为 `<TerminalTabs />`
- 保留 xterm mount 区域不变

### Phase 4: 布局集成

**`src/App.tsx`**

- 导入 `TerminalTemplateList` 替代 `TerminalSessionList`
- 空状态：当无模板时引导创建模板

### Phase 5: i18n + 验证

- 新增翻译 key
- TypeScript 类型检查 + Vite 构建

---

## 涉及文件清单

| 文件 | 操作 |
|------|------|
| `src/store/terminalSlice.ts` | 重构：新增 template 状态 + actions |
| `src/store/storeHelpers.ts` | 修改：StoreState 接口 |
| `src/store/documentsSlice.ts` | 修改：init 中加载 templates |
| `src/components/TerminalTemplateList.tsx` | **新建**：替代 TerminalSessionList |
| `src/components/TerminalSessionList.tsx` | 删除（被替代） |
| `src/components/TerminalTabs.tsx` | **新建**：tab 栏 + 快捷键 |
| `src/components/TerminalPanel.tsx` | 修改：集成 tabs |
| `src/App.tsx` | 修改：导入新组件 |
| `src/lib/i18n.ts` | 修改：新增翻译 key |
