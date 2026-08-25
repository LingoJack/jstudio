/**
 * titlebarSlot — module-level registry for the title-bar island slots.
 *
 * Why not just `document.getElementById` + useState: AppTitleBar exports both
 * a component and a constant, so Fast Refresh remounts the whole module on
 * edit — replacing the slot DOM node. A useState-cached element reference
 * then points at a DETACHED node and the portaled content silently
 * vanishes. A callback ref + external store keeps every consumer pointed at
 * the LIVE element across remounts and HMR.
 *
 * Two named slots:
 *   'center' — the tab capsule (DocumentTabs).
 *   'left'   — the sidebar toolbar: search / pin / more (DocumentSidebar).
 */
import { useSyncExternalStore } from 'react';

type SlotName = 'center' | 'left';

const slots: Record<SlotName, HTMLElement | null> = { center: null, left: null };
const listeners = new Set<() => void>();

/** Callback-ref: called with the element on mount, null on unmount. */
export function setTitlebarSlot(name: SlotName, el: HTMLElement | null): void {
  if (slots[name] === el) return;
  slots[name] = el;
  for (const l of listeners) l();
}

function subscribeTitlebarSlot(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getTitlebarCenterSlot = (): HTMLElement | null => slots.center;
export const getTitlebarLeftSlot = (): HTMLElement | null => slots.left;

/** Live element of the center slot (tab capsule), re-renders on change. */
export function useTitlebarCenterSlot(): HTMLElement | null {
  return useSyncExternalStore(subscribeTitlebarSlot, getTitlebarCenterSlot);
}

/** Live element of the left slot (sidebar toolbar), re-renders on change. */
export function useTitlebarLeftSlot(): HTMLElement | null {
  return useSyncExternalStore(subscribeTitlebarSlot, getTitlebarLeftSlot);
}
