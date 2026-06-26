# 回收站功能实现计划

## 目标

为 JStudio 增加"回收站"概念：删除文档/文件夹时不再永久删除，而是移入回收站。用户可在回收站中恢复或彻底删除。

## 设计方案

### 核心思路：软删除标记

在 `DocumentMeta` 和 `FolderMeta` 上增加 `trashed` 时间戳字段。当用户"删除"时：
- 不调用 `storage.deleteDocument()`，而是设置 `trashedAt: Date.now()`
- 保存到 `index.json` / `folders.json`
- 侧边栏文档列表过滤掉 `trashedAt != null` 的项

回收站视图单独展示已标记为 trashed 的文档/文件夹，提供「恢复」和「永久删除」操作。

---

## 改动清单（按层级）

### 1. 类型层 — `src/lib/storage.ts`

**DocumentMeta** 新增字段：
```ts
export interface DocumentMeta {
  // ... existing
  /** ISO timestamp when moved to trash; null/undefined = active */
  trashedAt?: string | null;
}
```

**FolderMeta** 新增字段：
```ts
export interface FolderMeta {
  // ... existing
  trashedAt?: string | null;
}
```

### 2. Store 层

#### `src/store/documentsSlice.ts`

**新增方法**：
- `trashDocument(id: string)` — 设置 `trashedAt`，从可见列表移除，保存 index
- `trashDocuments(ids: string[])` — 批量软删除
- `restoreDocument(id: string)` — 清除 `trashedAt`，恢复到可见列表
- `restoreDocuments(ids: string[])` — 批量恢复
- `emptyTrash()` — 永久删除所有 trashed 文档（调用 `storage.deleteDocument`）

**修改方法**：
- `deleteDocument(id)` — 改名为 `permanentlyDeleteDocument` 或保持原名，但**仅从回收站永久删除时调用**。逻辑不变（从内存移除 + 调用 `storage.deleteDocument` + 保存 index）
- `deleteDocuments(ids)` — 同上，仅用于回收站清空

> **关键决策**：现有的 `deleteDocument` / `deleteDocuments` 语义改为"永久删除"（仅回收站内使用），UI 删除入口改调 `trashDocument` / `trashDocuments`。

**新增 state**：
```ts
trashedDocList: DocumentMeta[]; // 回收站文档列表（从 docList 过滤）
```
在 `initDocumentsStore` 中初始化（从 `index.json` 读取后分离 active/trashed）。

#### `src/store/foldersSlice.ts`

**新增方法**：
- `trashFolder(id: string)` — 软删除文件夹（标记 `trashedAt`），文件夹内文档同步标记
- `trashFolders(ids: string[])` — 批量
- `restoreFolder(id: string)` — 恢复文件夹及内部文档
- `restoreFolders(ids: string[])` — 批量
- `emptyTrashFolders()` — 永久删除所有 trashed 文件夹

#### `src/store/storeHelpers.ts`

在 `StoreState` 接口中声明所有新增方法：
```ts
// 文档回收站
trashDocument: (id: string) => void;
trashDocuments: (ids: string[]) => void;
restoreDocument: (id: string) => void;
restoreDocuments: (ids: string[]) => void;
trashedDocList: DocumentMeta[];
// 文件夹回收站
trashFolder: (id: string) => void;
trashFolders: (ids: string[]) => void;
restoreFolder: (id: string) => void;
restoreFolders: (ids: string[]) => void;
trashedFolders: FolderMeta[];
```

### 3. UI 层

#### `src/components/DocumentList.tsx`

**当前删除入口改为"移入回收站"**：
- 单文档右键菜单：`doclist.delete` → 改调 `trashDocument`，确认文案改为"移入回收站？"
- 批量删除：`batchDelete` → 改调 `trashDocuments`

**新增回收站面板**（在 DocumentList 底部或独立分区）：
- 展示 `trashedDocList` + `trashedFolders`
- 每项右侧两个操作：「恢复」和「永久删除」
- 面板顶部有「清空回收站」按钮

> **UI 方案**：在文档列表底部添加一个可折叠的「回收站」分区，点击展开后显示已删除项。不新增 Activity Bar 入口（保持轻量）。

#### `src/components/DocumentContextMenu.tsx`

- 删除菜单项文案改为"移入回收站"
- 确认弹窗文案对应调整

### 4. i18n — `src/lib/i18n.ts`

新增翻译键（中英双语）：
```ts
'doclist.trash': '回收站' / 'Trash',
'doclist.moveToTrash': '移入回收站' / 'Move to Trash',
'doclist.moveToTrashConfirm': '确定将「{name}」移入回收站吗？' / 'Move "{name}" to trash?',
'doclist.batchMoveToTrashConfirm': '确定将选中的 {count} 项移入回收站吗？' / 'Move {count} selected items to trash?',
'doclist.restore': '恢复' / 'Restore',
'doclist.restoreDocument': '恢复文档' / 'Restore Document',
'doclist.permanentlyDelete': '永久删除' / 'Delete Permanently',
'doclist.permanentlyDeleteConfirm': '确定永久删除「{name}」吗？此操作不可撤销。' / 'Permanently delete "{name}"? This cannot be undone.',
'doclist.emptyTrash': '清空回收站' / 'Empty Trash',
'doclist.emptyTrashConfirm': '确定永久删除回收站中的所有项目吗？此操作不可撤销。' / 'Permanently delete all items in trash? This cannot be undone.',
'doclist.trashEmpty': '回收站为空' / 'Trash is empty',
'doclist.deletedDate': '删除于 {date}' / 'Deleted {date}',
```

同时修改现有键的文案：
- `'doclist.delete'` 保持"删除"（用于永久删除）
- `'doclist.batchDelete'` → 改为"移入回收站" / "Move to Trash"
- `'doclist.batchDeleteConfirm'` → 改为软删除确认

### 5. 命令注册（可选增强）— `src/lib/commandRegistry.ts`

新增命令：
- 「移入回收站」（当前文档）
- 「打开回收站」
- 「清空回收站」

---

## 实现顺序

1. **类型层**：`storage.ts` 增加 `trashedAt` 字段
2. **Store 层**：documentsSlice + foldersSlice 新增 trash/restore 方法，修改现有 delete 语义
3. **storeHelpers**：声明新接口
4. **i18n**：新增翻译键
5. **UI 层**：DocumentList 增加回收站分区，DocumentContextMenu 修改删除文案
6. **测试**：`npx tsc --noEmit` 类型检查通过

---

## 不改动的部分

- **Rust 后端**：无需修改。回收站是纯前端概念（通过 index.json 的 trashedAt 字段实现），永久删除仍用现有 `delete_document` 命令。
- **存储结构**：`~/.jdata/studio/` 布局不变。trashed 文档的文件仍在 `documents/{id}/` 下，只是 `index.json` 中标记了 `trashedAt`。
- **编辑器核心**：不涉及。
