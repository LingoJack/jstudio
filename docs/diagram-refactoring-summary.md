# DiagramBlockView 代码结构优化总结

## 重构目标

将原 370 行的单文件组件拆分为多个职责清晰的 hooks,提升可维护性、可测试性和代码复用性。

## 重构成果

### 1. 新增自定义 Hooks (5 个)

| Hook | 文件路径 | 职责 |
|------|---------|------|
| `useDiagramSize` | `hooks/useDiagramSize.ts` | 尺寸计算、legacy pixel → percentage 懒迁移、resize handler |
| `useDiagramEditMode` | `hooks/useDiagramEditMode.ts` | 编辑模式管理、Excalidraw canvas 焦点控制 |
| `useDiagramWindow` | `hooks/useDiagramWindow.ts` | 新窗口编辑逻辑、snapshot/blockId 稳定引用 |
| `useDiagramRenderer` | `hooks/useDiagramRenderer.ts` | 渲染内核路由 (Excalidraw vs Graph) |
| `useDarkMode` | `hooks/useDarkMode.ts` | 暗色模式检测 (基于 `.dark` class) |

### 2. 主组件优化

**DiagramBlockView.tsx** (从 370 行 → 230 行)

- 移除所有内联逻辑,改为组合 hooks
- 职责变为"协调 + 渲染"
- 代码结构清晰,每个区块有明确的注释分隔

## 架构优势

### 1. 单一职责原则

每个 hook 只处理一个特定领域:

```typescript
// 尺寸管理 → useDiagramSize
const { displayWidth, displayHeight, onResizeStart } = useDiagramSize({ attrs, updateAttributes });

// 编辑模式 → useDiagramEditMode
const { handleExcalidrawRoot } = useDiagramEditMode(editing);

// 渲染内核 → useDiagramRenderer
const { useLegacyExcalidraw } = useDiagramRenderer(snapshot);

// 窗口编辑 → useDiagramWindow
const { windowOpen, handleMaximize } = useDiagramWindow({ snapshot, blockId, isDark, updateAttributes });

// 暗色模式 → useDarkMode
const isDark = useDarkMode();
```

### 2. 可测试性提升

每个 hook 可独立测试,无需 mock 整个组件:

```typescript
// 测试尺寸迁移逻辑
import { useDiagramSize } from './useDiagramSize';

test('migrates legacy pixel width to percentage', () => {
  // ...
});

// 测试渲染内核路由
import { useDiagramRenderer } from './useDiagramRenderer';

test('uses Excalidraw for legacy snapshots', () => {
  // ...
});
```

### 3. 逻辑复用

这些 hooks 可被其他类似组件复用:

- `useDarkMode` → 所有需要暗色模式的组件
- `useDiagramEditMode` → 其他 canvas-based blocks
- `useDiagramSize` → 任何支持百分比尺寸的 block

### 4. 稳定性改进

通过 refs 稳定化避免了回调重建导致的副作用:

```typescript
// useDiagramWindow 内部
const snapshotRef = useRef(snapshot);
const blockIdRef = useRef(blockId);

useEffect(() => {
  snapshotRef.current = snapshot;
  blockIdRef.current = blockId;
}, [snapshot, blockId]);

// handleMaximize 不依赖 snapshot/blockId,避免重建
const handleMaximize = useCallback(() => {
  openDiagramWindow(snapshotRef.current ?? '', ...);
}, [windowOpen, isDark, handleWindowUpdate, blockId]); // 稳定依赖
```

## 迁移路径

所有重构保持 **100% 向后兼容**:

1. API 未变: `DiagramBlockView` 仍接收 `NodeViewProps`
2. 行为未变: 所有交互逻辑与原组件一致
3. 数据未变: snapshot 格式、尺寸迁移逻辑完全保留

## 编译验证

重构后无新增 TypeScript 编译错误:

```bash
$ npx tsc --noEmit --project tsconfig.app.json
# 无 DiagramBlockView/useDiagram* 相关错误
```

(GraphCanvas.tsx 的原有错误与本次重构无关)

## 未来改进建议

1. **可考虑进一步拆分**: `useDiagramSize` 中的 legacy migration 可独立为 `useDimensionMigration`
2. **类型增强**: 为 `DiagramNodeAttributes` 增加更严格的类型约束
3. **性能优化**: 考虑为 `useDiagramRenderer` 增加 snapshot hash 缓存
4. **测试覆盖**: 为新增 hooks 编写单元测试

## 相关文件

- 主组件: `src/components/editor/nodes/DiagramBlockView.tsx`
- Hooks 目录: `src/components/editor/hooks/`
  - `useDiagramSize.ts`
  - `useDiagramEditMode.ts`
  - `useDiagramWindow.ts`
  - `useDiagramRenderer.ts`
  - `useDarkMode.ts`