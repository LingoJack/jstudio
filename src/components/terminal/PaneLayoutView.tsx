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
import PaneGlow from './PaneGlow';
import type { PaneLayoutType } from './types';

// ────────────────────────────────────────────────
// Layout geometry (Kitty-style, dynamic sizing)
// ────────────────────────────────────────────────

interface LayoutPlan {
  kind: string;
  containerCls: string;
  containerStyle: CSSProperties;
  /** Per-pane wrapper style, indexed by position. */
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
  const setActivePane = useStore((s) => s.setActivePane);

  const theme = getTerminalTheme(terminalThemeId);

  const { terminalsRef, setupTerminal, destroyTerminal, destroyAll, tryEnableWebgl } =
    useTerminalManager(terminalFontId, terminalFontSize);

  /** Map: sessionId → pane DOM element (the ref div inside each pane). */
  const paneElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  /** Track which sessions have been fully initialized. */
  const initializedRef = useRef<Set<string>>(new Set());

  // ── Core: attach terminal containers to pane DOM nodes ──────────
  //
  // This effect runs on every render that changes the visible session
  // list, layout, or active session.  It ensures every visible pane
  // has its xterm container appended, initializes first-timers, and
  // refits everything.
  const sessionKey = sessionIds.join(',');
  const layoutKey = `${layout}:${sessionKey}:${activeSessionId}`;

  useEffect(() => {
    // Use double-rAF to ensure the DOM (flex/grid) has settled before
    // we try to measure / open terminals.
    const rafId = requestAnimationFrame(() => {
      for (const sid of sessionIds) {
        const el = paneElsRef.current.get(sid);
        if (!el) continue;

        const entry = setupTerminal(sid, theme);

        // Append container if it's not already in this element.
        if (entry.container.parentElement !== el) {
          while (el.firstChild) el.removeChild(el.firstChild);
          el.appendChild(entry.container);
        }

        // First-time initialization: open + WebGL + trail.
        if (!initializedRef.current.has(sid)) {
          initializedRef.current.add(sid);
          entry.term.open(entry.container);
          tryEnableWebgl(entry.term);
          try {
            entry.trail = new CursorTrail(
              entry.term,
              entry.container,
              theme.cursor,
            );
            requestAnimationFrame(() => {
              entry.trail?.resize();
              entry.trail?.start();
            });
          } catch {
            entry.trail = null;
          }
        }
      }

      // Refit all terminals after DOM has settled.
      for (const sid of sessionIds) {
        const entry = terminalsRef.current.get(sid);
        if (!entry) continue;
        try {
          entry.fit.fit();
          storage
            .ptyResize(sid, entry.term.cols, entry.term.rows)
            .catch(() => {});
          entry.trail?.resize();
        } catch {
          // ignore
        }
      }

      // Focus active pane.
      const activeEntry = terminalsRef.current.get(activeSessionId);
      activeEntry?.term.focus();
    });

    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  // ── Poke trail on focus switch ───────────────────────────────────
  //
  // Each terminal has its own CursorTrail.  When switching panes,
  // the newly focused pane's cursor hasn't moved (within its own
  // buffer), so its trail stays dormant.  We poke it so the trail
  // animates as if the cursor flew in from the previous pane's
  // cursor position — creating a smooth cross-pane animation.
  const prevActiveRef = useRef<string | null>(null);
  useEffect(() => {
    const prevId = prevActiveRef.current;
    if (prevId === activeSessionId) return;
    prevActiveRef.current = activeSessionId;

    const newEntry = terminalsRef.current.get(activeSessionId);
    if (!newEntry?.trail) return;

    // Try to get the old pane's cursor position in screen pixels,
    // then convert to the new pane's local coordinate space.
    let fromX: number | undefined;
    let fromY: number | undefined;

    if (prevId) {
      const oldEntry = terminalsRef.current.get(prevId);
      const oldPos = oldEntry?.trail?.getCursorScreenPos();
      if (oldPos) {
        const newCanvasRect = newEntry.container.getBoundingClientRect();
        fromX = oldPos.x - newCanvasRect.left;
        fromY = oldPos.y - newCanvasRect.top;
      }
    }

    newEntry.trail.poke(fromX, fromY);
  }, [activeSessionId]);

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
    terminalsRef.current.forEach(({ term, trail }) => {
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
      trail?.setColor(theme.cursor);
    });
  }, [theme, terminalsRef]);

  // ── Live font update ─────────────────────────────────────────────
  useEffect(() => {
    terminalsRef.current.forEach(({ term, fit, trail }) => {
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
          trail?.resize();
        } catch {
          // ignore
        }
      });
    });
  }, [terminalFontId, terminalFontSize, terminalsRef]);

  // ── Render ───────────────────────────────────────────────────────
  const n = sessionIds.length;
  const plan = computeLayout(layout, n);
  const visibleIds = plan.kind === 'stack' ? [activeSessionId] : sessionIds;

  // Divider + focus glow, theme-aware:
  //   dark theme  → subtle white divider, faint green glow
  //   light theme → subtle black divider, faint blue glow
  const dividerColor = theme.isDark
    ? 'rgba(255,255,255,0.12)'
    : 'rgba(0,0,0,0.12)';
  // Blue in light theme follows the convention used by most editors
  // (VS Code's own focusBorder is blue #007fd4 in light themes).
  const glowRgb: [number, number, number] = theme.isDark
    ? [0, 210, 106]   // green
    : [0, 122, 255];   // blue

  return (
    <div
      className={plan.containerCls}
      style={{ ...plan.containerStyle, background: dividerColor }}
    >
      {visibleIds.map((sid, i) => {
        const cellStyle =
          plan.kind === 'stack'
            ? { width: '100%', height: '100%' }
            : plan.cells[i] ?? { width: '100%', height: '100%' };
        const isActive = sid === activeSessionId;
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
            {/*
              This inner div is the xterm mount point.
              w-full h-full is critical — without it the container
              collapses to 0 height and xterm renders nothing.
            */}
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
            {/* Animated focus glow — organic, flame-like shimmer
                along all four edges. */}
            {isActive && <PaneGlow rgb={glowRgb} />}
          </div>
        );
      })}
    </div>
  );
}
