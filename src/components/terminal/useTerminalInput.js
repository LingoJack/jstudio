import { useCallback } from "react";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { preparePasteText } from "../../lib/terminal/pasteSanitize";
import { isRawPinyinCommit, stripPinyinSpaces } from "../../lib/ime/pinyinStrip";
function useTerminalInput() {
  const attachInputHandlers = useCallback(
    (term, sessionId, writeToPty) => {
      const STRAY_SPACE_WINDOW = 200;
      const COMPOSITION_COMMIT_WINDOW = 120;
      let composing = false;
      let lastCompositionEndTime = 0;
      let lastCompositionEndData = "";
      let keydownHandledByXterm = null;
      const isMacPlatform = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");
      const isPrintableSymbol = (data) => {
        if (!data || data.length === 0 || data.length > 8) return false;
        return /^[\p{P}\p{S}]+$/u.test(data);
      };
      const isSymbolInputType = (inputType) => inputType === "insertText" || inputType === "insertCompositionText";
      const customKeyHandler = (event) => {
        if (event.isComposing || event.keyCode === 229) return false;
        if (event.key === "Shift" && !event.ctrlKey && !event.metaKey && !event.altKey) {
          return false;
        }
        if (event.type !== "keydown") return true;
        const isMac = navigator.platform.toLowerCase().includes("mac");
        const isPaste = isMac ? event.metaKey : event.ctrlKey;
        if (isPaste && (event.key === "v" || event.key === "V")) {
          event.preventDefault();
          readText().then((text) => {
            if (text) term.paste(preparePasteText(text));
          }).catch(console.error);
          return false;
        }
        return true;
      };
      term.attachCustomKeyEventHandler(customKeyHandler);
      const onDataDisposable = term.onData((data) => {
        if (lastCompositionEndData && lastCompositionEndTime > 0 && Date.now() - lastCompositionEndTime < COMPOSITION_COMMIT_WINDOW && data === lastCompositionEndData && isRawPinyinCommit(data)) {
          lastCompositionEndData = "";
          writeToPty(sessionId, stripPinyinSpaces(data));
          return;
        }
        writeToPty(sessionId, data);
      });
      const bridgeKeyDown = (event) => {
        keydownHandledByXterm = null;
        if (event.keyCode !== 229 && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && isPrintableSymbol(event.key)) {
          keydownHandledByXterm = event.key;
        }
      };
      const bridgeCompositionStart = () => {
        composing = true;
      };
      const bridgeCompositionEnd = (event) => {
        composing = false;
        lastCompositionEndTime = Date.now();
        lastCompositionEndData = event.data ?? "";
      };
      const bridgeBeforeInput = (event) => {
        if (event.inputType === "insertText" && event.data === " " && !composing && lastCompositionEndTime > 0 && Date.now() - lastCompositionEndTime < STRAY_SPACE_WINDOW) {
          event.preventDefault();
          return;
        }
        const symbol = isPrintableSymbol(event.data) ? event.data : null;
        if (!isSymbolInputType(event.inputType) || symbol === null) return;
        if (keydownHandledByXterm === symbol) {
          keydownHandledByXterm = null;
          return;
        }
        term.input(symbol);
        event.preventDefault();
      };
      let disposed = false;
      let bridgeCleanup = null;
      const attachInputBridge = (retries = 10) => {
        if (disposed || !isMacPlatform) return;
        if (term.textarea) {
          term.textarea.addEventListener("keydown", bridgeKeyDown);
          term.textarea.addEventListener("beforeinput", bridgeBeforeInput);
          term.textarea.addEventListener("compositionstart", bridgeCompositionStart);
          term.textarea.addEventListener("compositionend", bridgeCompositionEnd);
          bridgeCleanup = () => {
            term.textarea?.removeEventListener("keydown", bridgeKeyDown);
            term.textarea?.removeEventListener("beforeinput", bridgeBeforeInput);
            term.textarea?.removeEventListener("compositionstart", bridgeCompositionStart);
            term.textarea?.removeEventListener("compositionend", bridgeCompositionEnd);
          };
        } else if (retries > 0) {
          requestAnimationFrame(() => attachInputBridge(retries - 1));
        }
      };
      queueMicrotask(() => attachInputBridge());
      return () => {
        disposed = true;
        bridgeCleanup?.();
        onDataDisposable.dispose();
      };
    },
    []
  );
  return { attachInputHandlers };
}
export {
  useTerminalInput
};
