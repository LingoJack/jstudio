# JStudio 架构优化审查报告

## 概述

经过对 JStudio 代码库的全面审查，整体架构设计良好，遵循了 AGENTS.md 中定义的规范。以下是发现的优化点和改进建议。

---

## 一、类型系统优化

### 1.1 `BlockProperties` 接口过于庞大

**现状**：`src/types/document.ts` 中 `BlockProperties` 接口包含 116 行定义，涵盖所有块类型的属性（代码块、图片、文件、表格、链接、图表等）。

**问题**：
- 单一接口承载过多职责，违反接口隔离原则
- 查找特定块类型的属性需要阅读整个接口
- 新增块类型时容易遗漏或误用其他块类型的属性

**建议**：
```typescript
// 拆分为多个专用接口
interface CodeBlockProperties {
  language?: string;
  codeHtmlPreview?: boolean;
  codeWidthPct?: number;
  codeHeightPct?: number;
  // ...
}

interface ImageBlockProperties {
  imageType?: 'url' | 'base64' | 'asset';
  widthPct?: number;
  heightPct?: number;
  align?: 'left' | 'center';
  caption?: string;
}

interface FileBlockProperties {
  fileType?: string;
  fileName?: string;
  fileSize?: number;
  fileDisplayMode?: 'card' | 'preview';
  // ...
}

// BlockProperties 改为联合类型或组合接口
type BlockProperties = CodeBlockProperties & ImageBlockProperties & FileBlockProperties & ...;
```

**影响范围**：`types/document.ts`、`lib/editor/tiptapAdapter.ts`、各块组件。

### 1.2 强制类型转换审查

**现状**：发现 8 处 `as unknown as` 强制转换，分布在：
- `terminalRegistry.ts`（1处）
- `useTerminalManager.ts`（3处）
- `tiptapAdapter.ts`（2处）
- `helpDocument.ts`（2处）

**建议**：
- 逐处审查是否可以通过改进类型定义消除
- 如果确实需要，添加注释说明转换原因
- 特别关注 `tiptapAdapter.ts` 中的转换，这是核心数据转换层

---

## 二、Store 架构优化

### 2.1 Slice 文件拆分

**现状**：`documentsSlice.ts` 约 500+ 行，包含：
- 文档 CRUD
- 标签页管理
- 导入导出逻辑
- 搜索过滤
- 批量操作

**建议**：
```
src/store/
├── documentsSlice.ts       # 核心 CRUD（保留）
├── tabsSlice.ts            # 标签页管理（新建）
├── importExportSlice.ts    # 导入导出逻辑（新建）
└── documentsSelectors.ts   # 选择器层（新建）
```

**收益**：
- 降低单文件复杂度
- 更清晰的职责边界
- 方便单元测试

### 2.2 统一选择器层

**现状**：组件直接使用 `useStore((s) => s.xxx)`，无统一选择器层。

**问题**：
- 状态结构变化时需要修改多个组件
- 无法集中优化计算性能（memoization）
- 缺少对复杂状态聚合的封装

**建议**：
```typescript
// src/store/selectors.ts
export const selectActiveDocBlocks = (state: StoreState) => state.activeDoc.blocks;
export const selectFilteredDocuments = (state: StoreState) => {
  // 封装过滤逻辑
  return state.documents.filter(d => 
    state.searchQuery ? d.title.includes(state.searchQuery) : true
  );
};
export const selectIsEditorReady = (state: StoreState) => 
  state.activeDocId && state.activeDoc.blocks.length > 0;

// 组件中使用
const blocks = useStore(selectActiveDocBlocks);
```

---

## 三、编辑器架构优化

### 3.1 tiptapAdapter 拆分

**现状**：`tiptapAdapter.ts` 约 723 行，包含：
- RichText ↔ TipTap marks 双向转换
- Block ↔ TipTap node 双向转换
- 表格、列表、待办等复杂结构的专用转换
- 嵌套内容处理

**建议**：
```
src/lib/editor/
├── tiptapAdapter/
│   ├── index.ts            # barrel export + 主入口函数
│   ├── richText.ts         # RichText ↔ marks 转换
│   ├── blocks.ts           # Block ↔ node 主转换
│   ├── table.ts            # 表格专用转换
│   ├── list.ts             # 列表专用转换
│   └── todo.ts             # 待办专用转换
```

**收益**：
- 每个文件职责单一
- 更容易维护复杂嵌套结构
- 方便添加新的块类型转换

### 3.2 扩展注册统一

**现状**：`lib/editor/extensions/` 下有约 12 个扩展文件，无 barrel export。

**建议**：
```typescript
// src/lib/editor/extensions/index.ts
export { collapsibleExtension } from './collapsibleExtension';
export { taskListMarkdown } from './taskListMarkdown';
export { selectAllText } from './selectAllText';
// ...

// 使用时
import { collapsibleExtension, taskListMarkdown } from './extensions';
```

---

## 四、Rust 后端优化

### 4.1 db.rs 拆分

**现状**：`db.rs` 约 600+ 行，包含：
- 连接管理
- 建表逻辑
- JSON 迁移
- 孤儿文档恢复
- body backfill

**建议**：
```
src-tauri/src/
├── db/
│   ├── mod.rs              # 公共 API（db()、init_db()）
│   ├── schema.rs           # create_tables + 迁移检测
│   ├── migrate.rs          # migrate_from_json
│   ├── reconcile.rs        # reconcile_orphan_documents
│   └── backups.rs          # migrate_document_bodies
```

### 4.2 命令命名一致性

**现状**：命令名沿用 JSON 时代旧名（如 `read_index` 实际读 SQLite），虽然保证向后兼容，但新开发者可能困惑。

**建议**：
- 在 `lib.rs` 命令注册处添加注释说明历史原因
- 文档中明确说明命令语义变化
- 未来新增命令直接使用语义化命名

---

## 五、组件架构优化

### 5.1 业务组件职责拆分

**现状**：部分组件内联过多逻辑：

- `DocumentList.tsx` 包含：搜索过滤、列表渲染、新建入口、右键菜单、批量选择、拖拽排序
- `BlockEditor.tsx` 包含：编辑器初始化、状态同步、保存调度、键盘事件、图片粘贴

**建议**：

```tsx
// DocumentList.tsx 拆分
<DocumentList>
  <DocumentSearch />          {/* 搜索过滤 */}
  <DocumentListItems />       {/* 列表渲染 */}
  <DocumentCreateButton />    {/* 新建入口 */}
</DocumentList>

// 或使用 hooks 拆分逻辑
const useDocumentListState = () => { /* 搜索、选择、排序状态 */ };
const useDocumentListActions = () => { /* 创建、删除、移动操作 */ };
```

### 5.2 公共 UI 组件增强

**现状**：`components/ui/` 有 13 个组件，结构良好。

**建议补充**：
- `LoadingState.tsx` — 统一的加载中状态（目前各组件自行处理）
- `ErrorState.tsx` — 统一的错误状态展示
- `ConfirmDialog.tsx` — 确认对话框（删除文档等操作需要）

---

## 六、性能优化建议

### 6.1 SectionedBlockEditor 虚拟化

**现状**：使用 `requestIdleCallback` 渐进挂载，但未使用真正的虚拟滚动。

**建议**：
- 当 section 数量超过阈值（如 10 个 section = 300 块）时，启用虚拟滚动
- 仅渲染可视区域附近的 section
- 需要权衡：虚拟滚动与 TipTap 实例的生命周期管理复杂度

### 6.2 Store 选择器 memoization

**现状**：无选择器层，组件每次渲染可能重复计算。

**建议**：
```typescript
// 使用 Zustand 的 shallow 比较或自定义选择器
import { shallow } from 'zustand/shallow';

// 对对象/数组使用 shallow
const { docs, activeId } = useStore(
  (s) => ({ docs: s.documents, activeId: s.activeDocId }),
  shallow
);
```

---

## 七、代码质量指标

**良好的现状**：
- ✅ 无 `TODO/FIXME/HACK` 注释残留
- ✅ 无 `useEffect` 空依赖数组滥用
- ✅ 无 `useState as any` / `useRef as any` 强制转换
- ✅ 类型检查通过（tsc --noEmit）
- ✅ i18n key 结构完整（zh/en 双字典）
- ✅ CSS 变量使用规范（遵循三层边框语义）

**需关注的点**：
- ⚠️ `as unknown as` 强制转换 8 处（应审查原因）
- ⚠️ 大文件：`tiptapAdapter.ts`（723行）、`db.rs`（600+行）、`documentsSlice.ts`（500+行）
- ⚠️ `BlockProperties` 接口过大（116行）

---

## 八、优化优先级建议

| 优先级 | 优化项 | 预估工作量 | 收益 |
|--------|--------|------------|------|
| P1 | tiptapAdapter 拆分 | 2-3h | 可维护性显著提升 |
| P1 | BlockProperties 拆分 | 1-2h | 类型安全性提升 |
| P2 | Store 选择器层 | 2h | 性能优化 + 重构便利 |
| P2 | db.rs 拆分 | 1-2h | Rust 侧可维护性 |
| P3 | documentsSlice 拆分 | 2h | 降低单文件复杂度 |
| P3 | 扩展 barrel export | 0.5h | 导入便利性 |
| P3 | 补充公共 UI 组件 | 1h | 组件复用 |

---

## 九、总结

JStudio 整体架构设计合理，遵循了项目规范，无明显结构性问题。主要的优化方向是：

1. **大文件拆分** — 将过长的核心文件（tiptapAdapter、db.rs、documentsSlice）拆分为模块化结构
2. **类型细化** — 将聚合型接口（BlockProperties）拆分为专用接口
3. **选择器层** — 添加统一的 store 选择器，为未来性能优化和重构提供基础
4. **组件职责边界** — 将复杂业务组件的逻辑拆分为 hooks 或子组件

以上优化均为增量改进，不影响现有功能，可按优先级逐步实施。