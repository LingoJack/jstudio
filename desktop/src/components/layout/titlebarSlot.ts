/**
 * titlebarSlot — module-level registry for the title-bar center slot element.
 *
 * Why not just `document.getElementById` + useState: AppTitleBar exports both
 * a component and a constant, so Fast Refresh remounts the whole module on
 * edit — replacing the slot DOM node. A useState-cached element reference
 * then points at a DETACHED node and the portaled tab capsule silently
 * vanishes. A callback ref + external store keeps every consumer pointed at
 * the LIVE element across remounts and HMR.
 */
import { useSyncExternalStore } from 'react';

let slotEl: HTMLElement | null = null;
const listeners = new Set<() => void>();

/** Callback-ref: called with the element on mount, null on unmount. */
export function setTitlebarSlot(el: HTMLElement | null): void {
  if (slotEl === el) return;
  slotEl = el;
  for (const l of listeners) l();
}

function subscribeTitlebarSlot(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = (): HTMLElement | null => slotEl;

/** Live element of the title-bar center slot (tab capsule). */
export function useTitlebarCenterSlot(): HTMLElement | null {
  return useSyncExternalStore(subscribeTitlebarSlot, getSnapshot);
}
