# 设置页侧边栏可折叠导航 + 子项快速跳转

## 目标

设置页左侧导航（section list）支持：
1. **折叠/展开**：每个 section 可折叠，展开后显示其下的设置项（子目录）
2. **快速跳转**：点击子项切换到对应 section 并平滑滚动到具体设置项
3. **同一页面**：section 的所有设置项仍然渲染在同一个页面内，不拆分页面

---

## 设计思路

### 导航数据结构

在 `Settings.tsx` 中扩展 `NavItem`，增加可选的 `subItems`：

```ts
interface NavSubItem {
  id: string;          // DOM 锚点 id，如 'general-language'
  labelKey: TranslationKey;
}
interface NavItem {
  id: SectionId;
  labelKey: TranslationKey;
  icon: LucideIcon;
  subItems?: NavSubItem[];   // 有则可折叠
}
```

每个 section 的子项配置如下（直接复用已有 i18n key）：

| Section | 子项 |
|---------|------|
| **general** | language, theme, activityBarBorder, activityBarItems, dataLocation, jcli |
| **editor** | latinFont, cjkFont, fontSize, lineHeight |
| **terminal** | themeDark, themeLight, fontFamily, cursorStyle, fontSize |
| **help** | editor(blocks), terminal |
| **about** | *(无子项，不可折叠)* |

### 交互逻辑

1. **点击 section 主标题**：
   - 切换到该 section（`setSettingsActiveSection`）
   - 如果该 section 有子项 → 同时切换折叠/展开状态
   - 滚动到顶部

2. **点击子项**：
   - 切换到对应 section
   - 平滑滚动到该设置项（`scrollIntoView`）
   - 高亮当前选中的子项

3. **展开状态**：
   - 当前激活的 section 默认展开
   - 用 local state 管理，不持久化（每次进设置页重置）
   - 点击主标题时切换展开

### DOM 锚点

在每个 section 组件的设置块外层 `<div>` 上添加 `id` 属性，格式 `settings-{section}-{key}`：

- `GeneralSection.tsx`：`id="settings-general-language"` 等 6 个
- `EditorSection.tsx`：`id="settings-editor-latinFont"` 等 4 个
- `TerminalSection.tsx`：`id="settings-terminal-themeDark"` 等 5 个
- `HelpSection.tsx`：`id="settings-help-editor"` 等 2 个

### 滚动容器

右侧内容区是 `overflow-y-auto` 的 div。`scrollIntoView({ behavior: 'smooth', block: 'start' })` 即可生效。需要在切换 section 后等 React 渲染完成再滚动（用 `requestAnimationFrame` 或 `setTimeout(0)`）。

---

## 实施步骤

### 1. `Settings.tsx`（核心改动）

- 扩展 `NAV_ITEMS` 数据结构，添加 `subItems`
- 新增 local state：`expandedSections: Set<SectionId>`（默认包含 active section）
- 新增 local state：`activeAnchor: string | null`（当前高亮的子项）
- 渲染导航时：
  - 有子项的 section：点击主标题 → 切换 section + toggle 展开
  - 展开后渲染子项列表（缩进 + 小圆点/文字）
  - 子项点击 → 切换 section + 滚动到锚点
  - 无子项的 section（about）：保持原行为
- 新增 `handleSubItemClick(sectionId, anchorId)` 函数：
  ```ts
  setActiveSection(sectionId);
  setActiveAnchor(anchorId);
  // 等渲染完成后滚动
  requestAnimationFrame(() => {
    document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  ```

### 2. Section 组件添加锚点 id

- **GeneralSection.tsx**：6 个设置块各包一层 `<div id="settings-general-xxx">`
- **EditorSection.tsx**：4 个设置块添加 id
- **TerminalSection.tsx**：5 个设置块添加 id
- **HelpSection.tsx**：2 个 CollapsibleSection 添加 id

### 3. i18n 补充

复用现有 key 即可，**无需新增翻译**。所有子项的 label 都已有对应的 i18n key。

### 4. 样式

- 子项缩进：`pl-9`（比主标题 `px-3` + icon 更深一级）
- 子项字号略小：`text-xs` 或 `text-[13px]`
- 展开/折叠箭头：复用 `ChevronDown` 图标（`w-3.5 h-3.5`），展开时 `rotate-90` → `rotate-180`（或用 `ChevronRight` → `rotate-90`）
- 子项 hover/active 样式与主项一致但更轻量

---

## 文件清单

| 文件 | 改动 |
|------|------|
| `src/components/Settings.tsx` | 导航数据结构 + 折叠/跳转逻辑 |
| `src/components/settings/GeneralSection.tsx` | 6 个锚点 id |
| `src/components/settings/EditorSection.tsx` | 4 个锚点 id |
| `src/components/settings/TerminalSection.tsx` | 5 个锚点 id |
| `src/components/settings/HelpSection.tsx` | 2 个锚点 id |

**不改动**：store / uiSlice / i18n / Rust 后端。
