import { useEffect, useRef, memo } from 'react';

/**
 * Convert a perimeter distance (0-based, clockwise from top-left)
 * to an (x, y) point on the rectangle's border.
 */
function perimeterToXY(
  pos: number,
  w: number,
  h: number,
): [number, number] {
  if (pos < w) return [pos, 0]; // top
  if (pos < w + h) return [w, pos - w]; // right
  if (pos < 2 * w + h) return [w - (pos - w - h), h]; // bottom
  return [0, h - (pos - 2 * w - h)]; // left
}

interface PaneGlowProps {
  /** Base color as [r, g, b]. */
  rgb: [number, number, number];
}

/**
 * PaneGlow — canvas overlay that paints an animated, organic glow
 * along the pane's edges.  A soft static gradient border provides
 * a persistent base; multiple glow anchors travel around the
 * perimeter, pulsing and flickering via layered sine waves to
 * produce a living, flame-like shimmer.
 */
function PaneGlowImpl({ rgb }: PaneGlowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let needsResize = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      if (w === 0 || h === 0) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const ro = new ResizeObserver(() => {
      needsResize = true;
    });
    ro.observe(canvas);

    let raf = 0;
    let t = 0;

    const ANCHORS = 18;
    const phaseA: number[] = [];
    const phaseB: number[] = [];
    const speedMul: number[] = [];
    for (let i = 0; i < ANCHORS; i++) {
      phaseA[i] = i * 1.713 + Math.random() * 0.5;
      phaseB[i] = i * 3.091 + Math.random() * 0.5;
      speedMul[i] = 0.7 + Math.random() * 0.6;
    }

    const draw = () => {
      raf = requestAnimationFrame(draw);

      if (needsResize) {
        resize();
        needsResize = false;
      }
      if (w === 0 || h === 0) return;

      t += 0.012;

      ctx.clearRect(0, 0, w, h);

      const perim = 2 * (w + h);
      const [r, g, b] = rgb;

      // ── Layer 1: Static gradient border (always-visible base) ──────
      //
      // Draw 4 thick strokes, one per edge, each with a gradient
      // fading from the color at the edge toward transparent inward.
      // This gives a persistent ~20px glow band on all four sides.
      ctx.globalCompositeOperation = 'source-over';

      const BW = 22; // glow band width

      // Top
      let grad = ctx.createLinearGradient(0, 0, 0, BW);
      grad.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, BW);

      // Bottom
      grad = ctx.createLinearGradient(0, h - BW, 0, h);
      grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0.5)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, h - BW, w, BW);

      // Left
      grad = ctx.createLinearGradient(0, 0, BW, 0);
      grad.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, BW, h);

      // Right
      grad = ctx.createLinearGradient(w - BW, 0, w, 0);
      grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0.5)`);
      ctx.fillStyle = grad;
      ctx.fillRect(w - BW, 0, BW, h);

      // ── Layer 2: Animated traveling glow anchors ──────────────────
      ctx.globalCompositeOperation = 'lighter';

      // Slow global breathing.
      const breathe = 0.75 + 0.25 * Math.sin(t * 0.5);

      for (let i = 0; i < ANCHORS; i++) {
        const basePos = (i / ANCHORS) * perim;
        const drift =
          35 * speedMul[i] * t +
          12 * Math.sin(t * 0.4 + phaseB[i]);
        const pos = ((basePos + drift) % perim + perim) % perim;

        const [cx, cy] = perimeterToXY(pos, w, h);

        const flicker =
          0.4 +
          0.3 * Math.sin(t * (1.8 + speedMul[i]) + phaseA[i]) +
          0.2 * Math.sin(t * (4.1 + speedMul[i] * 0.5) + phaseB[i]) +
          0.1 * Math.sin(t * 7.3 + phaseA[i] * 2);
        const intensity = Math.max(0.15, flicker * breathe);

        const radius = 40 + 20 * Math.sin(t * 1.3 + phaseA[i]);

        const ag = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        ag.addColorStop(0, `rgba(${r},${g},${b},${0.45 * intensity})`);
        ag.addColorStop(0.4, `rgba(${r},${g},${b},${0.2 * intensity})`);
        ag.addColorStop(1, `rgba(${r},${g},${b},0)`);

        ctx.fillStyle = ag;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      }

      ctx.globalCompositeOperation = 'source-over';
    };

    draw();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [rgb]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
    />
  );
}

const PaneGlow = memo(PaneGlowImpl);
export default PaneGlow;
