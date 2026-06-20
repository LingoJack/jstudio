import { useEffect, useState, useRef, useCallback } from 'react';
import { ExternalLink, Folder, Loader2, AlertCircle, Globe, ChevronDown, Check, Sun, Moon, Monitor, Terminal, CheckCircle2, XCircle, Trash2, Download, FileText, Settings as SettingsIcon, GripVertical, type LucideIcon } from 'lucide-react';
import { storage } from '../../lib/storage';
import type { JcliStatus, ActivityItemId } from '../../lib/storage';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import type { Language, ThemeMode } from '../../lib/storage';

/**
 * GeneralSection — app-wide settings.
 *
 * Contains:
 *   - Language
 *   - Theme mode (light/dark/system)
 *   - Activity bar border toggle
 *   - Data location
 */
export default function GeneralSection() {
  const { t } = useI18n();
  const [dataPath, setDataPath] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const themeMode = useStore((s) => s.themeMode);
  const setThemeMode = useStore((s) => s.setThemeMode);
  const activityBarBorder = useStore((s) => s.activityBarBorder);
  const setActivityBarBorder = useStore((s) => s.setActivityBarBorder);

  useEffect(() => {
    storage
      .init()
      .then(setDataPath)
      .catch((e) => toast.error(String(e)));
  }, []);

  const handleOpen = async () => {
    if (!dataPath) return;
    setOpening(true);
    try {
      await storage.openDataDir();
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
      <div>
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

      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ---- Activity Bar Border ---- */}
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

      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ---- Activity Bar Items (visibility & order) ---- */}
      <ActivityBarItemsSection />

      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ---- Data Location ---- */}
      <div>
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
      <JcliSection />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// LanguageDropdown
// ──────────────────────────────────────────────────────────────────

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
];

function LanguageDropdown() {
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = LANGUAGE_OPTIONS.find((o) => o.value === language) ?? LANGUAGE_OPTIONS[0];

  const close = useCallback(() => {
    setOpen(false);
    setHighlighted(0);
  }, []);

  const handleSelect = useCallback(
    (val: Language) => {
      setLanguage(val);
      close();
    },
    [setLanguage, close],
  );

  useEffect(() => {
    if (!open) return;
    const idx = LANGUAGE_OPTIONS.findIndex((o) => o.value === language);
    setHighlighted(idx >= 0 ? idx : 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, close]);

  return (
    <div className="font-dropdown">
      <div
        ref={triggerRef}
        className="font-dropdown-trigger"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((p) => !p)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Globe size={14} className="opacity-50" />
        <span className="font-dropdown-label">{selected?.label ?? '—'}</span>
        <ChevronDown size={14} className="font-dropdown-chevron" />
      </div>

      {open && (
        <div ref={panelRef} className="font-dropdown-panel">
          <div className="font-dropdown-list">
            {LANGUAGE_OPTIONS.map((opt, index) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                onMouseEnter={() => setHighlighted(index)}
                className={`font-dropdown-option ${opt.value === language ? 'is-active' : ''} ${index === highlighted ? 'is-highlighted' : ''}`}
              >
                <span className="font-dropdown-option-label">{opt.label}</span>
                {opt.value === language && <Check size={13} className="font-dropdown-check" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// JcliSection
// ──────────────────────────────────────────────────────────────────

function JcliSection() {
  const { t } = useI18n();
  const [status, setStatus] = useState<JcliStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await storage.checkJcli();
      setStatus(s);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleInstall = async () => {
    setBusy(true);
    try {
      await storage.installJcli();
      await refresh();
      toast.success(t('jcli.installSuccess'));
    } catch (e) {
      toast.error(`${t('jcli.installFailed')}: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleUninstall = async () => {
    setBusy(true);
    try {
      await storage.uninstallJcli();
      await refresh();
      toast.success(t('jcli.uninstallSuccess'));
    } catch (e) {
      toast.error(`${t('jcli.uninstallFailed')}: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const checking = status === null;
  const installed = status?.installed ?? false;
  const canInstall = status?.bundled ?? false;

  return (
    <div>
      <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
        {t('jcli.title')}
      </label>
      <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
        {t('jcli.desc')}
      </p>

      {/* Status row — path shown inline, same pattern as Data Location */}
      <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)]">
        <Terminal className="w-5 h-5 text-[var(--vscode-descriptionForeground)] shrink-0" />

        {checking ? (
          <span className="text-sm text-[var(--vscode-descriptionForeground)] flex-1">
            {t('jcli.checking')}
          </span>
        ) : (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {installed ? (
              <CheckCircle2 className="w-4 h-4 text-[var(--vscode-testing-iconPassed)] shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-[var(--vscode-errorForeground)] shrink-0" />
            )}
            <span
              className={`text-sm shrink-0 ${installed ? 'text-[var(--vscode-foreground)]' : 'text-[var(--vscode-descriptionForeground)]'}`}
            >
              {installed ? t('jcli.installed') : t('jcli.notInstalled')}
            </span>
            {installed && status?.version && (
              <span className="text-xs text-[var(--vscode-descriptionForeground)] shrink-0 font-mono">
                {status.version}
              </span>
            )}
            {installed && status?.path && (
              <>
                <span className="text-xs text-[var(--vscode-descriptionForeground)] shrink-0">
                  ·
                </span>
                <span className="text-xs text-[var(--vscode-descriptionForeground)] truncate font-mono">
                  {status.path}
                </span>
              </>
            )}
          </div>
        )}

        {/* Action button — same jstudio-btn-primary as Data Location */}
        {!checking && (
          <button
            onClick={installed ? handleUninstall : handleInstall}
            disabled={busy || (!installed && !canInstall)}
            className="jstudio-btn-primary shrink-0"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : installed ? (
              <Trash2 className="w-4 h-4" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{installed ? t('jcli.uninstall') : t('jcli.install')}</span>
          </button>
        )}
      </div>

      {/* Bundled version warning (if not bundled) */}
      {status && !status.bundled && (
        <div className="mt-2 flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-[var(--vscode-inputValidation-warningBackground)] border border-[var(--vscode-inputValidation-warningBorder)]">
          <AlertCircle className="w-4 h-4 text-[var(--vscode-editorWarning-foreground)] shrink-0" />
          <span className="text-xs text-[var(--vscode-foreground)]">
            {t('jcli.notBundled')}
          </span>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// ActivityBarItemsSection — configure visibility & order of the
// left Activity Bar icons.
// ──────────────────────────────────────────────────────────────────

/** Icon + label metadata for each activity bar item id. */
const ACTIVITY_ITEM_META: Record<
  ActivityItemId,
  { icon: LucideIcon; labelKey: string }
> = {
  documents: { icon: FileText, labelKey: 'appearance.activityBarItem_documents' },
  terminal: { icon: Terminal, labelKey: 'appearance.activityBarItem_terminal' },
  settings: { icon: SettingsIcon, labelKey: 'appearance.activityBarItem_settings' },
};

function ActivityBarItemsSection() {
  const { t } = useI18n();
  const activityBarItems = useStore((s) => s.activityBarItems);
  const setActivityBarItems = useStore((s) => s.setActivityBarItems);

  /**
   * Use refs for drag state so event handlers always see the latest value
   * (avoiding stale-closure issues with React state during drag events).
   */
  const dragIndexRef = useRef(-1);
  const [overIndex, setOverIndex] = useState(-1);

  /** Toggle the visibility of a single entry. */
  const handleToggle = (id: ActivityItemId) => {
    const next = activityBarItems.map((item) =>
      item.id === id ? { ...item, visible: !item.visible } : item,
    );
    setActivityBarItems(next);
  };

  /**
   * Reorder by moving the dragged item to the drop position.
   * Settings is locked at the bottom — it can't be dragged and no
   * item can be dropped below it.
   */
  const handleDrop = (from: number, to: number) => {
    if (from === to) return;
    const next = [...activityBarItems];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setActivityBarItems(next);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
        {t('appearance.activityBarItems')}
      </label>
      <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
        {t('appearance.activityBarItemsDesc')}
      </p>

      <div className="space-y-1.5 max-w-sm">
        {activityBarItems.map((item, index) => {
          const meta = ACTIVITY_ITEM_META[item.id];
          if (!meta) return null;
          const Icon = meta.icon;
          const isFixed = item.id === 'settings';
          const isDragging = dragIndexRef.current === index;
          const isDragOver = overIndex === index && dragIndexRef.current !== -1 && dragIndexRef.current !== index;

          return (
            <div
              key={item.id}
              draggable={!isFixed}
              onDragStart={(e) => {
                if (isFixed) return;
                dragIndexRef.current = index;
                e.dataTransfer.effectAllowed = 'move';
                // Required for Firefox to initiate drag
                e.dataTransfer.setData('text/plain', item.id);
              }}
              onDragEnd={() => {
                dragIndexRef.current = -1;
                setOverIndex(-1);
              }}
              onDragOver={(e) => {
                if (isFixed || dragIndexRef.current === -1) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setOverIndex(index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndexRef.current !== -1 && !isFixed) {
                  handleDrop(dragIndexRef.current, index);
                }
                dragIndexRef.current = -1;
                setOverIndex(-1);
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                isDragging
                  ? 'opacity-40 border-[var(--vscode-focusBorder)]'
                  : isDragOver
                    ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-hoverBackground)]'
                    : 'border-[var(--vscode-widget-border)]'
              } ${!item.visible ? 'opacity-50' : ''} ${
                isFixed ? '' : 'bg-[var(--vscode-list-hoverBackground)]'
              } ${isFixed ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
            >
              {/* Drag handle */}
              <span className={`shrink-0 ${isFixed ? 'opacity-0' : 'text-[var(--vscode-descriptionForeground)]'}`}>
                <GripVertical className="w-4 h-4" />
              </span>

              {/* Icon preview */}
              <Icon className="w-4 h-4 text-[var(--vscode-foreground)] shrink-0" />

              {/* Label */}
              <span className="text-sm text-[var(--vscode-foreground)] flex-1">
                {t(meta.labelKey as 'appearance.activityBarItem_documents')}
              </span>

              {/* Visibility toggle */}
              <button
                onClick={() => handleToggle(item.id)}
                className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 cursor-pointer ${
                  item.visible
                    ? 'bg-[var(--vscode-button-background)]'
                    : 'bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]'
                }`}
                title={item.visible ? t('common.hide') : t('common.show')}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform duration-200 ${
                    item.visible
                      ? 'translate-x-4 bg-[var(--vscode-button-foreground)]'
                      : 'bg-[var(--vscode-descriptionForeground)]'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
