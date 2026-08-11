# Double Shift 全局搜索 - 实现计划

## 概述

双击 Shift 键唤起全局搜索弹窗，搜索文档标题和内容。搜索结果统一列表展示，右侧用 tag（标题/内容）+ 相对时间区分匹配类型。内容匹配点击后跳转到文档并定位到匹配位置。可在设置中开关此功能。

## 文件改动清单

### 1. 新建文件

| 文件 | 用途 |
|------|------|
| `src/lib/documents/extractPlainText.ts` | Block[] → 纯文本提取（处理 18 种 block 类型） |
| `src/lib/documents/globalSearch.ts` | 搜索逻辑：标题+内容匹配、snippet 提取、结果排序 |
| `src/components/search/GlobalSearchDialog.tsx` | 全局搜索弹窗组件 |

### 2. 修改文件

| 文件 | 改动 |
|------|------|
| `src/lib/shortcuts/ShortcutManager.ts` | 在 `handleKeyDown` 最前面新增 double Shift 检测 |
| `src/store/uiSlice.ts` | 新增 `isGlobalSearchOpen` / `setGlobalSearchOpen` / `toggleGlobalSearch` / `doubleShiftSearchEnabled` / `setDoubleShiftSearchEnabled` |
| `src/types/settings.ts` | 新增 `doubleShiftSearchEnabled?: boolean` |
| `src/App.tsx` | 挂载 `<GlobalSearchDialog />` |
| `src/components/settings/GeneralSection.tsx` | 新增 double Shift 搜索开关 toggle |
| `src/lib/core/i18n/translations.ts` | 新增 zh/en 文案 keys |

## 详细设计

### 2.1 Double Shift 检测 (ShortcutManager.ts)

在 `handleKeyDown` 的最前面，在 `eventToBinding(e)` 之前插入检测逻辑：

```typescript
// 新增字段
private lastShiftTime = 0;
private readonly DOUBLE_SHIFT_INTERVAL = 300; // ms

// 在 handleKeyDown 最前面：
// 检测纯 Shift 双击（无其他修饰键，非 repeat）
if (e.key === 'Shift' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat) {
  const now = Date.now();
  if (now - this.lastShiftTime < this.DOUBLE_SHIFT_INTERVAL) {
    const store = useStore.getState();
    // 检查设置开关
    if (store.doubleShiftSearchEnabled) {
      store.setGlobalSearchOpen(true);
      this.lastShiftTime = 0; // 重置，防止三连击重复触发
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }
  this.lastShiftTime = now;
  // 不 return - 让第一次 Shift 正常传递，不干扰 Shift+其他键
}
```

关键点：
- `e.repeat` 过滤：按住 Shift 不放不会重复触发
- 第一次 Shift 不拦截：用户可能准备按 Shift+其他键
- 只有第二次 Shift 在 300ms 窗口内才触发
- 检查 `doubleShiftSearchEnabled` 设置

### 2.2 纯文本提取 (extractPlainText.ts)

```typescript
export function extractPlainText(blocks: Block[]): string
```

按 block 类型提取文本：
- `text` / `heading-1..6` / `quote`：从 `content: RichText[]` 提取 `.text`
- `code`：从 `content: RichText[]` 提取 `.text`（含代码内容）
- `bullet-list` / `ordered-list`：递归 `properties.listItems[].content` + `children`
- `todo-list`：递归 `properties.todoItems[].richText` + `children`
- `table`：递归 `properties.tableData.rows[].cells[].content[][]`
- `collapsible`：`properties.collapsibleSummary` + `collapsibleChildren`
- `link`：`properties.title` + `properties.description`
- `math`：`properties.mathLatex`
- `image` / `file` / `divider` / `diagram`：跳过

### 2.3 搜索逻辑 (globalSearch.ts)

```typescript
export interface GlobalSearchResult {
  docId: string;
  title: string;
  emoji: string;
  matchType: 'title' | 'content';
  updatedAt: string;
  snippet: string | null;      // 内容匹配的上下文片段
  snippetRange: [number, number] | null;  // snippet 中高亮范围
}

export function performGlobalSearch(
  query: string,
  documents: Document[],
  textIndex: Map<string, string>,
): GlobalSearchResult[]
```

搜索策略：
- **标题匹配**：使用 `pinyinMatchRange` (复用现有函数)，支持拼音
- **内容匹配**：`extractPlainText(blocks).toLowerCase().includes(query.toLowerCase())`，纯子串匹配
- 同一文档同时命中标题和内容 → 只显示为「标题」匹配（优先级高）
- 排序：标题匹配在前，内容匹配在后；同类型内按 `updatedAt` 降序

Snippet 提取：
- 找到匹配位置，取前后各 40 字符
- 高亮匹配关键词部分

### 2.4 索引构建策略

弹窗打开时构建一次文本索引（`Map<docId, string>`），关闭时丢弃：
```typescript
const indexRef = useRef<Map<string, string>>(new Map());
useEffect(() => {
  if (isOpen) {
    const docs = useStore.getState().documents;
    const idx = new Map();
    for (const doc of docs) idx.set(doc.id, extractPlainText(doc.blocks));
    indexRef.current = idx;
  }
}, [isOpen]);
```

搜索输入 debounce 150ms，只查索引不重新提取文本。

### 2.5 UI 组件 (GlobalSearchDialog.tsx)

视觉风格与 CommandPalette 一致（`fixed inset-0 z-[9999]` overlay）。

布局：
```
┌──────────────────────────────────────────────────┐
│  🔍  搜索文档标题或内容...                    Esc │
├──────────────────────────────────────────────────┤
│  📝 项目设计文档                    标题 · 2小时前 │
│  📝 技术方案选型                    内容 · 昨天    │
│     ...我们评估了倒排索引和线性扫描的...           │
│  📝 周报 - 第12周                   内容 · 3天前   │
│     ...本周完成了倒排索引的 POC...                │
│  📝 会议纪要 - Q4 规划              标题 · 1周前   │
└──────────────────────────────────────────────────┘
```

每条结果：
- 左侧：emoji + 文档标题
- 内容匹配：标题下方多一行 snippet（灰色，关键词高亮）
- 右侧：tag（标题/内容）+ `formatRelativeEditedTime(updatedAt)`
- 键盘导航：ArrowUp/Down、Enter 打开、Escape 关闭
- 点击/Enter 打开文档

### 2.6 跳转到匹配位置

内容匹配点击时的流程：
1. `setGlobalSearchOpen(false)` 关闭弹窗
2. `openDocumentTab(docId)` 打开文档
3. 延迟 150ms 后 `setFindQuery(query)` + `setFindBarOpen(true)`
4. 复用现有 `useCrossSectionFind` 基础设施：高亮匹配 + 滚动到第一个匹配位置
5. FindBar 显示在文档右上角，用户可用 Enter 在匹配间跳转

标题匹配只打开文档，不触发 FindBar。

延迟 150ms 的原因：给 DocumentPanel 时间切换文档和挂载 section editors。`useCrossSectionFind` 的 re-subscription timers (100/300/800/2000ms) 会捕获渐进挂载的 sections。

### 2.7 设置开关

**types/settings.ts**: 新增 `doubleShiftSearchEnabled?: boolean`

**uiSlice.ts**: 新增 `doubleShiftSearchEnabled: boolean` (默认 `true`) + `setDoubleShiftSearchEnabled`，持久化到 settings

**GeneralSection.tsx**: 新增 toggle 开关，样式复用 `confirmOnExit` 的 toggle pattern

### 2.8 Store 变更 (uiSlice.ts)

```typescript
// 新增状态
isGlobalSearchOpen: boolean;          // default: false
doubleShiftSearchEnabled: boolean;    // default: true

// 新增 actions
setGlobalSearchOpen: (v: boolean) => void;
toggleGlobalSearch: () => void;
setDoubleShiftSearchEnabled: (v: boolean) => void;
```

`doubleShiftSearchEnabled` 需要持久化到 settings（在 `loadSettings` / `saveSettings` 中处理）。

### 2.9 i18n keys

```
globalSearch.placeholder = 搜索文档标题或内容… / Search document titles and content…
globalSearch.noResults = 无匹配结果 / No matching results
globalSearch.footer = ↑↓ 导航 · Enter 打开 · Esc 关闭 / ↑↓ Navigate · Enter Open · Esc Close
globalSearch.tagTitle = 标题 / Title
globalSearch.tagContent = 内容 / Content
general.doubleShiftSearch = 双击 Shift 全局搜索 / Double Shift Global Search
general.doubleShiftSearchDesc = 连续按两次 Shift 键打开全局搜索弹窗 / Press Shift twice quickly to open global search
```

## 实现顺序

1. `extractPlainText.ts` - 纯文本提取工具
2. `globalSearch.ts` - 搜索逻辑
3. `uiSlice.ts` - store 状态
4. `types/settings.ts` - 设置类型
5. `translations.ts` - i18n
6. `GlobalSearchDialog.tsx` - UI 组件
7. `ShortcutManager.ts` - double Shift 检测
8. `App.tsx` - 挂载组件
9. `GeneralSection.tsx` - 设置开关
10. 构建验证
