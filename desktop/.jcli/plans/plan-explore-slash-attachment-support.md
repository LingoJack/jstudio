# BlockNote 瘦身计划：精简 Block 类型

## 背景

当前 `BlockType` 有 **13 种**类型，但 adapter 实际只处理 **5 种**（text, heading-1/2/3, code, image），其余全是死代码。同时 `_blocks_legacy/` 目录（旧的自定义块系统）已无人引用。BlockNote 默认 slash 菜单有 ~16 个选项，其中大部分插入后无法持久化。

**目标：只保留能完整工作的最小类型集，清理死代码，过滤 slash 菜单。后续按需逐个添加。**

---

## 精简后的核心 Block 类型（6 种）

| Our Type | BlockNote Type | 状态 |
|----------|---------------|------|
| `text` | `paragraph` | 已工作 |
| `heading-1` | `heading` (level 1) | 已工作 |
| `heading-2` | `heading` (level 2) | 已工作 |
| `heading-3` | `heading` (level 3) | 已工作 |
| `code` | `codeBlock` | 已工作 |
| `image` | `image` | 已工作 |

**移除的类型**（7 种）：`callout`、`table`、`canvas`、`toggle`、`web-embed`、`attachment`、`whiteboard`

---

## 改动清单

### 1. `src/types/document.ts` — 精简类型定义

**`BlockType`** 从 13 种缩减为 6 种：
```ts
export type BlockType =
  | 'text'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'code'
  | 'image';
```

**`BlockProperties`** 移除不再需要的字段，仅保留：
```ts
export interface BlockProperties {
  language?: string;   // code block
  caption?: string;    // image block
  imageType?: 'url' | 'base64' | 'asset';
}
```
移除：`isOpen`、`tableData`、`drawingPaths`、`emoji`、`embedUrl`、`attachmentName/Type/Size/Mode`、`CanvasPath` 接口

### 2. `src/lib/blockNoteAdapter.ts` — 清理死分支

- `ourTypeToBNType()`：移除 `callout → quote` 分支，default fallback 保留 `→ paragraph`
- `bnTypeToOurType()`：移除 `quote/alert → callout` 分支
- `ourBlockToBlockNote()`：移除 `isMediaBlock` 中对 `attachment/web-embed` 的判断（只保留 `image`）
- 更新文件头部注释的映射表
- `callout` 相关的转换逻辑全部移除

### 3. `src/components/BlockEditor.tsx` — 过滤 slash 菜单

BlockNote 默认 slash 菜单有 ~16 项，我们只保留与核心类型匹配的。通过自定义 `slashMenuItems` 实现：

```ts
import { getDefaultReactSlashMenuItems } from '@blocknote/react';

// 只保留我们支持的菜单项
const getSlashMenuItems = (editor) => {
  const all = getDefaultReactSlashMenuItems(editor);
  const allowedKeys = ['heading', 'heading_2', 'heading_3', 'code_block', 'image'];
  return all.filter((item) => allowedKeys.includes(item.key));
};

const editor = useCreateBlockNote({
  // ...
  slashMenuItems: getSlashMenuItems,
});
```

**过滤后 `/` 菜单只显示**：Heading 1、Heading 2、Heading 3、Code Block、Image

### 4. `src/data/defaultData.ts` — 重写默认文档

当前默认文档包含 `callout`、`table`、`canvas`、`whiteboard`、`web-embed` 块，需改为仅使用核心类型：
- `callout` 块 → `text` 块（加引用前缀或直接转文本）
- `table` 块 → `code` 块（用文本表格展示）或直接转 `text`
- `canvas` / `whiteboard` 块 → 移除或转 `text`（说明文字保留）
- `web-embed` 块 → 移除或转 `text`（URL 以文本保留）
- 欢迎文档内容需相应调整，去掉对不存在功能的描述

### 5. 删除 `src/components/_blocks_legacy/` 目录

确认无任何 import 引用 `_blocks_legacy`（grep 已验证），整个目录可安全删除：
- `SlashMenu.tsx`、`AttachmentBlock.tsx`、`BlockRouter.tsx`、`shared.tsx`、`useSurfaceEditor.ts` 等

---

## 不改动的部分

- `src/lib/storage.ts` — 存储层与 block 类型无关
- `src/lib/migrate.ts` — 迁移逻辑不涉及 block 类型
- `src/store/useStore.ts` — store 与 block 类型无关
- `package.json` 依赖 — BlockNote 三个包保留不动

---

## 后续添加 Block 类型的标准流程

当用户需要添加新的 block 类型时，只需 **3 步**：

1. **`types/document.ts`**：在 `BlockType` 加新类型 + 在 `BlockProperties` 加对应属性
2. **`blockNoteAdapter.ts`**：在 4 个函数中各加一个 case（类型映射 × 2 + 属性映射 × 2）
3. **`BlockEditor.tsx`**：在 `allowedKeys` 数组中加对应的 slash menu key

示例（未来添加 attachment）：
```ts
// 1. types/document.ts
type BlockType = ... | 'attachment';
BlockProperties { ... attachmentName?: string; }

// 2. blockNoteAdapter.ts
ourTypeToBNType: case 'attachment': return 'file';
bnTypeToOurType: case 'file': return 'attachment';
// + 属性映射

// 3. BlockEditor.tsx
const allowedKeys = [..., 'file'];
```
