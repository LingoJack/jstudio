import { Sun, Moon, Monitor, type LucideIcon } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/i18n';
import type { ThemeMode } from '../../lib/storage';
import { TERMINAL_THEMES } from '../../lib/terminalThemes';

export default function AppearanceSection() {
  const { t } = useI18n();
  const themeMode = useStore((s) => s.themeMode);
  const setThemeMode = useStore((s) => s.setThemeMode);
  const activityBarBorder = useStore((s) => s.activityBarBorder);
  const setActivityBarBorder = useStore((s) => s.setActivityBarBorder);
  const terminalThemeId = useStore((s) => s.terminalThemeId);
  const setTerminalThemeId = useStore((s) => s.setTerminalThemeId);

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

      {/* Divider */}
      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* Terminal theme selector */}
      <div>
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('appearance.terminalTheme')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-5">
          {t('appearance.terminalThemeDesc')}
        </p>

        <div className="grid grid-cols-2 gap-4">
          {TERMINAL_THEMES.map((th) => {
            const selected = terminalThemeId === th.id;
            return (
              <button
                key={th.id}
                onClick={() => setTerminalThemeId(th.id)}
                className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all duration-150 cursor-pointer text-left ${
                  selected
                    ? 'border-[var(--vscode-focusBorder)]'
                    : 'border-transparent hover:border-[var(--vscode-widget-border)]'
                }`}
                style={{ background: th.ui.panelBg }}
              >
                {/* Mini terminal preview swatch */}
                <div
                  className="w-12 h-12 rounded-md shrink-0 flex items-center justify-center font-mono text-xs"
                  style={{
                    background: th.background,
                    color: th.foreground,
                    border: `1px solid ${th.ui.barBorder}`,
                  }}
                >
                  <span style={{ color: th.green }}>$</span>
                  <span style={{ color: th.cursor }} className="ml-0.5">_</span>
                </div>
                <div className="min-w-0">
                  <div
                    className="text-sm font-medium truncate"
                    style={{ color: th.foreground }}
                  >
                    {t(`appearance.terminalTheme_${th.id}`)}
                  </div>
                  {/* Color row indicator */}
                  <div className="flex gap-1 mt-1.5">
                    {[th.red, th.green, th.yellow, th.blue, th.magenta, th.cyan].map(
                      (c) => (
                        <span
                          key={c}
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ background: c }}
                        />
                      ),
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
