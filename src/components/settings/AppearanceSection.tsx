import { Sun, Moon, Monitor, type LucideIcon } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/i18n';
import type { ThemeMode } from '../../lib/storage';

export default function AppearanceSection() {
  const { t } = useI18n();
  const themeMode = useStore((s) => s.themeMode);
  const setThemeMode = useStore((s) => s.setThemeMode);
  const activityBarBorder = useStore((s) => s.activityBarBorder);
  const setActivityBarBorder = useStore((s) => s.setActivityBarBorder);

  const themeOptions: {
    value: ThemeMode;
    label: string;
    desc: string;
    icon: LucideIcon;
  }[] = [
    { value: 'light', label: t('appearance.light'), desc: t('appearance.lightDesc'), icon: Sun },
    { value: 'dark', label: t('appearance.dark'), desc: t('appearance.darkDesc'), icon: Moon },
    { value: 'system', label: t('appearance.system'), desc: t('appearance.systemDesc'), icon: Monitor },
  ];

  return (
    <div className="space-y-8">
      {/* Theme selector */}
      <div>
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('appearance.theme')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-5">
          {t('appearance.themeDesc')}
        </p>

        <div className="grid grid-cols-3 gap-4">
          {themeOptions.map((opt) => {
            const Icon = opt.icon;
            const selected = themeMode === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setThemeMode(opt.value)}
                className={`flex flex-col items-center gap-3 p-6 rounded-lg border-2 transition-all duration-150 cursor-pointer ${
                  selected
                    ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)]'
                    : 'border-transparent bg-[var(--vscode-list-hoverBackground)] hover:border-[var(--vscode-widget-border)]'
                }`}
              >
                <Icon
                  className={`w-7 h-7 ${selected ? 'text-[var(--vscode-foreground)]' : 'text-[var(--vscode-descriptionForeground)]'}`}
                />
                <span
                  className={`text-sm ${selected ? 'text-[var(--vscode-foreground)] font-medium' : 'text-[var(--vscode-sideBar-foreground)]'}`}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-sm text-[var(--vscode-descriptionForeground)] mt-4">
          {themeOptions.find((o) => o.value === themeMode)?.desc}
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* Activity bar border toggle */}
      <div className="flex items-center justify-between">
        <div className="pr-4">
          <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1">
            {t('appearance.activityBarBorder')}
          </label>
          <p className="text-sm text-[var(--vscode-descriptionForeground)]">
            {t('appearance.activityBarBorderDesc')}
          </p>
        </div>
        <button
          onClick={() => setActivityBarBorder(!activityBarBorder)}
          className={`relative w-12 h-7 rounded-full transition-colors duration-200 shrink-0 cursor-pointer ${
            activityBarBorder
              ? 'bg-[var(--vscode-button-background)]'
              : 'bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]'
          }`}
        >
          <span
            className={`absolute top-1 left-1 w-5 h-5 rounded-full transition-transform duration-200 ${
              activityBarBorder
                ? 'translate-x-5 bg-[var(--vscode-button-foreground)]'
                : 'bg-[var(--vscode-descriptionForeground)]'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
