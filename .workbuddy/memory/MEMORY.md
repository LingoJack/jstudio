# JStudio 项目长期记忆

## 主题系统规范

### 三层边框语义（醒目度从高到低）
- `menu-border`：浮窗 / 弹窗 / 菜单（斜杠菜单、气泡菜单、块工具条、下拉、对话框、Toast、表格选择器等一切"浮在内容之上"的临时面板）
- `block-border`：内容块（代码块外框、表格网格线、表格外框）
- `widget-border`：内嵌分隔 / 静态卡片（设置页分隔线、卡片轮廓、图片节点边框、NavTree 缩进线、行号分隔）

### 背景语义
- 浮窗弹窗统一用 `menu-background`，勿混用 `quickInput-background` / `editorWidget-background` / `editor-background`
- 对话框内部分隔线（header/footer 的 border-b）保留 `widget-border`（内嵌分隔语义）

### 主题色值约定（2026-07-08 调整）
- jstudio-light: menu=block-border=#C0C0C0, widget-border=#E5E5E5（色距 37）
- jstudio-dark: menu=block-border=#5A5A5A, widget-border=#313131（色距 38，dark 中更亮=更醒目）
- ink 主题刻意拉大色距：light menu=#1a1612(深黑) vs widget=#ddd4c8(浅米)；dark menu=#5a6590 vs widget=#2f334d
- 设计原则：浮窗边框必须明显深于(light)/亮于(dark)内嵌分隔，参考 ink 的层次感

### 主题系统架构
- 4 主题：jstudio-light/dark, ink-light/dark，定义在 `src/lib/themes/appThemes.ts`
- 运行时通过 `applyAppTheme()` 在 `<html>` 上设 inline CSS 变量覆盖 `vscode-theme.css` 的 `:root`/`.dark` 静态默认值
- 改主题色值需同步改 appThemes.ts（运行时生效）+ vscode-theme.css（静态默认/fallback）

## 构建门禁
- `beforeBuildCommand=npm run build` 会跑 tsc，TS 错误直接让 tauri build 失败
- 改动后先 `npx tsc --noEmit` 验证

## i18n 规范
- `TranslationKey = keyof translations.zh`（只取自 zh 块）；新增 key 必须 zh+en 同时写；禁止重复 key（TS1117）
