import { useEffect } from 'react';
import { useStore } from './store/useStore';
import DocumentList from './components/DocumentList';
import BlockEditor from './components/BlockEditor';
import LocalFolder from './components/LocalFolder';
import { FileText, Info, FolderDot, PanelLeftClose, PanelLeft, Plus, Trash2 } from 'lucide-react';

export default function App() {
  const init = useStore((s) => s.init);
  const isLoading = useStore((s) => s.isLoading);
  const activeDoc = useStore((s) => s.activeDoc);
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);
  const isFolderOpen = useStore((s) => s.isFolderOpen);

  const createDocument = useStore((s) => s.createDocument);
  const deleteDocument = useStore((s) => s.deleteDocument);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const toggleFolder = useStore((s) => s.toggleFolder);
  const setFolderOpen = useStore((s) => s.setFolderOpen);

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
    <div className="h-screen bg-[var(--vscode-sideBar-background)] text-[var(--vscode-editor-foreground)] flex flex-col font-sans tracking-tight relative overflow-hidden">
      <div className="w-full flex-1 h-full bg-[var(--vscode-editor-background)] flex flex-col overflow-hidden relative z-10">
        {/* Top bar */}
        <div className="h-10 border-b border-[var(--vscode-titleBar-border)] px-2 md:px-3 flex items-center justify-between shrink-0 select-none bg-[var(--vscode-titleBar-background)]">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSidebar}
              className="cursor-pointer p-1.5 rounded-sm text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150"
              title={isSidebarOpen ? '收拢左边栏' : '展开左边栏'}
            >
              {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>
            <div className="font-medium text-xs text-[var(--vscode-titleBar-foreground)] hidden sm:flex items-center gap-1.5 ml-1">
              <FileText className="w-3.5 h-3.5 text-[var(--vscode-icon-foreground)]" />
              <span>OmniNote</span>
            </div>
          </div>

          <div className="flex items-center gap-0.5">
            <button
              onClick={createDocument}
              className="cursor-pointer bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] text-[var(--vscode-button-foreground)] rounded-sm px-2.5 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors duration-150 mr-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden md:inline">新建</span>
            </button>

            {activeDoc && (
              <>
                <button
                  onClick={() => deleteDocument(activeDoc.id)}
                  className="cursor-pointer p-1.5 rounded-sm text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150"
                  title="删除文档"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-[var(--vscode-widget-border)] mx-1 hidden sm:block" />
              </>
            )}

            <button
              onClick={toggleFolder}
              className={`cursor-pointer p-1.5 rounded-sm transition-colors duration-150 ${
                isFolderOpen
                  ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)]'
                  : 'text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
              }`}
              title="本地文件夹"
            >
              <FolderDot className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Workspace */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {isSidebarOpen && <DocumentList />}

          <div className="flex-1 min-w-0 h-full bg-[var(--vscode-editor-background)] overflow-hidden">
            {activeDoc ? (
              <BlockEditor />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-center gap-3">
                <Info className="w-10 h-10 text-[var(--vscode-descriptionForeground)]" />
                <div>
                  <h3 className="font-semibold text-[var(--vscode-foreground)]">请选择左侧文档</h3>
                  <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-1">
                    创建或选择现有文档立即进行整理编写。
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {isFolderOpen && <LocalFolder onClose={() => setFolderOpen(false)} />}
      </div>
    </div>
  );
}
