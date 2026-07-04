/**
 * Lowlight instance — register common languages for syntax highlighting.
 *
 * Performance note:
 *   When a code block has no `language` attribute (e.g. created via /code
 *   slash command), CodeBlockLowlight falls back to `lowlight.highlightAuto()`,
 *   which synchronously tries every registered grammar (37 languages) to
 *   "guess" the language.  This is the #1 cause of cursor lag when pressing
 *   Enter inside code blocks.
 *
 *   Two mitigations:
 *     1. defaultLanguage: 'plaintext' — tells CodeBlockLowlight to use the
 *        near-zero-cost `highlight('plaintext', …)` path instead of
 *        highlightAuto for untyped code blocks.
 *     2. Override `highlightAuto` on our lowlight instance as a safety net
 *        so any other caller also takes the fast plaintext path instead of
 *        the expensive auto-detection.
 */

import { createLowlight, common } from 'lowlight';

export const lowlight = createLowlight(common);
lowlight.highlightAuto = (value: string) =>
  lowlight.highlight('plaintext', value) as ReturnType<typeof lowlight.highlight>;
