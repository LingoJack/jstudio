import type { KnowledgeGraph, PageSummary } from '../model/workspace'

interface KnowledgeGraphViewProps {
  graph: KnowledgeGraph
  pages: PageSummary[]
  onOpenPage: (pageId: string) => void
}

export function KnowledgeGraphView({ graph, pages, onOpenPage }: KnowledgeGraphViewProps) {
  const width = 900
  const height = 620
  const centerX = width / 2
  const centerY = height / 2
  const radius = Math.min(width, height) * 0.34
  const nodes = graph.nodes.length
    ? graph.nodes
    : pages.map((page) => ({ id: page.id, title: page.title, icon: page.icon }))
  const positioned = nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1) - Math.PI / 2
    return {
      ...node,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    }
  })
  const nodeMap = new Map(positioned.map((node) => [node.id, node]))

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-slate-50 p-8 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-orange-500">Knowledge Graph</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">双向链接知识图谱</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              通过 [[页面标题]] 建立连接，保存后图谱会自动更新。
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {nodes.length} 个节点 · {graph.edges.length} 条连接
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-[620px] w-full">
            <defs>
              <linearGradient id="edge" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#fb923c" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.8" />
              </linearGradient>
            </defs>
            {graph.edges.map((edge, index) => {
              const source = nodeMap.get(edge.source)
              const target = nodeMap.get(edge.target)
              if (!source || !target) return null
              return (
                <line
                  key={`${edge.source}-${edge.target}-${index}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="url(#edge)"
                  strokeWidth="2"
                  strokeOpacity="0.75"
                />
              )
            })}
            {positioned.map((node) => (
              <g key={node.id} className="cursor-pointer" onClick={() => onOpenPage(node.id)}>
                <circle cx={node.x} cy={node.y} r="42" fill="#fff7ed" stroke="#fdba74" strokeWidth="2" />
                <text x={node.x} y={node.y - 4} textAnchor="middle" className="fill-slate-700 text-lg">
                  {node.icon ?? 'doc'}
                </text>
                <text x={node.x} y={node.y + 18} textAnchor="middle" className="fill-slate-600 text-xs font-medium">
                  {node.title.length > 10 ? `${node.title.slice(0, 10)}…` : node.title}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  )
}
