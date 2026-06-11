export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'todo'
  | 'quote'
  | 'code'
  | 'table'
  | 'canvas'
  | 'image'
  | 'html'
  | 'embed'
  | 'link'
  | 'toggle'
  | 'divider'

export interface BlockNode {
  id: string
  type: BlockType
  props: Record<string, unknown>
  children?: BlockNode[]
}

export interface PageDoc {
  id: string
  title: string
  icon?: string | null
  parentId?: string | null
  createdAt: number
  updatedAt: number
  blocks: BlockNode[]
}

export interface PageSummary {
  id: string
  title: string
  icon?: string | null
  parentId?: string | null
  createdAt: number
  updatedAt: number
}

export interface WorkspaceMeta {
  id: string
  name: string
  path: string
  createdAt: number
  updatedAt: number
  pages: PageSummary[]
}

export interface GraphNode {
  id: string
  title: string
  icon?: string | null
}

export interface GraphEdge {
  source: string
  target: string
  label: string
}

export interface KnowledgeGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface Backlink {
  pageId: string
  title: string
  blockId: string
  excerpt: string
}

export interface PluginManifest {
  id: string
  name: string
  description: string
  enabled: boolean
}

export interface SyncStatus {
  strategy: string
  deviceId: string
  lastSnapshotAt?: number | null
  message: string
}
