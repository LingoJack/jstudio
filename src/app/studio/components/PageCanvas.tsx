import type { BlockNode, PageDoc, PageSummary } from '../model/workspace'
import { BlockEditor } from '../editor/BlockEditor'

interface Props {
  page: PageDoc
  pages?: PageSummary[]
  onChange: (blocks: BlockNode[]) => void
}

/// 兼容旧文件路径的页面画布组件；新应用主入口使用 StudioApp 内的布局。
export function PageCanvas({ page, pages = [], onChange }: Props) {
  return <BlockEditor blocks={page.blocks} pages={pages} onChange={onChange} />
}
