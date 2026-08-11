import { useEffect, useState } from "react";
const FALLBACK_WIDTH = 800;
function getContentWidth(el) {
  const style = getComputedStyle(el);
  const padLeft = parseFloat(style.paddingLeft) || 0;
  const padRight = parseFloat(style.paddingRight) || 0;
  return Math.round(el.clientWidth - padLeft - padRight);
}
function useEditorWidth() {
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useEffect(() => {
    const surface = document.querySelector(".ProseMirror");
    if (!surface) {
      setWidth(FALLBACK_WIDTH);
      return;
    }
    setWidth(getContentWidth(surface));
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const w = Math.round(entry.contentRect.width);
        if (w > 0) setWidth(w);
      }
    });
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);
  return width;
}
export {
  useEditorWidth
};
