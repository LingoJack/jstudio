import { useState } from 'react';
import { Sun, Moon, Info, Palette, Monitor, Github, Heart, ArrowLeft } from 'lucide-react';
import { useStore } from '../store/useStore';

type SettingsTab = 'appearance' | 'about';

const APP_VERSION = '0.1.0';

export default function Settings() {
  const isDarkMode = useStore((s) => s.isDarkMode);
  const toggleDarkMode = useStore((s) => s.toggleDarkMode);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

  const tabBtnBase = 'flex items-center gap-2 px-3 py-1.5 rounded-sm transition-colors duration-150 text-xs cursor-pointer';
  const tabBtnActive =
    'bg-[var(--vscode-list-activeSelectionBackground)] font-medium text-white';
  const tabBtnInactive =
    'text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)]';

  return (
    <div className="w-full h-full bg-[var(--vscode-editor-background)] flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="shrink-0 border-b border-[var(--vscode-widget-border)] bg-[var(--vscode-sideBarSectionHeader-background)] px-4 py-2.5 flex items-center gap-3">
        <button
          onClick={() => setSettingsOpen(false)}
          className="cursor-pointer p-1.5 rounded-sm text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150"
          title="返回"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="font-semibold text-sm text-[var(--vscode-foreground)]">设置</h2>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 border-b border-[var(--vscode-widget-border)] bg-[var(--vscode-editor-background)] px-4 py-2 flex items-center gap-1">
        <button
          onClick={() => setActiveTab('appearance')}
          className={`${tabBtnBase} ${activeTab === 'appearance' ? tabBtnActive : tabBtnInactive}`}
        >
          <Palette className="w-3.5 h-3.5" />
          <span>外观</span>
        </button>
        <button
          onClick={() => setActiveTab('about')}
          className={`${tabBtnBase} ${activeTab === 'about' ? tabBtnActive : tabBtnInactive}`}
        >
          <Info className="w-3.5 h-3.5" />
          <span>关于</span>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          {activeTab === 'appearance' && (
            <AppearanceTab
              isDarkMode={isDarkMode}
              onToggleTheme={toggleDarkMode}
            />
          )}
          {activeTab === 'about' && <AboutTab />}
        </div>
      </div>
    </div>
  );
}

// ================================================================
// AppearanceTab — theme & display preferences
// ================================================================
interface AppearanceTabProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

function AppearanceTab({ isDarkMode, onToggleTheme }: AppearanceTabProps) {
  return (
    <div className="space-y-6">
      {/* Section: Theme */}
      <section>
        <h3 className="text-[11px] uppercase font-semibold text-[var(--vscode-descriptionForeground)] mb-3">
          主题 (Theme)
        </h3>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          {/* Dark option */}
          <button
            onClick={() => {
              if (!isDarkMode) onToggleTheme();
            }}
            className={`cursor-pointer p-4 rounded-lg border flex flex-col items-center gap-2.5 transition-colors duration-150 ${
              isDarkMode
                ? 'bg-[var(--vscode-list-activeSelectionBackground)] border-[var(--vscode-list-activeSelectionBackground)] text-white'
                : 'bg-[var(--vscode-sideBar-background)] border-[var(--vscode-widget-border)] text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] hover:border-[var(--vscode-list-activeSelectionBackground)]'
            }`}
          >
            <Moon className="w-6 h-6" />
            <span className="text-xs font-medium">深色模式</span>
          </button>

          {/* Light option */}
          <button
            onClick={() => {
              if (isDarkMode) onToggleTheme();
            }}
            className={`cursor-pointer p-4 rounded-lg border flex flex-col items-center gap-2.5 transition-colors duration-150 ${
              !isDarkMode
                ? 'bg-[var(--vscode-list-activeSelectionBackground)] border-[var(--vscode-list-activeSelectionBackground)] text-white'
                : 'bg-[var(--vscode-sideBar-background)] border-[var(--vscode-widget-border)] text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] hover:border-[var(--vscode-list-activeSelectionBackground)]'
            }`}
          >
            <Sun className="w-6 h-6" />
            <span className="text-xs font-medium">浅色模式</span>
          </button>
        </div>
        <p className="text-[11px] text-[var(--vscode-descriptionForeground)] leading-relaxed mt-3">
          主题偏好会自动保存到本地，下次打开应用时恢复。
        </p>
      </section>
    </div>
  );
}

// ================================================================
// AboutTab — application info
// ================================================================
function AboutTab() {
  return (
    <div className="space-y-6">
      {/* Logo & name */}
      <div className="flex flex-col items-center gap-3 py-6">
        <div className="w-20 h-20 rounded-2xl bg-[var(--vscode-list-activeSelectionBackground)] flex items-center justify-center shadow-lg">
          <Monitor className="w-10 h-10 text-white" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-[var(--vscode-foreground)]">
            JStudio
          </h2>
          <p className="text-xs text-[var(--vscode-descriptionForeground)] font-mono mt-1">
            v{APP_VERSION}
          </p>
        </div>
      </div>

      {/* Tagline */}
      <div className="bg-[var(--vscode-sideBar-background)] border border-[var(--vscode-widget-border)] rounded-lg p-4">
        <p className="text-sm text-[var(--vscode-foreground)] leading-relaxed text-center">
          离线优先的本地 Notion 风格知识库编辑器
        </p>
        <p className="text-xs text-[var(--vscode-descriptionForeground)] leading-relaxed text-center mt-2">
          实时 HTML 渲染 · 双向链接 · 知识图谱可视化 · 涂鸦画板 · 斜杠命令
        </p>
      </div>

      {/* Tech stack */}
      <section>
        <h3 className="text-[11px] uppercase font-semibold text-[var(--vscode-descriptionForeground)] mb-2.5">
          技术栈
        </h3>
        <div className="flex flex-wrap gap-2">
          {['Tauri 2', 'React 19', 'TypeScript', 'Zustand', 'TailwindCSS', 'tldraw'].map(
            (tech) => (
              <span
                key={tech}
                className="text-[11px] px-2.5 py-1 rounded-full bg-[var(--vscode-sideBar-background)] border border-[var(--vscode-widget-border)] text-[var(--vscode-descriptionForeground)]"
              >
                {tech}
              </span>
            ),
          )}
        </div>
      </section>

      {/* Privacy note */}
      <div className="bg-[var(--vscode-sideBar-background)] border border-[var(--vscode-widget-border)] rounded-lg p-3.5 flex items-start gap-3">
        <Heart className="w-4 h-4 text-[var(--vscode-errorForeground)] mt-0.5 shrink-0" />
        <div>
          <div className="text-xs font-semibold text-[var(--vscode-foreground)]">
            隐私优先
          </div>
          <p className="text-[11px] text-[var(--vscode-descriptionForeground)] leading-relaxed mt-1">
            所有数据保存在本地文件系统，无云端依赖，隐私不出本机。
          </p>
        </div>
      </div>

      {/* Links */}
      <section>
        <h3 className="text-[11px] uppercase font-semibold text-[var(--vscode-descriptionForeground)] mb-2.5">
          链接
        </h3>
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[var(--vscode-sideBar-background)] border border-[var(--vscode-widget-border)] hover:bg-[var(--vscode-list-hoverBackground)] hover:border-[var(--vscode-list-activeSelectionBackground)] transition-colors duration-150 cursor-pointer"
        >
          <Github className="w-4 h-4 text-[var(--vscode-descriptionForeground)]" />
          <span className="text-xs text-[var(--vscode-foreground)]">
            源代码仓库
          </span>
        </a>
      </section>

      <p className="text-[10px] text-[var(--vscode-descriptionForeground)] text-center pt-2">
        © {new Date().getFullYear()} JStudio · Made with ♥
      </p>
    </div>
  );
}
