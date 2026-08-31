import { useEffect, useState } from 'react';
import { ExternalLink, Folder, Loader2, Sun, Moon, Monitor, LogOut, type LucideIcon } from 'lucide-react';
import { ipc } from '../../lib/core/ipc';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { toast } from '../../lib/core/toast';
import type { ThemeMode } from '../../types/settings';
import { AppThemeGrid } from './AppThemeGrid';
import { LanguageDropdown } from './LanguageDropdown';
import { JcliSection } from './JcliSection';
import { ActivityBarItemsSection } from './ActivityBarItemsSection';
import { TabBarGlassOpacitySlider, TabBarPositionSelector } from './TabBarControls';

/**
 * GeneralSection - app-wide settings.
 *
 * Contains:
 *   - Language
 *   - Theme mode (light/dark/system)
 *   - App color themes (dark & light)
 *   - Tab bar glass opacity & position
 *   - Activity bar items (visibility & order)
 *   - Data location
 *   - JCLI management
 *
 * Sub-components live in separate files under ./settings/ and each
 * pulls its own state from the Zustand store.
 */
export default function GeneralSection() {
  const { t } = useI18n();
  const [dataPath, setDataPath] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const themeMode = useStore((s) => s.themeMode);
  const setThemeMode = useStore((s) => s.setThemeMode);
  const appThemeIdDark = useStore((s) => s.appThemeIdDark);
  const appThemeIdLight = useStore((s) => s.appThemeIdLight);
  const setAppThemeIdDark = useStore((s) => s.setAppThemeIdDark);
  const setAppThemeIdLight = useStore((s) => s.setAppThemeIdLight);
  const confirmOnExit = useStore((s) => s.confirmOnExit);
  const setConfirmOnExit = useStore((s) => s.setConfirmOnExit);

  useEffect(() => {
    ipc
      .init()
      .then(setDataPath)
      .catch((e) => toast.error(String(e)));
  }, []);

  const handleOpen = async () => {
    if (!dataPath) return;
    setOpening(true);
    try {
      await ipc.openDataDir();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setOpening(false);
    }
  };

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
      {/* ---- Language ---- */}
      <div id="settings-general-language">
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('general.language')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
          {t('general.languageDesc')}
        </p>
        <LanguageDropdown />
      </div>

      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ---- Theme Mode ---- */}
      <div id="settings-general-theme">
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

      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ---- App Color Theme (Dark) ---- */}
      <div id="settings-general-appThemeDark">
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('appearance.appThemeDark')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-5">
          {t('appearance.appThemeDarkDesc')}
        </p>
        <AppThemeGrid
          isDark={true}
          selectedId={appThemeIdDark}
          onSelect={setAppThemeIdDark}
          label={(id) => t(`appearance.appTheme_${id}` as any)}
        />
      </div>

      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ---- App Color Theme (Light) ---- */}
      <div id="settings-general-appThemeLight">
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('appearance.appThemeLight')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-5">
          {t('appearance.appThemeLightDesc')}
        </p>
        <AppThemeGrid
          isDark={false}
          selectedId={appThemeIdLight}
          onSelect={setAppThemeIdLight}
          label={(id) => t(`appearance.appTheme_${id}` as any)}
        />
      </div>

      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ---- Tab Bar Glass Opacity ---- */}
      <div id="settings-general-tabBarGlassOpacity">
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('general.tabBarGlassOpacity')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
          {t('general.tabBarGlassOpacityDesc')}
        </p>
        <TabBarGlassOpacitySlider />
      </div>

      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ---- Tab Bar Position ---- */}
      <div id="settings-general-tabBarPosition">
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('general.tabBarPosition')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
          {t('general.tabBarPositionDesc')}
        </p>
        <TabBarPositionSelector />
      </div>

      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ---- Exit Confirmation ---- */}
      <div id="settings-general-confirmOnExit">
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('general.confirmOnExit')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
          {t('general.confirmOnExitDesc')}
        </p>
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)]">
          <LogOut className="w-5 h-5 text-[var(--vscode-descriptionForeground)] shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[var(--vscode-foreground)]">
              {t('general.confirmOnExit')}
            </div>
            <div className="text-xs text-[var(--vscode-descriptionForeground)]">
              {t('general.confirmOnExitDesc')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfirmOnExit(!confirmOnExit)}
            aria-label={t('general.confirmOnExit')}
            className={`relative w-8 h-5 rounded-full transition-colors flex-shrink-0 cursor-pointer ${
              confirmOnExit
                ? 'bg-[var(--vscode-button-background)]'
                : 'bg-[var(--vscode-input-border)]'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform ${
                confirmOnExit
                  ? 'translate-x-3 bg-[var(--vscode-button-foreground)]'
                  : 'bg-[var(--vscode-descriptionForeground)]'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ---- Activity Bar Items (visibility & order) ---- */}
      <div id="settings-general-activityBarItems">
        <ActivityBarItemsSection />
      </div>

      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ---- Data Location ---- */}
      <div id="settings-general-dataLocation">
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('general.dataLocation')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
          {t('general.dataLocationDesc')}
        </p>

        <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)]">
          <Folder className="w-5 h-5 text-[var(--vscode-descriptionForeground)] shrink-0" />
          <span className="text-sm text-[var(--vscode-foreground)] truncate flex-1 font-mono">
            {dataPath ?? t('general.loading')}
          </span>
          <button
            onClick={handleOpen}
            disabled={!dataPath || opening}
            className="jstudio-btn-primary shrink-0"
          >
            {opening ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4" />
            )}
            <span>{t('general.open')}</span>
          </button>
        </div>
      </div>

      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ---- JCLI ---- */}
      <div id="settings-general-jcli">
        <JcliSection />
      </div>
    </div>
  );
}
