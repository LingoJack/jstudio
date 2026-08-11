import { useEffect } from "react";
function useCmdEnterConfirm(callback, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.altKey || e.shiftKey) return;
      if (e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();
      callback();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [callback, enabled]);
}
export {
  useCmdEnterConfirm
};
