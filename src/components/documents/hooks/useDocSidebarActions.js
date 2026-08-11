import { useCallback, useRef } from "react";
import { useStore } from "../../../store/useStore";
import { ipc } from "../../../lib/core/ipc";
import { blocksToMarkdown } from "../../../lib/editor/markdownExport";
function useDocSidebarActions({
  importDocumentFromMarkdown,
  importMarkdownDirectory,
  exportDocumentBundle,
  importDocumentBundle,
  addToast,
  setContextMenu,
  t
}) {
  const tRef = useRef(t);
  tRef.current = t;
  const handleOpenInFinder = useCallback(async (docId) => {
    try {
      await ipc.openDocDir(docId);
    } catch (e) {
      console.error("Failed to open document folder:", e);
    }
    setContextMenu(null);
  }, [setContextMenu]);
  const handleCopyPath = useCallback(async (docId) => {
    try {
      const path = await ipc.getDocPath(docId);
      await navigator.clipboard.writeText(path);
    } catch (e) {
      console.error("Failed to copy path:", e);
    }
    setContextMenu(null);
  }, [setContextMenu]);
  const handleCopyRelativePath = useCallback(async (docId) => {
    try {
      const path = await ipc.getDocPath(docId);
      const home = await ipc.init();
      let rel = path;
      if (path.startsWith(home)) {
        rel = path.slice(home.length).replace(/^[/\\]+/, "");
      }
      await navigator.clipboard.writeText(rel);
    } catch (e) {
      console.error("Failed to copy relative path:", e);
    }
    setContextMenu(null);
  }, [setContextMenu]);
  const handleImportMarkdown = useCallback(async (folderId) => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const filePath = await open({
        multiple: false,
        filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown"] }]
      });
      if (!filePath || typeof filePath !== "string") return;
      const bytes = await ipc.readFileBytes(filePath);
      const md = new TextDecoder("utf-8").decode(new Uint8Array(bytes));
      const filename = filePath.split(/[/\\]/).pop() ?? "Untitled.md";
      await importDocumentFromMarkdown(filename, md, folderId);
    } catch (e) {
      console.error("Failed to import Markdown:", e);
    }
  }, [importDocumentFromMarkdown]);
  const handleImportMarkdownDirectory = useCallback(async (folderId) => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dirPath = await open({ directory: true, multiple: false });
      if (!dirPath || typeof dirPath !== "string") return;
      const count = await importMarkdownDirectory(dirPath, folderId);
      const tt = tRef.current;
      if (count === 0) {
        addToast("info", tt("doclist.importDirEmpty"));
      } else {
        addToast("success", tt("doclist.importDirSuccess", { count }));
      }
    } catch (e) {
      console.error("Failed to import Markdown directory:", e);
      addToast("error", tRef.current("doclist.importDirFailed"));
    }
  }, [importMarkdownDirectory, addToast]);
  const handleExportBundle = useCallback(async (docId) => {
    setContextMenu(null);
    try {
      const ok = await exportDocumentBundle(docId);
      if (ok) addToast("success", tRef.current("doclist.exportBundleSuccess"));
    } catch (e) {
      console.error("Failed to export bundle:", e);
      addToast("error", tRef.current("doclist.exportBundleFailed"));
    }
  }, [exportDocumentBundle, addToast, setContextMenu]);
  const handleImportBundle = useCallback(async (folderId) => {
    try {
      const id = await importDocumentBundle(folderId);
      if (id) addToast("success", tRef.current("doclist.importBundleSuccess"));
    } catch (e) {
      console.error("Failed to import bundle:", e);
      addToast("error", tRef.current("doclist.importBundleFailed"));
    }
  }, [importDocumentBundle, addToast]);
  const handleCopyAsMarkdown = useCallback(async (docId) => {
    setContextMenu(null);
    try {
      const doc = useStore.getState().documents.find((d) => d.id === docId);
      if (!doc) return;
      const tt = tRef.current;
      const md = blocksToMarkdown(doc.blocks, {
        file: (name) => name ? tt("doclist.mdPlaceholderFile", { name }) : tt("doclist.mdPlaceholderFileEmpty"),
        diagram: tt("doclist.mdPlaceholderDiagram")
      });
      await navigator.clipboard.writeText(md);
      addToast("success", tt("doclist.copyAsMarkdownSuccess"));
    } catch (e) {
      console.error("Failed to copy as Markdown:", e);
      addToast("error", tRef.current("doclist.copyAsMarkdownFailed"));
    }
  }, [addToast, setContextMenu]);
  return {
    handleOpenInFinder,
    handleCopyPath,
    handleCopyRelativePath,
    handleImportMarkdown,
    handleImportMarkdownDirectory,
    handleExportBundle,
    handleImportBundle,
    handleCopyAsMarkdown
  };
}
export {
  useDocSidebarActions
};
