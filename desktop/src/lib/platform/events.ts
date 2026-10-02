/**
 * Platform events — the renderer's single event gateway.
 *
 * Backed by the unified main→renderer bus ('jstudio-event'): sidecar
 * notifications (pty-data, agent:*) and main-originated events
 * (native-command, window-close-requested) arrive on the same channel.
 * `emit` round-trips through main and is broadcast to ALL windows —
 * including the sender.
 */

import { native } from './native';

export interface PlatformEvent<T> {
  event: string;
  payload: T;
  /** Emitting manager/window label, when the main process supplied one. */
  label?: string;
}

type Callback<T> = (event: PlatformEvent<T>) => void;
export type UnlistenFn = () => void;

const listeners = new Map<string, Set<Callback<unknown>>>();
let busWired = false;

function ensureBus(): void {
  if (busWired) return;
  busWired = true;
  native().onEvent((event, label, payload) => {
    const set = listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        cb({ event, payload, label });
      } catch (err) {
        console.error(`[platform/events] listener for "${event}" threw:`, err);
      }
    }
  });
}

export async function listen<T>(event: string, cb: Callback<T>): Promise<UnlistenFn> {
  ensureBus();
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
  const fn = cb as Callback<unknown>;
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) listeners.delete(event);
  };
}

export async function once<T>(event: string, cb: Callback<T>): Promise<UnlistenFn> {
  const unlisten = await listen<T>(event, (e) => {
    unlisten();
    cb(e);
  });
  return unlisten;
}

export async function emit(event: string, payload?: unknown): Promise<void> {
  native().emitEvent(event, payload);
}
