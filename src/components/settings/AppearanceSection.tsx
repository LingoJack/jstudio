import { Sun, Moon, Monitor, type LucideIcon } from 'lucide-react';
import { useStore } from '../../store/useStore';
import type { ThemeMode } from '../../lib/storage';

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

export default function AppearanceSection() {
  const themeMode = useStore((s) => s.themeMode);
  const setThemeMode = useStore((s) => s.setThemeMode);

  return (
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
  );
}
