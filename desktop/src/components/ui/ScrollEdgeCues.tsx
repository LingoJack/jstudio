/**
 * ScrollEdgeCues — edge light cues for scrollable panels (目录树 / 大纲).
 *
 * Replaces the native scrollbar: when content extends above / below the
 * viewport, a subtle fade gradient and a small chevron appear at that
 * edge ("还有内容" 的表意). Purely visual (pointer-events: none). Render
 * as a SIBLING of the scroll container inside a `relative` parent — the
 * cues overlay the container's visible area without scrolling with it.
 */

import { useEffect, useState, type RefObject } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export function ScrollEdgeCues({
  scrollRef,
  /** Panel background color — the fade melts into it. */
  fadeFrom,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  fadeFrom: string;
}) {
  const [cue, setCue] = useState({ up: false, down: false });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setCue({
        up: el.scrollTop > 4,
        down: el.scrollTop < el.scrollHeight - el.clientHeight - 4,
      });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [scrollRef]);

  if (!cue.up && !cue.down) return null;

  return (
    <>
      {cue.up && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-1"
          style={{
            height: 28,
            background: `linear-gradient(to bottom, ${fadeFrom} 25%, transparent)`,
          }}
        >
          <ChevronUp
            className="w-3.5 h-3.5"
            style={{
              color: 'var(--jstudio-indicator-ink, var(--vscode-descriptionForeground))',
              opacity: 0.45,
              filter: 'drop-shadow(0 0 4px color-mix(in srgb, var(--jstudio-indicator-ink, #00b8d9) 45%, transparent))',
            }}
          />
        </div>
      )}
      {cue.down && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-1"
          style={{
            height: 28,
            background: `linear-gradient(to top, ${fadeFrom} 25%, transparent)`,
          }}
        >
          <ChevronDown
            className="w-3.5 h-3.5"
            style={{
              color: 'var(--jstudio-indicator-ink, var(--vscode-descriptionForeground))',
              opacity: 0.45,
              filter: 'drop-shadow(0 0 4px color-mix(in srgb, var(--jstudio-indicator-ink, #00b8d9) 45%, transparent))',
            }}
          />
        </div>
      )}
    </>
  );
}
