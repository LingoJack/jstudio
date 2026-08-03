import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView, NodeView, ViewMutationRecord } from '@tiptap/pm/view'

/**
 * Returns the CSS property declaration for a <col> element.
 *
 * - When the column has an explicit width (from dragging), sets `width`.
 * - When the column has no explicit width, returns `null` so the column is
 *   truly `auto` and can freely share the remaining table space under
 *   `table-layout: fixed`.
 */
function getColStyleDeclaration(
  minWidth: number,
  width: number | undefined,
): [string, string] | null {
  if (width) {
    return ['width', `${Math.max(width, minWidth)}px`]
  }
  return null
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
        const cssWidth = hasWidth ? `${hasWidth}px` : ''

        totalWidth += hasWidth || cellMinWidth

        if (!hasWidth) {
          fixedWidth = false
        } else {
          hasAnyColwidth = true
        }

        if (!nextDOM) {
          const colElement = document.createElement('col')
          const decl = getColStyleDeclaration(cellMinWidth, hasWidth)
          if (decl) {
            colElement.style.setProperty(decl[0], decl[1])
          }
          colgroup.appendChild(colElement)
        } else {
          const colEl = nextDOM as HTMLTableColElement
          // Always reconcile: clear previous styles, then apply the new one.
          colEl.style.width = ''
          colEl.style.minWidth = ''
          if (cssWidth) {
            colEl.style.width = cssWidth
          }
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
 * right edge to resize the entire table width.
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

  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    _view?: EditorView,
    _HTMLAttributes: Record<string, any> = {},
  ) {
    this.node = node
    this.cellMinWidth = cellMinWidth

    this.dom = document.createElement('div')
    this.dom.className = 'tableWrapper'

    this.table = this.dom.appendChild(document.createElement('table'))

    this.colgroup = this.table.appendChild(document.createElement('colgroup'))
    updateColumns(node, this.colgroup, this.table, cellMinWidth)

    this.contentDOM = this.table.appendChild(document.createElement('tbody'))
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) {
      return false
    }

    this.node = node
    updateColumns(node, this.colgroup, this.table, this.cellMinWidth)
    return true
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
}
