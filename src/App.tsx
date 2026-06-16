import { useEffect } from 'react';
import { useStore } from './store/useStore';
import DocumentList from './components/DocumentList';
import BlockEditor from './components/BlockEditor';
import Settings from './components/Settings';
import { FileText, Settings as SettingsIcon, Plus } from 'lucide-react';

export default function App() {
  const init = useStore((s) => s.init);
  const isLoading = useStore((s) => s.isLoading);
  // Subscribe to a boolean only — NOT the activeDoc object reference.
  // setActiveDocBlocks() (fires on every 300ms debounce tick) replaces the
  // activeDoc reference, which would re-render App and cascade to BlockEditor,
  // causing ProseMirror cursor lag (especially in code blocks).
  const hasActiveDoc = useStore((s) => !!s.activeDoc);
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);
  const isSettingsOpen = useStore((s) => s.isSettingsOpen);

  const createDocument = useStore((s) => s.createDocument);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);

  useEffect(() => {
    init();
  }, [init]);

  if (isLoading) {
    return (
      <div className="h-screen bg-[var(--vscode-editor-background)] flex items-center justify-center">
        <div className="text-[var(--vscode-descriptionForeground)] text-sm">
          正在加载...
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex bg-[var(--vscode-activityBar-background)] text-[var(--vscode-editor-foreground)] font-sans tracking-tight overflow-hidden">
      {/* ==============================
          Activity Bar (left-most)
         ============================== */}
      <div className="w-12 shrink-0 flex flex-col items-center justify-between bg-[var(--vscode-activityBar-background)] border-r border-[var(--vscode-activityBar-border)] py-2 select-none">
        {/* Top: Documents entry */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => {
              setSettingsOpen(false);
              if (!isSidebarOpen) toggleSidebar();
            }}
            className={`w-10 h-10 flex items-center justify-center rounded-sm transition-colors duration-150 cursor-pointer relative ${
              !isSettingsOpen
                ? 'text-[var(--vscode-foreground)]'
                : 'text-[var(--vscode-activityBar-foreground)] opacity-60 hover:opacity-100'
            }`}
            title="文档"
          >
            {/* Active indicator bar */}
            {!isSettingsOpen && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r bg-[var(--vscode-tab-activeBorderTop)]" />
            )}
            <FileText className="w-5 h-5" />
          </button>
        </div>

        {/* Bottom: Settings entry */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => setSettingsOpen(true)}
            className={`w-10 h-10 flex items-center justify-center rounded-sm transition-colors duration-150 cursor-pointer relative ${
              isSettingsOpen
                ? 'text-[var(--vscode-foreground)]'
                : 'text-[var(--vscode-activityBar-foreground)] opacity-60 hover:opacity-100'
            }`}
            title="设置"
          >
            {isSettingsOpen && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r bg-[var(--vscode-tab-activeBorderTop)]" />
            )}
            <SettingsIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ==============================
          Secondary sidebar: Document list
         ============================== */}
      {isSidebarOpen && !isSettingsOpen && <DocumentList />}

      {/* ==============================
          Main content area (right)
         ============================== */}
      <div className="flex-1 min-w-0 h-full bg-[var(--vscode-editor-background)] flex flex-col overflow-hidden relative">
        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {isSettingsOpen ? (
            <Settings />
          ) : hasActiveDoc ? (
            <BlockEditor />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-center gap-4">
              <FileText className="w-12 h-12 text-[var(--vscode-descriptionForeground)] opacity-40" />
              <div>
                <h3 className="font-semibold text-base text-[var(--vscode-foreground)]">还没有文档</h3>
                <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-1.5">
                  点击左侧文档列表顶部的「+」创建你的第一篇文档
                </p>
              </div>
              <button
                onClick={createDocument}
                className="cursor-pointer bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] text-[var(--vscode-button-foreground)] rounded-sm px-4 py-2 text-xs font-medium flex items-center gap-1.5 transition-colors duration-150 mt-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建文档</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
