# 统一导航树组件抽象

## 问题

`Settings.tsx` 是唯一仍在手写 `<button>` + 内联 Tailwind class 的导航树消费者。`DocumentList.tsx` 和 `DocumentOutline.tsx` 都已使用 `components/ui/NavTree.tsx` 的 `NavRow` + `NavBranch`。

这导致：
1. Settings 的 SubNode 分支行 ChevronRight 在文字**左侧**，与主标题行（右侧）不一致
2. 同一套视觉规格的 CSS class 散落在两处，改一处忘另一处

## 改动范围（仅 1 个文件）

### `src/components/Settings.tsx`

**1. 主标题行**（`handleMainClick` 区域，当前约 L289-L308）

将手写 `<button>` 替换为：
```tsx
<NavRow
  level="primary"
  plainActive={hasSubs}        // 有子项时不加背景色，仅 font-medium
  active={active}
  icon={<Icon className="w-5 h-5 opacity-70 shrink-0" />}
  expandable={hasSubs}
  expanded={open}
  onClick={() => handleMainClick(item)}
>
  {t(item.labelKey)}
</NavRow>
```

**2. SubNode 叶子节点**（当前约 L182-L196）

将手写 `<button>` 替换为：
```tsx
<NavRow
  level="secondary"
  active={subActive}
  onClick={() => node.anchorId && onLeafClick(sectionId, node.anchorId)}
>
  {t(node.labelKey)}
</NavRow>
```

**3. SubNode 分支节点**（当前约 L150-L179）

将手写 `<button>` + 左侧 ChevronRight 替换为：
```tsx
<NavRow
  level="secondary"
  expandable
  expanded={open}
  onClick={() => toggle(groupId)}
>
  {t(node.labelKey)}
</NavRow>
```

NavRow 会自动把 ChevronRight 放在文字**右侧**，与主标题行完全一致。

### 不需要改动的文件
- `NavTree.tsx` — NavRow 已经支持所有需要的 props（`level`, `active`, `plainActive`, `icon`, `expandable`, `expanded`）
- `DocumentList.tsx` — 已经在用 NavRow + NavBranch
- `DocumentOutline.tsx` — 已经在用 NavRow + NavBranch
- `useCollapsibleTree.ts` — 无需改动

## 验证
- `npx tsc --noEmit`
- 视觉确认：Settings 左侧树的所有箭头统一在右侧，与 DocumentList 的文件夹展开箭头位置一致
