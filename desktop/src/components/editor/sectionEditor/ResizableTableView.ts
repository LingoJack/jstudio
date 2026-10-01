import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { NodeView, ViewMutationRecord } from '@tiptap/pm/view'

/**
 * Returns the CSS property declaration for a <col> element.
 *
 * - When the column has an explicit width (from dragging), sets `width`.
 * - When the column has no explicit width, sets `min-width` so the column
 *   doesn't collapse to content width when the table switches to
 *   `width: auto` after the first resize.
 */
function getColStyleDeclaration(
  minWidth: number,
  width: number | undefined,
): [string, string] {
  if (width) {
    return ['width', `${Math.max(width, minWidth)}px`]
  }
  return ['min-width', `${minWidth}px`]
}

/**
 * 未调整过列宽的表格：列宽自动适配内容 —— 每列取「恰好放下最长一行内容
 * + 一点余量」，总宽容得下编辑区时表格拥抱内容（wrapper fit-content），
 * 装不下时按比例收缩到铺满。结果按列数缓存在表格元素上：单元格里打字
 * 不会让列宽跟着内容抖动，增删列时才重新适配。
 */
const autoFitCache = new WeakMap<HTMLTableElement, { colCount: number; widths: number[] }>()

const AUTO_FIT_SLACK = 36       // 每列呼吸余量（约两个中文字符宽）
const AUTO_FIT_COLUMN_CAP = 560 // 单列上限：防止超长段落把整表拖爆
const CSS_CELL_MIN_WIDTH = 80   // 与 .tableWrapper td 的 CSS min-width 保持一致

/**
 * 让浏览器按 max-content 测量每列的自然宽度：同步把表格切到自动布局 +
 * 单元格临时 nowrap（都在同一绘制帧内完成，不会产生可见的布局抖动），
 * 读回首行各列宽度后立即还原。
 */
function measureContentColumnWidths(table: HTMLTableElement): number[] {
  const widths: number[] = []
  const firstRow = table.rows?.[0]
  if (!firstRow || firstRow.cells.length === 0) return widths

  const prevTableLayout = table.style.tableLayout
  const prevTableWidth = table.style.width
  const cells = Array.from(table.querySelectorAll('th, td')) as HTMLElement[]
  const prevWhiteSpace = cells.map((c) => c.style.whiteSpace)

  table.style.tableLayout = 'auto'
  table.style.width = 'auto'
  cells.forEach((c) => { c.style.whiteSpace = 'nowrap' })

  for (const cell of firstRow.cells) {
    const colspan = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10))
    const w = cell.getBoundingClientRect().width
    for (let j = 0; j < colspan; j++) widths.push(Math.round(w / colspan))
  }

  cells.forEach((c, i) => { c.style.whiteSpace = prevWhiteSpace[i] ?? '' })
  table.style.tableLayout = prevTableLayout
  table.style.width = prevTableWidth
  return widths
}

/** 内容宽 + 余量，收在单列上限内；总宽超出容器时按比例收缩到铺满。 */
function fitColumnWidths(
  measured: number[],
  cellMinWidth: number,
  containerWidth: number,
): number[] {
  const floor = Math.max(cellMinWidth, CSS_CELL_MIN_WIDTH)
  let widths = measured.map((w) =>
    Math.min(Math.max(w + AUTO_FIT_SLACK, floor), AUTO_FIT_COLUMN_CAP),
  )
  let total = widths.reduce((a, b) => a + b, 0)
  if (containerWidth > 0 && total > containerWidth) {
    const scale = containerWidth / total
    widths = widths.map((w) => Math.max(Math.round(w * scale), floor))
  }
  return widths
}

function countColumns(node: ProseMirrorNode): number {
  const row = node.firstChild
  if (!row) return 0
  let count = 0
  for (let i = 0; i < row.childCount; i += 1) {
    count += row.child(i).attrs.colspan || 1
  }
  return count
}

/**
 * Updates <col> elements in the colgroup and manages the table + wrapper width.
 *
 * Width strategy (the key difference from TipTap's built-in TableView):
 * - **No columns resized** -> 列宽内容自适应：每列「max-content + 余量」，
 *   总宽容得下容器时 table `width: <total>px` + wrapper `fit-content`
 *   （表格拥抱内容）；装不下按比例收缩到铺满。测量结果按列数缓存，
 *   单元格内打字不抖动。tbody 尚未渲染时退回 `width: 100%` 行为。
 * - **Some columns resized** -> table `width: auto` + `min-width: <totalWidth>`,
 *   wrapper `width: fit-content; max-width: 100%` so it hugs the table (and
 *   scrolls when the table outgrows the container). No circularity here
 *   because the table width is px-based, not a percentage of the wrapper.
 * - **All columns resized** -> table `width: <totalWidth>px` (fully fixed),
 *   wrapper `fit-content` to hug.
 *
 * The border + `overflow-x: auto` live on the wrapper, so the horizontal
 * scrollbar always sits INSIDE the frame; the wrapper width mode just decides
 * whether the frame fills the container or hugs the table.
 */
function updateColumns(
  node: ProseMirrorNode,
  colgroup: HTMLTableColElement,
  table: HTMLTableElement,
  cellMinWidth: number,
  wrapper: HTMLElement,
): void {
  let totalWidth = 0
  let fixedWidth = true
  let hasAnyColwidth = false
  let nextDOM: Node | null = colgroup.firstChild
  const row = node.firstChild

  if (row !== null) {
    for (let i = 0, col = 0; i < row.childCount; i += 1) {
      const { colspan, colwidth } = row.child(i).attrs

      for (let j = 0; j < colspan; j += 1, col += 1) {
        const hasWidth = (colwidth && colwidth[j]) as number | undefined

        totalWidth += hasWidth || cellMinWidth

        if (!hasWidth) {
          fixedWidth = false
        } else {
          hasAnyColwidth = true
        }

        if (!nextDOM) {
          const colElement = document.createElement('col')
          const [propertyKey, propertyValue] = getColStyleDeclaration(cellMinWidth, hasWidth)
          colElement.style.setProperty(propertyKey, propertyValue)
          colgroup.appendChild(colElement)
        } else {
          const colEl = nextDOM as HTMLTableColElement
          // Always reconcile: clear both properties, then set only the
          // relevant one. This avoids stale width/min-width left over
          // from updateColumnsOnResize (called during the live drag).
          colEl.style.width = ''
          colEl.style.minWidth = ''
          const [propertyKey, propertyValue] = getColStyleDeclaration(cellMinWidth, hasWidth)
          colEl.style.setProperty(propertyKey, propertyValue)
          nextDOM = colEl.nextSibling
        }
      }
    }
  }

  // Remove excess <col> elements (e.g. after column deletion).
  while (nextDOM) {
    const after = nextDOM.nextSibling
    nextDOM.parentNode?.removeChild(nextDOM)
    nextDOM = after
  }

  // Check if the user has set a width style on the table node itself.
  const hasUserWidth =
    node.attrs.style &&
    typeof node.attrs.style === 'string' &&
    /\bwidth\s*:/i.test(node.attrs.style)

  if (fixedWidth && !hasUserWidth) {
    // Every column has an explicit width -> table has a fixed total width.
    table.style.width = `${totalWidth}px`
    table.style.minWidth = ''
    // Hug the fixed-width table (scrolls if it outgrows the container).
    wrapper.style.width = 'fit-content'
    wrapper.style.maxWidth = '100%'
  } else if (!hasAnyColwidth && !hasUserWidth) {
    // 未调整过列宽：列宽内容自适应（策略见 autoFitCache 注释）——
    // 每列恰好放下内容再扩一点，表格拥抱内容而不是硬拉满整行。
    // 测不到行（构造期 tbody 尚未填充）时先退回铺满，等 ResizeObserver
    // 在行真正渲染后触发首次适配。
    const colCount = countColumns(node)
    const cached = autoFitCache.get(table)
    let widths: number[] | null =
      cached && cached.colCount === colCount ? cached.widths : null
    if (!widths && colCount > 0) {
      const measured = measureContentColumnWidths(table)
      if (measured.length > 0) {
        widths = fitColumnWidths(measured, cellMinWidth, wrapper.clientWidth)
        autoFitCache.set(table, { colCount, widths })
      }
    }

    if (widths && widths.length > 0) {
      let fittedTotal = 0
      const cols = Array.from(colgroup.children) as HTMLTableColElement[]
      cols.forEach((colEl, i) => {
        const w = widths![i]
        if (w == null) return
        colEl.style.minWidth = ''
        colEl.style.width = `${w}px`
        fittedTotal += w
      })
      table.style.width = `${fittedTotal}px`
      table.style.minWidth = ''
      wrapper.style.width = 'fit-content'
      wrapper.style.maxWidth = '100%'
    } else {
      table.style.width = '100%'
      table.style.minWidth = ''
      wrapper.style.width = '100%'
      wrapper.style.maxWidth = ''
    }
  } else if (!hasAnyColwidth) {
    // 用户给表格节点设置了宽度样式：尊重之，保持原有铺满行为。
    table.style.width = '100%'
    table.style.minWidth = ''
    wrapper.style.width = '100%'
    wrapper.style.maxWidth = ''
  } else {
    // Some columns have been resized -> table width is driven by column widths.
    // The table can grow or shrink when the user drags any column edge,
    // including the last column's right edge. Hug it (px-based, no circularity).
    table.style.width = ''
    table.style.minWidth = `${totalWidth}px`
    wrapper.style.width = 'fit-content'
    wrapper.style.maxWidth = '100%'
  }
}

/**
 * Custom NodeView for table nodes that supports dragging the last column's
 * right edge to resize the entire table width, and rendering the collapsed
 * state (only the first row visible) driven by the table node's `collapsed`
 * attribute.
 *
 * The collapse / expand toggle itself lives in the `TableControls` floating
 * toolbar (top-right corner, shown when the cursor is inside the table); this
 * view only reflects the `collapsed` attribute on the wrapper
 * (`data-collapsed`, which drives the CSS that hides body rows) and freezes
 * column widths so the first row keeps its width when the body is hidden.
 *
 * The built-in TipTap `TableView` is not exported, so this is a standalone
 * implementation that follows the same structure but with modified width
 * management in `updateColumns`.
 */
export class ResizableTableView implements NodeView {
  node: ProseMirrorNode
  cellMinWidth: number
  dom: HTMLDivElement
  table: HTMLTableElement
  colgroup: HTMLTableColElement
  contentDOM: HTMLTableSectionElement

  /** Observes the tbody so we can freeze column widths once ProseMirror has
   *  populated it (the constructor runs before the rows are rendered). */
  private resizeObserver: ResizeObserver | null = null

  /** 内容自适应的首次补测只做一次（见 ResizeObserver 回调）。 */
  private attemptedAutoFit = false

  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    _HTMLAttributes: Record<string, any> = {},
  ) {
    this.node = node
    this.cellMinWidth = cellMinWidth

    this.dom = document.createElement('div')
    this.dom.className = 'tableWrapper'

    this.table = this.dom.appendChild(document.createElement('table'))

    this.colgroup = this.table.appendChild(document.createElement('colgroup'))
    updateColumns(node, this.colgroup, this.table, cellMinWidth, this.dom)

    this.contentDOM = this.table.appendChild(document.createElement('tbody'))

    this.syncCollapsed()

    // ProseMirror populates `contentDOM` (the <tbody>) only AFTER the
    // constructor returns.  When a table is loaded already collapsed, the
    // first freezeColumnWidths() call in syncCollapsed() finds no <tr> and
    // bails – so we re-run it once the rows actually appear.
    this.resizeObserver = new ResizeObserver(() => {
      if (this.node.attrs.collapsed) {
        const needsFreeze = Array.from(this.colgroup.children).some(
          (col) => (col as HTMLTableColElement).style.minWidth !== '',
        )
        if (needsFreeze) {
          this.syncCollapsed()
        }
      }
      // 构造期 tbody 为空、无法做内容自适应测量 —— 行首次渲染后补做一次。
      if (
        !this.attemptedAutoFit &&
        countColumns(this.node) > 0 &&
        this.contentDOM.querySelector('td, th')
      ) {
        this.attemptedAutoFit = true
        this.update(this.node)
      }
    })
    this.resizeObserver.observe(this.contentDOM)
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) {
      return false
    }

    this.node = node
    updateColumns(node, this.colgroup, this.table, this.cellMinWidth, this.dom)
    this.syncCollapsed()
    return true
  }

  destroy(): void {
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    const target = mutation.target as Node
    const isInsideWrapper = this.dom.contains(target)
    const isInsideContent = this.contentDOM.contains(target)

    // Ignore mutations on the colgroup, col elements, table attributes, etc.
    // so that ProseMirror doesn't try to re-render and wipe our manual DOM.
    if (isInsideWrapper && !isInsideContent) {
      if (
        mutation.type === 'attributes' ||
        mutation.type === 'childList' ||
        mutation.type === 'characterData'
      ) {
        return true
      }
    }

    return false
  }

  /**
   * Sync the wrapper's `data-collapsed` attribute (which drives the CSS that
   * hides body rows) with the node's `collapsed` attr, freezing / restoring
   * column widths around the transition so the table doesn't visually jump.
   */
  private syncCollapsed(): void {
    const collapsed = !!this.node.attrs.collapsed
    const wasCollapsed = this.dom.getAttribute('data-collapsed') === 'true'

    if (collapsed) {
      this.freezeColumnWidths()
    } else if (wasCollapsed) {
      // Expanding: recompute column widths the normal way.
      updateColumns(this.node, this.colgroup, this.table, this.cellMinWidth, this.dom)
    }

    this.dom.setAttribute('data-collapsed', String(collapsed))
  }

  /**
   * Snapshot the current rendered column widths and write them as explicit
   * `width` on each `<col>` element.  This prevents the browser from
   * recalculating column widths when body rows are hidden via `display:none`.
   *
   * Must be called WHILE all rows are still visible (i.e. before
   * `data-collapsed` is set).
   */
  private freezeColumnWidths(): void {
    const firstRow = this.contentDOM.querySelector('tr')
    if (!firstRow) return

    const cells = firstRow.querySelectorAll('th, td')
    const cols = Array.from(this.colgroup.children) as HTMLTableColElement[]
    let colIdx = 0

    for (let i = 0; i < cells.length && colIdx < cols.length; i++) {
      const cell = cells[i] as HTMLElement
      const colspan = parseInt(cell.getAttribute('colspan') || '1', 10)
      const cellWidth = cell.offsetWidth

      for (let j = 0; j < colspan && colIdx < cols.length; j++, colIdx++) {
        // For colspan > 1, distribute evenly (rare in practice).
        const w = colspan > 1 ? Math.floor(cellWidth / colspan) : cellWidth
        cols[colIdx].style.width = `${w}px`
        cols[colIdx].style.minWidth = ''
      }
    }
  }
}
