import { useState } from 'react';
import {
  Sun,
  Moon,
  Monitor,
  Palette,
  Info,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import type { ThemeMode } from '../lib/storage';

// ────────────────────────────────────────────────
// Settings sections
// ────────────────────────────────────────────────
type SectionId = 'appearance' | 'about';

interface NavItem {
  id: SectionId;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'about', label: '关于', icon: Info },
];

const themeOptions: {
  value: ThemeMode;
  label: string;
  icon: LucideIcon;
  desc: string;
}[] = [
  { value: 'light', label: '浅色', icon: Sun, desc: '始终使用浅色主题' },
  { value: 'dark', label: '深色', icon: Moon, desc: '始终使用深色主题' },
  { value: 'system', label: '跟随系统', icon: Monitor, desc: '自动匹配操作系统外观' },
];

export default function Settings() {
  const themeMode = useStore((s) => s.themeMode);
  const setThemeMode = useStore((s) => s.setThemeMode);

  const [activeSection, setActiveSection] = useState<SectionId>('appearance');

  return (
    <div className="w-full h-full flex bg-[var(--vscode-editor-background)]">
      {/* ── Left navigation ── */}
      <nav className="w-52 shrink-0 bg-[var(--vscode-sideBar-background)] border-r border-[var(--vscode-sideBar-border)] flex flex-col py-4 select-none">
        {/* Title */}
        <div className="px-4 mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
            设置
          </h2>
        </div>

        {/* Nav items */}
        <div className="flex-1 space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-sm text-xs transition-colors duration-150 cursor-pointer ${
                  active
                    ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)] font-medium'
                    : 'text-[var(--vscode-sideBar-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
                }`}
              >
                <Icon className="w-4 h-4 opacity-70" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Right content ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="px-8 py-4 border-b border-[var(--vscode-sideBar-border)] shrink-0">
          <h3 className="text-sm font-semibold text-[var(--vscode-foreground)]">
            {NAV_ITEMS.find((n) => n.id === activeSection)?.label}
          </h3>
        </div>

        {/* Content — scrollable, max-width for readability */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto px-8 py-6">
            {activeSection === 'appearance' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--vscode-foreground)] mb-1">
                    主题
                  </label>
                  <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-4">
                    选择应用的外观风格
                  </p>

                  <div className="grid grid-cols-3 gap-3">
                    {themeOptions.map((opt) => {
                      const Icon = opt.icon;
                      const selected = themeMode === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setThemeMode(opt.value)}
                          className={`flex flex-col items-center gap-2 p-5 rounded-md border-2 transition-all duration-150 cursor-pointer ${
                            selected
                              ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)]'
                              : 'border-transparent bg-[var(--vscode-list-hoverBackground)] hover:border-[var(--vscode-widget-border)]'
                          }`}
                        >
                          <Icon
                            className={`w-6 h-6 ${selected ? 'text-[var(--vscode-foreground)]' : 'text-[var(--vscode-descriptionForeground)]'}`}
                          />
                          <span
                            className={`text-xs ${selected ? 'text-[var(--vscode-foreground)] font-medium' : 'text-[var(--vscode-sideBar-foreground)]'}`}
                          >
                            {opt.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mt-3">
                    {themeOptions.find((t) => t.value === themeMode)?.desc}
                  </p>
                </div>
              </div>
            )}

            {activeSection === 'about' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-lg bg-[var(--vscode-button-background)] flex items-center justify-center shrink-0">
                    <Palette className="w-5 h-5 text-[var(--vscode-button-foreground)]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--vscode-foreground)]">
                      JStudio
                    </p>
                    <p className="text-[11px] text-[var(--vscode-descriptionForeground)]">
                      轻量级笔记与画布工作台
                    </p>
                  </div>
                </div>

                <div className="border-t border-[var(--vscode-sideBar-border)] pt-4 space-y-2.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[var(--vscode-descriptionForeground)]">
                      版本
                    </span>
                    <span className="text-[var(--vscode-foreground)]">
                      {__APP_VERSION__}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--vscode-descriptionForeground)]">
                      技术栈
                    </span>
                    <span className="text-[var(--vscode-foreground)]">
                      Tauri + React + TipTap
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
