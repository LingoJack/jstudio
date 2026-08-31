# Mermaid 导入转换功能实现计划

## 需求概述

在 DiagramBlockView 画板中支持 Mermaid 代码导入转换，将 Mermaid 语法转换为 GraphCanvas 可渲染的 GraphSnapshot 格式。

**支持范围**：
- 流程图（flowchart / graph）
- 时序图（sequenceDiagram）

**导入方式**：
- 工具栏按钮触发，弹出对话框输入 Mermaid 代码

## 技术调研

### Mermaid 解析方案

#### 方案 A：mermaid 主包 + 内部 db API

```typescript
import mermaid from 'mermaid';

// 解析文本获取 Diagram 对象
const diagram = await mermaid.getDiagramFromText(code);
// 访问内部 db API
const db = diagram.parser.yy;
const vertices = db.getVertices();  // 节点数据
const edges = db.getEdges();        // 连线数据
```

- **优点**：官方实现，解析准确
- **缺点**：依赖 mermaid 全包（~500KB），内部 API 不稳定

#### 方案 B：简易自解析

手写解析器，仅覆盖核心语法。

- **优点**：体积小，可控
- **缺点**：覆盖不全，边缘 case 多，维护成本高

#### 方案 C：@excalidraw/mermaid-to-excalidraw

参考 Excalidraw 的实现思路。

- **优点**：成熟方案思路
- **缺点**：输出 Excalidraw 格式，需二次转换

### 推荐方案：A + 部分定制

使用 mermaid 内部 API 解析获取数据，但不渲染 SVG，而是直接将 db 数据转换为 GraphSnapshot。

**理由**：
1. 解析准确性有保障（官方解析器）
2. 避免渲染 SVG 的性能开销
3. mermaid 已在项目中使用（支持 diagram 类型预览）

## 实现设计

### 1. 新增文件

```
src/lib/editor/mermaid/
├── mermaidParser.ts      # Mermaid 解析封装（调用 mermaid API）
├── flowchartConverter.ts # Flowchart → GraphSnapshot 转换
├── sequenceConverter.ts  # SequenceDiagram → GraphSnapshot 转换
└── index.ts              # 导出统一入口
```

### 2. Mermaid 解析封装 (mermaidParser.ts)

```typescript
import mermaid from 'mermaid';

export interface MermaidParseResult {
  type: 'flowchart' | 'sequence' | 'unsupported';
  data: unknown;
  error?: string;
}

export async function parseMermaidCode(code: string): Promise<MermaidParseResult> {
  // 初始化 mermaid（仅需一次）
  mermaid.initialize({ startOnLoad: false });
  
  try {
    const diagram = await mermaid.getDiagramFromText(code);
    const type = diagram.type;
    const db = diagram.parser.yy;
    
    if (type === 'flowchart' || type === 'graph') {
      return {
        type: 'flowchart',
        data: {
          vertices: db.getVertices(),
          edges: db.getEdges(),
          subgraphs: db.getSubgraphs?.() ?? [],
        }
      };
    }
    
    if (type === 'sequenceDiagram') {
      return {
        type: 'sequence',
        data: {
          actors: db.getActors(),
          messages: db.getMessages(),
          notes: db.getNotes?.() ?? [],
        }
      };
    }
    
    return { type: 'unsupported', data: null };
  } catch (e) {
    return { type: 'unsupported', data: null, error: e.message };
  }
}
```

### 3. Flowchart 转换器 (flowchartConverter.ts)

**核心映射**：

| Mermaid Flowchart | GraphSnapshot |
|-------------------|---------------|
| vertex (id, text, type) | GraphNode (id, shape, label, x, y, width, height) |
| edge (start, end, type, text) | GraphEdge (id, source, target, label, style) |
| subgraph | 暂不支持（可后续扩展） |

**形状映射**：

| Mermaid 形状 | GraphNodeShape |
|--------------|----------------|
| 默认方形 | rectangle |
| 圆角 ([...]) | rounded |
| 圆形 ((...)) | ellipse |
| 菱形 {...} | diamond |
| 六边形 [[...]] | rectangle（暂无六边形） |

**连线样式映射**：

| Mermaid 箭头 | GraphEdge 样式 |
|--------------|----------------|
| --> 或 ---> | 实线箭头 (classic) |
| --- 或 ---- | 实线无箭头 |
| -.-> 或 -..-> | 虚线箭头 |
| ==> 或 ===> | 粗线箭头（暂不支持） |

**自动布局**：
- 使用简化的横向/纵向布局算法
- 从左到右排列节点，行间距 80px，列间距 120px
- 或根据 flowchart 方向（TB/BT/LR/RL）调整

```typescript
export function convertFlowchartToSnapshot(data: FlowchartData): GraphSnapshot {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  
  // 1. 转换 vertices → nodes
  // 2. 自动布局（简化版：从左到右流式布局）
  // 3. 转换 edges → edges（带 source/target ID）
  
  return { nodes, edges, viewport: { zoom: 1, pan: { x: 0, y: 0 } } };
}
```

### 4. Sequence 转换器 (sequenceConverter.ts)

**核心映射**：

| Mermaid Sequence | GraphSnapshot |
|------------------|---------------|
| actor (name, description) | lifeline node |
| participant (name) | lifeline node |
| message (from, to, text, type) | edge (连线 + 标签) |
| note (position, text) | note node + edge |
| activation | activation node |

**时序图布局特点**：
- 参与者水平排列（从左到右）
- 每个参与者是一条 lifeline（矩形头部 + 虚线延伸）
- 消息是水平箭头，从一条生命线到另一条
- 激活框贴在生命线上

**布局算法**：
- 参与者间距：120px
- 生命线默认高度：200px
- 消息垂直间距：40px（按消息序号递增 y）

```typescript
export function convertSequenceToSnapshot(data: SequenceData): GraphSnapshot {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  
  // 1. actors/participants → lifeline nodes
  // 2. 水平布局参与者
  // 3. messages → edges（水平连线）
  // 4. 按消息序号计算 y 坐标
  // 5. notes → note nodes + edge
  // 6. activations → activation nodes
  
  return { nodes, edges, viewport: { zoom: 1, pan: { x: 0, y: 0 } } };
}
```

### 5. UI 入口：导入对话框

**位置**：在 GraphCanvas 工具栏底部新增"导入 Mermaid"按钮

**交互流程**：
1. 点击按钮 → 弹出 Modal 对话框
2. 对话框内：Textarea 输入 Mermaid 代码 + 示例提示
3. 点击"转换"按钮 → 解析并转换
4. 成功：将 GraphSnapshot 应用到画板，关闭对话框
5. 失败：显示错误信息，允许修正

**对话框组件**：
```tsx
// src/components/editor/nodes/graph/MermaidImportDialog.tsx

interface MermaidImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (snapshot: string) => void;
}

function MermaidImportDialog({ open, onClose, onImport }: ...) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const handleConvert = async () => {
    const result = await parseMermaidCode(code);
    if (result.error) {
      setError(result.error);
      return;
    }
    const snapshot = convertToSnapshot(result);
    onImport(serializeGraphSnapshot(snapshot));
    onClose();
  };
  
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>导入 Mermaid 图表</DialogTitle>
      <DialogContent>
        <Textarea 
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="输入 Mermaid 代码..."
        />
        {error && <ErrorText>{error}</ErrorText>}
        <ExampleHint>
          示例：
          flowchart TD
            A[开始] --> B[处理]
            B --> C{判断}
            C -->|是| D[结束]
            C -->|否| B
        </ExampleHint>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button onClick={handleConvert}>转换</Button>
      </DialogActions>
    </Dialog>
  );
}
```

### 6. GraphCanvas 集成

在 `GraphCanvas.tsx` 工具栏中添加导入按钮：

```tsx
// 工具栏底部新增按钮
<button
  type="button"
  className="jgraph-tool-btn"
  title="导入 Mermaid 图表"
  onClick={() => setMermaidDialogOpen(true)}
>
  <FileDown size={16} />
</button>

// 对话框组件
<MermaidImportDialog
  open={mermaidDialogOpen}
  onClose={() => setMermaidDialogOpen(false)}
  onImport={(snapshot) => {
    // 应用快照到画板
    const parsed = parseGraphSnapshot(snapshot);
    applySnapshotToGraph(graphRef.current, parsed, darkMode);
  }}
/>
```

## 依赖影响

**新增依赖**：
- `mermaid`：已在项目中间接使用，需确认版本兼容性

**现有依赖影响**：
- 无破坏性变更
- GraphCanvas 现有功能保持不变

## 实现步骤

1. **Phase 1：解析封装**
   - 创建 `mermaidParser.ts`
   - 测试 mermaid API 调用是否正常工作

2. **Phase 2：Flowchart 转换**
   - 创建 `flowchartConverter.ts`
   - 实现节点形状映射 + 自动布局
   - 单元测试验证转换结果

3. **Phase 3：Sequence 转换**
   - 创建 `sequenceConverter.ts`
   - 实现时序图布局算法
   - 单元测试验证转换结果

4. **Phase 4：UI 集成**
   - 创建 `MermaidImportDialog.tsx`
   - 在 GraphCanvas 工具栏添加按钮
   - 联调完整流程

5. **Phase 5：优化与测试**
   - 错误处理优化（解析失败提示）
   - 边缘 case 测试（复杂语法、嵌套结构）
   - 性能测试（大型图表）

## 风险与备选方案

### 风险 1：mermaid 内部 API 稳定性

**应对**：
- 封装层隔离，API 变化时只需修改 parser.ts
- 考虑锁定 mermaid 版本

### 鑫险 2：自动布局质量

**应对**：
- 先实现简化布局，后续可引入 dagre 等布局库
- Flowchart 可直接使用 mermaid 渲染的 SVG 坐标（方案 A 的变体）

### 风险 3：复杂语法覆盖不全

**应对**：
- 先支持核心语法（节点 + 连线 + 标签）
- 不支持的语法静默忽略或提示用户

## 备选方案：使用 SVG 坐标

如果内部 db API 不可用或不稳定，可采用 Excalidraw 方案：
1. 调用 mermaid.render() 生成 SVG
2. 解析 SVG 元素坐标（更可靠）
3. 转换为 GraphSnapshot

```typescript
// 备选实现
async function parseMermaidViaSVG(code: string) {
  const { svg } = await mermaid.render('temp-diagram', code);
  // 解析 SVG DOM，提取节点位置和连线
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  // ...提取坐标
}
```

**优点**：SVG 坐标是渲染结果，准确性高
**缺点**：需要渲染开销，坐标提取逻辑复杂

## 验收标准

1. **功能验收**：
   - 可导入标准 flowchart 代码并正确显示
   - 可导入标准 sequenceDiagram 代码并正确显示
   - 解析失败时显示明确错误提示

2. **质量验收**：
   - 节点形状正确映射
   - 连线箭头样式正确
   - 布局清晰可读（节点不重叠）

3. **交互验收**：
   - 按钮位置合理，图标语义清晰
   - 对话框可输入、可取消、可转换
   - 转换成功后画板即时更新