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
const autoFitCache = new WeakMap<
  HTMLTableElement,
  { colCount: number; widths: number[]; containerWidth: number }
>()

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

/** 任一列带显式 colwidth（用户拖拽过）→ 不再自动适配。 */
function hasAnyExplicitColwidth(node: ProseMirrorNode): boolean {
  const row = node.firstChild
  if (!row) return false
  for (let i = 0; i < row.childCount; i += 1) {
    const { colspan, colwidth } = row.child(i).attrs
    for (let j = 0; j < colspan; j += 1) {
      if (colwidth && colwidth[j]) return true
    }
  }
  return false
}

/** 用户给表格节点设置了宽度样式 → 不再自动适配。 */
function hasUserNodeWidth(node: ProseMirrorNode): boolean {
  return !!(
    node.attrs.style &&
    typeof node.attrs.style === 'string' &&
    /\bwidth\s*:/i.test(node.attrs.style)
  )
}

/** 把适配好的列宽写入 colgroup，并让表格拥抱内容（wrapper fit-content）。 */
function applyFittedWidths(
  colgroup: HTMLTableColElement,
  table: HTMLTableElement,
  wrapper: HTMLElement,
  widths: number[],
): void {
  let total = 0
  const cols = Array.from(colgroup.children) as HTMLTableColElement[]
  cols.forEach((colEl, i) => {
    const w = widths[i]
    if (w == null) return
    colEl.style.minWidth = ''
    colEl.style.width = `${w}px`
    total += w
  })
  table.style.width = `${total}px`
  table.style.minWidth = ''
  wrapper.style.width = 'fit-content'
  wrapper.style.maxWidth = '100%'
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
        autoFitCache.set(table, {
          colCount,
          widths,
          containerWidth: wrapper.clientWidth,
        })
      }
    }

    if (widths && widths.length > 0) {
      applyFittedWidths(colgroup, table, wrapper, widths)
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
 *
 * DOM structure: `.tableWrapper`（不滚动的框：边框/圆角/边缘指示的定位基准）
 * > `.table-scroll`（真正的横向滚动层，滚动条与滚轮横滚都在这里）> table。
 * 溢出示能（右缘渐隐 + 墨色 ❯ + 首列钉住）由 wrapper 上的
 * `data-overflow-start/end` 驱动（updateOverflowState）。
 */
export class ResizableTableView implements NodeView {
  node: ProseMirrorNode
  cellMinWidth: number
  dom: HTMLDivElement
  /** 横向滚动层：滚动事件、滚轮纵转横、溢出测量都发生在这里。 */
  scrollEl: HTMLDivElement
  table: HTMLTableElement
  colgroup: HTMLTableColElement
  contentDOM: HTMLTableSectionElement

  /** Observes the tbody so we can freeze column widths once ProseMirror has
   *  populated it (the constructor runs before the rows are rendered). */
  private resizeObserver: ResizeObserver | null = null

  /** 内容自适应的首次补测只做一次（见 ResizeObserver 回调）。 */
  private attemptedAutoFit = false
  /** 已纳入 ResizeObserver 的容器元素（构造期 parent 尚未挂载，懒绑定）。 */
  private observedParent: HTMLElement | null = null
  /** 上一次列宽适配所用的容器宽度（变化 >1px 才重新适配，防逐帧抖动）。 */
  private lastFitContainerWidth = 0

  /** scroll 事件的 rAF 句柄（updateOverflowState 节流用）。 */
  private overflowRaf = 0
  /** 滚轮纵→横映射（与 TabBar 同一处理），destroy 时移除。 */
  private wheelHandler: ((e: WheelEvent) => void) | null = null
  /** 上一次溢出状态（仅在变化时写 data 属性，避免滚动期间样式失效）。 */
  private lastCanStart = false
  private lastCanEnd = false

  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    _HTMLAttributes: Record<string, any> = {},
  ) {
    this.node = node
    this.cellMinWidth = cellMinWidth

    this.dom = document.createElement('div')
    this.dom.className = 'tableWrapper'

    // 内层滚动层：wrapper 只当不滚动的框（边框/圆角/指示定位基准），
    // 滚动条、滚轮、渐隐指示的显隐测量都在这一层。
    this.scrollEl = this.dom.appendChild(document.createElement('div'))
    this.scrollEl.className = 'table-scroll'

    // 右缘指示（渐隐 + 墨色 ❯），absolute 定位在 wrapper 上所以不随内容
    // 滚动，默认 opacity:0，由 data-overflow-end 驱动显隐。左缘不设箭头：
    // 首列钉住后左缘永远是可读的钉住列，滚动态由其缘线示意（CSS）。
    const edgeEnd = document.createElement('span')
    edgeEnd.className = 'table-edge-end'
    edgeEnd.setAttribute('aria-hidden', 'true')
    this.dom.appendChild(edgeEnd)

    this.table = this.scrollEl.appendChild(document.createElement('table'))

    this.colgroup = this.table.appendChild(document.createElement('colgroup'))
    updateColumns(node, this.colgroup, this.table, cellMinWidth, this.dom)

    this.contentDOM = this.table.appendChild(document.createElement('tbody'))

    this.syncCollapsed()

    // 滚轮纵向增量 → 横向滚动（mouse wheel 无横轴；与 TabBar 的处理一致，
    // 触控板 deltaX 占优时走原生横滚不受影响）。非 passive 以便 preventDefault。
    // 表已滚到目标方向尽头时把事件还给文档 —— 滚轮可以继续滚动页面，
    // 光标停在宽表上不会把页面滚动"劫持"住。
    this.wheelHandler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      const el = this.scrollEl
      const maxScroll = el.scrollWidth - el.clientWidth
      if (maxScroll <= 0) return
      const atStart = el.scrollLeft <= 0
      const atEnd = el.scrollLeft >= maxScroll - 1
      if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return
      el.scrollLeft += e.deltaY
      e.preventDefault()
    }
    this.scrollEl.addEventListener('wheel', this.wheelHandler, { passive: false })
    this.scrollEl.addEventListener('scroll', this.handleScroll, { passive: true })

    // ProseMirror populates `contentDOM` (the <tbody>) only AFTER the
    // constructor returns.  When a table is loaded already collapsed, the
    // first freezeColumnWidths() call in syncCollapsed() finds no <tr> and
    // bails – so we re-run it once the rows actually appear.
    this.resizeObserver = new ResizeObserver(() => {
      // 构造期 tbody 为空、无法做内容自适应测量 —— 行首次渲染后补做一次。
      if (
        !this.attemptedAutoFit &&
        countColumns(this.node) > 0 &&
        this.contentDOM.querySelector('td, th')
      ) {
        this.attemptedAutoFit = true
        this.update(this.node)
      }
      // 编辑区容器宽度变化（展开/收起大纲、拖分隔条）时重新适配列宽，
      // 否则按旧容器宽适配的表格会在窄容器里被裁掉一部分。父元素挂载
      // 后才纳入观察（构造期 parentElement 为 null）。
      const parent = this.dom.parentElement
      if (parent && this.observedParent !== parent) {
        this.observedParent = parent
        this.resizeObserver?.observe(parent)
      }
      this.refitIfContainerChanged()
      this.updateOverflowState()
      if (this.node.attrs.collapsed) {
        const needsFreeze = Array.from(this.colgroup.children).some(
          (col) => (col as HTMLTableColElement).style.minWidth !== '',
        )
        if (needsFreeze) {
          this.syncCollapsed()
        }
      }
    })
    this.resizeObserver.observe(this.contentDOM)
  }

  /** scroll 事件 → rAF 节流的溢出状态刷新。 */
  private handleScroll = (): void => {
    cancelAnimationFrame(this.overflowRaf)
    this.overflowRaf = requestAnimationFrame(() => this.updateOverflowState())
  }

  /**
   * 测量横向溢出并写 wrapper 的 data-overflow-start/end —— 驱动 CSS：
   * 边缘渐隐 + ❯ 指示的显隐（滚到头自动隐去）与首列 sticky 的启用。
   * 不溢出时两个属性都移除，表格回到零示能的纯账本外观。
   * 仅在状态变化时写属性（滚动期间每帧 setAttribute 会触发样式失效）。
   */
  private updateOverflowState(): void {
    const el = this.scrollEl
    const maxScroll = el.scrollWidth - el.clientWidth
    const canStart = maxScroll > 1 && el.scrollLeft > 1
    const canEnd = maxScroll > 1 && el.scrollLeft < maxScroll - 1
    if (canStart !== this.lastCanStart) {
      this.lastCanStart = canStart
      if (canStart) this.dom.setAttribute('data-overflow-start', 'true')
      else this.dom.removeAttribute('data-overflow-start')
    }
    if (canEnd !== this.lastCanEnd) {
      this.lastCanEnd = canEnd
      if (canEnd) this.dom.setAttribute('data-overflow-end', 'true')
      else this.dom.removeAttribute('data-overflow-end')
    }
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) {
      return false
    }

    this.node = node
    updateColumns(node, this.colgroup, this.table, this.cellMinWidth, this.dom)
    this.syncCollapsed()
    this.updateOverflowState()
    // 缓存命中路径不会重新测量，这里同步最近一次适配所用的容器宽度。
    const cached = autoFitCache.get(this.table)
    if (cached) {
      this.lastFitContainerWidth = cached.containerWidth
    }
    return true
  }

  destroy(): void {
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    cancelAnimationFrame(this.overflowRaf)
    if (this.wheelHandler) {
      this.scrollEl.removeEventListener('wheel', this.wheelHandler)
      this.wheelHandler = null
    }
    this.scrollEl.removeEventListener('scroll', this.handleScroll)
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
   * 编辑区容器宽度变化（展开/收起大纲、拖分隔条）后重新适配列宽 ——
   * 缓存的适配结果按旧容器宽缩放，容器变窄时表格会被裁掉一部分
   * （右半不可见）。重新测量内容并按新容器宽缩放；拖拽过的表格
   * （显式列宽）与用户设置了宽度的表格不动。1px 阈值兜住逐帧触发。
   */
  private refitIfContainerChanged(): void {
    const parent = this.dom.parentElement
    if (!parent || this.node.attrs.collapsed) return
    if (hasAnyExplicitColwidth(this.node) || hasUserNodeWidth(this.node)) return
    const containerWidth = parent.clientWidth
    if (Math.abs(containerWidth - this.lastFitContainerWidth) <= 1) return
    this.lastFitContainerWidth = containerWidth
    const colCount = countColumns(this.node)
    if (colCount === 0 || !this.contentDOM.querySelector('td, th')) return
    const measured = measureContentColumnWidths(this.table)
    if (measured.length === 0) return
    const widths = fitColumnWidths(measured, this.cellMinWidth, containerWidth)
    autoFitCache.set(this.table, { colCount, widths, containerWidth })
    applyFittedWidths(this.colgroup, this.table, this.dom, widths)
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
    // 折叠/展开改变行数与列宽冻结状态，溢出与否要重算。
    this.updateOverflowState()
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
