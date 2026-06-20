# 统一 Activity Bar 图标常量

## 问题

同一组三个活动项（`documents` / `terminal` / `settings`），在三个文件中各自定义了图标映射，且互不一致：

| 文件 | documents | terminal | settings |
|------|-----------|----------|----------|
| `ActivityBar.tsx` (L7-14) | `PenLine` | `Terminal` | `Settings` |
| `GeneralSection.tsx` (L434-441) | `FileText` | `Terminal` | `Settings` |
| `commandRegistry.ts` (L62-102) | `FileText` | `TerminalSquare` | `Settings` |

## 方案

### 1. 新建 `src/lib/activityMeta.ts` — 单一数据源

集中维护 `ActivityItemId` 的图标、labelKey 元数据：

```ts
import { PenLine, Terminal, Settings, type LucideIcon } from 'lucide-react';
import type { ActivityItemId } from './storage';

export const ACTIVITY_ITEM_META: Record<
  ActivityItemId,
  { icon: LucideIcon; labelKey: string }
> = {
  documents: { icon: PenLine,   labelKey: 'app.documents' },
  terminal:  { icon: Terminal,  labelKey: 'app.terminal' },
  settings:  { icon: Settings,  labelKey: 'app.settings' },
};
```

> 放在独立文件而非 `storage.ts`，避免存储层（纯 Tauri IPC）引入 UI 依赖（lucide-react）。

### 2. 改造三个消费方

| 文件 | 改动 |
|------|------|
| `ActivityBar.tsx` | 删除本地 `ACTIVITY_META`，改为 `import { ACTIVITY_ITEM_META }` |
| `GeneralSection.tsx` | 删除本地 `ACTIVITY_ITEM_META`（L434-441），改为 import。labelKey 从 `'appearance.activityBarItem_*'` 统一改为 `'app.*'` |
| `commandRegistry.ts` | 导航命令的 `icon` 字段改为引用 `ACTIVITY_ITEM_META[id].icon`，删除 `FileText`/`TerminalSquare`/`Settings` 的直接 import |

### 3. labelKey 统一

`GeneralSection.tsx` 中的 labelKey 用的是 `'appearance.activityBarItem_documents'` 等，而 `ActivityBar.tsx` 用的是 `'app.documents'`。统一为 `'app.*'`（i18n 中已存在），`appearance.activityBarItem_*` 如果仅有此一处引用则无需保留。

## 涉及文件

1. **新建** `src/lib/activityMeta.ts`
2. **改** `src/components/ActivityBar.tsx` — 删本地常量，改 import
3. **改** `src/components/settings/GeneralSection.tsx` — 删本地常量，改 import
4. **改** `src/lib/commandRegistry.ts` — 改 import + 三处导航命令图标引用
