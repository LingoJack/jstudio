import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type MutableRefObject,
  type ReactNode,
  type Ref,
  type RefCallback,
} from 'react';
import type { EditorCursorTrail } from '../ui/cursor/EditorCursorTrail';

export type NativeCaretHost = HTMLInputElement | HTMLTextAreaElement;

export interface CaretAnchorRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type ContentCaretResolver = () => CaretAnchorRect | null;

interface NativeHostEntry {
  refs: number;
}

interface ContentHostEntry {
  refs: number;
  resolver: ContentCaretResolver;
}

/**
 * Stable registry between React caret hosts and the short-lived WebGL trail.
 *
 * NodeViews may mount before the trail canvas exists, and the trail is rebuilt
 * when the document or animation setting changes. Keeping descriptors here
 * lets attachTrail() replay every mounted host onto the new instance without
 * making each input care about that lifecycle.
 */
export class CursorTrailRegistry {
  private trail: EditorCursorTrail | null = null;
  private nativeHosts = new Map<NativeCaretHost, NativeHostEntry>();
  private contentHosts = new Map<HTMLElement, ContentHostEntry>();
  private nativeBindings = new Map<NativeCaretHost, () => void>();
  private contentBindings = new Map<HTMLElement, () => void>();

  attachTrail(trail: EditorCursorTrail | null) {
    if (trail === this.trail) return;
    this.releaseBindings();
    this.trail = trail;
    if (!trail) return;

    for (const host of this.nativeHosts.keys()) {
      this.bindNativeHost(host);
    }
    for (const [host, entry] of this.contentHosts) {
      this.bindContentHost(host, entry.resolver);
    }
    trail.markDirty();
  }

  registerNativeHost(host: NativeCaretHost): () => void {
    const current = this.nativeHosts.get(host);
    if (current) {
      current.refs++;
    } else {
      this.nativeHosts.set(host, { refs: 1 });
      this.bindNativeHost(host);
    }

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const entry = this.nativeHosts.get(host);
      if (!entry) return;
      entry.refs--;
      if (entry.refs > 0) return;
      this.nativeHosts.delete(host);
      this.nativeBindings.get(host)?.();
      this.nativeBindings.delete(host);
      this.trail?.markDirty();
    };
  }

  registerContentHost(host: HTMLElement, resolver: ContentCaretResolver): () => void {
    const current = this.contentHosts.get(host);
    if (current) {
      current.refs++;
      current.resolver = resolver;
      if (this.trail) {
        this.contentBindings.get(host)?.();
        this.contentBindings.delete(host);
        this.bindContentHost(host, resolver);
      }
    } else {
      this.contentHosts.set(host, { refs: 1, resolver });
      this.bindContentHost(host, resolver);
    }

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const entry = this.contentHosts.get(host);
      if (!entry) return;
      entry.refs--;
      if (entry.refs > 0) return;
      this.contentHosts.delete(host);
      this.contentBindings.get(host)?.();
      this.contentBindings.delete(host);
      this.trail?.markDirty();
    };
  }

  markDirty() {
    this.trail?.markDirty();
  }

  dispose() {
    this.attachTrail(null);
    this.nativeHosts.clear();
    this.contentHosts.clear();
  }

  private bindNativeHost(host: NativeCaretHost) {
    if (!this.trail || this.nativeBindings.has(host)) return;
    this.nativeBindings.set(host, this.trail.registerNativeCaretHost(host));
  }

  private bindContentHost(host: HTMLElement, resolver: ContentCaretResolver) {
    if (!this.trail || this.contentBindings.has(host)) return;
    this.contentBindings.set(host, this.trail.registerContentCaretHost(host, resolver));
  }

  private releaseBindings() {
    for (const dispose of this.nativeBindings.values()) dispose();
    for (const dispose of this.contentBindings.values()) dispose();
    this.nativeBindings.clear();
    this.contentBindings.clear();
  }
}

const CursorTrailContext = createContext<CursorTrailRegistry | null>(null);

export function useCursorTrail(): CursorTrailRegistry | null {
  return useContext(CursorTrailContext);
}

interface CursorTrailProviderProps {
  registry: CursorTrailRegistry;
  children: ReactNode;
}

export function CursorTrailProvider({ registry, children }: CursorTrailProviderProps) {
  return (
    <CursorTrailContext.Provider value={registry}>
      {children}
    </CursorTrailContext.Provider>
  );
}

function setForwardedRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref) {
    (ref as MutableRefObject<T | null>).current = value;
  }
}

/** Register a native text control while preserving an existing business ref. */
export function useCursorTrailHostRef<T extends NativeCaretHost>(
  forwardedRef?: Ref<T>,
): RefCallback<T> {
  const registry = useCursorTrail();
  const unregisterRef = useRef<(() => void) | null>(null);

  const clear = useCallback(() => {
    unregisterRef.current?.();
    unregisterRef.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  return useCallback(
    (host: T | null) => {
      clear();
      setForwardedRef(forwardedRef, host);
      if (host && registry) {
        unregisterRef.current = registry.registerNativeHost(host);
      }
    },
    [clear, forwardedRef, registry],
  );
}
