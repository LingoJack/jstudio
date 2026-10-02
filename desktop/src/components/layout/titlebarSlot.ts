/**
 * titlebarSlot — module-level registries for title-bar slot elements.
 *
 * Why not just `document.getElementById` + useState: AppTitleBar exports both
 * a component and a constant, so Fast Refresh remounts the whole module on
 * edit — replacing the slot DOM node. A useState-cached element reference
 * then points at a DETACHED node and the portaled content silently vanishes.
 * A callback ref + external store keeps every consumer pointed at the LIVE
 * element across remounts and HMR.
 */
import { useSyncExternalStore } from 'react';

interface SlotRegistry {
  set: (el: HTMLElement | null) => void;
  use: () => HTMLElement | null;
}

function createSlotRegistry(): SlotRegistry {
  let el: HTMLElement | null = null;
  const listeners = new Set<() => void>();
  return {
    set(next) {
      if (el === next) return;
      el = next;
      for (const l of listeners) l();
    },
    use() {
      return useSyncExternalStore(
        (listener) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        () => el,
      );
    },
  };
}

const centerSlot = createSlotRegistry();
const leftSlot = createSlotRegistry();

/** Callback-ref: called with the element on mount, null on unmount. */
export const setTitlebarSlot = centerSlot.set;
export const setTitlebarLeftSlot = leftSlot.set;

/** Live element of the title-bar center slot (tab capsule). */
export function useTitlebarCenterSlot(): HTMLElement | null {
  return centerSlot.use();
}

/** Live element of the title-bar left slot (sidebar header actions). */
export function useTitlebarLeftSlot(): HTMLElement | null {
  return leftSlot.use();
}
