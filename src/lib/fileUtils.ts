/**
 * Shared file-type utilities.
 *
 * Extracted from FileView to be reusable across components.
 */

/* ------------------------------------------------------------------ */
/* Formatting                                                         */
/* ------------------------------------------------------------------ */

/** Format bytes into a human-readable string (e.g. "1.5 MB"). */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const val = bytes / Math.pow(1024, i);
  return `${i === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[i]}`;
}

/** Extract lowercased file extension from a file name (no dot). */
export function getExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

/* ------------------------------------------------------------------ */
/* MIME type mapping                                                  */
/* ------------------------------------------------------------------ */

/** Common MIME types keyed by file extension. */
const MIME_MAP: Record<string, string> = {
  // HTML / SVG
  html: 'text/html',
  htm: 'text/html',
  svg: 'image/svg+xml',
  // PDF
  pdf: 'application/pdf',
  // DOCX
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // Images
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  // Structured data
  json: 'application/json',
  xml: 'application/xml',
};

/** Get a MIME type from a file extension. Falls back to `application/octet-stream`. */
export function getMimeType(ext: string): string {
  return MIME_MAP[ext.toLowerCase()] || 'application/octet-stream';
}

/* ------------------------------------------------------------------ */
/* Preview category                                                   */
/* ------------------------------------------------------------------ */

/** Category of a file for determining preview behaviour. */
export type PreviewCategory =
  | 'html'
  | 'pdf'
  | 'docx'
  | 'image'
  | 'text'
  | 'other';

/** Text-like extensions that can be previewed as plain text. */
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'csv', 'xml', 'yaml', 'yml',
  'js', 'ts', 'jsx', 'tsx', 'css', 'scss', 'less',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp',
  'cs', 'php', 'sh', 'bash', 'zsh', 'sql', 'graphql', 'toml', 'ini',
  'conf', 'config', 'env', 'log', 'diff', 'dockerfile',
]);

/**
 * Determine the preview category from MIME type and/or file extension.
 *
 * Priority: MIME type → extension → 'other'.
 */
export function getPreviewCategory(
  fileType: string,
  fileName: string,
): PreviewCategory {
  const ext = getExtension(fileName);

  if (fileType === 'text/html' || ext === 'html' || ext === 'htm') return 'html';
  if (fileType === 'image/svg+xml' || ext === 'svg') return 'html';
  if (fileType === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (
    fileType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  )
    return 'docx';
  if (fileType.startsWith('image/')) return 'image';
  if (
    fileType.startsWith('text/') ||
    TEXT_EXTENSIONS.has(ext) ||
    ext === 'dockerfile'
  )
    return 'text';

  return 'other';
}

/** Short uppercase label for a preview category (used in card mode). */
export function getCategoryLabel(category: PreviewCategory): string {
  switch (category) {
    case 'html':
      return 'HTML';
    case 'pdf':
      return 'PDF';
    case 'docx':
      return 'DOCX';
    case 'image':
      return 'IMAGE';
    case 'text':
      return 'TEXT';
    default:
      return 'FILE';
  }
}
