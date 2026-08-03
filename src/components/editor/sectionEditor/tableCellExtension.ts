/**
 * Custom TableCell & TableHeader extensions that add a `vAlign` attribute
 * for vertical alignment (top / middle / bottom).
 *
 * The attribute renders as an inline `vertical-align` CSS style on the
 * `<td>` / `<th>` element, which overrides the default `vertical-align: top`
 * set in the stylesheet (no `!important` on that rule).
 *
 * Use `editor.commands.setCellAttribute('vAlign', 'middle')` to apply it.
 * This works for both single-cursor (sets on the containing cell) and
 * multi-cell selection (sets on all selected cells).
 */

import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';

/** Supported vertical-align values. */
export type VerticalAlign = 'top' | 'middle' | 'bottom';

/** Normalize an unknown value into a valid VerticalAlign or null. */
function normalizeVerticalAlign(value: unknown): VerticalAlign | null {
  if (value === 'top' || value === 'middle' || value === 'bottom') {
    return value;
  }
  return null;
}

/**
 * Shared TipTap attribute configuration for vertical alignment.
 *
 * - `parseHTML`: reads the inline `vertical-align` style from the DOM element.
 * - `renderHTML`: emits `{ style: 'vertical-align: <value>' }` so TipTap's
 *   `mergeAttributes` concatenates it with any `text-align` style from the
 *   `align` attribute.
 */
function createVAlignAttribute() {
  return {
    default: null as VerticalAlign | null,
    parseHTML: (element: HTMLElement) =>
      normalizeVerticalAlign(
        (element.style.verticalAlign || '').trim().toLowerCase(),
      ),
    renderHTML: (attributes: { vAlign?: VerticalAlign | null }) => {
      if (!attributes.vAlign) return {};
      return { style: `vertical-align: ${attributes.vAlign}` };
    },
  };
}

/** TableCell with an added `vAlign` attribute. */
export const TableCellWithVAlign = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      vAlign: createVAlignAttribute(),
    };
  },
});

/** TableHeader with an added `vAlign` attribute. */
export const TableHeaderWithVAlign = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      vAlign: createVAlignAttribute(),
    };
  },
});
