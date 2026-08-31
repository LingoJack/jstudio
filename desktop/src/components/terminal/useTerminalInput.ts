/**
 * useTerminalInput — Terminal input handling: keyboard, paste, IME.
 *
 * Inspired by kitty's window.py input handling:
 *   - Keyboard → PTY (onData)
 *   - Paste interception with kitty-style sanitise
 *   - IME composition tracking (macOS Chinese IME quirks)
 *   - macOS WKWebView Shift+symbol beforeinput bridge
 *
 * This hook manages the INPUT side of the terminal pipeline:
 *   User keystroke/paste → useTerminalInput → usePtySessions.writeToPty → Shell
 */

import { useCallback, useRef } from 'react';
import type { Terminal } from '@xterm/xterm';
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import { preparePasteText } from '../../lib/terminal/pasteSanitize';
import { isRawPinyinCommit, stripPinyinSpaces } from '../../lib/ime/pinyinStrip';

/** Callback to write data to PTY. */
type WriteToPty = (sessionId: string, data: string) => void;

/**
 * Hook return type.
 */
export interface UseTerminalInputReturn {
  /** Attach input handlers to a terminal instance. Called after term.open(). */
  attachInputHandlers: (term: Terminal, sessionId: string, writeToPty: WriteToPty) => () => void;
}

/**
 * Manage terminal input — keyboard, paste, IME.
 *
 * This hook creates input handlers for each terminal instance and
 * attaches them after `term.open()` is called.
 */
export function useTerminalInput(): UseTerminalInputReturn {
  /**
   * Attach input handlers to a terminal instance.
   *
   * Returns a cleanup function to remove event listeners.
   */
  const attachInputHandlers = useCallback(
    (term: Terminal, sessionId: string, writeToPty: WriteToPty) => {
      // ── IME composition state tracking (suppress phantom spaces) ─────────
      //
      // macOS Chinese IMEs (Pinyin, Wubi, Sogou, etc.) emit a stray space
      // when the user switches input mode mid-composition (Shift toggle,
      // CapsLock, etc.). This space appears via beforeinput right after
      // compositionend and gets forwarded to the PTY, causing unwanted
      // spaces at the cursor position.
      //
      // Strategy:
      //   1. Track composition lifecycle (start/end times).
      //   2. Suppress single-space beforeinput events that arrive within
      //      a short window after compositionend.
      const STRAY_SPACE_WINDOW = 200; // ms
      // onData must match a composition commit within this window after
      // compositionend — xterm reads textarea.value via setTimeout(0) and
      // fires onData shortly after the event, so keep this tight.
      const COMPOSITION_COMMIT_WINDOW = 120; // ms
      let composing = false;
      let lastCompositionEndTime = 0;
      // Raw text from the last compositionend. Used to match the ensuing
      // onData payload so we only strip spaces on an actual pinyin commit,
      // never on a paste or normal keystroke.
      let lastCompositionEndData = '';

      // ── macOS WKWebView Shift+symbol beforeinput bridge state ───────
      let keydownHandledByXterm: string | null = null;

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

      // ══════════════════════════════════════════════════════════════════
      // 1. Custom key handler (IME + paste interception)
      // ══════════════════════════════════════════════════════════════════
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

      const customKeyHandler = (event: KeyboardEvent) => {
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

        // ════════════════════════════════════════════════════════════════
        // Paste interception (Cmd+V on macOS, Ctrl+V elsewhere).
        // ════════════════════════════════════════════════════════════════
        //
        // In Tauri's WKWebView the browser's native paste event is unreliable
        // when the terminal textarea has focus — we read the clipboard via
        // Tauri's clipboard-manager plugin and feed it manually.
        //
        // CRITICAL: attachCustomKeyEventHandler returning `false` only skips
        // xterm's own keydown handling — it does NOT call
        // event.preventDefault(). The browser therefore still fires a native
        // `paste` event on the textarea, and xterm's internal paste listener
        // reads clipboardData and pastes again on top of our manual
        // term.paste(), producing duplicate content. We must explicitly
        // preventDefault() here to suppress the native paste path.
        const isMac = navigator.platform.toLowerCase().includes('mac');
        const isPaste = isMac ? event.metaKey : event.ctrlKey;
        if (isPaste && (event.key === 'v' || event.key === 'V')) {
          event.preventDefault();
          readText()
            .then((text) => {
              // Kitty-style sanitize before pasting: strip embedded bracketed-paste
              // end sequences (\x1b[201~) to prevent injection attacks.
              // xterm.js will then wrap with \x1b[200~...\x1b[201~ if bracketed mode is active.
              if (text) term.paste(preparePasteText(text));
            })
            .catch(console.error);
          return false;
        }

        return true;
      };

      term.attachCustomKeyEventHandler(customKeyHandler);

      // ══════════════════════════════════════════════════════════════════
      // 2. Keyboard input → PTY (onData)
      // ══════════════════════════════════════════════════════════════════
      const onDataDisposable = term.onData((data) => {
        // ── Pinyin strip: raw pinyin committed on IME switch ───────────
        // When the user switches to English mid-composition, the IME commits
        // the raw pinyin (e.g. "ni hao") into the textarea; xterm reads it
        // via setTimeout(0) and fires onData. Match against the compositionend
        // data + a tight time window to confirm this is that commit (not a
        // paste or normal typing), then strip spaces before forwarding so
        // "ni hao" → "nihao" lands at the cursor.
        if (
          lastCompositionEndData &&
          lastCompositionEndTime > 0 &&
          Date.now() - lastCompositionEndTime < COMPOSITION_COMMIT_WINDOW &&
          data === lastCompositionEndData &&
          isRawPinyinCommit(data)
        ) {
          lastCompositionEndData = ''; // consume once — avoid repeat matches
          writeToPty(sessionId, stripPinyinSpaces(data));
          return;
        }
        writeToPty(sessionId, data);
      });

      // ══════════════════════════════════════════════════════════════════
      // 3. macOS WKWebView beforeinput bridge (Shift+symbol)
      // ══════════════════════════════════════════════════════════════════
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

      const bridgeCompositionStart = () => {
        composing = true;
      };

      const bridgeCompositionEnd = (event: CompositionEvent) => {
        composing = false;
        lastCompositionEndTime = Date.now();
        lastCompositionEndData = event.data ?? '';
      };

      const bridgeBeforeInput = (event: InputEvent) => {
        // ── Suppress phantom space from IME mode switch ───────────────────
        // A single space arriving right after compositionend is likely a
        // stray from the IME's internal mode-switch logic, not intentional
        // user input. Suppress it to match document editor behavior.
        if (
          event.inputType === 'insertText' &&
          event.data === ' ' &&
          !composing &&
          lastCompositionEndTime > 0 &&
          Date.now() - lastCompositionEndTime < STRAY_SPACE_WINDOW
        ) {
          event.preventDefault();
          return;
        }

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
          term.textarea.addEventListener('compositionstart', bridgeCompositionStart);
          term.textarea.addEventListener('compositionend', bridgeCompositionEnd);
          bridgeCleanup = () => {
            term.textarea?.removeEventListener('keydown', bridgeKeyDown);
            term.textarea?.removeEventListener('beforeinput', bridgeBeforeInput);
            term.textarea?.removeEventListener('compositionstart', bridgeCompositionStart);
            term.textarea?.removeEventListener('compositionend', bridgeCompositionEnd);
          };
        } else if (retries > 0) {
          requestAnimationFrame(() => attachInputBridge(retries - 1));
        }
      };

      queueMicrotask(() => attachInputBridge());

      // ══════════════════════════════════════════════════════════════════
      // Cleanup function
      // ══════════════════════════════════════════════════════════════════
      return () => {
        disposed = true;
        bridgeCleanup?.();
        onDataDisposable.dispose();
      };
    },
    [],
  );

  return { attachInputHandlers };
}