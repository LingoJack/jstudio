import { resolveMonospaceFont } from "../../lib/editor/fonts";
import { usePtySessions } from "./usePtySessions";
import { useTerminalInstances } from "./useTerminalInstances";
import { useTerminalInput } from "./useTerminalInput";
function useTerminalManager(fontId, terminalFontSize, cursorStyle) {
  const resolvedFontFamily = resolveMonospaceFont(fontId);
  const ptySessions = usePtySessions();
  const terminalInput = useTerminalInput();
  const { terminalsRef, setupTerminal, destroyTerminal, destroyAll, tryEnableWebgl } = useTerminalInstances({
    resolvedFontFamily,
    terminalFontSize,
    cursorStyle,
    ptySessions,
    terminalInput
  });
  return {
    terminalsRef,
    setupTerminal,
    destroyTerminal,
    destroyAll,
    tryEnableWebgl
  };
}
export {
  useTerminalManager
};
