import { useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import { WebglAddon } from '@xterm/addon-webgl';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import { useStore } from '../../store/useStore';
import { storage } from '../../lib/storage';
import type { TerminalCursorStyle } from '../../lib/storage';
import { resolveMonospaceFont } from '../../lib/editor/fonts';
import type { TerminalTheme } from '../../lib/terminal/themes';
import type { SessionTerminal } from './types';
import { registerTerminal, unregisterTerminal } from './terminalRegistry';

/**
 * Extract a working directory path from a shell OSC title string.
 *
 * Handles common title formats across different shells / OSes:
 *   "user@host: ~/projects/app"      → "~/projects/app"
 *   "user@host: /absolute/path"       → "/absolute/path"
 *   "~/projects/app"                  → "~/projects/app"
 *   "/absolute/path"                  → "/absolute/path"
 *   "user@host"                       → null  (no path)
 *   "zsh" / "node server.js"          → null  (command, not a path)
 */
function extractCwdFromTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;

  // Try "user@host: <path>" format first.
  const atMatch = trimmed.match(/^[^@\s]+@[^:\s]+:\s*(.+)$/);
  if (atMatch) {
    let path = atMatch[1].trim();
    // Strip trailing prompt characters like % $ # >
    path = path.replace(/[%$#>]\s*$/, '').trim();
    if (path && path !== '~' && looksLikePath(path)) {
      return path;
    }
  }

  // Bare path (no user@host prefix).
  if (looksLikePath(trimmed) && trimmed !== '~') {
    return trimmed.replace(/[%$#>]\s*$/, '').trim() || null;
  }

  return null;
}

/** Heuristic: does this string look like a filesystem path? */
function looksLikePath(s: string): boolean {
  // Absolute path: /Users/...
  if (s.startsWith('/')) return true;
  // Tilde path: ~/...
  if (s.startsWith('~/')) return true;
  // Relative path with slashes: ./src or ../src or src/foo
  if (/^\.?\.?\//.test(s)) return true;
  // Dot-only: "."
  if (s === '.') return true;
  return false;
}

/** Try WebGL2 GPU-accelerated renderer; fall back silently. */
function tryEnableWebgl(term: Terminal): boolean {
  try {
    const addon = new WebglAddon();
    addon.onContextLoss(() => addon.dispose());
    term.loadAddon(addon);
    return true;
  } catch {
    return false;
  }
}

/**
 * useTerminalManager — owns the lifecycle of all xterm.js Terminal instances.
 *
 * Each session gets a cached entry (Terminal + FitAddon + DOM container +
 * CursorTrail).  Switching tabs reuses cached instances — scrollback and
 * state are preserved.
 *
 * Responsibilities:
 *   - Create / destroy Terminal instances
 *   - Wire PTY input/output (Tauri events)
 *   - Enable WebGL2 renderer + cursor trail
 *   - Resize handling (ResizeObserver → pty_resize + trail resize)
 *
 * Returns refs to the instance cache so the parent component can mount /
 * switch the active session's DOM container.
 */
export function useTerminalManager(
  fontId: string,
  terminalFontSize: number,
  cursorStyle: TerminalCursorStyle,
) {
  const removeSessionState = useStore((s) => s.removeSessionState);

  const resolvedFontFamily = resolveMonospaceFont(fontId);

  const terminalsRef = useRef<Map<string, SessionTerminal>>(new Map());
  const unlistenRef = useRef<Map<string, Promise<UnlistenFn>[]>>(new Map());

  /** Create (or return cached) Terminal for a session id. */
  const setupTerminal = useCallback(
    (sessionId: string, theme: TerminalTheme): SessionTerminal => {
      const cached = terminalsRef.current.get(sessionId);
      if (cached) return cached;

      const container = document.createElement('div');
      container.style.position = 'relative';
      container.style.width = '100%';
      container.style.height = '100%';

      const term = new Terminal({
        fontFamily: `${resolvedFontFamily}, monospace`,
        fontSize: terminalFontSize,
        cursorStyle,
        cursorBlink: true,
        cursorWidth: 2,
        allowProposedApi: true,
        scrollback: 10000,
        // Enable Kitty keyboard protocol support so that terminal apps
        // (e.g. jcli agent TUI) can correctly distinguish Shift-modified
        // keys like Shift+/ ("?"), Shift+Enter, etc. Without this, xterm.js
        // silently ignores PushKeyboardEnhancementFlags sequences sent by
        // the app, causing modifier-key input to fail.
        vtExtensions: {
          kittyKeyboard: true,
        },
        // Let the browser figure out the true advance width of each
        // glyph — prevents narrow/wide mismatches on mixed scripts.
        allowTransparency: true,
        theme: {
          background: theme.background,
          foreground: theme.foreground,
          cursor: theme.cursor,
          cursorAccent: theme.cursorAccent,
          selectionBackground: theme.selectionBackground,
          selectionInactiveBackground: theme.selectionInactiveBackground,
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
        },
      });

      const fit = new FitAddon();
      term.loadAddon(fit);

      // SerializeAddon — enables tear-off: the parent window serializes the
      // xterm buffer (scrollback + alt screen + cursor state) and the child
      // window replays it via `term.write(serialized)`.
      const serialize = new SerializeAddon();
      term.loadAddon(serialize);

      // Unicode 11 addon — provides the real width calculation engine.
      // Without loading this addon, the `unicodeVersion: '11'` option above
      // is just a label with no actual width table behind it.  This addon
      // makes emoji (💻🎨) and wide CJK characters correctly occupy 2 cells,
      // matching what the shell expects when laying out box-drawing art.
      const unicode11 = new Unicode11Addon();
      term.loadAddon(unicode11);
      term.unicode.activeVersion = '11';

      // ── Paste + macOS IME Shift Support ────────────────────────────────
      //
      // macOS Chinese IMEs (Pinyin, Wubi, Sogou, etc.) rely on Shift:
      //
      // 1. **Shift toggle**: A quick tap of Shift switches Chinese↔English
      //    mode.  Returning `false` for pure-Shift keydown/keyup prevents
      //    xterm from calling `preventDefault()`, which would block the IME's
      //    native toggle detection at the TSM/IMK level.
      //
      // 2. **Shift+symbol input**: In Chinese mode, Shift+2 → @, Shift+' → ",
      //    etc.  On WKWebView some of these arrive via the textarea's
      //    `beforeinput` event instead of xterm's normal key path, causing the
      //    first press to be silently swallowed.  A `beforeinput` bridge
      //    (attached after term.open()) catches these and forwards them via
      //    `term.input()`.  Adapted from hanshuaikang/nezha PR #97.

      term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        // During IME composition, let the browser/IME handle everything.
        if (event.isComposing || event.keyCode === 229) return false;

        // Pure Shift (no other modifiers): let the IME handle the toggle.
        // Returning false prevents xterm from calling preventDefault() on
        // the Shift keydown→keyup cycle.
        if (
          event.key === 'Shift' &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          return false;
        }

        if (event.type !== 'keydown') return true;

        // Paste interception (Cmd+V on macOS, Ctrl+V elsewhere).
        // In Tauri's WKWebView the browser's native paste event is unreliable
        // when the terminal textarea has focus — we read the clipboard via
        // Tauri's clipboard-manager plugin and feed it manually.
        const isMac = navigator.platform.toLowerCase().includes('mac');
        const isPaste = isMac ? event.metaKey : event.ctrlKey;
        if (isPaste && (event.key === 'v' || event.key === 'V')) {
          readText()
            .then((text) => {
              if (text) term.paste(text);
            })
            .catch(console.error);
          return false;
        }

        return true;
      });

      // ── macOS WKWebView Shift+symbol beforeinput bridge ───────────────
      //
      // On macOS WKWebView, some Shift+symbol key presses (Shift+2 → @,
      // Shift+' → ") are delivered via the textarea's `beforeinput` event
      // instead of xterm's normal keypress/input path, causing the first
      // symbol press in Chinese IME mode to be swallowed.
      //
      // Strategy (nezha PR #97):
      //   1. `bridgeKeyDown` (bubble phase, runs after xterm) records the
      //      last Shift+symbol that xterm already processed.
      //   2. `bridgeBeforeInput` forwards the symbol via `term.input()` ONLY
      //      if xterm did NOT already handle it — preventing double-sends.

      const isMacPlatform =
        typeof navigator !== 'undefined' &&
        navigator.platform.toLowerCase().includes('mac');

      /** True if data is a short punctuation/symbol-only string. */
      const isPrintableSymbol = (data: string | null): boolean => {
        if (!data || data.length === 0 || data.length > 8) return false;
        return /^[\p{P}\p{S}]+$/u.test(data);
      };

      const isSymbolInputType = (inputType: string): boolean =>
        inputType === 'insertText' || inputType === 'insertCompositionText';

      let keydownHandledByXterm: string | null = null;

      const bridgeKeyDown = (event: KeyboardEvent) => {
        keydownHandledByXterm = null;
        if (
          event.keyCode !== 229 &&
          event.shiftKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.metaKey &&
          isPrintableSymbol(event.key)
        ) {
          keydownHandledByXterm = event.key;
        }
      };

      const bridgeBeforeInput = (event: InputEvent) => {
        const symbol = isPrintableSymbol(event.data) ? event.data : null;
        if (!isSymbolInputType(event.inputType) || symbol === null) return;
        // xterm already handled this symbol via its normal keydown path.
        if (keydownHandledByXterm === symbol) {
          keydownHandledByXterm = null;
          return;
        }
        // xterm missed it (WKWebView quirk) — forward to PTY manually.
        term.input(symbol);
        event.preventDefault();
      };

      // Attach bridge listeners after term.open() creates the textarea.
      // term.open() is called by the parent component after setupTerminal
      // returns, so we retry on the next animation frame if not ready.
      // We cap retries at a few frames to avoid an infinite loop if the
      // terminal is disposed before term.open() is called.
      let disposed = false;
      let bridgeCleanup: (() => void) | null = null;
      const attachInputBridge = (retries = 10) => {
        if (disposed || !isMacPlatform) return;
        if (term.textarea) {
          term.textarea.addEventListener('keydown', bridgeKeyDown);
          term.textarea.addEventListener('beforeinput', bridgeBeforeInput);
          bridgeCleanup = () => {
            term.textarea?.removeEventListener('keydown', bridgeKeyDown);
            term.textarea?.removeEventListener('beforeinput', bridgeBeforeInput);
          };
        } else if (retries > 0) {
          requestAnimationFrame(() => attachInputBridge(retries - 1));
        }
      };
      queueMicrotask(() => attachInputBridge());

      // Keyboard input → PTY
      term.onData((data) => {
        storage.ptyWrite(sessionId, data).catch(console.error);
      });

      // Shell title change (OSC 0/2 sequences) → auto title + cwd tracking
      term.onTitleChange((title) => {
        const state = useStore.getState();
        state.setAutoTitle(sessionId, title);

        // Try to extract the current working directory from the OSC title.
        const cwd = extractCwdFromTitle(title);
        if (cwd) {
          state.updateSessionCwd(sessionId, cwd);
        }
      });

      // Shell output → terminal
      const unlistenData = listen<{ data: string }>(
        `pty-data-${sessionId}`,
        (e) => term.write(e.payload.data),
      );

      // Shell exit → cleanup
      const unlistenExit = listen(`pty-exit-${sessionId}`, () => {
        removeSessionState(sessionId);
      });

      unlistenRef.current.set(sessionId, [unlistenData, unlistenExit]);

      const entry: SessionTerminal = {
        term,
        fit,
        serialize,
        container,
        disposeInputBridge: () => {
          disposed = true;
          bridgeCleanup?.();
        },
      };
      terminalsRef.current.set(sessionId, entry);
      registerTerminal(sessionId, entry);

      // Tear-off child window: replay serialized scrollback from the parent
      // window. TerminalWindowApp sets `window.__detachScrollback` before
      // rendering; each entry is consumed once.
      const scrollbackMap = (window as unknown as {
        __detachScrollback?: Record<string, string>;
      }).__detachScrollback;
      const savedScrollback = scrollbackMap?.[sessionId];
      if (savedScrollback) {
        try {
          term.write(savedScrollback);
        } catch {
          // ignore — malformed scrollback is non-fatal
        }
        delete scrollbackMap?.[sessionId];
      }

      // Resize → PTY
      const resizeObserver = new ResizeObserver(() => {
        try {
          fit.fit();
          storage.ptyResize(sessionId, term.cols, term.rows).catch(console.error);
        } catch {
          // ignore
        }
      });
      resizeObserver.observe(container);
      (container as unknown as { _resizeObserver?: ResizeObserver })._resizeObserver =
        resizeObserver;

      return entry;
    },
    [resolvedFontFamily, terminalFontSize, cursorStyle, removeSessionState],
  );

  /** Fully destroy a terminal instance + clean up listeners. */
  const destroyTerminal = useCallback((sessionId: string) => {
    const entry = terminalsRef.current.get(sessionId);
    if (entry) {
      const obs = (entry.container as unknown as { _resizeObserver?: ResizeObserver })
        ._resizeObserver;
      obs?.disconnect();
      entry.disposeInputBridge?.();
      entry.term.dispose();
      terminalsRef.current.delete(sessionId);
      unregisterTerminal(sessionId);
    }
    const unlistens = unlistenRef.current.get(sessionId);
    if (unlistens) {
      unlistens.forEach((u) => u.then((fn) => fn()).catch(() => {}));
      unlistenRef.current.delete(sessionId);
    }
  }, []);

  /** Destroy all terminals (called on unmount). */
  const destroyAll = useCallback(() => {
    terminalsRef.current.forEach((_, id) => destroyTerminal(id));
  }, [destroyTerminal]);

  return {
    terminalsRef,
    setupTerminal,
    destroyTerminal,
    destroyAll,
    tryEnableWebgl,
  };
}
