# 文档批量操作功能

## 目标

在侧边栏 `DocumentList` 中支持多选文档，并提供批量「删除」和「移动到文件夹」操作。

## 交互设计

### 多选方式

| 操作 | 行为 |
|------|------|
| **普通点击** | 打开文档（现有行为），同时清除选择 |
| **Cmd/Ctrl + 点击** | 切换该文档的选中状态（不打开文档） |
| **Shift + 点击** | 从上次点击的文档到当前文档，选中范围内所有可见文档 |
| **Escape** | 清除全部选择 |
| **右键选中文档** | 弹出批量操作菜单（删除 / 移动到文件夹） |
| **右键未选中文档** | 弹出现有单文档右键菜单（同时清除选择） |

### 批量操作栏

当 `selectedDocIds.size > 0` 时，在侧边栏底部显示一个浮动操作栏：
- 左侧显示「已选 N 篇」
- 右侧按钮：
  - **移动到文件夹**（`FolderInput` 图标）→ 弹出文件夹选择下拉菜单
  - **删除**（`Trash2` 图标，danger 样式）→ `window.confirm` 确认后批量删除
  - **取消选择**（`X` 图标）

### 视觉样式

选中状态的文档行使用与 active doc 不同的高亮样式：
- 背景：`var(--vscode-list-inactiveSelectionBackground)`（比 active 更淡）
- 配合左侧边框线

## 实现方案

### 1. Store 层：新增批量操作（`documentsSlice.ts` + `storeHelpers.ts`）

在 `documentsSlice` 中新增两个方法：

```ts
// 批量删除
deleteDocuments: async (ids: string[]) => {
  // 1. 过滤内存中的 documents 和 docList
  // 2. 如果 activeDocId 在删除集合中，切换到第一个剩余文档
  // 3. set() 更新状态
  // 4. 并行调用 storage.deleteDocument() 删除磁盘文件
  // 5. storage.saveIndex() 持久化新索引
}
```

在 `foldersSlice` 中新增：

```ts
// 批量移动
moveDocumentsToFolder: (docIds: string[], folderId: string | null) => {
  // 1. 遍历 docList，更新 folderId
  // 2. set() + scheduleIndexSave()
}
```

在 `storeHelpers.ts` 的 `StoreState` 接口中声明这两个方法的类型。

### 2. `DocumentList.tsx` 组件改动

#### 新增本地状态

```ts
const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
const [lastClickedDocId, setLastClickedDocId] = useState<string | null>(null);
const [batchMoveMenuOpen, setBatchMoveMenuOpen] = useState(false);
```

#### 计算可见文档有序列表（用于 Shift+Click 范围选择）

```ts
const visibleDocIds = useMemo(() => {
  // 递归遍历 tree，收集所有展开文件夹内的文档 id（有序）
  // 搜索模式下直接用 filteredDocs
}, [tree, isSearching, filteredDocs]);
```

#### 修改文档点击处理

```ts
const handleDocClick = (e: React.MouseEvent, docId: string) => {
  // 如果有 suppressClick（拖拽后），return
  if (e.metaKey || e.ctrlKey) {
    // Cmd/Ctrl+Click: 切换选中
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
    setLastClickedDocId(docId);
  } else if (e.shiftKey && lastClickedDocId) {
    // Shift+Click: 范围选择
    const start = visibleDocIds.indexOf(lastClickedDocId);
    const end = visibleDocIds.indexOf(docId);
    const range = visibleDocIds.slice(Math.min(start, end), Math.max(start, end) + 1);
    setSelectedDocIds(new Set(range));
  } else {
    // 普通点击: 打开文档，清除选择
    setSelectedDocIds(new Set());
    openDocument(docId);
    setLastClickedDocId(docId);
  }
};
```

#### 修改右键菜单逻辑

```ts
const handleContextMenu = (e: React.MouseEvent, docId: string) => {
  e.preventDefault();
  e.stopPropagation();
  // 如果右键的文档已在选择集中，且选择集 > 1 → 显示批量菜单
  // 否则 → 清除选择，显示单文档菜单
  if (selectedDocIds.size > 1 && selectedDocIds.has(docId)) {
    setBatchMenu({ x: e.clientX, y: e.clientY });
  } else {
    setSelectedDocIds(new Set());
    setContextMenu({ x: e.clientX, y: e.clientY, docId });
  }
};
```

#### Escape 键清除选择

```ts
useEffect(() => {
  if (selectedDocIds.size === 0) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setSelectedDocIds(new Set());
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [selectedDocIds]);
```

#### 选中样式应用到 NavRow

在 `renderDoc`、`renderSearchResults`、根级文档渲染中，给文档行传入 `selected` 状态。由于 `NavRow` 当前不支持 `selected` prop，需要扩展：

在 `NavRow` 组件中新增 `selected?: boolean` prop，当选中时使用 `bg-[var(--vscode-list-inactiveSelectionBackground)]` 背景。

#### 批量操作栏 UI

在侧边栏底部（resize handle 上方）渲染：

```tsx
{selectedDocIds.size > 0 && (
  <div className="batch-action-bar ...">
    <span>{t('doclist.batchSelected', { count: selectedDocIds.size })}</span>
    <IconButton icon={<FolderInput />} onClick={openMoveMenu} />
    <IconButton icon={<Trash2 />} variant="danger" onClick={batchDelete} />
    <IconButton icon={<X />} onClick={() => setSelectedDocIds(new Set())} />
  </div>
)}
```

### 3. i18n 国际化（`lib/i18n.ts`）

新增 key：
| Key | 中文 | English |
|-----|------|---------|
| `doclist.batchSelected` | 已选 {count} 篇 | {count} selected |
| `doclist.batchDelete` | 删除选中 | Delete Selected |
| `doclist.batchMove` | 移动选中 | Move Selected |
| `doclist.batchDeleteConfirm` | 确定删除选中的 {count} 篇文档吗？ | Delete {count} selected documents? |
| `doclist.batchClear` | 取消选择 | Clear Selection |

### 4. 拖拽兼容

当 `selectedDocIds.size > 0` 时，拖拽逻辑需考虑：
- 如果拖拽的是已选中文档，移动所有选中文档到目标文件夹（而非单个）
- 如果拖拽的是未选中文档，清除选择，按现有行为移动单个文档

在 `onDocPointerDown` 和 `onUp`（commit drop）中处理此逻辑。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/store/documentsSlice.ts` | 新增 `deleteDocuments(ids)` |
| `src/store/foldersSlice.ts` | 新增 `moveDocumentsToFolder(ids, folderId)` |
| `src/store/storeHelpers.ts` | `StoreState` 接口新增两个方法声明 |
| `src/components/DocumentList.tsx` | 多选状态、点击/右键逻辑、批量操作栏 |
| `src/components/ui/NavTree.tsx` | `NavRow` 新增 `selected` prop |
| `src/lib/i18n.ts` | 新增批量操作相关翻译 key |

## 不涉及的文件

- `DocumentContextMenu.tsx` — 单文档右键菜单不变
- Rust 后端 — 无新命令，复用现有 `delete_document` / `write_index`
- `storage.ts` — 无改动
