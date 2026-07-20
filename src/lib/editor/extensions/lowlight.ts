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
// `dockerfile` ships in highlight.js but is NOT part of lowlight's `common`
// bundle — register it so the "Dockerfile" dropdown option actually highlights.
// highlight.js language submodules may or may not carry .d.ts depending on the
// tsconfig in play (`tsc -b` resolves types, `tsc --noEmit` may not), so use a
// self-suppressing dynamic-ish import guard instead of a directive that only one
// mode considers "used".
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- highlight.js language submodules ship without reliable .d.ts
import dockerfile from 'highlight.js/lib/languages/dockerfile';

export const lowlight = createLowlight(common);

lowlight.register('dockerfile', dockerfile);

/**
 * Resolve a stored / selected language value to the grammar we can actually
 * run. Several dropdown options point at grammars that are either useless for
 * the content type or simply absent from this (trimmed) highlight.js install.
 * The badge still shows the user's original choice; only the grammar changes.
 *
 * Groups:
 *   - Session grammars → script grammar: `shell` / `sh` / `zsh` / `console` /
 *     `*-session` should highlight as `bash`, not the terminal-prompt grammar
 *     (which only colours the `$` prompt and leaves scripts plain).
 *   - Missing grammars → nearest real one: `html`→`xml`, `jsx`→`javascript`,
 *     `tsx`→`typescript`, `toml`→`ini` (those files are absent from the install).
 *   - Common runtime aliases: values that imported docs / users may carry
 *     (`yml`, `py`, `ts`, `js`, `node`, `jsonc`, `golang`, …).
 */
export const GRAMMAR_ALIASES: Record<string, string> = {
  // session / shell-family → bash (the real fix for "Shell" looking dead)
  shell: 'bash',
  shell_session: 'bash',
  'shell-session': 'bash',
  sh: 'bash',
  'sh-session': 'bash',
  zsh: 'bash',
  console: 'bash',
  'console-session': 'bash',
  bash_session: 'bash',
  // grammars absent from this trimmed install → nearest registered one
  html: 'xml',
  jsx: 'javascript',
  tsx: 'typescript',
  toml: 'ini',
  // common runtime / import aliases
  yml: 'yaml',
  py: 'python',
  python3: 'python',
  ts: 'typescript',
  js: 'javascript',
  node: 'javascript',
  nodejs: 'javascript',
  jsonc: 'json',
  golang: 'go',
  cpp: 'cpp',
  cs: 'csharp',
  shtml: 'xml',
  xhtml: 'xml',
};

lowlight.highlightAuto = (value: string) =>
  lowlight.highlight('plaintext', value) as ReturnType<typeof lowlight.highlight>;
