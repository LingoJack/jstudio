# Tasks

## 1. 共享 PanZoomStage 提取

- [ ] 1.1 新建 `desktop/src/components/windows/PanZoomStage.tsx`：封装 `TransformWrapper`/`TransformComponent`、非被动滚轮监听（`wheelMode: "always-zoom" | "ctrl-zoom"`，deltaMode 行增量归一化）、左/中/右键拖拽平移（move/up 挂 window）、双击复位、可选 −/＋/⊗ 工具栏、api ref 透传；搬入 MIN/MAX_SCALE=0.2/8、灵敏度、`PAN_BUTTONS` 等常量。验证：`cd desktop && npm run lint` 通过
- [ ] 1.2 在 `desktop/src/styles/vscode-theme.css` 为通用 stage 补 `grab`/`grabbing` 光标与 `.is-panning` 状态样式（复用 `.preview-zoom` 工具栏皮肤）。验证：`npm run lint` 通过 + dev 运行时光标样式可见

## 2. Mermaid 窗口迁移

- [ ] 2.1 重构 `MermaidViewer`：手势接线全部改由 `PanZoomStage` 承担（编辑器内联 `wheelMode="ctrl-zoom"`，窗口 `wheelMode="always-zoom"`），删除 `panOnWheel` prop 并更新调用点（`PreviewWindowApp.tsx` mermaid 分支、`CodeBlockView.tsx` 内联预览）；保留 overlay / contentEditable / 错误展示职责。验证：`npm run lint` 通过
- [ ] 2.2 验证 Mermaid 预览窗口（`npm run dev` + 编辑器打开 mermaid 块 → 新窗口预览）：普通滚轮以光标为锚点缩放、Cmd/Ctrl+滚轮一致、右/中键拖拽平移无右键菜单、双击复位、−/＋/⊗ 工具栏正常

## 3. 图片窗口迁移

- [ ] 3.1 用 `PanZoomStage`（`wheelMode="always-zoom"`、`showControls`）重写 `PreviewWindowApp.tsx` 的 `ImageZoom`，删除手写 scale/tx/ty 状态；`<img>` 保持 `object-fit: contain`、`draggable={false}`。验证：`npm run lint` 通过
- [ ] 3.2 验证图片预览窗口：普通滚轮缩放（不再需要 Alt）、右键拖拽平移、双击复位、工具栏步进/复位正常

## 4. HTML 窗口接入

- [ ] 4.1 在 `PreviewWindowApp.tsx` HTML 分支用 `PanZoomStage` 包裹 iframe 容器；实现 same-origin 事件转发：iframe 创建/`srcdoc` 更新后幂等重挂镜像 `wheel`/`mousedown`/`mousemove`/`mouseup` 监听并 `preventDefault`，坐标按 `getBoundingClientRect` 比例换算到父窗口；iframe 保持原生 DOM 创建（不得改为 JSX）。验证：`npm run lint` 通过 + 代码审查确认 React 不遍历 iframe 内部
- [ ] 4.2 验证 HTML 预览窗口：iframe 上方滚轮缩放/拖拽平移正常（含拖拽跨 iframe 与父窗口边界无跳变）、双击复位、缩放后 iframe 内点击/表单仍响应、`srcdoc` 变更后手势不失效

## 5. 回归与整体校验

- [ ] 5.1 编辑器内联回归：mermaid 代码块内嵌预览——普通滚轮滚动编辑器页面、Cmd/Ctrl+滚轮缩放、三键拖拽、点击 overlay 选中节点均与改动前一致。验证：手测 + 对照 spec 场景"编辑器内联预览不受影响"
- [ ] 5.2 文档流窗口回归：PDF 普通滚轮滚动 + Ctrl/Cmd+滚轮缩放、DOCX/文本滚轮滚动行为与改动前一致。验证：手测对照 spec 场景"文档流预览维持滚动模型"
- [ ] 5.3 全量校验：`cd desktop && npm run lint` 与 `npm run build` 通过，无新增依赖、`PreviewPayload` 未变更。验证：命令退出码 0
