import type { ComponentType } from 'react'
import { Braces, GitCompare, Toolbox as ToolboxIcon } from './Icon'
import { DiffTool } from './DiffTool'
import { JsonTool } from './JsonTool'
import type { ToolId } from './types'

type IconComponent = typeof GitCompare

export interface ToolDefinition {
  id: ToolId
  name: string
  description: string
  tone: 'accent' | 'success' | 'warn' | 'purple'
  Icon: IconComponent
  Component: ComponentType
}

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    id: 'diff',
    name: '文本 Diff',
    description: '并排比较两段文本，行级差异高亮',
    tone: 'accent',
    Icon: GitCompare,
    Component: DiffTool,
  },
  {
    id: 'json',
    name: 'JSON 查看器',
    description: '格式化展示 JSON，支持节点折叠 / 修改',
    tone: 'success',
    Icon: Braces,
    Component: JsonTool,
  },
]

export function getToolDefinition(toolId: ToolId | null | undefined): ToolDefinition | null {
  return TOOL_DEFINITIONS.find((tool) => tool.id === toolId) ?? null
}

export function getToolTitle(toolId: ToolId): string {
  return getToolDefinition(toolId)?.name ?? toolId
}

export function ToolRegistryIcon({ toolId, size = 13 }: { toolId: ToolId | null; size?: number }) {
  const tool = getToolDefinition(toolId)
  const Icon = tool?.Icon ?? ToolboxIcon
  return <Icon size={size} />
}

export function ToolRegistryHost({ toolId }: { toolId: ToolId | null }) {
  const tool = getToolDefinition(toolId)
  if (!tool) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-12 text-seeyue-fg-dim text-[13px] text-center">
        <div className="text-seeyue-fg text-[15px] font-medium mb-1.5">未知工具</div>
        <div className="text-seeyue-fg-muted mb-4 leading-[1.7]">toolId = {String(toolId)}</div>
      </div>
    )
  }

  const Component = tool.Component
  return <Component />
}
