import {
  useRef,
  useEffect,
  type CSSProperties,
} from 'react';
import { useStore } from '../../store/useStore';
import { storage } from '../../lib/storage';
import { getTerminalTheme } from '../../lib/terminalThemes';
import { useTerminalManager } from './useTerminalManager';
import CursorTrail from './CursorTrail';
import type { PaneLayoutType } from './types';

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
  kind: string;
  containerCls: string;
  containerStyle: CSSProperties;
  cells: CSSProperties[];
}

function computeLayout(layout: PaneLayoutType, n: number): LayoutPlan {
  if (n <= 1) {
    return {
      kind: 'single',
      containerCls: 'w-full h-full',
      containerStyle: {},
      cells: [{ width: '100%', height: '100%' }],
    };
  }

  switch (layout) {
    case 'stack':
      return {
        kind: 'stack',
        containerCls: 'w-full h-full',
        containerStyle: {},
        cells: [{ width: '100%', height: '100%' }],
      };

    case 'horizontal':
      return {
        kind: 'horizontal',
        containerCls: 'w-full h-full flex flex-row',
        containerStyle: { gap: '1px' },
        cells: Array.from({ length: n }, () => ({
          flex: '1 1 0',
          minWidth: 0,
          height: '100%',
        })),
      };

    case 'vertical':
      return {
        kind: 'vertical',
        containerCls: 'w-full h-full flex flex-col',
        containerStyle: { gap: '1px' },
        cells: Array.from({ length: n }, () => ({
          flex: '1 1 0',
          minHeight: 0,
          width: '100%',
        })),
      };

    case 'fat': {
      const cells: CSSProperties[] = [
        { flex: '1.2 1 0', minHeight: 0, width: '100%' },
        ...Array.from({ length: n - 1 }, () => ({
          flex: '1 1 0',
          minWidth: 0,
        })),
      ];
      return {
        kind: 'fat',
        containerCls: 'w-full h-full flex flex-col',
        containerStyle: { gap: '1px' },
        cells,
      };
    }

    case 'grid': {
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      return {
        kind: 'grid',
        containerCls: 'w-full h-full grid',
        containerStyle: {
          gap: '1px',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        },
        cells: Array.from({ length: n }, () => ({
          minWidth: 0,
          minHeight: 0,
        })),
      };
    }

    case 'tall':
    default: {
      const cells: CSSProperties[] = [
        { flex: '1.2 1 0', minWidth: 0, height: '100%' },
        ...Array.from({ length: n - 1 }, () => ({
          flex: '1 1 0',
          minHeight: 0,
          width: '100%',
        })),
      ];
      return {
        kind: 'tall',
        containerCls: 'w-full h-full flex flex-row',
        containerStyle: { gap: '1px' },
        cells,
      };
    }
  }
}

// ────────────────────────────────────────────────
// PaneLayoutView
// ────────────────────────────────────────────────

export interface PaneLayoutViewProps {
  sessionIds: string[];
  activeSessionId: string;
  layout: PaneLayoutType;
}

export default function PaneLayoutView({
  sessionIds,
  activeSessionId,
  layout,
}: PaneLayoutViewProps) {
  const terminalThemeId = useStore((s) => s.terminalThemeId);
  const terminalFontId = useStore((s) => s.terminalFontId);
  const terminalFontSize = useStore((s) => s.terminalFontSize);
  const terminalCursorStyle = useStore((s) => s.terminalCursorStyle);
  const setActivePane = useStore((s) => s.setActivePane);

  const theme = getTerminalTheme(terminalThemeId);

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
    });

    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

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
      // Terminal not yet mounted (first render race).  Retry on next
      // frame — the layout effect's rAF will have created it by then.
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
  const visibleIds = plan.kind === 'stack' ? [activeSessionId] : sessionIds;

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
        {visibleIds.map((sid, i) => {
          const cellStyle =
            plan.kind === 'stack'
              ? { width: '100%', height: '100%' }
              : plan.cells[i] ?? { width: '100%', height: '100%' };
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
