# 精简 Excalidraw 画板 UI

## 背景

`DiagramBlockView` 嵌入了 `ExcalidrawCanvas`，后者直接渲染 `@excalidraw/excalidraw` npm 包的 `<Excalidraw>` 组件。默认情况下 Excalidraw 会渲染大量与"纯画板"无关的 UI：

- 左上角汉堡菜单（含 GitHub 链接、帮助文档、社交分享、实时协作等条目）
- 欢迎屏（WelcomeScreen）
- 右上角帮助按钮 / 社交按钮
- 底部 Footer 区域
- 库面板（Library）

用户希望嵌入时只有一块干净的画板，不包含任何无关信息。

## 方案：利用 Excalidraw 官方定制 API（不需要 fork 源码）

Excalidraw 的 `<Excalidraw>` 组件提供了 `children` slot —— 一旦我们传入自定义的 `children`，默认的 UI 组件就会被完全替换。我们只需要精心选择保留哪些子组件，就能实现"干净画板"的效果。

这比 fork 源码优越得多：
- 不引入 10 万行 fork 代码的维护负担
- 可正常跟随 npm 版本升级
- Excalidraw 本身就为嵌入场景设计了这些 API

## 改动清单

### 1. `src/components/ExcalidrawCanvas.tsx`（核心改动）

在 `<Excalidraw>` 组件内注入自定义 `children`，替换默认 UI：

```tsx
import { Excalidraw, MainMenu } from '@excalidraw/excalidraw';

<Excalidraw ...>
  {/* 极简主菜单：只保留画板操作，去掉所有无关条目 */}
  <MainMenu>
    <MainMenu.DefaultItems.ClearCanvas />
    <MainMenu.DefaultItems.ChangeCanvasBackground />
    <MainMenu.DefaultItems.SaveAsImage />
    <MainMenu.DefaultItems.Export />
    <MainMenu.Separator />
    <MainMenu.DefaultItems.CommandPalette />
  </MainMenu>
  {/* 不放 <WelcomeScreen /> → 欢迎屏不渲染 */}
  {/* 不放 <Footer /> → 底部信息条不渲染 */}
</Excalidraw>
```

被**移除**的默认条目：
- `MainMenu.DefaultItems.Socials`（GitHub / Twitter 等社交链接）
- `MainMenu.DefaultItems.Help`（帮助文档入口）
- `MainMenu.DefaultItems.LoadScene`（加载场景文件）
- `MainMenu.DefaultItems.SaveToActiveFile`（保存到活动文件）
- `MainMenu.DefaultItems.ToggleTheme`（主题切换，已由宿主 app 控制）
- `MainMenu.DefaultItems.LiveCollaborationTrigger`（实时协作）
- `MainMenu.DefaultItems.SearchMenu`（搜索）

**保留**的条目（对画板有实际功能价值）：
- `ClearCanvas` — 清空画板
- `ChangeCanvasBackground` — 修改画板背景色
- `SaveAsImage` — 导出为图片
- `Export` — 导出（PNG/SVG）
- `CommandPalette` — 快捷命令面板（可选保留，不打扰用户）
- `Separator` — 分隔线

### 2. `src/styles/vscode-theme.css`（CSS 补丁）

即使注入了自定义 children，Excalidraw 的 LayerUI 仍会渲染一些**非 children 控制的 UI 元素**（它们是内部渲染的，不受 children 替换影响）。需要用 CSS 隐藏：

```css
/* 隐藏右上角的帮助按钮 (?) */
.excalidraw .HelpButton,           /* 0.18+ class name */
.excalidraw .help-icon {            /* fallback */
  display: none !important;
}

/* 隐藏右上角的社交分享 / GitHub 按钮 */
.excalidraw .GithubCorner,
.excalidraw .export-to-button[href*="github"] {
  display: none !important;
}

/* 隐藏底部版权/水印提示（如果有的话） */
.excalidraw .excalidraw-link {
  display: none !important;
}
```

> **注意**：Excalidraw 0.18 的具体 class name 需要在运行时通过 DOM 检查确认。计划中先写好 CSS 框架，实际实现时通过 `npm run dev` 检查 DOM 确认选择器后微调。

### 3. 不需要改动的文件

- `DiagramBlockView.tsx` — 无需改动，它通过 `ExcalidrawCanvas` 间接使用画板
- `DiagramWindowApp.tsx` — 无需改动，同上
- `package.json` — 无需新增依赖，`@excalidraw/excalidraw` 已有

## 实现步骤

1. 修改 `ExcalidrawCanvas.tsx`：导入 `MainMenu`，在 `<Excalidraw>` 内添加自定义 children
2. 启动 `npm run dev`，在浏览器中打开编辑器，插入 diagram block
3. 通过 DevTools 检查 Excalidraw DOM，确认还有哪些多余元素
4. 在 `vscode-theme.css` 中添加 CSS 隐藏规则
5. 反复验证：嵌入画板内不再出现 GitHub 链接、帮助文档、欢迎屏等

## 验证标准

- [ ] 嵌入的 Excalidraw 画板不显示欢迎屏
- [ ] 左上角汉堡菜单只包含：清空画板、背景色、导出图片、导出、命令面板（无 GitHub、帮助、社交链接）
- [ ] 右上角无帮助按钮 / GitHub 角标
- [ ] 底部无多余信息
- [ ] 画板的核心绘图功能（形状、文字、箭头、橡皮擦等）完全正常
