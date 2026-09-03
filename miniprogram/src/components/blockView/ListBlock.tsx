import { Text, View } from '@tarojs/components'

import type { Block, ListItemData, RichText, TodoItemData } from '../../lib/blocks/types'
import { RichTextView } from './RichTextView'
import { richTextOf } from './TextBlocks'

/**
 * 列表块：bullet / ordered / todo 三种共用一个文件。
 * 对齐桌面端 vscode-theme.css:1179-1360：
 * - 列表容器 0.5em 上下 margin、条目 0.15em 上下 padding；
 * - bullet 按层级 disc → circle → square（● → ○ → ■）；
 * - ordered 按层级 decimal → lower-alpha → lower-roman；
 * - todo 复选框 16x16、圆角 4、1.5px placeholderForeground 边框，
 *   选中填充 button-background + 白色对勾，已完成文字 descriptionForeground + 删除线。
 *
 * 嵌套：桌面端靠 ul padding-left 2em 逐层叠加，本端用 marginLeft 32px/层 等价实现。
 */

/** 桌面端 ul 的 padding-left（2em @16px）与嵌套缩进。 */
const NEST_INDENT_PX = 32

/** 无序列表层级标记（对应 CSS disc/circle/square）。 */
const BULLET_MARKERS = ['\u25cf', '\u25cb', '\u25a0']

function orderedMarker(depth: number, index: number): string {
  const n = index + 1
  switch (depth % 3) {
    case 0:
      return `${n}.`
    case 1: {
      // lower-alpha
      return `${String.fromCharCode(96 + ((n - 1) % 26) + 1)}.`
    }
    default: {
      // lower-roman（条目超过 10 的极少数情况，退回数字）
      return roman(n) ?? `${n}.`
    }
  }
}

function roman(n: number): string | null {
  if (n <= 0 || n > 3999) {
    return null
  }
  const table: Array<[number, string]> = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ]
  let rest = n
  let out = ''
  for (const [v, s] of table) {
    while (rest >= v) {
      out += s
      rest -= v
    }
  }
  return out
}

/** 桌面端 content 存扁平 RichText[][]（无嵌套的遗留形态），无 listItems 时兜底。 */
function fallbackItems(content: RichText[] | string): ListItemData[] {
  if (Array.isArray(content)) {
    return content.length > 0 ? content.map((c) => ({ content: [c] })) : []
  }
  const rich = richTextOf(content)
  return rich.length > 0 ? [{ content: rich }] : []
}

function BulletOrOrderedItem({
  item,
  depth,
  index,
  ordered,
}: {
  item: ListItemData
  depth: number
  index: number
  ordered: boolean
}) {
  const marker = ordered ? orderedMarker(depth, index) : BULLET_MARKERS[depth % 3]
  return (
    <View>
      <View className='bv-li'>
        <View className='bv-li-marker'>
          <Text>{marker}</Text>
        </View>
        <View className='bv-li-content'>
          <RichTextView richText={item.content} />
        </View>
      </View>
      {(item.children ?? []).length > 0 && (
        <View style={{ marginLeft: NEST_INDENT_PX }}>
          {(item.children ?? []).map((child, i) => (
            <BulletOrOrderedItem
              key={i}
              item={child}
              depth={depth + 1}
              index={i}
              ordered={ordered}
            />
          ))}
        </View>
      )}
    </View>
  )
}

function TodoItemView({ item, depth }: { item: TodoItemData; depth: number }) {
  return (
    <View>
      <View className='bv-todo-li'>
        <View className='bv-todo-label'>
          <View className={`bv-checkbox${item.checked ? ' bv-checkbox-checked' : ''}`}>
            {item.checked && <View className='bv-checkbox-mark' />}
          </View>
        </View>
        <View className={`bv-todo-content${item.checked ? ' bv-todo-done' : ''}`}>
          <RichTextView richText={item.richText} />
        </View>
      </View>
      {(item.children ?? []).length > 0 && (
        <View style={{ marginLeft: NEST_INDENT_PX }}>
          {(item.children ?? []).map((child, i) => (
            <TodoItemView key={i} item={child} depth={depth + 1} />
          ))}
        </View>
      )}
    </View>
  )
}

/** 遗留 todo：content 为扁平 RichText[] 时按未勾选条目渲染。 */
function fallbackTodoItems(content: RichText[] | string): TodoItemData[] {
  if (Array.isArray(content)) {
    return content.map((c) => ({ checked: false, richText: [c] }))
  }
  return [{ checked: false, richText: richTextOf(content) }]
}

export function BulletListView({ block }: { block: Block }) {
  const items = block.properties?.listItems ?? fallbackItems(block.content)
  if (items.length === 0) {
    return null
  }
  return (
    <View className='bv-ul'>
      {items.map((item, i) => (
        <BulletOrOrderedItem key={i} item={item} depth={0} index={i} ordered={false} />
      ))}
    </View>
  )
}

export function OrderedListView({ block }: { block: Block }) {
  const items = block.properties?.listItems ?? fallbackItems(block.content)
  if (items.length === 0) {
    return null
  }
  return (
    <View className='bv-ul'>
      {items.map((item, i) => (
        <BulletOrOrderedItem key={i} item={item} depth={0} index={i} ordered />
      ))}
    </View>
  )
}

export function TodoListView({ block }: { block: Block }) {
  const items = block.properties?.todoItems ?? fallbackTodoItems(block.content)
  if (items.length === 0) {
    return null
  }
  return (
    <View className='bv-ul'>
      {items.map((item, i) => (
        <TodoItemView key={i} item={item} depth={0} />
      ))}
    </View>
  )
}
