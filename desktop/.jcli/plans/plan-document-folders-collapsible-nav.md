# 文档列表文件夹功能 — 完整实施方案

## 目标

1. 抽取公共可折叠树组件（`CollapsibleTree`）
2. 给文档列表加入多层嵌套文件夹
3. 数据结构为未来 SQLite 迁移铺路
4. Settings 侧边栏复用同一组件

---

## 一、数据结构设计

### 新增类型：`FolderMeta`

```ts
// lib/storage.ts
export interface FolderMeta {
  id: string;            // "folder-{timestamp}"
  name: string;
  parentId: string | null; // null = 根级
  sortOrder: number;       // 同级排序
  collapsed: boolean;      // UI 折叠状态
}
```

### DocumentMeta 扩展

```ts
export interface DocumentMeta {
  // ...现有字段
  folderId?: string | null; // null/undefined = 根级
}
```

> **为什么不存 `settings.json`**：`write_settings` 是全量覆盖（不是 merge），而现有每个 setter 只传一个字段（`saveSettings({ theme: mode })`）。如果 folders 放 settings.json，任何其他设置的保存都会擦掉它。

### 存储位置：独立的 `folders.json`

```
~/.jdata/studio/
├── index.json        # DocumentMeta[]（新增 folderId 字段）
├── folders.json      # FolderMeta[]（新增）
└── settings.json     # 不动
```

### 为什么是独立文件 + folderId 引用方案

| 考量 | 说明 |
|------|------|
| **不被覆盖** | `folders.json` 有专属 Rust 命令，不会被 settings 的部分写入覆盖 |
| **SQLite 友好** | 迁移时 `folders.json → folders 表`，`index.json.folderId → documents.folder_id`，一对一映射 |
| **关系清晰** | 文档通过外键引用文件夹，重命名文件夹不动文档 |
| **向后兼容** | 老数据无 `folderId` → 自动落根级；`folders.json` 不存在 → 无文件夹 |

---

## 二、Rust 后端（2 个新命令）

### `src-tauri/src/commands/storage.rs`

```rust
fn folders_path() -> PathBuf {
    studio_dir().join("folders.json")
}

#[tauri::command]
pub fn read_folders() -> Result<Value, String> {
    let path = folders_path();
    if !path.exists() {
        return Ok(serde_json::Value::Array(vec![]));
    }
    let data = fs::read_to_string(&path)
        .map_err(|e| format!("failed to read folders: {e}"))?;
    serde_json::from_str(&data).map_err(|e| format!("failed to parse folders: {e}"))
}

#[tauri::command]
pub fn write_folders(entries: Value) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&entries)
        .map_err(|e| e.to_string())?;
    fs::write(folders_path(), json).map_err(|e| e.to_string())
}
```

### 注册命令

`src-tauri/src/lib.rs` 的 `generate_handler!` 中添加：
```
commands::storage::read_folders,
commands::storage::write_folders,
```

---

## 三、前端存储层（`lib/storage.ts`）

### 新增

```ts
export interface FolderMeta {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  collapsed: boolean;
}

// storage 对象中新增：
loadFolders: () => invoke<FolderMeta[]>('read_folders'),
saveFolders: (folders: FolderMeta[]) => invoke<void>('write_folders', { entries: folders }),
```

### DocumentMeta 扩展

```ts
export interface DocumentMeta {
  id: string;
  title: string;
  emoji: string;
  createdAt: string;
  updatedAt: string;
  isFavorite?: boolean;
  folderId?: string | null;  // ← 新增
}
```

### toMeta 同步

```ts
export function toMeta(doc: Document): DocumentMeta {
  return {
    id: doc.id,
    title: doc.title,
    emoji: doc.emoji,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    isFavorite: doc.isFavorite,
    folderId: doc.folderId ?? null,  // ← 新增
  };
}
```

---

## 四、Store 层（`store/foldersSlice.ts` — 新文件）

### 状态

```ts
interface FoldersState {
  folders: FolderMeta[];
  // 初始化
  initFolders: (raw: FolderMeta[]) => void;
  // CRUD
  createFolder: (name: string, parentId: string | null) => void;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;  // 子文档移至根级
  toggleFolderCollapsed: (id: string) => void;
  moveDocumentToFolder: (docId: string, folderId: string | null) => void;
}
```

### 关键逻辑

- **createFolder**：生成 `folder-{timestamp}`，追加到 `folders` 数组，debounce 保存
- **deleteFolder**：
  1. 递归删除所有子文件夹
  2. 将该文件夹下的文档 `folderId` 置为 null（移至根级）
  3. 保存 folders + index
- **moveDocumentToFolder**：更新 `docList` 中对应 meta 的 `folderId`，debounce 保存 index
- **toggleFolderCollapsed**：更新 `folders` 中对应项的 `collapsed`，立即保存
- 持久化辅助：`scheduleFoldersSave(folders)`（500ms debounce）

### StoreState 扩展（`storeHelpers.ts`）

新增字段和方法声明。

### 合并到 store（`useStore.ts`）

```ts
import { createFoldersSlice } from './foldersSlice';
// ...
...createFoldersSlice(set, get),
```

---

## 五、公共组件：`CollapsibleTree`

### 路径：`src/components/ui/CollapsibleTree.tsx`

不做一个过度抽象的"通用树组件"。而是抽取一个 **`CollapsibleNav`** 容器组件，封装：
- 箭头旋转动画（`ChevronRight` → `rotate-90`）
- 子项缩进 + 左侧引导线
- 展开/折叠状态管理

```tsx
interface CollapsibleNavProps {
  expanded: boolean;
  onToggle: () => void;
  // header slot（主标题渲染）
  header: React.ReactNode;
  children?: React.ReactNode;
}
```

但因为 Settings 和 DocumentList 的交互差异较大（Settings 是导航跳转，DocumentList 是 CRUD + 拖拽），**抽公共组件的投入产出比不高**。更好的做法是抽取共享的 **样式逻辑** 和 **hooks**：

### 方案：抽 `useCollapsibleTree` hook + 共享样式常量

**`src/components/ui/useCollapsibleTree.ts`**

```ts
export function useCollapsibleTree<T extends { id: string }>(initialExpanded?: Set<string>) {
  const [expanded, setExpanded] = useState<Set<string>>(initialExpanded ?? new Set());
  const toggle = useCallback((id: string) => { ... }, []);
  const isExpanded = useCallback((id: string) => expanded.has(id), [expanded]);
  return { expanded, toggle, isExpanded, setExpanded };
}
```

Settings.tsx 和 DocumentList.tsx 各自实现自己的渲染逻辑，复用 hook 和样式约定（箭头动画、缩进规则）。

---

## 六、树构建工具（`lib/folderTree.ts` — 新文件）

```ts
import type { FolderMeta, DocumentMeta } from './storage';

export interface FolderTreeNode {
  folder: FolderMeta | null;  // null = 根级虚拟节点
  subFolders: FolderTreeNode[];
  documents: DocumentMeta[];
}

export function buildFolderTree(
  folders: FolderMeta[],
  documents: DocumentMeta[],
): FolderTreeNode {
  // 递归构建树
}
```

---

## 七、DocumentList 改造（核心 UI）

### 新增功能

1. **新建文件夹按钮**：头部 `+` 按钮旁增加 `新建文件夹` 按钮（`FolderPlus` 图标）
2. **文件夹渲染**：
   - 文件夹行：`Folder`/`FolderOpen` 图标 + 名称 + 折叠箭头
   - 展开时显示子文件夹 + 文档
   - 嵌套缩进：每层 `pl-4`（16px）
3. **文件夹右键菜单**：重命名、删除、新建子文件夹
4. **文档移动**：右键菜单 → "移动到..." → 显示文件夹列表选择
5. **折叠状态**：从 `FolderMeta.collapsed` 读取/持久化

### 文件夹行交互

| 操作 | 行为 |
|------|------|
| 点击文件夹名 | 切换展开/折叠 |
| 右键文件夹 | 上下文菜单（重命名/删除/新建子文件夹） |
| 双击文件夹名 | 进入重命名编辑模式 |

### 文档右键菜单扩展

在现有 `DocumentContextMenu` 中新增：
- "移动到文件夹" → 弹出文件夹选择子菜单

### 搜索过滤

搜索时展平所有文件夹，按标题过滤文档，忽略文件夹层级（搜索结果平铺显示）。

---

## 八、Settings.tsx 复用

将 Settings.tsx 中的展开逻辑改为使用 `useCollapsibleTree` hook，保持现有行为不变。

---

## 九、i18n 新增 key

```
doclist.newFolder: "新建文件夹" / "New Folder"
doclist.renameFolder: "重命名" / "Rename"
doclist.deleteFolder: "删除文件夹" / "Delete Folder"
doclist.moveTo: "移动到" / "Move to"
doclist.untitledFolder: "新建文件夹" / "Untitled Folder"
doclist.rootLevel: "根目录" / "Root"
doclist.deleteFolderConfirm: "确定删除文件夹「{name}」吗？文件夹内的文档将移至根目录。" / "..."
```

---

## 十、文件清单

| 文件 | 类型 | 改动 |
|------|------|------|
| `src-tauri/src/commands/storage.rs` | Rust | +`read_folders` +`write_folders` |
| `src-tauri/src/lib.rs` | Rust | 注册 2 个新命令 |
| `src/lib/storage.ts` | TS | +`FolderMeta` +`loadFolders/saveFolders` +`DocumentMeta.folderId` |
| `src/lib/folderTree.ts` | **新** | 树构建工具 |
| `src/store/foldersSlice.ts` | **新** | 文件夹 CRUD slice |
| `src/store/storeHelpers.ts` | TS | StoreState 扩展 |
| `src/store/useStore.ts` | TS | 合并 foldersSlice |
| `src/store/documentsSlice.ts` | TS | init 中加载 folders；createDocument 支持 folderId |
| `src/components/ui/useCollapsibleTree.ts` | **新** | 共享展开/折叠 hook |
| `src/components/Settings.tsx` | TSX | 复用 `useCollapsibleTree` |
| `src/components/DocumentList.tsx` | TSX | 文件夹树渲染 + CRUD UI |
| `src/components/DocumentContextMenu.tsx` | TSX | "移动到"子菜单 |
| `src/lib/i18n.ts` | TS | 新增文件夹相关翻译 |
