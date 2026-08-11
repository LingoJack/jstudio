import { useLayoutEffect, useRef } from "react";
function useDropdownMenuFit(menuOpen) {
  const menuListRef = useRef(null);
  useLayoutEffect(() => {
    if (!menuOpen) return;
    const el = menuListRef.current;
    if (!el) return;
    const updateMaxHeight = () => {
      const rect = el.getBoundingClientRect();
      const canvas = el.closest(".diagram-block-canvas");
      const boundary = canvas ? canvas.getBoundingClientRect().bottom : window.innerHeight;
      const available = boundary - rect.top - 12;
      el.style.maxHeight = `${Math.max(80, available)}px`;
    };
    updateMaxHeight();
    const onWheel = (e) => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight) return;
      const atTop = scrollTop <= 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
      if (atTop && e.deltaY < 0 || atBottom && e.deltaY > 0) {
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", updateMaxHeight);
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", updateMaxHeight);
      el.style.maxHeight = "";
    };
  }, [menuOpen]);
  return menuListRef;
}
export {
  useDropdownMenuFit
};
