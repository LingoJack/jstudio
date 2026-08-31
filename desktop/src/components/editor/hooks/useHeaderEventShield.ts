/**
 * useHeaderEventShield - stops ProseMirror from intercepting native events
 * that originate inside the code-block header (form controls like the
 * language dropdown, title input, action buttons).
 *
 * The header does NOT use `contentEditable={false}` (WKWebView blocks
 * keyboard input to `<input>` inside such "non-editable islands"), so these
 * bubble-phase listeners are the mechanism that keeps form-control events
 * from reaching ProseMirror. Identical pattern to CollapsibleView.
 *
 * Usage
 * -----
 *   const headerRef = useRef<HTMLDivElement | null>(null);
 *   useHeaderEventShield(headerRef);
 *   return <div ref={headerRef} className="code-block-header">...</div>;
 */

import { type RefObject, useEffect } from "react";

/**
 * Tags that should be shielded from ProseMirror's event interception.
 * (Mirrors CollapsibleView - see the header comment there for why
 * contentEditable={false} is NOT used on the code-block-header.)
 */
const SHIELD_TAGS = new Set(["INPUT", "BUTTON", "TEXTAREA", "SELECT"]);

export function useHeaderEventShield(
  headerRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const isFormControl = (target: EventTarget | null): boolean => {
      const t = target as HTMLElement | null;
      if (!t) return false;
      // Includes [role="button"] to cover the language badge (a div with
      // role="button" rather than a real <button> element).
      return (
        SHIELD_TAGS.has(t.tagName) ||
        !!t.closest("input, textarea, select, button, [role='button']")
      );
    };

    const mousedownShield = (e: MouseEvent) => {
      if (isFormControl(e.target)) {
        e.stopPropagation();
        const button = (e.target as HTMLElement | null)?.closest("button");
        if (button) {
          e.preventDefault();
          button.focus();
        }
      }
    };
    const keydownShield = (e: KeyboardEvent) => {
      if (isFormControl(e.target)) e.stopPropagation();
    };
    const beforeinputShield = (e: InputEvent) => {
      if (isFormControl(e.target)) e.stopPropagation();
    };
    const compositionShield = (e: CompositionEvent) => {
      if (isFormControl(e.target)) e.stopPropagation();
    };

    el.addEventListener("mousedown", mousedownShield);
    el.addEventListener("keydown", keydownShield);
    el.addEventListener("beforeinput", beforeinputShield);
    el.addEventListener("compositionstart", compositionShield);
    el.addEventListener("compositionupdate", compositionShield);
    el.addEventListener("compositionend", compositionShield);
    return () => {
      el.removeEventListener("mousedown", mousedownShield);
      el.removeEventListener("keydown", keydownShield);
      el.removeEventListener("beforeinput", beforeinputShield);
      el.removeEventListener("compositionstart", compositionShield);
      el.removeEventListener("compositionupdate", compositionShield);
      el.removeEventListener("compositionend", compositionShield);
    };
  }, [headerRef]);
}
