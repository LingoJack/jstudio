/**
 * DOCX preview via mammoth.js (lazy-loaded).
 *
 * Extracted from FileView to keep the component focused on rendering.
 */

/**
 * Convert a DOCX data URL to an HTML string using mammoth.js.
 *
 * mammoth is dynamically imported so it only loads when a user actually
 * opens a .docx preview, keeping the initial bundle small.
 */
export async function docxToHtml(dataUrl: string): Promise<string> {
  const mammoth = await import('mammoth/mammoth.browser');
  const base64 = dataUrl.split(',')[1] ?? '';
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const arrayBuffer = bytes.buffer;
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value || '<p style="color:#999;">Empty document</p>';
}
