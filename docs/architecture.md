# 架构与目录边界规则

> 本文档定义 `src/` 的目录边界约定，供新增/移动文件时遵循。结构优化计划见 `docs/file-structure-optimization-plan.md`。

## 分层规则

1. **`src/lib/` = 逻辑层**：可复用纯逻辑——纯函数、store 适配、tiptap 扩展定义、内容转换（richText↔HTML↔tiptap JSON）、主题/快捷键/命令注册、i18n、常量。不含业务容器组件。
2. **`src/components/` = 视图层**：所有 React 组件——容器组件（`BlockEditor`、`DocumentList`、`Settings`…）、节点视图（`nodes/*`）、通用 UI（`ui/*`）、布局（`layout/*`）、多窗口入口（`windows/*`）、设置页（`settings/*`）、Agent 面板（`agent/*`）。
3. **唯一例外**：与某个 tiptap 扩展 / suggestion 插件**强绑定**、且被 `lib/` 侧渲染的 React UI，可留在 `lib/editor` 对应目录。例如 `lib/editor/slashMenu/` 的 `SlashMenuList.tsx` / `renderer.tsx` / `shared.tsx`（被同目录 suggestion 插件渲染，移走会造成 `lib → components` 反向依赖）。普通应用 UI 一律进 `components/`。
4. **依赖方向单向**：`components/` → `lib/`。禁止 `lib/` 反向 `import` `components/` 的业务组件。
5. **巨型文件红线**：单文件 > 400 行（组件）/ > 500 行（逻辑）应拆分。提 PR 前跑 `npm run knip` 确认无新增未用导出。

## 当前真实目录（节选，非全量）

```
src/
├── main.tsx / App.tsx
├── types/            # 全局类型（document/editor/richText/agent）
├── lib/              # 逻辑层
│   ├── core/         # storage, i18n(+i18n/translations.ts 数据), commandRegistry, logger
│   ├── editor/
│   │   ├── extensions/   # tiptap 扩展（含 node-view 配对 .tsx 例外）
│   │   ├── slashMenu/    # 斜杠菜单逻辑（commands + suggestion plugin + UI 例外）
│   │   ├── tiptapAdapter/ # 唯一转换源（blocks.ts 等）
│   │   ├── content/      # 纯转换（assetUrl/blockContent/docxPreview/editorPasteDrop）
│   │   ├── mermaid/      # mermaid 渲染逻辑
│   │   └── sectioning.ts # 纯分段函数（SECTION_SIZE/SECTION_MAX/SECTION_MERGE_BELOW/SectionState/splitIntoSections）
│   ├── themes/ shortcuts/ documents/ terminal/ windows/ commandPalette/ ime/ constants/
├── components/        # 视图层
│   ├── ui/ layout/ settings/ terminal/ windows/ agent/
│   │   └── cursor/       # BaseCursorTrail, EditorCursorTrail, trailMath.ts（纯助手）
│   ├── documents/     # DocumentList（计划拆 FolderTree/DocumentRow/Menus）
│   └── editor/
│       ├── BlockEditor.tsx / SectionedBlockEditor.tsx
│       ├── nodes/        # 含 graph/（graphCanvasStyle.ts + ShapeGlyph.tsx 已拆出）
│       ├── sectionEditor/ # SectionedBlockEditor + SectionSkeleton.tsx + SectionEditor + SectionOutline
│       ├── hooks/ CommandPalette.tsx
├── store/            # Zustand（slice 模式）
├── data/ styles/     # 静态内容 / 全局样式
```

## 新增文件决策树（见 `docs/structure-review.md`）
