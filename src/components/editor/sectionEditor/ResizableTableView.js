function getColStyleDeclaration(minWidth, width) {
  if (width) {
    return ["width", `${Math.max(width, minWidth)}px`];
  }
  return ["min-width", `${minWidth}px`];
}
function updateColumns(node, colgroup, table, cellMinWidth, wrapper) {
  let totalWidth = 0;
  let fixedWidth = true;
  let hasAnyColwidth = false;
  let nextDOM = colgroup.firstChild;
  const row = node.firstChild;
  if (row !== null) {
    for (let i = 0, col = 0; i < row.childCount; i += 1) {
      const { colspan, colwidth } = row.child(i).attrs;
      for (let j = 0; j < colspan; j += 1, col += 1) {
        const hasWidth = colwidth && colwidth[j];
        totalWidth += hasWidth || cellMinWidth;
        if (!hasWidth) {
          fixedWidth = false;
        } else {
          hasAnyColwidth = true;
        }
        if (!nextDOM) {
          const colElement = document.createElement("col");
          const [propertyKey, propertyValue] = getColStyleDeclaration(cellMinWidth, hasWidth);
          colElement.style.setProperty(propertyKey, propertyValue);
          colgroup.appendChild(colElement);
        } else {
          const colEl = nextDOM;
          colEl.style.width = "";
          colEl.style.minWidth = "";
          const [propertyKey, propertyValue] = getColStyleDeclaration(cellMinWidth, hasWidth);
          colEl.style.setProperty(propertyKey, propertyValue);
          nextDOM = colEl.nextSibling;
        }
      }
    }
  }
  while (nextDOM) {
    const after = nextDOM.nextSibling;
    nextDOM.parentNode?.removeChild(nextDOM);
    nextDOM = after;
  }
  const hasUserWidth = node.attrs.style && typeof node.attrs.style === "string" && /\bwidth\s*:/i.test(node.attrs.style);
  if (fixedWidth && !hasUserWidth) {
    table.style.width = `${totalWidth}px`;
    table.style.minWidth = "";
    wrapper.style.width = "fit-content";
    wrapper.style.maxWidth = "100%";
  } else if (!hasAnyColwidth) {
    table.style.width = "100%";
    table.style.minWidth = "";
    wrapper.style.width = "100%";
    wrapper.style.maxWidth = "";
  } else {
    table.style.width = "";
    table.style.minWidth = `${totalWidth}px`;
    wrapper.style.width = "fit-content";
    wrapper.style.maxWidth = "100%";
  }
}
class ResizableTableView {
  node;
  cellMinWidth;
  dom;
  table;
  colgroup;
  contentDOM;
  /** Observes the tbody so we can freeze column widths once ProseMirror has
   *  populated it (the constructor runs before the rows are rendered). */
  resizeObserver = null;
  constructor(node, cellMinWidth, _HTMLAttributes = {}) {
    this.node = node;
    this.cellMinWidth = cellMinWidth;
    this.dom = document.createElement("div");
    this.dom.className = "tableWrapper";
    this.table = this.dom.appendChild(document.createElement("table"));
    this.colgroup = this.table.appendChild(document.createElement("colgroup"));
    updateColumns(node, this.colgroup, this.table, cellMinWidth, this.dom);
    this.contentDOM = this.table.appendChild(document.createElement("tbody"));
    this.syncCollapsed();
    this.resizeObserver = new ResizeObserver(() => {
      if (this.node.attrs.collapsed) {
        const needsFreeze = Array.from(this.colgroup.children).some(
          (col) => col.style.minWidth !== ""
        );
        if (needsFreeze) {
          this.syncCollapsed();
        }
      }
    });
    this.resizeObserver.observe(this.contentDOM);
  }
  update(node) {
    if (node.type !== this.node.type) {
      return false;
    }
    this.node = node;
    updateColumns(node, this.colgroup, this.table, this.cellMinWidth, this.dom);
    this.syncCollapsed();
    return true;
  }
  destroy() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }
  ignoreMutation(mutation) {
    const target = mutation.target;
    const isInsideWrapper = this.dom.contains(target);
    const isInsideContent = this.contentDOM.contains(target);
    if (isInsideWrapper && !isInsideContent) {
      if (mutation.type === "attributes" || mutation.type === "childList" || mutation.type === "characterData") {
        return true;
      }
    }
    return false;
  }
  /**
   * Sync the wrapper's `data-collapsed` attribute (which drives the CSS that
   * hides body rows) with the node's `collapsed` attr, freezing / restoring
   * column widths around the transition so the table doesn't visually jump.
   */
  syncCollapsed() {
    const collapsed = !!this.node.attrs.collapsed;
    const wasCollapsed = this.dom.getAttribute("data-collapsed") === "true";
    if (collapsed) {
      this.freezeColumnWidths();
    } else if (wasCollapsed) {
      updateColumns(this.node, this.colgroup, this.table, this.cellMinWidth, this.dom);
    }
    this.dom.setAttribute("data-collapsed", String(collapsed));
  }
  /**
   * Snapshot the current rendered column widths and write them as explicit
   * `width` on each `<col>` element.  This prevents the browser from
   * recalculating column widths when body rows are hidden via `display:none`.
   *
   * Must be called WHILE all rows are still visible (i.e. before
   * `data-collapsed` is set).
   */
  freezeColumnWidths() {
    const firstRow = this.contentDOM.querySelector("tr");
    if (!firstRow) return;
    const cells = firstRow.querySelectorAll("th, td");
    const cols = Array.from(this.colgroup.children);
    let colIdx = 0;
    for (let i = 0; i < cells.length && colIdx < cols.length; i++) {
      const cell = cells[i];
      const colspan = parseInt(cell.getAttribute("colspan") || "1", 10);
      const cellWidth = cell.offsetWidth;
      for (let j = 0; j < colspan && colIdx < cols.length; j++, colIdx++) {
        const w = colspan > 1 ? Math.floor(cellWidth / colspan) : cellWidth;
        cols[colIdx].style.width = `${w}px`;
        cols[colIdx].style.minWidth = "";
      }
    }
  }
}
export {
  ResizableTableView
};
