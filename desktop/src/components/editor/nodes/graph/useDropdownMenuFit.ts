/**
 * useDropdownMenuFit - 工具栏下拉菜单展开时：
 * 1. 动态计算 max-height（菜单顶部到 canvas 容器底边的距离），
 *    让菜单在 canvas 内滚动而非溢出被裁剪；
 * 2. 拦截 wheel 事件，防止滚动穿透到外层文档滚动容器（DocumentPanel）。
 *
 * 使用 useLayoutEffect 确保 max-height 在浏览器 paint 前生效，
 * 避免菜单先以完整高度展开再被裁剪的闪烁。
 */

import { useLayoutEffect, useRef } from "react";

export function useDropdownMenuFit(menuOpen: boolean) {
  const menuListRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    const el = menuListRef.current;
    if (!el) return;

    const updateMaxHeight = () => {
      const rect = el.getBoundingClientRect();
      // 以最近的 canvas 容器底边为边界，让菜单在 canvas 内滚动而非溢出
      const canvas = el.closest(".diagram-block-canvas") as HTMLElement | null;
      const boundary = canvas
        ? canvas.getBoundingClientRect().bottom
        : window.innerHeight;
      const available = boundary - rect.top - 12;
      el.style.maxHeight = `${Math.max(80, available)}px`;
    };
    updateMaxHeight();

    const onWheel = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight) return;
      const atTop = scrollTop <= 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
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
