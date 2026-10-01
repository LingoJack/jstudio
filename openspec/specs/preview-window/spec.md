# preview-window Specification

## Purpose

定义预览新窗口（PreviewWindowApp）中画布类内容（HTML / Mermaid / 图片）的统一查看手势：滚轮缩放、拖拽平移、双击复位，并约束 HTML 预览在缩放平移下保持内容可交互、编辑器内联预览与文档流预览不受影响。

## Requirements

### Requirement: 画布类预览统一滚轮缩放

预览窗口中的画布类内容（HTML、Mermaid、图片）SHALL 在普通滚轮滚动时以光标为锚点缩放；Cmd/Ctrl+滚轮（mac 触控板捏合上报 ctrlKey）SHALL 执行相同的缩放行为。缩放 SHALL 有最小/最大倍率限制，且滚轮缩放 MUST NOT 触发窗口页面滚动。

#### Scenario: 普通滚轮缩放
- **WHEN** 用户在 HTML / Mermaid / 图片预览内容上向上滚动普通滚轮
- **THEN** 内容以光标所在位置为锚点放大，页面不滚动

#### Scenario: 反向滚轮缩小
- **WHEN** 用户向下滚动普通滚轮
- **THEN** 内容以光标所在位置为锚点缩小

#### Scenario: Cmd/Ctrl+滚轮与普通滚轮行为一致
- **WHEN** 用户按住 Cmd 或 Ctrl 滚动滚轮（含触控板捏合手势）
- **THEN** 缩放行为与普通滚轮完全一致

#### Scenario: 缩放倍率受限
- **WHEN** 用户持续缩放到达最小或最大倍率
- **THEN** 内容停止在该边界倍率，不再继续缩放

### Requirement: 画布类预览统一拖拽平移

预览窗口中的画布类内容 SHALL 支持按住左键、中键或右键拖拽来平移视图，且 MUST NOT 在拖拽过程中弹出右键菜单或触发内容选中。拖拽 SHALL 在指针移出窗口区域后仍持续生效直至松开。

#### Scenario: 左键拖拽平移
- **WHEN** 用户按住左键在预览内容上拖动
- **THEN** 视图跟随指针方向平移，且不选中任何文本

#### Scenario: 右键拖拽平移
- **WHEN** 用户按住右键在预览内容上拖动
- **THEN** 视图跟随指针平移，且不弹出右键菜单

#### Scenario: 拖拽跨出窗口仍持续
- **WHEN** 拖拽过程中指针移出内容区域（甚至窗口边缘）后松开
- **THEN** 平移持续生效直到松开按键，松开后停止

### Requirement: 双击复位视图

预览窗口中的画布类内容 SHALL 在双击时复位到初始适配状态（缩放 1 倍、居中）。

#### Scenario: 双击复位
- **WHEN** 用户在已缩放或已平移的预览内容上双击
- **THEN** 视图复位到初始适配大小与位置

### Requirement: 缩放工具栏

Mermaid 与图片预览窗口 SHALL 保留 −/＋/⊗ 缩放工具栏：−/＋ 步进缩小/放大，⊗ 复位到适配状态。工具栏按钮 MUST NOT 触发拖拽平移。

#### Scenario: 工具栏步进缩放
- **WHEN** 用户点击 − 或 ＋ 按钮
- **THEN** 内容按固定步长缩小或放大

#### Scenario: 工具栏复位
- **WHEN** 用户点击 ⊗ 按钮
- **THEN** 视图复位到初始适配状态

### Requirement: HTML 预览缩放平移下保持可交互

HTML 预览窗口在引入缩放/平移后 MUST NOT 破坏 iframe 内容的交互性：iframe 内的点击、表单等操作 SHALL 继续生效；指针位于 iframe 上方时滚轮缩放与拖拽平移 SHALL 照常工作。

#### Scenario: iframe 内交互不受影响
- **WHEN** 用户在缩放后的 HTML 预览中点击按钮或输入内容
- **THEN** iframe 内的交互正常响应

#### Scenario: iframe 上方的手势
- **WHEN** 用户在 iframe 上方滚动滚轮或按住左/右键拖动
- **THEN** 视图照常缩放/平移（事件不因落在 iframe 内而丢失）

### Requirement: 编辑器内联预览不受影响

编辑器内的内联预览（如 mermaid 代码块内嵌预览）MUST NOT 改变现有手势：普通滚轮 SHALL 保持滚动编辑器页面，仅 Cmd/Ctrl+滚轮缩放；内联预览不要求右键/左键以外的拖拽行为变化。

#### Scenario: 编辑器内普通滚轮滚动页面
- **WHEN** 用户在编辑器内的 mermaid 预览块上滚动普通滚轮
- **THEN** 编辑器页面正常滚动，预览不缩放

#### Scenario: 编辑器内 Cmd/Ctrl+滚轮缩放
- **WHEN** 用户在编辑器内的 mermaid 预览块上按住 Cmd/Ctrl 滚动滚轮
- **THEN** 预览以光标为锚点缩放（现有行为保持）

### Requirement: 文档流预览维持滚动模型

PDF / DOCX / 文本预览窗口 SHALL 维持文档滚动模型：普通滚轮滚动内容用于阅读；PDF 保留 Ctrl/Cmd+滚轮缩放与工具栏缩放。本变更 MUST NOT 将画布类手势强加于文档流内容。

#### Scenario: PDF 普通滚轮滚动
- **WHEN** 用户在 PDF 预览窗口滚动普通滚轮
- **THEN** PDF 内容正常滚动（不缩放）

#### Scenario: DOCX/文本滚轮阅读
- **WHEN** 用户在 DOCX 或文本预览窗口滚动普通滚轮
- **THEN** 内容正常滚动，行为与本变更前一致
