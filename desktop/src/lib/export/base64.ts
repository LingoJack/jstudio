/**
 * Base64 helpers for exports — everything a self-contained file carries has
 * to become a data URL first.
 */

/** `btoa()` needs the bytes in chunks: multi-MB fonts overflow the arg limit. */
const BASE64_CHUNK_SIZE = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
}

/** Wrap bytes in a data URL of the given MIME type. */
export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

/** Decode a base64 string (as produced by the main process) back to text. */
export function base64ToText(base64: string): string {
  let binary = '';
  for (let i = 0; i < base64.length; i += BASE64_CHUNK_SIZE) {
    binary += atob(base64.slice(i, i + BASE64_CHUNK_SIZE));
  }
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
