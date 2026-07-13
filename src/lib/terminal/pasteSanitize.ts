/**
 * Kitty-style sanitize for bracketed paste.
 *
 * When bracketed paste mode is active, the terminal wraps pasted text in
 * `\x1b[200~` … `\x1b[201~` escape sequences so the shell can distinguish
 * pasted input from manual keypresses.
 *
 * A malicious clipboard could embed `\x1b[201~` to prematurely close the
 * wrapper and inject arbitrary escape sequences.  This module strips those
 * sequences before the text reaches xterm.js.
 *
 * Reference — kitty utils.py:1050 `sanitize_for_bracketed_paste`:
 *   pat = re.compile(b'(?:(?:\033\\\x5b)|(?:\x9b))201~')
 */

/** Match CSI 201~ in both 7-bit (`\x1b[201~`) and 8-bit (`\x9b201~`) forms. */
const BRACKETED_PASTE_END_RE = /(?:\x1b\[201~|\x9b201~)/g;

/**
 * Remove any embedded bracketed-paste END sequences from the text.
 *
 * This is a pure safety measure — xterm.js internally replaces bare ESC with
 * U+241B (SYMBOL FOR ESCAPE) inside bracketed paste, but stripping END
 * sequences adds a defence-in-depth layer matching kitty's approach.
 */
export function sanitizeForBracketedPaste(text: string): string {
  return text.replace(BRACKETED_PASTE_END_RE, '');
}

/**
 * Full paste preparation pipeline.
 *
 * 1. Kitty-style sanitise (remove embedded END markers).
 * 2. xterm.js `term.paste()` will then handle the rest:
 *    - detect whether bracketed paste mode is active
 *    - add `\x1b[200~` / `\x1b[201~` wrapper
 *    - replace bare ESC → U+241B inside the payload
 */
export function preparePasteText(text: string): string {
  return sanitizeForBracketedPaste(text);
}
