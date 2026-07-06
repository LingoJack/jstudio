/**
 * CursorTrailContext — provides access to the EditorCursorTrail instance
 * for NodeViews that need to register their <input> elements.
 *
 * Why: NodeViews like CollapsibleView have native <input> elements that need
 * their caret measured by the GPU cursor trail system. Selection API cannot
 * read caret positions inside native inputs, so they must be registered with
 * the trail (which uses a mirror element for measurement).
 */

import { createContext, useContext, useCallback, useRef, type RefObject } from 'react';
import type { EditorCursorTrail } from '../ui/cursor/EditorCursorTrail';

interface CursorTrailContextValue {
  /** Register an input element for caret measurement. Returns an unregister function. */
  registerInput: (el: HTMLInputElement) => () => void;
  /** Force re-measurement of caret position. */
  markDirty: () => void;
}

const CursorTrailContext = createContext<CursorTrailContextValue | null>(null);

export function useCursorTrail(): CursorTrailContextValue | null {
  return useContext(CursorTrailContext);
}

interface CursorTrailProviderProps {
  trailRef: RefObject<EditorCursorTrail | null>;
  children: React.ReactNode;
}

export function CursorTrailProvider({ trailRef, children }: CursorTrailProviderProps) {
  const registerInput = useCallback((el: HTMLInputElement) => {
    const trail = trailRef.current;
    if (!trail) return () => {};
    return trail.registerInputEl(el);
  }, [trailRef]);

  const markDirty = useCallback(() => {
    trailRef.current?.markDirty();
  }, [trailRef]);

  return (
    <CursorTrailContext.Provider value={{ registerInput, markDirty }}>
      {children}
    </CursorTrailContext.Provider>
  );
}