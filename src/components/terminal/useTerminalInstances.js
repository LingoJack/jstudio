import { useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebglAddon } from "@xterm/addon-webgl";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { registerTerminal, unregisterTerminal } from "./terminalRegistry";
import { useStore } from "../../store/useStore";
function extractCwdFromTitle(title) {
  const trimmed = title.trim();
  if (!trimmed) return null;
  const atMatch = trimmed.match(/^[^@\s]+@[^:\s]+:\s*(.+)$/);
  if (atMatch) {
    let path = atMatch[1].trim();
    path = path.replace(/[%$#>]\s*$/, "").trim();
    if (path && path !== "~" && looksLikePath(path)) {
      return path;
    }
  }
  if (looksLikePath(trimmed) && trimmed !== "~") {
    return trimmed.replace(/[%$#>]\s*$/, "").trim() || null;
  }
  return null;
}
function looksLikePath(s) {
  if (s.startsWith("/")) return true;
  if (s.startsWith("~/")) return true;
  if (/^\.?\.?\//.test(s)) return true;
  if (s === ".") return true;
  return false;
}
function tryEnableWebgl(term) {
  try {
    const addon = new WebglAddon();
    addon.onContextLoss(() => addon.dispose());
    term.loadAddon(addon);
    return true;
  } catch {
    return false;
  }
}
function useTerminalInstances(deps) {
  const { resolvedFontFamily, terminalFontSize, cursorStyle, ptySessions, terminalInput } = deps;
  const terminalsRef = useRef(/* @__PURE__ */ new Map());
  const inputCleanupRef = useRef(/* @__PURE__ */ new Map());
  const ptySessionsRef = useRef(ptySessions);
  ptySessionsRef.current = ptySessions;
  const terminalInputRef = useRef(terminalInput);
  terminalInputRef.current = terminalInput;
  const setupTerminal = useCallback(
    (sessionId, theme) => {
      const cached = terminalsRef.current.get(sessionId);
      if (cached) return cached;
      const container = document.createElement("div");
      container.style.position = "relative";
      container.style.width = "100%";
      container.style.height = "100%";
      const term = new Terminal({
        fontFamily: `${resolvedFontFamily}, monospace`,
        fontSize: terminalFontSize,
        cursorStyle,
        cursorBlink: true,
        cursorWidth: 2,
        allowProposedApi: true,
        scrollback: 1e4,
        // Enable Kitty keyboard protocol support so that terminal apps
        // (e.g. jcli agent TUI) can correctly distinguish Shift-modified
        // keys like Shift+/ ("?"), Shift+Enter, etc.
        vtExtensions: {
          kittyKeyboard: true
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
          brightWhite: theme.brightWhite
        }
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      const serialize = new SerializeAddon();
      term.loadAddon(serialize);
      const unicode11 = new Unicode11Addon();
      term.loadAddon(unicode11);
      term.unicode.activeVersion = "11";
      ptySessionsRef.current.registerSession(sessionId, term);
      const inputCleanup = terminalInputRef.current.attachInputHandlers(
        term,
        sessionId,
        ptySessionsRef.current.writeToPty
      );
      inputCleanupRef.current.set(sessionId, inputCleanup);
      term.onTitleChange((title) => {
        const state = useStore.getState();
        state.setAutoTitle(sessionId, title);
        const cwd = extractCwdFromTitle(title);
        if (cwd) {
          state.updateSessionCwd(sessionId, cwd);
        }
      });
      const entry = {
        term,
        fit,
        serialize,
        container,
        disposeInputBridge: inputCleanup
      };
      terminalsRef.current.set(sessionId, entry);
      registerTerminal(sessionId, entry);
      const scrollbackMap = window.__detachScrollback;
      const savedScrollback = scrollbackMap?.[sessionId];
      if (savedScrollback) {
        try {
          term.write(savedScrollback);
        } catch {
        }
        delete scrollbackMap?.[sessionId];
      }
      const resizeObserver = new ResizeObserver(() => {
        try {
          fit.fit();
          ptySessionsRef.current.resizePty(sessionId, term.cols, term.rows);
        } catch {
        }
      });
      resizeObserver.observe(container);
      container._resizeObserver = resizeObserver;
      return entry;
    },
    [resolvedFontFamily, terminalFontSize, cursorStyle]
    // ← 只依赖稳定的值，ptySessions/terminalInput 通过 ref 访问
  );
  const destroyTerminal = useCallback(
    (sessionId) => {
      const entry = terminalsRef.current.get(sessionId);
      if (entry) {
        const obs = entry.container._resizeObserver;
        obs?.disconnect();
        entry.disposeInputBridge?.();
        entry.term.dispose();
        terminalsRef.current.delete(sessionId);
        unregisterTerminal(sessionId);
      }
      inputCleanupRef.current.get(sessionId)?.();
      inputCleanupRef.current.delete(sessionId);
      ptySessionsRef.current.unregisterSession(sessionId);
    },
    []
    // ← 空依赖，通过 ref 访问最新的 ptySessions
  );
  const destroyAll = useCallback(() => {
    terminalsRef.current.forEach((_, id) => {
      const entry = terminalsRef.current.get(id);
      if (entry) {
        const obs = entry.container._resizeObserver;
        obs?.disconnect();
        entry.disposeInputBridge?.();
        entry.term.dispose();
        unregisterTerminal(id);
      }
      inputCleanupRef.current.get(id)?.();
    });
    terminalsRef.current.clear();
    inputCleanupRef.current.clear();
    ptySessionsRef.current.killAllSessions();
  }, []);
  return {
    terminalsRef,
    setupTerminal,
    destroyTerminal,
    destroyAll,
    tryEnableWebgl
  };
}
export {
  tryEnableWebgl,
  useTerminalInstances
};
