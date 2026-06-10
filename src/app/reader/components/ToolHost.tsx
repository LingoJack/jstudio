import { DiffTool } from '../../../DiffTool'
import { JsonTool } from '../../../JsonTool'
import type { ToolId } from '../../../types'

/**
 * 工具 tab 渲染入口。按 toolId 分发到具体工具组件。
 * 列出来 + 路由集中在这里，新增工具时只在这里加 case，Reader 主流程不动。
 */
export function ToolHost({ toolId }: { toolId: ToolId | null }) {
  switch (toolId) {
    case 'diff':
      return <DiffTool />
    case 'json':
      return <JsonTool />
    default:
      return (
        <div className="h-full flex flex-col items-center justify-center p-12 text-seeyue-fg-dim text-[13px] text-center">
          <div className="text-seeyue-fg text-[15px] font-medium mb-1.5">未知工具</div>
          <div className="text-seeyue-fg-muted mb-4 leading-[1.7]">toolId = {String(toolId)}</div>
        </div>
      )
  }
}
