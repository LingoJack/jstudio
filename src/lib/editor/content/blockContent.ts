/**
 * Helper functions for working with the `Block.content` union type.
 */

import type { RichText } from '../../../types/richText';

/**
 * Extract a plain string from a block's `content` field.
 *
 * Media blocks (image, attachment) store their content as a raw string
 * (URL, data URI, or asset path).  This helper safely extracts that string
 * regardless of whether `content` is currently typed as `string` or
 * `RichText[]`.
 *
 * - `string`        → returned as-is
 * - `RichText[]`    → concatenation of all segment `.text` values
 * - `null`/`undefined` → empty string
 */
export function contentToString(
  content: RichText[] | string | null | undefined,
): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((seg) => seg.text).join('');
  return '';
}
