# 新增文件该放哪？（结构 review 决策树）

> 配合 `docs/architecture.md` 的边界规则使用。提 PR 前跑 `npm run lint:struct`。

1. **是纯逻辑 / 工具 / 扩展定义 / 转换 / 主题 / 快捷键？**
   → 放 `src/lib/<domain>/`（如 `lib/editor/extensions/`、`lib/documents/`）。

2. **是 React 组件（容器 / 节点视图 / 通用 UI）？**
   → 放 `src/components/<domain>/`（如 `components/editor/`、`components/documents/`）。

3. **该 UI 是否被 `lib/` 侧渲染、且与某个 tiptap 扩展 / suggestion 插件强绑定？**
   → 唯一例外：可留 `lib/editor/<x>/`（如 `slashMenu/SlashMenuList.tsx`）。普通应用 UI 一律进 `components/`。
   → **禁止** `lib/` 反向 `import` `components/` 的业务组件（依赖方向单向）。

4. **单文件将超 400 行（组件）/ 500 行（逻辑）？**
   → 先拆分再提交：把纯函数 / 常量提到 `lib/` 或同级 `*.ts`，把可复用 JSX 提到独立组件。

5. **是否引入了新 npm 依赖？**
   → 确认它是直接依赖（在 `package.json` `dependencies` 中），而非仅靠传递依赖解析（knip 会报 "Unlisted dependencies"）。

6. **提交前**
   → `npm run lint:struct`（= `tsc --noEmit` + `knip`），确保无新增未用导出 / 死文件。

## knip 已确认的死文件处理
- `SearchBar.tsx`、`useSizeMigration.ts`、`htmlToRichText.ts`、`richTextToHtml.ts` 已删除（Phase 1）。
- `lib/core/index.ts`、`lib/constants/index.ts`、`lib/constants/ui.ts`、`lib/commandPalette/index.ts` 是未被直接引用的 barrel，暂保留（删除需先确认无隐式消费方）。
