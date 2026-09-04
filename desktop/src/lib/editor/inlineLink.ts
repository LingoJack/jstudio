/**
 * Inline link support — shared plumbing for creating/editing/removing inline
 * link marks (FormatBubbleMenu + the inlineLink slash command).
 *
 * Three concerns live here:
 *
 * 1. Slash-command -> bubble routing. The slash command cannot render UI; it
 *    deposits a request slot carrying the editor instance. FormatBubbleMenu's
 *    `shouldShow` peeks the slot (non-consuming) so the bubble shows at the
 *    caret, and `handleShow` consumes it to open the URL input. The slot is
 *    keyed by editor identity, TTL-bound, and overwritten by newer requests.
 *
 * 2. BubbleMenu meta protocol. `BubbleMenuPlugin` reads
 *    `tr.getMeta(this.pluginKey)` and supports the value "hide" (verified in
 *    @tiptap/extension-bubble-menu dist). ProseMirror's PluginKey uniquifies
 *    NAMES (two `new PluginKey('x')` yield `x` and `x$`), so the exact SAME
 *    instance must be passed to `<BubbleMenu pluginKey={...}>` and used for
 *    dispatch — hence this module-level singleton.
 *
 * 3. URL normalization/validation for the inline input. Mirrors LinkView's
 *    "prefix https://" UX and @tiptap/extension-link's isAllowedUri scheme
 *    allowlist. Pre-validation is mandatory for the insert path: it bypasses
 *    setLink's href gate, and the Link mark's renderHTML would silently
 *    render a rejected href as "".
 */

import type { Editor } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";

/** Shared BubbleMenu plugin key — identity matters (see module doc, point 2). */
export const BUBBLE_MENU_PLUGIN_KEY = new PluginKey("formatBubbleMenu");

/** Meta value understood by BubbleMenuPlugin's transactionHandler. */
const BUBBLE_MENU_META_HIDE = "hide";

/** How long an unconsumed slash-insert request stays valid (ms). */
const INLINE_LINK_REQUEST_TTL_MS = 2000;

/** Protocol assumed when the user omits one (matches customLinkAutolink). */
const LINK_DEFAULT_PROTOCOL = "https";

/** Detects any "scheme:" prefix, e.g. "https:", "mailto:", "tel:". */
const URL_HAS_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * Scheme allowlist mirrored from @tiptap/extension-link's isAllowedUri
 * (node_modules/@tiptap/extension-link/dist/index.js). setLink rejects
 * everything else; the inline insert path must apply the same gate.
 */
const LINK_ALLOWED_SCHEMES = new Set([
  "http",
  "https",
  "ftp",
  "ftps",
  "mailto",
  "tel",
  "callto",
  "sms",
  "cid",
  "xmpp",
]);

/** The inline link mark name provided by @tiptap/extension-link. */
const LINK_MARK_NAME = "link";

// ──────────────────────────────────────────────────────────────────
// Slash-command request slot
// ──────────────────────────────────────────────────────────────────

interface InlineLinkRequest {
  editor: Editor;
  issuedAt: number;
}

let pendingRequest: InlineLinkRequest | null = null;

function requestIsFresh(editor: Editor, request: InlineLinkRequest): boolean {
  return (
    request.editor === editor &&
    Date.now() - request.issuedAt < INLINE_LINK_REQUEST_TTL_MS
  );
}

/** Deposit an open-the-URL-input request for `editor` (overwrites prior). */
export function requestInlineLinkInput(editor: Editor): void {
  pendingRequest = { editor, issuedAt: Date.now() };
}

/** Non-consuming check used by FormatBubbleMenu's shouldShow. */
export function peekInlineLinkRequest(editor: Editor): boolean {
  return pendingRequest !== null && requestIsFresh(editor, pendingRequest);
}

/** Consuming check used by FormatBubbleMenu's handleShow. */
export function takeInlineLinkRequest(editor: Editor): boolean {
  if (pendingRequest === null) return false;
  if (requestIsFresh(editor, pendingRequest)) {
    pendingRequest = null;
    return true;
  }
  // Expired requests are useless to everyone — drop them. A fresh request
  // for a DIFFERENT editor stays (its own bubble will consume it).
  if (Date.now() - pendingRequest.issuedAt >= INLINE_LINK_REQUEST_TTL_MS) {
    pendingRequest = null;
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────
// BubbleMenu meta protocol
// ──────────────────────────────────────────────────────────────────

/** Force-hide the bubble menu via the plugin's meta protocol (no-op safe). */
export function hideBubbleMenu(editor: Editor): void {
  const tr = editor.state.tr.setMeta(
    BUBBLE_MENU_PLUGIN_KEY,
    BUBBLE_MENU_META_HIDE,
  );
  editor.view.dispatch(tr);
}

// ──────────────────────────────────────────────────────────────────
// URL normalization / validation
// ──────────────────────────────────────────────────────────────────

/**
 * Trim and normalize a user-entered URL. Returns null for empty input
 * (meaning "cancel"). Adds https:// when no scheme is present.
 */
export function normalizeLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (URL_HAS_SCHEME_RE.test(trimmed)) return trimmed;
  return `${LINK_DEFAULT_PROTOCOL}://${trimmed}`;
}

/** Scheme allowlist check (the gate @tiptap/extension-link applies). */
export function isAllowedLinkHref(url: string): boolean {
  const scheme = url.slice(0, url.indexOf(":")).toLowerCase();
  return LINK_ALLOWED_SCHEMES.has(scheme);
}

// ──────────────────────────────────────────────────────────────────
// Mark inspection
// ──────────────────────────────────────────────────────────────────

/** First link mark href within the selection, or null. Used to prefill. */
export function findLinkHrefInRange(state: EditorState): string | null {
  const { from, to } = state.selection;
  let href: string | null = null;
  state.doc.nodesBetween(from, to, (node) => {
    const linkMark = node.marks.find(
      (mark) => mark.type.name === LINK_MARK_NAME,
    );
    if (linkMark) {
      href =
        typeof linkMark.attrs.href === "string" ? linkMark.attrs.href : null;
      return false;
    }
    return true;
  });
  return href;
}
