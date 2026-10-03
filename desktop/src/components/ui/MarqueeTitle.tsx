/**
 * MarqueeTitle — seamless dual-copy marquee title.
 *
 * Renders the text twice on an inline-flex track. When the text overflows
 * its host's clip box (the parent element, which must truncate), hovering
 * the title scrolls the track back and forth within the clip — the end of
 * the text flows seamlessly into the start (one loop = exactly one copy +
 * gap). Self-contained: hover-driven via its own pointer events, no
 * ancestor requirements.
 */

import { useRef } from 'react';

export function MarqueeTitle({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const trackRef = useRef<HTMLSpanElement>(null);

  const onPointerEnter = () => {
    const track = trackRef.current;
    if (!track) return;
    const clip = track.parentElement;
    if (!clip) return;
    // First copy only — the track also carries the hidden duplicate, which
    // would over-report overflow for fitting titles.
    const copy = track.querySelector<HTMLElement>('.marquee-copy');
    const overflow = copy
      ? Math.round(copy.getBoundingClientRect().width) - clip.clientWidth
      : 0;
    if (overflow > 2) {
      track.style.setProperty('--marquee-dur', `${Math.max(1.2, overflow / 45)}s`);
      track.classList.add('marquee-active');
    }
  };

  const onPointerLeave = () => {
    trackRef.current?.classList.remove('marquee-active');
  };

  return (
    <span
      ref={trackRef}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={`marquee-title-track ${className ?? ''}`}
    >
      <span className="marquee-copy">{text}</span>
      <span className="marquee-copy" aria-hidden>
        {text}
      </span>
    </span>
  );
}
