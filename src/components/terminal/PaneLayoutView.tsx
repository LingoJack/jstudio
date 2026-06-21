import {
  useRef,
  useEffect,
  useMemo,
  useCallback,
  type CSSProperties,
} from 'react';
import { useStore } from '../../store/useStore';
import { storage } from '../../lib/storage';
import { getTerminalTheme } from '../../lib/terminalThemes';
import { useTerminalManager } from './useTerminalManager';
import CursorTrail from './CursorTrail';
import type { PaneLayoutType, PaneResizeState } from './types';

/**
 * xterm.js exposes `cursorHidden` at runtime but not in `ITerminalOptions`.
 * Extend the type locally so we can toggle cursor visibility per pane.
 */
type TerminalOptionsWithCursorHidden = import('@xterm/xterm').ITerminalOptions & {
  cursorHidden?: boolean;
};

// ────────────────────────────────────────────────
// Layout geometry
// ────────────────────────────────────────────────

interface LayoutPlan {
  /** Layout identifier. */
  kind: string;
  containerCls: string;
  containerStyle: CSSProperties;
  columns: number[];
  rows: number[];
  /** Per-pane inline styles (grid-column / grid-row placement, etc.). */
  cells: CSSProperties[];
}

type ResizeAxis = 'column' | 'row';

const GRID_GAP_PX = 1;
const MIN_TRACK_PX = 80;

/**
 * Compute a Kitty-style pane layout using CSS Grid.
 *
 * Every multi-pane layout (tall / fat / grid / horizontal / vertical)
 * is expressed as a single CSS Grid with explicit `grid-column` /
 * `grid-row` placement for each cell.  This avoids empty cells and
 * produces proper master+stack nesting (the hallmark of Kitty's
 * window layouts).
 *
 * Visual reference (n = number of panes):
 *
 *   tall (master left + right stack)
 *     n=2  ┌─────┬───┐    n=3  ┌─────┬───┐
 *          │  0  │ 1 │         │     │ 1 │
 *          └─────┴───┘         │  0  ├───┤
 *                              │     │ 2 │
 *                              └─────┴───┘
 *
 *   fat (master top + bottom row)
 *     n=2  ┌───────┐      n=3  ┌───────────┐
 *          │   0   │           │     0     │
 *          ├───────┤           ├─────┬─────┤
 *          │   1   │           │  1  │  2  │
 *          └───────┘           └─────┴─────┘
 *
 *   grid (best-fit, no empty cells)
 *     n=3  ┌───┬───┐    n=5  ┌───┬───┬───┐
 *          │ 0 │ 1 │         │ 0 │ 1 │ 2 │
 *          ├───┴───┤         ├───┼───┴───┤
 *          │   2   │         │ 3 │   4   │
 *          └───────┘         └───┴───────┘
 */
function computeLayout(layout: PaneLayoutType, n: number): LayoutPlan {
  // ── Single pane ──
  if (n <= 1) {
    return {
      kind: 'single',
      containerCls: 'w-full h-full',
      containerStyle: {},
      columns: [1],
      rows: [1],
      cells: [{ width: '100%', height: '100%' }],
    };
  }

  // ── All multi-pane layouts use CSS Grid ──

  switch (layout) {
    case 'horizontal':
      return {
        kind: 'horizontal',
        containerCls: 'w-full h-full grid',
        containerStyle: {
          gap: '1px',
        },
        columns: Array.from({ length: n }, () => 1),
        rows: [1],
        cells: Array.from({ length: n }, () => ({ minWidth: 0, minHeight: 0 })),
      };

    case 'vertical':
      return {
        kind: 'vertical',
        containerCls: 'w-full h-full grid',
        containerStyle: {
          gap: '1px',
        },
        columns: [1],
        rows: Array.from({ length: n }, () => 1),
        cells: Array.from({ length: n }, () => ({ minWidth: 0, minHeight: 0 })),
      };

    // ── Tall: master left (full height) + vertical stack on right ──
    case 'tall': {
      const stackRows = n - 1; // panes in the right column
      const cells: CSSProperties[] = [
        { gridColumn: '1', gridRow: `1 / span ${stackRows}` },
      ];
      for (let i = 0; i < stackRows; i++) {
        cells.push({ gridColumn: '2', gridRow: `${i + 1}` });
      }
      return {
        kind: 'tall',
        containerCls: 'w-full h-full grid',
        containerStyle: {
          gap: '1px',
        },
        columns: [1.5, 1],
        rows: Array.from({ length: stackRows }, () => 1),
        cells,
      };
    }

    // ── Fat: master top (full width) + horizontal row on bottom ──
    case 'fat': {
      const stackCols = n - 1; // panes in the bottom row
      const cells: CSSProperties[] = [
        { gridRow: '1', gridColumn: `1 / span ${stackCols}` },
      ];
      for (let i = 0; i < stackCols; i++) {
        cells.push({ gridRow: '2', gridColumn: `${i + 1}` });
      }
      return {
        kind: 'fat',
        containerCls: 'w-full h-full grid',
        containerStyle: {
          gap: '1px',
        },
        columns: Array.from({ length: stackCols }, () => 1),
        rows: [1.5, 1],
        cells,
      };
    }

    // ── Grid: best-fit square grid, last partial row stretches ──
    case 'grid':
    default: {
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      const remainder = n % cols; // panes in last partial row (0 = perfect)

      const cells: CSSProperties[] = [];
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / cols);
        const posInRow = i % cols;
        const isLastRow = row === rows - 1;
        const lastRowCount = remainder === 0 ? cols : remainder;
        const isLastInPartialRow =
          isLastRow && remainder > 0 && posInRow === lastRowCount - 1;

        if (isLastInPartialRow) {
          // Stretch the final item in a partial row to fill all remaining columns
          cells.push({
            gridRow: `${row + 1}`,
            gridColumn: `${posInRow + 1} / ${cols + 1}`,
          });
        } else {
          cells.push({ gridRow: `${row + 1}`, gridColumn: `${posInRow + 1}` });
        }
      }

      return {
        kind: 'grid',
        containerCls: 'w-full h-full grid',
        containerStyle: {
          gap: '1px',
        },
        columns: Array.from({ length: cols }, () => 1),
        rows: Array.from({ length: rows }, () => 1),
        cells,
      };
    }
  }
}

function tracksToTemplate(tracks: number[]): string {
  return tracks.map((value) => `${value}fr`).join(' ');
}

function canUseResizeState(
  state: PaneResizeState | undefined,
  layout: PaneLayoutType,
  sessionKey: string,
  columns: number[],
  rows: number[],
): state is PaneResizeState {
  if (!state || state.layout !== layout || state.sessionKey !== sessionKey) {
    return false;
  }
  if (state.columns && state.columns.length !== columns.length) return false;
  if (state.rows && state.rows.length !== rows.length) return false;
  return true;
}

function trackBoundaries(tracks: number[]): number[] {
  const total = tracks.reduce((sum, value) => sum + value, 0);
  let acc = 0;
  return tracks.slice(0, -1).map((value) => {
    acc += value;
    return (acc / total) * 100;
  });
}

function resizeAdjacentTracks(
  tracks: number[],
  index: number,
  deltaPx: number,
  containerPx: number,
): number[] {
  if (containerPx <= 0) return tracks;

  const next = [...tracks];
  const total = tracks.reduce((sum, value) => sum + value, 0);
  const pairTotal = tracks[index] + tracks[index + 1];
  const minTrack = Math.min(pairTotal / 2, (MIN_TRACK_PX / containerPx) * total);
  const deltaFr = (deltaPx / containerPx) * total;

  const first = Math.max(
    minTrack,
    Math.min(pairTotal - minTrack, tracks[index] + deltaFr),
  );

  next[index] = first;
  next[index + 1] = pairTotal - first;
  return next;
}

// ────────────────────────────────────────────────
// PaneLayoutView
// ────────────────────────────────────────────────

export interface PaneLayoutViewProps {
  sessionIds: string[];
  activeSessionId: string;
  layout: PaneLayoutType;
  /** True when the terminal panel is visually hidden (e.g. Settings open).
   *  When this transitions from true → false, all terminals are refitted
   *  because their container had zero size while hidden. */
  hidden?: boolean;
}

export default function PaneLayoutView({
  sessionIds,
  activeSessionId,
  layout,
  hidden = false,
}: PaneLayoutViewProps) {
  const terminalThemeIdDark = useStore((s) => s.terminalThemeIdDark);
  const terminalThemeIdLight = useStore((s) => s.terminalThemeIdLight);
  const isDarkMode = useStore((s) => s.isDarkMode);
  const terminalFontId = useStore((s) => s.terminalFontId);
  const terminalFontSize = useStore((s) => s.terminalFontSize);
  const terminalCursorStyle = useStore((s) => s.terminalCursorStyle);
  const setActivePane = useStore((s) => s.setActivePane);

  const theme = getTerminalTheme(isDarkMode ? terminalThemeIdDark : terminalThemeIdLight);

  const { terminalsRef, setupTerminal, destroyTerminal, destroyAll, tryEnableWebgl } =
    useTerminalManager(terminalFontId, terminalFontSize, terminalCursorStyle);

  /** Map: sessionId → pane DOM element. */
  const paneElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  /** Track which sessions have been fully initialized. */
  const initializedRef = useRef<Set<string>>(new Set());

  // ── Shared overlay canvas for cursor trail ──
  const overlayRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<CursorTrail | null>(null);

  /** Create the shared trail once. */
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    let canvas = overlay.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      canvas = document.createElement('canvas');
      Object.assign(canvas.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      } as CSSStyleDeclaration);
      overlay.appendChild(canvas);
    }

    try {
      trailRef.current = new CursorTrail(canvas, theme.cursor, terminalCursorStyle);
      trailRef.current.resize();
      trailRef.current.start();
    } catch {
      trailRef.current = null;
    }

    return () => {
      trailRef.current?.dispose();
      trailRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Resize overlay canvas when container size changes. */
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ro = new ResizeObserver(() => {
      trailRef.current?.resize();
    });
    ro.observe(overlay);
    return () => ro.disconnect();
  }, []);

  // ════════════════════════════════════════════════════════════════
  // Effect 1: Terminal mount / layout
  //
  // This effect ONLY cares about:
  //   - Which sessions exist (sessionIds)
  //   - How they're arranged (layout)
  //
  // It does NOT depend on activeSessionId.  Switching pane focus
  // should NOT re-trigger terminal mounting or refitting.
  // ════════════════════════════════════════════════════════════════
  const sessionKey = sessionIds.join(',');
  const layoutKey = `${layout}:${sessionKey}`;

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      let didMountNew = false;

      for (const sid of sessionIds) {
        const el = paneElsRef.current.get(sid);
        if (!el) continue;

        const entry = setupTerminal(sid, theme);

        if (entry.container.parentElement !== el) {
          while (el.firstChild) el.removeChild(el.firstChild);
          el.appendChild(entry.container);
        }

        if (!initializedRef.current.has(sid)) {
          initializedRef.current.add(sid);
          entry.term.open(entry.container);
          tryEnableWebgl(entry.term);
          didMountNew = true;
        }
      }

      // Refit all terminals to their new container sizes.
      for (const sid of sessionIds) {
        const entry = terminalsRef.current.get(sid);
        if (!entry) continue;
        try {
          entry.fit.fit();
          storage
            .ptyResize(sid, entry.term.cols, entry.term.rows)
            .catch(() => {});
        } catch {
          // ignore
        }
      }

      // When a new terminal was just opened (e.g. after closing a tab),
      // immediately focus the active one in the SAME rAF.  This prevents
      // a focus gap: the old pane's <textarea> was stripped from the DOM
      // during React's commit phase, dropping focus to <body>.  If we
      // wait for Effect 2's separate rAF, the browser has already
      // settled focus on <body> and the xterm textarea may not reliably
      // steal it back.
      if (didMountNew || !document.activeElement?.closest('.xterm')) {
        const activeEntry = terminalsRef.current.get(activeSessionId);
        activeEntry?.term.focus();
      }
    });

    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  // ════════════════════════════════════════════════════════════════
  // Effect 1b: Refit on resurface
  //
  // When the terminal panel transitions from hidden → visible,
  // the container went from zero-size to full-size.  We must
  // refit every xterm instance and notify the PTY of the new
  // cols/rows, otherwise the terminal renders with stale geometry.
  // ════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (hidden) return;
    const rafId = requestAnimationFrame(() => {
      for (const sid of sessionIds) {
        const entry = terminalsRef.current.get(sid);
        if (!entry) continue;
        try {
          entry.fit.fit();
          storage
            .ptyResize(sid, entry.term.cols, entry.term.rows)
            .catch(() => {});
        } catch {
          // ignore
        }
      }
      // Also re-focus the active terminal so keyboard input resumes.
      const activeEntry = terminalsRef.current.get(activeSessionId);
      activeEntry?.term.focus();
    });
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden]);

  // ════════════════════════════════════════════════════════════════
  // Effect 2: Focus + trail attach
  //
  // This effect ONLY cares about activeSessionId.  When focus
  // changes it:
  //   1. Hides cursor on old pane, shows on new pane
  //   2. Reads old cursor position → passes to trail.attach()
  //   3. Trail flies smoothly from old position to new position
  //
  // It does NOT touch layout or terminal mounting.
  // ════════════════════════════════════════════════════════════════
  const prevActiveRef = useRef<string | null>(null);

  useEffect(() => {
    const prevId = prevActiveRef.current;
    if (prevId === activeSessionId) return;
    prevActiveRef.current = activeSessionId;

    const trail = trailRef.current;

    // Hide cursor on the old pane.
    if (prevId) {
      const oldEntry = terminalsRef.current.get(prevId);
      if (oldEntry) {
        (oldEntry.term.options as TerminalOptionsWithCursorHidden).cursorHidden = true;
      }
    }

    // Read old cursor screen position BEFORE attaching the new term.
    let fromX: number | undefined;
    let fromY: number | undefined;
    if (trail && prevId) {
      const oldPos = trail.getCursorScreenPos();
      if (oldPos && overlayRef.current) {
        const overlayRect = overlayRef.current.getBoundingClientRect();
        fromX = oldPos.x - overlayRect.left;
        fromY = oldPos.y - overlayRect.top;
      }
    }

    // Attach to new pane.
    const newEntry = terminalsRef.current.get(activeSessionId);
    if (newEntry) {
      (newEntry.term.options as TerminalOptionsWithCursorHidden).cursorHidden = false;
      newEntry.term.focus();
      trail?.attach(newEntry.term, newEntry.container, fromX, fromY);
      trail?.setColor(theme.cursor);
      trail?.resize();
    } else {
      // Terminal not yet mounted (first render race or tab-close race).
      // Use a double-rAF so we run AFTER Effect 1's rAF has had a
      // chance to call term.open() and create the xterm <textarea>.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const entry = terminalsRef.current.get(activeSessionId);
          if (entry) {
            (entry.term.options as TerminalOptionsWithCursorHidden).cursorHidden = false;
            entry.term.focus();
            trail?.attach(entry.term, entry.container, fromX, fromY);
            trail?.setColor(theme.cursor);
            trail?.resize();
          }
        });
      });
    }
  }, [activeSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      destroyAll();
      initializedRef.current.clear();
      paneElsRef.current.clear();
    };
  }, [destroyAll]);

  // ── Cleanup dead sessions ────────────────────────────────────────
  useEffect(() => {
    const sessions = useStore.getState().sessions;
    const alive = new Set(sessions.map((s) => s.id));
    terminalsRef.current.forEach((_, id) => {
      if (!alive.has(id)) {
        destroyTerminal(id);
        initializedRef.current.delete(id);
        paneElsRef.current.delete(id);
      }
    });
  });

  // ── Live theme update ────────────────────────────────────────────
  useEffect(() => {
    terminalsRef.current.forEach(({ term }) => {
      term.options.theme = {
        background: theme.background,
        foreground: theme.foreground,
        cursor: theme.cursor,
        cursorAccent: theme.cursorAccent,
        selectionBackground: theme.selectionBackground,
        selectionForeground: theme.selectionForeground,
        black: theme.black,
        red: theme.red,
        green: theme.green,
        yellow: theme.yellow,
        blue: theme.blue,
        magenta: theme.magenta,
        cyan: theme.cyan,
        white: theme.white,
        brightBlack: theme.brightBlack,
        brightRed: theme.brightRed,
        brightGreen: theme.brightGreen,
        brightYellow: theme.brightYellow,
        brightBlue: theme.brightBlue,
        brightMagenta: theme.brightMagenta,
        brightCyan: theme.brightCyan,
        brightWhite: theme.brightWhite,
      };
    });
    trailRef.current?.setColor(theme.cursor);
  }, [theme, terminalsRef]);

  // ── Live font update ─────────────────────────────────────────────
  useEffect(() => {
    terminalsRef.current.forEach(({ term, fit }) => {
      term.options.fontFamily = `'${terminalFontId}', 'monaco', monospace`;
      term.options.fontSize = terminalFontSize;
      requestAnimationFrame(() => {
        try {
          fit.fit();
          const sid = [...terminalsRef.current.entries()].find(
            ([, v]) => v.term === term,
          )?.[0];
          if (sid) {
            storage.ptyResize(sid, term.cols, term.rows).catch(() => {});
          }
        } catch {
          // ignore
        }
      });
    });
  }, [terminalFontId, terminalFontSize, terminalsRef]);

  // ── Live cursor style update ─────────────────────────────────────
  // Push the new cursor style into every live xterm instance and the
  // shared trail so the two stay visually consistent in real time.
  useEffect(() => {
    terminalsRef.current.forEach(({ term }) => {
      term.options.cursorStyle = terminalCursorStyle;
    });
    trailRef.current?.setCursorStyle(terminalCursorStyle);
  }, [terminalCursorStyle, terminalsRef]);

  // ── Render ───────────────────────────────────────────────────────
  const n = sessionIds.length;
  const plan = computeLayout(layout, n);

  const dividerColor = theme.isDark
    ? 'rgba(255,255,255,0.10)'
    : 'rgba(0,0,0,0.10)';

  return (
    <div className="relative w-full h-full">
      {/* Pane grid */}
      <div
        className={plan.containerCls}
        style={{ ...plan.containerStyle, background: dividerColor }}
      >
        {sessionIds.map((sid, i) => {
          const cellStyle = plan.cells[i] ?? { width: '100%', height: '100%' };
          return (
            <div
              key={sid}
              style={{
                ...cellStyle,
                boxSizing: 'border-box',
                background: theme.background,
              }}
              onClick={() => setActivePane(sid)}
              className="relative overflow-hidden"
            >
              <div
                ref={(el) => {
                  if (el) {
                    paneElsRef.current.set(sid, el);
                  } else {
                    paneElsRef.current.delete(sid);
                  }
                }}
                className="w-full h-full"
              />
            </div>
          );
        })}
      </div>

      {/* Shared overlay canvas for cursor trail.
          Covers all panes, above xterm canvases, below pointer events.
          NOT clipped by overflow-hidden on individual panes. */}
      <div
        ref={overlayRef}
        className="absolute inset-0"
        style={{ pointerEvents: 'none', zIndex: 5 }}
      />
    </div>
  );
}
