import { create } from "zustand";
import { createDocumentsSlice } from "./documentsSlice";
import { createInitSlice } from "./initSlice";
import { createTrashSlice } from "./trashSlice";
import { createImportExportSlice } from "./importExportSlice";
import { createEditorSlice } from "./editorSlice";
import { createUiSlice } from "./uiSlice";
import { createTerminalSlice } from "./terminalSlice";
import { createToastSlice } from "./toastSlice";
import { createFoldersSlice } from "./foldersSlice";
import { createWorkspaceSlice } from "./workspaceSlice";
import { createAgentSlice } from "./agentSlice";
import { createBrowserSlice } from "./browserSlice";
const useStore = create((set, get) => ({
  ...createDocumentsSlice(set, get),
  ...createInitSlice(set, get),
  ...createTrashSlice(set, get),
  ...createImportExportSlice(set, get),
  ...createEditorSlice(set, get),
  ...createUiSlice(set, get),
  ...createTerminalSlice(set, get),
  ...createToastSlice(set, get),
  ...createFoldersSlice(set, get),
  ...createWorkspaceSlice(set, get),
  ...createAgentSlice(set, get),
  ...createBrowserSlice(set, get)
}));
if (typeof window !== "undefined" && window.matchMedia) {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", (e) => {
    if (useStore.getState().themeMode !== "system") return;
    const isDark = e.matches;
    if (isDark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    useStore.setState({ isDarkMode: isDark });
  });
}
export {
  useStore
};
