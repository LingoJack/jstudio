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
 * Updates <col> elements in the colgroup and manages the table + wrapper width.
 *
 * Width strategy (the key difference from TipTap's built-in TableView):
 * - **No columns resized** -> table `width: 100%`, wrapper `width: 100%` so new
 *   tables fill the container. The wrapper is `100%` (of the editor content
 *   area, a determinate size) – NOT `fit-content` – so the table's `100%`
 *   resolves without a circular dependency.
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
  } else if (!hasAnyColwidth) {
    // No columns have been resized -> fill the container. Wrapper is `100%`
    // (a determinate size) so the table's `width: 100%` resolves without a
    // circular dependency on the wrapper's own shrink-to-fit width.
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
