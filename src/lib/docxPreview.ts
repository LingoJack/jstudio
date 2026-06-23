/**
 * DOCX preview via mammoth.js (lazy-loaded).
 *
 * Extracted from FileView to keep the component focused on rendering.
 */

/**
 * Convert a DOCX URL (asset-protocol or data URL) to an HTML string using
 * mammoth.js.
 *
 * mammoth is dynamically imported so it only loads when a user actually
 * opens a .docx preview, keeping the initial bundle small.
 */
export async function docxToHtml(src: string): Promise<string> {
  const mammoth = await import('mammoth/mammoth.browser');
  const arrayBuffer = await (await fetch(src)).arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value || '<p style="color:#999;">Empty document</p>';
}
