# JStudio 文件结构优化计划（可执行 v2 — 细化到行号与命令）

> 生成日期：2026-07-11（v2 细化版）
> 范围：前端 `src/`（201 个 `.ts`/`.tsx` 文件，约 44.6k 行）。`src-tauri/` 结构清晰、已模块化，**不建议改动**。
> 数据来源：目录树 + 行数扫描 + 相对导入图（排除 barrel）+ 人工 grep 复核（动态 `import()` / 副作用 `import` 盲区已人工确认）。所有行号基于当前 `src/` 实测，执行时若文件已变动请重新 `grep -n` 校准。

**v2 相比 v1 的改进**：Phase 0/1/2/5 现在是**可直接复制运行的 shell 脚本**；Phase 3 每个巨型文件给出**精确行号提取表 + 目标文件 + 源文件需替换的一行 import + 新文件代码桩**；新增 `knip.json` 全文与每步的"完成定义"。

---

## 0. 速览与执行顺序

```
Phase 0  装 knip + 基线校验          （风险极低，~0.5h）
Phase 1  删死文件（带验证 grep）      （风险极低，~0.5h）
Phase 2  边界文档 + main.tsx 风格统一 （风险低，~1h）
Phase 3  拆 5 个巨型文件（逐文件 tsc） （风险中，~3–4d，每拆一个文件验一次）
Phase 4  （暂缓）feature-sliced 大重构 （高风险，不建议本轮）
Phase 5  接 CI + 结构 review 指南      （风险极低，~0.5h）
```
每阶段结束 `git commit` 一次；全部命令在仓库根目录 `jstudio/` 下执行（脚本里用绝对/相对路径均从仓库根出发）。

---

## Phase 0 — 工具与基线

**0.1 安装 knip（死代码/未用导出扫描器）**
```bash
cd /Users/lingojack/dev_custom/jstudio
npm i -D knip
```

**0.2 写入 `knip.json`（仓库根）** — 全文如下，已把脚本盲区（动态/副作用 import）列入白名单：
```json
{
  "entry": ["src/main.tsx", "src/components/windows/*WindowApp.tsx"],
  "project": ["src/**/*.{ts,tsx}"],
  "ignore": [
    "src/globals.d.ts",
    "src/lib/shortcuts/globalShortcutActions.ts",
    "src/components/editor/nodes/TableSizeSelector.tsx"
  ],
  "ignoreDependencies": true
}
```

**0.3 在 `package.json` 的 `scripts` 增加**（用编辑器或 `npm pkg set`）：
```json
{ "scripts": { "knip": "knip", "lint:tsc": "tsc --noEmit" } }
```
```bash
npm pkg set scripts.knip="knip"
npm pkg set scripts.lint:tsc="tsc --noEmit"
```

**0.4 基线校验（必须全绿再继续）**
```bash
npx tsc --noEmit && echo "TSC_OK"
npx knip            # 记录当前输出，作为后续对比基线
```
> 完成定义：`tsc --noEmit` 无错误；`knip` 输出已存档（截图/粘贴到 PR 描述）。

**0.5 提交**
```bash
git add -A && git commit -m "chore: add knip + tsc lint scripts (structure baseline)"
```

---

## Phase 1 — 删除死代码（带验证）

**1.1 先让 knip 报告未用项**（确认与人工判断一致）：
```bash
npx knip
```

**1.2 对每一个候选做"最后人工确认"**（脚本盲区复核）。下列命令应输出**空**（无任何引用）才算死：
```bash
cd /Users/lingojack/dev_custom/jstudio/src
echo "--- SearchBar ---";      grep -rn "SearchBar"      --include=*.tsx --include=*.ts . | grep -v "components/editor/SearchBar.tsx" | grep -v "i18n.ts"
echo "--- useSizeMigration ---"; grep -rn "useSizeMigration" --include=*.ts  . | grep -v "components/editor/hooks/useSizeMigration.ts"
echo "--- htmlToRichText ---";  grep -rn "htmlToRichText"  --include=*.ts --include=*.tsx . | grep -v "lib/editor/content/htmlToRichText.ts"
echo "--- richTextToHtml ---";   grep -rn "richTextToHtml"  --include=*.ts --include=*.tsx . | grep -v "lib/editor/content/richTextToHtml.ts"
```
> 若 `htmlToRichText` / `richTextToHtml` 在 markdown/docx 导入路径里有调用（如被 `lib/editor/content/*` 或 `lib/documents/*` 引用），**不要删**，改为在该文件顶部加一行注释说明用途，并把它加进 `knip.json` 的 `ignore`。

**1.3 删除确认死的文件**（用 `git rm` 保留历史）：
```bash
cd /Users/lingojack/dev_custom/jstudio
git rm src/components/editor/SearchBar.tsx
git rm src/components/editor/hooks/useSizeMigration.ts
# 仅当 1.2 中 htmlToRichText/richTextToHtml 确认为空时才执行下一行：
# git rm src/lib/editor/content/htmlToRichText.ts src/lib/editor/content/richTextToHtml.ts
```

**1.4 验证 + 提交**
```bash
npx tsc --noEmit && echo "TSC_OK"   # 删除未引用文件不应破坏编译
git add -A && git commit -m "refactor: remove dead files (SearchBar, useSizeMigration)"
```

---

## Phase 2 — 边界文档 + 导入风格统一

**2.1 统一 `main.tsx` 导入风格**（去掉扩展名，与全仓 380 处相对导入一致）：
- 文件：`src/main.tsx` 第 3 行
- 改前：`import App from './App.tsx';`
- 改后：`import App from './App';`
- 工具：`Edit` 工具精确替换该行（或 `sed -i "" "s|'./App.tsx'|'./App'|" src/main.tsx`）。

**2.2 新增 `docs/architecture.md`**，写入下列边界规则（直接复制）：
````markdown
# 架构与目录边界规则

1. `src/lib/` = 可复用**逻辑层**（纯函数、store 适配、tiptap 扩展定义、内容转换、主题/快捷键/命令注册）。
2. `src/components/` = **React 视图层**（容器组件、节点视图、通用 UI）。
3. **例外（仅此一种）**：与某个 tiptap 扩展 / suggestion 插件强绑定、且被 `lib/` 侧渲染的 React UI
   （如 `lib/editor/slashMenu/` 的 `SlashMenuList.tsx` / `renderer.tsx` / `shared.tsx`），可留在 `lib/editor` 对应目录。
   不得把普通应用 UI 放进 `lib/`。
4. **依赖方向单向**：`components/` → `lib/`，禁止 `lib/` 反向 import `components/` 的业务组件。
5. 巨型文件红线：单文件 > 400 行（组件）/ > 500 行（逻辑）应拆分；提 PR 前跑 `npm run knip`。
````

**2.3 同步 `AGENTS.md`**：将其中过时的"目录结构"段替换为上述规则的简述，并补列当前真实存在的目录（至少包含）：`lib/constants/`、`lib/commandPalette/`、`lib/ime/`、`components/agent/`、`components/editor/sectionEditor/`、`components/editor/nodes/graph/`、`components/editor/hooks/`、`components/editor/slashMenu/commands/`、`data/`、`styles/`。

**2.4 验证 + 提交**
```bash
npx tsc --noEmit && echo "TSC_OK"
git add -A && git commit -m "docs: clarify lib/components boundary; sync AGENTS.md"
```
> 注意：**不要移动** `lib/editor/slashMenu/` 的 `.tsx`（会制造 lib→components 反向依赖，违反规则 4）。

---

## Phase 3 — 拆分巨型文件（核心，逐文件 tsc）

> 通用做法：① 按表把源文件第 X–Y 行**剪出** → ② 粘贴进"目标文件"并补必要的 `import` / `export` → ③ 在源文件对应位置**替换为一行 `import`** → ④ `npx tsc --noEmit` 必须全绿 → ⑤ 自测该模块行为 → ⑥ `git commit`。
> 闭包转 hook 说明：原文件里很多逻辑是 `useCallback` 闭包，提取成独立 hook/函数时需把用到的 `ref`/`state`/store action 作为**参数传入**或**在 hook 内用 `useStore` 取**，保持行为不变。

### 3.1 `lib/core/i18n.ts`（1333 行）→ 数据/逻辑分离【最高 ROI】

| 提取内容 | 行号 | 目标文件 | 源文件替换为一行 |
|---|---|---|---|
| `translations` 常量整体 | 22–1305 | `src/lib/core/i18n/translations.ts` | `import { translations } from './i18n/translations';` |

**`src/lib/core/i18n/translations.ts`（新建，内容 = 原 22–1305 行）：**
```ts
// 仅数据，无逻辑
export const translations = {
  zh: { /* …原 22–1305 行内容… */ },
  en: { /* … */ },
};
```
**`src/lib/core/i18n.ts`（保留 1–21 + 1307–1333）：**
```ts
import type { Language } from './i18n/types'; // 若需要
import { translations } from './i18n/translations';
// …其余（Language 类型、TranslationKey、interpolate、useI18n）保持不变…
```
> 完成定义：`npx tsc --noEmit` 绿；全仓 `import ... from '.../i18n'` 的调用方无需改动（导出签名不变）。提交：`refactor: split i18n translations data from logic`。

### 3.2 `components/editor/sectionEditor/SectionedBlockEditor.tsx`（802 行）

| 提取内容 | 行号 | 目标文件 | 源文件替换为 |
|---|---|---|---|
| `SECTION_SIZE`/`SECTION_MAX`/`SECTION_MERGE_BELOW` + `SectionState` + `splitIntoSections` | 43–81 | `src/lib/editor/sectioning.ts` | `import { splitIntoSections, SECTION_SIZE, SECTION_MAX, SECTION_MERGE_BELOW, type SectionState } from '../../editor/sectioning';` |
| `EditorSkeleton` 组件 | 82–~107 | `src/components/editor/sectionEditor/EditorSkeleton.tsx` | `import { EditorSkeleton } from './EditorSkeleton';` |

**`src/lib/editor/sectioning.ts`（新建）：**
```ts
import type { Block } from '../../types';

export const SECTION_SIZE = 30;
export const SECTION_MAX = Math.round(SECTION_SIZE * 1.6);
export const SECTION_MERGE_BELOW = Math.round(SECTION_SIZE * 0.5);

export interface SectionState { /* …原 55–63 行… */ }

export function splitIntoSections(blocks: Block[]): SectionState[] {
  /* …原 64–80 行… */
}
```
> 完成定义：`tsc` 绿；文档切换/分段加载行为不变（用大文档切换自测）。提交：`refactor: extract pure sectioning logic to lib/editor/sectioning.ts`。

### 3.3 `components/editor/nodes/graph/GraphCanvas.tsx`（1468 行）

| 提取内容 | 行号 | 目标文件 | 源文件替换为 |
|---|---|---|---|
| `DEFAULT_SIZE` + `SHAPE_LABEL` + `GRID_SIZE`/`EVENT_TOLERANCE`/`ZOOM_MIN`/`ZOOM_MAX`/`MIN_DRAW_SIZE` + `CONNECTION_POINTS` + `styleForShape` | 117–160, 289–370 | `src/components/editor/nodes/graph/graphConstants.ts` | `import { styleForShape, DEFAULT_SIZE, SHAPE_LABEL, GRID_SIZE, ZOOM_MIN, ZOOM_MAX, CONNECTION_POINTS } from './graphConstants';` |
| `ShapeGlyph` 组件 | 161–288 | `src/components/editor/nodes/graph/ShapeGlyph.tsx` | `import { ShapeGlyph } from './ShapeGlyph';` |
| 交互接线（`useEffect` 内的 `onDown`/`onUp`/`onMouseDown`/`onMouseMove`/`finishDraw`/`onWheel`/`onKeyDown`/`clientToContainer`/`snap`/`ensurePreviewShape`/`applyPreviewSize`） | 组件体内约 423–920（定位：包住这些 handler 的那个 `useEffect`） | `src/components/editor/nodes/graph/useGraphCanvasInteractions.ts` | 该 `useEffect` 替换为 `useGraphCanvasInteractions(/* refs/state */);` |

**`graphConstants.ts`（新建，纯数据/纯函数，无 JSX）**：把上表行号内容搬入，导出 `styleForShape` 等；`styleForShape` 依赖的 `GraphNodeShape` 从 `graph/graphModel` 或本文件 import。
**`ShapeGlyph.tsx`（新建）**：搬入原 161–288 行，注意其 `import`（`GraphNodeShape` 等）要保留。
> 完成定义：`tsc` 绿；graph 画布绘制/缩放/连线行为肉眼不变。提交：`refactor: extract ShapeGlyph + styling + interactions from GraphCanvas`。

### 3.4 `components/editor/BlockEditor.tsx`（1064 行）

| 提取内容 | 行号 | 目标文件 | 源文件替换为 |
|---|---|---|---|
| `EditorSkeleton` | 88–107 | `src/components/editor/EditorSkeleton.tsx` | `import { EditorSkeleton } from './EditorSkeleton';` |
| `handleChange` + `flushPendingEdits`（保存逻辑） | 184–264 | `src/components/editor/hooks/useBlockEditorSave.ts` | 在组件内调用 `const { handleChange, flushPendingEdits } = useBlockEditorSave(/* refs + store actions */);` |
| `focusTitleEnd` + `handleTitleKeyDown`（标题交互） | 265–272, 856–~890 | `src/components/editor/hooks/useBlockEditorTitle.ts` | `const { focusTitleEnd, handleTitleKeyDown } = useBlockEditorTitle(titleInputRef);` |
| 光标拖尾 setup（`useEffect` 647–~840） | 647–~840 | `src/components/editor/hooks/useBlockEditorTrail.ts` | 该 `useEffect` 替换为 `useBlockEditorTrail(trailOverlayRef, trailRef, editor);` |
| 文档加载/重载 effect（479–~530, 531–~605） | 479–~605 | `src/components/editor/hooks/useBlockEditorDocLoad.ts` | 两个 effect 替换为 `useBlockEditorDocLoad(/* editor, activeDocId, nonce, refs */);` |

> 闭包转 hook 要点：`flushPendingEdits` 用了 `saveTimeoutRef`/`idleHandleRef`/`isReplacingRef`/`editorRef`，把这些 ref 作为 hook 参数传入；store action（`setActiveDocBlocks` 等）在 hook 内 `useStore` 取或参数传入。每个 hook 提取后单独 `tsc`。
> 完成定义：`tsc` 绿；编辑器输入/保存/标题跳转/光标拖尾/文档切换自测正常。每拆一个 hook 提交一次，例如 `refactor: extract useBlockEditorSave from BlockEditor`。

### 3.5 `components/documents/DocumentList.tsx`（1104 行）

| 提取内容 | 行号 | 目标文件 | 源文件替换为 |
|---|---|---|---|
| 常量 + 接口：`ROOT_DROP_ID`/`DRAG_THRESHOLD`/`ContextMenuState`/`FolderMenuState` | 23–38 | `src/components/documents/documentListTypes.ts` | `import { type ContextMenuState, type FolderMenuState, ROOT_DROP_ID } from './documentListTypes';` |
| 树计算：`isFolderExpanded`+`filteredDocs`+`tree`+`visibleItemIds` | 117–162 | `src/components/documents/useDocumentListTree.ts` | `const { tree, filteredDocs, visibleItemIds, isFolderExpanded } = useDocumentListTree(folders, documents, searchQuery);` |
| 批量操作：`splitSelection`+`batchDelete`+`batchMove` | 163–196 | `src/components/documents/useDocumentListBatch.ts` | `const { splitSelection, batchDelete, batchMove } = useDocumentListBatch(/* store actions */);` |
| 重命名：`startRename`+`commitRename`+`handleContextMenu` | 278–313 | `src/components/documents/useDocumentListRename.ts` | 对应调用替换为 hook 返回 |
| DnD 状态：`drag` ref + 拖拽 handlers | 101–116 + 拖拽相关 callback | `src/components/documents/useDocumentListDnd.ts` | `const { drag, onDragStart, … } = useDocumentListDnd();` |
| **视图**：文件夹树 JSX（`return` 内约 820–900） | 820–~900 | `src/components/documents/FolderTree.tsx` | `<FolderTree ... />` |
| **视图**：文档行 JSX（`.doc-item`，约 900–1018） | 900–1018 | `src/components/documents/DocumentRow.tsx` | `<DocumentRow ... />` |
| **视图**：`<DocumentContextMenu>` 等菜单 JSX（1019–1104） | 1019–1104 | `src/components/documents/DocumentListMenus.tsx` | `<DocumentListMenus ... />` |

> 视图组件提取法：打开文件，定位 `return (`（816 行）内的三个子树，按上表行号区间剪切为独立组件；新组件通过 `props` 接收原组件里用到的 `documents`/`folders`/各 handler。每个视图组件提取后 `tsc` + 侧栏渲染/拖拽/右键菜单自测。
> 完成定义：`tsc` 绿；文档列表的搜索、文件夹折叠、右键菜单、拖拽排序、批量删除均正常。建议拆成 2–3 个提交。

### 3.6 `components/ui/cursor/EditorCursorTrail.ts`（1462 行）— 低优先级

该文件是单一 `EditorCursorTrail` 类（56–1462）封装的 canvas 渲染器，内聚度高。**建议保守拆分**，仅提取明确纯函数，避免破坏渲染状态机：
- 纯几何助手：`firstCodePoint`(1448)/`lastCodePoint`(1455)/`toCanvasLocal`(1105) → `src/components/ui/cursor/trailMath.ts`（无 `this` 依赖）。
- 标题光标镜像子系统：`measureTitleCaretRect`(1281)+`syncTitleMirror`(1396)+相关 → 抽到 `TitleCaretMirror.ts`（可独立测试）。
- 其余测量方法（`measureCaretRect`/`measureGlyphAt`/`measureCodePoint`/`refinePreCaretRect`/`adjacentCharRect`/`metricsAt`/`measureCaretViaTempSpan`）依赖 `this` 较多，留在类内。
> 若评估后认为风险 > 收益，**可整文件保留**，仅在 `docs/architecture.md` 注明"该类刻意保持内聚"。本文档不强制拆。

---

## Phase 4 —（暂缓）feature-sliced 大重构

**不建议本轮执行**。仅当长线维护性诉求强烈时单独立项。方案：引入 `src/features/<domain>/`（editor/documents/terminal/windows/agent/settings），每域自带 `components/ + hooks/ + lib/`。
- 风险：201 文件搬迁 + 全量 import 改写，churn 极大。
- 若执行：先用 `ts-morph`/`jscodeshift` codemod 批量重写 import，再逐 feature 迁移，每域一 PR。
- 边界：仍遵循 Phase 2 的规则 1–4。

---

## Phase 5 — 收尾与防回归

**5.1 接 CI / pre-commit**（任选其一）：
- pre-commit（husky）：在 `.husky/pre-commit` 加 `npm run lint:tsc && npx knip`。
- 或 CI workflow（如 `.github/workflows/ci.yml`）：
```yaml
- name: Struct lint
  run: npx tsc --noEmit && npx knip
```

**5.2 新建 `docs/structure-review.md`**（决策树，复制即用）：
```markdown
# 新增文件该放哪？
1. 是纯逻辑/工具/扩展定义/转换/主题/快捷键？ → `src/lib/<domain>/`
2. 是 React 组件（容器/节点视图/通用 UI）？ → `src/components/<domain>/`
3. 该 UI 是否被 lib/ 侧渲染且与 tiptap 扩展强绑定？ → 可留 `lib/editor/<x>/`（唯一例外）
4. 单文件将超 400(组件)/500(逻辑) 行？ → 先拆分再提交
5. 提交前跑 `npx knip`，无新增未用导出
```

**5.3 全量验证 + 提交**
```bash
npm run build && echo "BUILD_OK"   # 跑 tsc -b && vite build
npx knip                          # 应无新增未用导出
git add -A && git commit -m "chore: wire knip into CI; add structure review guide"
```

---

## 附录 A — 一键执行脚本（Phase 0–2，复制即用）

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /Users/lingojack/dev_custom/jstudio

# ---- Phase 0 ----
npm i -D knip
npm pkg set scripts.knip="knip"
npm pkg set scripts.lint:tsc="tsc --noEmit"
cat > knip.json <<'JSON'
{
  "entry": ["src/main.tsx", "src/components/windows/*WindowApp.tsx"],
  "project": ["src/**/*.{ts,tsx}"],
  "ignore": [
    "src/globals.d.ts",
    "src/lib/shortcuts/globalShortcutActions.ts",
    "src/components/editor/nodes/TableSizeSelector.tsx"
  ]
}
JSON
npx tsc --noEmit && echo "TSC_OK"
npx knip | tee knip-baseline.txt
git add -A && git commit -m "chore: add knip + tsc lint scripts (structure baseline)"

# ---- Phase 1 ----
# 最后人工确认（应输出空）：
grep -rn "SearchBar"      --include=*.tsx --include=*.ts src | grep -v "components/editor/SearchBar.tsx" | grep -v "i18n.ts" || true
grep -rn "useSizeMigration" --include=*.ts src | grep -v "components/editor/hooks/useSizeMigration.ts" || true
git rm src/components/editor/SearchBar.tsx
git rm src/components/editor/hooks/useSizeMigration.ts
npx tsc --noEmit && echo "TSC_OK"
git add -A && git commit -m "refactor: remove dead files (SearchBar, useSizeMigration)"

# ---- Phase 2 ----
sed -i "" "s|'./App.tsx'|'./App'|" src/main.tsx
# 手动：新建 docs/architecture.md（见 2.2）；同步 AGENTS.md（见 2.3）
npx tsc --noEmit && echo "TSC_OK"
git add -A && git commit -m "docs: clarify lib/components boundary; sync AGENTS.md"
echo "DONE: Phase 0-2 complete. Phase 3 is manual per-file (see doc)."
```

## 附录 B — 风险与回滚
- 全程基于 git，每阶段独立 commit；出问题 `git revert <sha>`。
- 唯一中风险：Phase 3 闭包→hook 改写可能误改行为。缓解：每拆一个文件/一个 hook 立即 `tsc` + 针对性自测（见各 3.x 完成定义），**不跨文件一次性大改**。
- 禁止：`rm -rf` 批量删；`build` 门禁依赖 `tsc -b`，TS 错误会让 `tauri build` 失败——所有阶段以 `tsc` 通过为硬门槛。

## 附录 C — 需你拍板的决策点
1. 是否引入 `knip` 为 devDependency 并接 CI？（建议：是）
2. `htmlToRichText.ts` / `richTextToHtml.ts` 若 `grep` 确认无人调用，是否删除？（建议：删，但保留前 double-check markdown/docx 导入）
3. `EditorCursorTrail.ts` 是否保守拆分（仅提纯函数）还是整文件保留？（建议：保守拆分或保留）
4. Phase 4 大重构是否立项？（建议：否，本轮不做）
