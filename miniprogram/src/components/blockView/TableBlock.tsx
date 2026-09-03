import { ScrollView, Text, View } from '@tarojs/components'

import type { Block, TableCellData, TableRowData } from '../../lib/blocks/types'
import { RichTextView } from './RichTextView'
import { flattenTiptapText } from '../../lib/blocks/snapshot'

/**
 * 表格块。对齐桌面端 vscode-theme.css:3000-3065 的「横线表格」规格：
 * 容器 16px 圆角 + 1px block-line-strong、单元格 8px 12px、只有横向行线、
 * 表头仅靠 600 字重 + 稍深底线区分（无底色、无斑马纹、无竖线）。
 *
 * 已知限制（平台取舍，README 有记录）：
 * - colspan / rowspan / colwidth 不生效，weapp 无 display:table，
 *   用 flex 行渲染，跨列跨行单元格按普通单元格展示。
 * - rawContent（单元格内的列表等块级内容）降级为 flattenTiptapText 文本行。
 */

/** 桌面端表格单元格行高 1.6（区别于正文 1.7）。 */
const CELL_LINE_HEIGHT = 1.6

function cellAlign(align: TableCellData['align']): 'left' | 'center' | 'right' | undefined {
  if (align === 'center' || align === 'right') {
    return align
  }
  return undefined
}

function CellContent({ cell }: { cell: TableCellData }) {
  if (cell.rawContent && cell.rawContent.length > 0) {
    const lines = flattenTiptapText(cell.rawContent)
    if (lines.length > 0) {
      return (
        <View>
          {lines.map((line, i) => (
            <View key={i} className={`bv-table-line${line.level > 0 ? ' bv-table-line-strong' : ''}`}>
              <RichTextView richText={line.richText} />
            </View>
          ))}
        </View>
      )
    }
  }
  const paragraphs = cell.content.length > 0 ? cell.content : [[]]
  return (
    <View>
      {paragraphs.map((para, i) => (
        <View key={i} className='bv-table-line'>
          <RichTextView richText={para} />
        </View>
      ))}
    </View>
  )
}

function RowView({ row, last }: { row: TableRowData; last: boolean }) {
  return (
    <View className={`bv-table-row${last ? ' bv-table-row-last' : ''}`}>
      {row.cells.map((cell, i) => (
        <View
          key={i}
          className={`bv-table-cell${row.isHeader ? ' bv-table-cell-header' : ''}`}
          style={{ textAlign: cellAlign(cell.align), lineHeight: CELL_LINE_HEIGHT }}
        >
          <CellContent cell={cell} />
        </View>
      ))}
    </View>
  )
}

export function TableBlockView({ block }: { block: Block }) {
  const tableData = block.properties?.tableData
  if (!tableData || tableData.rows.length === 0) {
    return (
      <View className='bv-table-empty'>
        <Text>空表格</Text>
      </View>
    )
  }
  // 桌面端 collapsed 状态只显示首行（首行即“表头栏”）。
  const rows = tableData.collapsed ? tableData.rows.slice(0, 1) : tableData.rows
  return (
    <ScrollView className='bv-table-wrapper' scrollX>
      <View className='bv-table-inner'>
        {rows.map((row, i) => (
          <RowView key={i} row={row} last={i === rows.length - 1} />
        ))}
      </View>
    </ScrollView>
  )
}
