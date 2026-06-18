# 文档标题大纲导航功能实现计划

## 目标

在编辑区右侧增加一个 icon 按钮，用于控制是否显示「文档标题大纲导航」面板。面板展示文档中所有 H1/H2/H3 标题的层级结构，支持点击跳转和滚动高亮当前阅读位置。

## 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/store/uiSlice.ts` | 修改 | 新增 `isOutlineOpen` 状态 + `toggleOutline` / `setOutlineOpen` |
| `src/store/storeHelpers.ts` | 修改 | 在 `StoreState` 接口中声明新字段和方法 |
| `src/components/DocumentOutline.tsx` | **新建** | 大纲面板组件（标题提取、scroll spy、点击跳转） |
| `src/components/BlockEditor.tsx` | 修改 | 集成大纲面板 + 右侧 toggle icon |

## 详细设计

### 1. UI Store 状态扩展 (`uiSlice.ts` + `storeHelpers.ts`)

```typescript
// 新增字段
isOutlineOpen: boolean;       // 默认 false

// 新增方法
toggleOutline: () => void;
setOutlineOpen: (open: boolean) => void;
```

与 `isSidebarOpen` 一致，不做持久化（会话级偏好）。

### 2. DocumentOutline 组件 (`src/components/DocumentOutline.tsx`)

**输入**: `editor: Editor`（TipTap 编辑器实例）

**核心逻辑**:

#### a) 标题提取
- 从 `editor.state.doc` 遍历所有 `heading` 类型的节点
- 提取 `level`（1/2/3）和文本内容（纯文本拼接）
- 使用 `editor.on('update')` + 300ms debounce 触发重新提取
- 过滤掉空标题（无文本内容）

#### b) Scroll Spy（当前可见标题高亮）
- 使用 `IntersectionObserver` 观察编辑区内 `<h1>` / `<h2>` / `<h3>` DOM 元素
- 通过 `editor.view.dom.querySelectorAll('h1, h2, h3')` 获取元素
- 标记最靠近视窗顶部的可见标题为 `active`
- 更新时机：编辑器滚动 + 内容变化

#### c) 点击跳转
- 点击大纲项时：
  1. 使用 ProseMirror 节点位置 `heading.pos`
  2. 调用 `editor.chain().focus().setTextSelection(pos).scrollIntoView().run()`
  3. 将目标标题在编辑区中滚动至可视区域顶部

#### d) 渲染样式
- 宽度：220px，固定不收缩
- 按层级缩进：H1 无缩进，H2 缩进 12px，H3 缩进 24px
- 字号：12px，行高紧凑
- active 项：`list-activeSelectionBackground` + 左侧蓝色竖线
- 空状态：文档无标题时显示提示文字「暂无标题」
- 使用 `var(--vscode-*)` 主题变量

### 3. BlockEditor 集成

修改 `BlockEditor.tsx` 的渲染结构：

```
<div className="flex flex-col h-full">
  {/* 内容区域：editor + outline 并排 */}
  <div className="flex-1 flex overflow-hidden relative">
    {/* 编辑器滚动区 */}
    <div className="flex-1 overflow-y-auto ...">
      <title />
      <EditorContent />
      <FormatBubbleMenu />
      <TableControls />
    </div>

    {/* 大纲面板（条件渲染） */}
    {isOutlineOpen && <DocumentOutline editor={editor} />}
  </div>

  {/* 右侧浮动 toggle icon */}
  <button className="absolute right-3 top-3 ...">
    <ListTree />
  </button>
</div>
```

Toggle icon 使用 `lucide-react` 的 `PanelRight` 或 `ListTree` 图标（w-4 h-4），固定在编辑区右上角，点击切换 `isOutlineOpen`。active 状态高亮显示。

## 实现步骤

1. **uiSlice + storeHelpers**：添加 `isOutlineOpen` 状态和方法
2. **DocumentOutline.tsx**：创建完整组件
3. **BlockEditor.tsx**：集成面板 + toggle icon
4. **类型检查**：运行 `npx tsc --noEmit` 确认无错误
