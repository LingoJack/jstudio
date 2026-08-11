import { useEffect } from "react";
const SHIELD_TAGS = /* @__PURE__ */ new Set(["INPUT", "BUTTON", "TEXTAREA", "SELECT"]);
function useHeaderEventShield(headerRef) {
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const isFormControl = (target) => {
      const t = target;
      if (!t) return false;
      return SHIELD_TAGS.has(t.tagName) || !!t.closest("input, textarea, select, button, [role='button']");
    };
    const mousedownShield = (e) => {
      if (isFormControl(e.target)) {
        e.stopPropagation();
        const button = e.target?.closest("button");
        if (button) {
          e.preventDefault();
          button.focus();
        }
      }
    };
    const keydownShield = (e) => {
      if (isFormControl(e.target)) e.stopPropagation();
    };
    const beforeinputShield = (e) => {
      if (isFormControl(e.target)) e.stopPropagation();
    };
    const compositionShield = (e) => {
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
export {
  useHeaderEventShield
};
