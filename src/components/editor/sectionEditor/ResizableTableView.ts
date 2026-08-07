import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView, NodeView, ViewMutationRecord } from '@tiptap/pm/view'

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
 * Updates <col> elements in the colgroup and manages the table width.
 *
 * Width strategy (the key difference from TipTap's built-in TableView):
 * - **No columns resized** → `width: 100%` so new tables fill the container.
 * - **Some columns resized** → `width: auto` + `min-width: <totalWidth>` so
 *   the table width is driven by the sum of column widths. Dragging the last
 *   column's right edge directly grows / shrinks the table.
 * - **All columns resized** → `width: <totalWidth>px` (fully fixed).
 */
function updateColumns(
  node: ProseMirrorNode,
  colgroup: HTMLTableColElement,
  table: HTMLTableElement,
  cellMinWidth: number,
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
    // Every column has an explicit width → table has a fixed total width.
    table.style.width = `${totalWidth}px`
    table.style.minWidth = ''
  } else if (!hasAnyColwidth) {
    // No columns have been resized → fill the container.
    table.style.width = '100%'
    table.style.minWidth = ''
  } else {
    // Some columns have been resized → table width is driven by column widths.
    // The table can grow or shrink when the user drags any column edge,
    // including the last column's right edge.
    table.style.width = ''
    table.style.minWidth = `${totalWidth}px`
  }
}

/**
 * Custom NodeView for table nodes that supports dragging the last column's
 * right edge to resize the entire table width, and collapsing the table body
 * so only the first row (header bar) is visible.
 *
 * The built-in TipTap `TableView` is not exported, so this is a standalone
 * implementation that follows the same structure but with modified width
 * management in `updateColumns` and an added collapse toggle.
 */
export class ResizableTableView implements NodeView {
  node: ProseMirrorNode
  cellMinWidth: number
  dom: HTMLDivElement
  table: HTMLTableElement
  colgroup: HTMLTableColElement
  contentDOM: HTMLTableSectionElement

  /** Chevron toggle for collapse / expand, positioned over the first cell. */
  private collapseToggle: HTMLButtonElement
  /** The SVG chevron icon inside the toggle button. */
  private collapseChevron: SVGElement | null
  /** EditorView, used to dispatch collapse transactions. */
  private view?: EditorView
  /** Returns the document position of the table node (or undefined). */
  private getPos?: () => number | undefined
  /** Observes the tbody for size changes to re-center the toggle vertically. */
  private resizeObserver: ResizeObserver | null = null

  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    view?: EditorView,
    _HTMLAttributes: Record<string, any> = {},
    getPos?: () => number | undefined,
  ) {
    this.node = node
    this.cellMinWidth = cellMinWidth
    this.view = view
    this.getPos = getPos

    this.dom = document.createElement('div')
    this.dom.className = 'tableWrapper'

    // Collapse toggle – a small chevron button that sits in the top-left
    // corner of the table (overlapping the first cell).  Reuses the same
    // .editor-toolbar-btn / .block-toolbar-btn--sm / .code-collapse-toggle
    // styling as CodeBlockView and CollapsibleView for visual consistency.
    // It is a child of the wrapper div but lives outside <table>/<tbody>
    // so ProseMirror ignores it.
    this.collapseToggle = document.createElement('button')
    this.collapseToggle.type = 'button'
    this.collapseToggle.className =
      'editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm code-collapse-toggle table-collapse-toggle'
    this.collapseToggle.title = 'Collapse / expand table'
    this.collapseToggle.setAttribute('aria-label', 'Collapse / expand table')
    this.collapseToggle.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="code-collapse-chevron"><path d="m9 18 6-6-6-6"/></svg>'
    this.collapseChevron = this.collapseToggle.querySelector('.code-collapse-chevron')
    this.collapseToggle.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    this.collapseToggle.addEventListener('click', (e) => this.handleToggleClick(e))
    this.dom.appendChild(this.collapseToggle)

    this.table = this.dom.appendChild(document.createElement('table'))

    this.colgroup = this.table.appendChild(document.createElement('colgroup'))
    updateColumns(node, this.colgroup, this.table, cellMinWidth)

    this.contentDOM = this.table.appendChild(document.createElement('tbody'))

    this.syncCollapsed()

    // Watch for size changes (content edits, column resize, editor resize)
    // to keep the toggle vertically centered on the first row, and to
    // freeze column widths after ProseMirror populates contentDOM (which
    // happens after the constructor returns).
    this.resizeObserver = new ResizeObserver(() => {
      this.positionToggle()
      // If the table is collapsed but column widths haven't been frozen yet
      // (e.g. contentDOM was empty during construction), freeze them now.
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

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) {
      return false
    }

    this.node = node
    updateColumns(node, this.colgroup, this.table, this.cellMinWidth)
    this.syncCollapsed()
    this.positionToggle()
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

    // Ignore mutations on the colgroup, col elements, collapse toggle, table
    // attributes, etc. so that ProseMirror doesn't try to re-render and wipe
    // our manual DOM.
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
   * Prevent ProseMirror from treating clicks on the collapse toggle as
   * cursor-placement events inside the table.
   */
  stopEvent(event: Event): boolean {
    const target = event.target as Node | null
    return !!target && this.collapseToggle.contains(target)
  }

  /** Sync `data-collapsed` and chevron rotation with the node's `collapsed` attr. */
  private syncCollapsed(): void {
    const collapsed = !!this.node.attrs.collapsed
    const wasCollapsed = this.dom.getAttribute('data-collapsed') === 'true'

    if (collapsed) {
      if (wasCollapsed) {
        this.dom.removeAttribute('data-collapsed')
      }
      this.freezeColumnWidths()
    } else if (wasCollapsed) {
      updateColumns(this.node, this.colgroup, this.table, this.cellMinWidth)
    }

    this.dom.setAttribute('data-collapsed', String(collapsed))
    this.collapseToggle.setAttribute('aria-expanded', String(!collapsed))
    // Rotate chevron: is-open -> points down (expanded), no class -> points right (collapsed)
    if (this.collapseChevron) {
      this.collapseChevron.classList.toggle('is-open', !collapsed)
    }
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

  /**
   * Vertically center the collapse toggle on the first table row.
   *
   * The toggle is absolutely positioned inside the `tableWrapper`, so we
   * measure the first `<tr>` height and set `top` to `(rowHeight - btnHeight)
   * / 2`.  Called on init (via ResizeObserver), on node updates, and whenever
   * the tbody size changes.
   */
  private positionToggle(): void {
    const firstRow = this.contentDOM.querySelector('tr')
    if (!firstRow) return
    const rowHeight = (firstRow as HTMLElement).offsetHeight
    const btnHeight = this.collapseToggle.offsetHeight || 26
    this.collapseToggle.style.top = `${Math.max(0, (rowHeight - btnHeight) / 2)}px`
  }

  /** Toggle the `collapsed` attribute via a ProseMirror transaction. */
  private handleToggleClick(e: MouseEvent): void {
    e.stopPropagation()
    e.preventDefault()

    if (!this.view || !this.getPos) return
    const pos = this.getPos()
    if (pos === undefined) return

    const collapsed = !!this.node.attrs.collapsed
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...this.node.attrs,
        collapsed: !collapsed,
      }),
    )
  }
}
