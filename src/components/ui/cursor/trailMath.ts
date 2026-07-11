/** Pure helpers shared by the cursor-trail renderers (no `this` dependency). */

/** First Unicode code point of a string (surrogate-pair aware), or ''. */
export function firstCodePoint(s: string): string {
  if (!s) return '';
  const cp = s.codePointAt(0);
  return cp === undefined ? '' : String.fromCodePoint(cp);
}

/** Last Unicode code point of a string (surrogate-pair aware), or ''. */
export function lastCodePoint(s: string): string {
  const len = s.length;
  if (len === 0) return '';
  const last = s.charCodeAt(len - 1);
  if (len >= 2 && last >= 0xdc00 && last <= 0xdfff) return s.slice(len - 2);
  return s.slice(len - 1);
}

/** Append a text span to a parent element and return it. */
export function appendSpan(parent: HTMLElement, text: string): HTMLSpanElement {
  const s = document.createElement('span');
  s.textContent = text;
  parent.appendChild(s);
  return s;
}
