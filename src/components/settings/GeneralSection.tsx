import { useEffect, useState, useRef, useCallback } from 'react';
import { FolderOpen, Folder, Loader2, AlertCircle, Minus, Plus, ChevronDown, Check, Globe } from 'lucide-react';
import { storage } from '../../lib/storage';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/i18n';
import type { Language } from '../../lib/storage';
import {
  LATIN_FONTS,
  CJK_FONTS,
  resolveFontFamily,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
} from '../../lib/fonts';
import FontDropdown from '../ui/FontDropdown';

export default function GeneralSection() {
  const { t } = useI18n();
  const [dataPath, setDataPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  // Font settings from store
  const fontId = useStore((s) => s.fontId);
  const cjkFontId = useStore((s) => s.cjkFontId);
  const fontSize = useStore((s) => s.fontSize);
  const terminalFontSize = useStore((s) => s.terminalFontSize);
  const setFontId = useStore((s) => s.setFontId);
  const setCjkFontId = useStore((s) => s.setCjkFontId);
  const setFontSize = useStore((s) => s.setFontSize);
  const setTerminalFontSize = useStore((s) => s.setTerminalFontSize);

  useEffect(() => {
    storage
      .init()
      .then(setDataPath)
      .catch((e) => setError(String(e)));
  }, []);

  const handleOpen = async () => {
    if (!dataPath) return;
    setOpening(true);
    setError(null);
    try {
      await storage.openDataDir();
    } catch (e) {
      setError(String(e));
    } finally {
      setOpening(false);
    }
  };

  // Combined preview font-family for the preview box
  const previewFontFamily = resolveFontFamily(fontId, cjkFontId);

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

      {/* Divider */}
      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ---- Latin Font ---- */}
      <div>
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('general.latinFont')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
          {t('general.latinFontDesc')}
        </p>
        <FontDropdown
          options={LATIN_FONTS}
          value={fontId}
          onChange={setFontId}
          searchPlaceholder={t('font.searchPlaceholder')}
        />
      </div>

      {/* ---- CJK Font ---- */}
      <div>
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('general.cjkFont')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
          {t('general.cjkFontDesc')}
        </p>
        <FontDropdown
          options={CJK_FONTS}
          value={cjkFontId}
          onChange={setCjkFontId}
          searchPlaceholder={t('font.searchPlaceholder')}
        />
      </div>

      {/* ---- Font Size ---- */}
      <div>
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('general.fontSize')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
          {t('general.fontSizeDesc', { min: MIN_FONT_SIZE, max: MAX_FONT_SIZE })}
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setFontSize(fontSize - 1)}
            disabled={fontSize <= MIN_FONT_SIZE}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)] text-[var(--vscode-foreground)] hover:border-[var(--vscode-focusBorder)] transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Minus className="w-4 h-4" />
          </button>

          <input
            type="range"
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            step={1}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="flex-1 accent-[var(--vscode-focusBorder)] cursor-pointer"
          />

          <button
            onClick={() => setFontSize(fontSize + 1)}
            disabled={fontSize >= MAX_FONT_SIZE}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)] text-[var(--vscode-foreground)] hover:border-[var(--vscode-focusBorder)] transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Plus className="w-4 h-4" />
          </button>

          <span className="text-sm text-[var(--vscode-foreground)] tabular-nums w-16 text-center shrink-0 font-medium">
            {fontSize} px
          </span>
        </div>

        {/* Preview */}
        <div
          className="mt-4 px-5 py-4 rounded-lg bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)] text-[var(--vscode-foreground)]"
          style={{
            fontFamily: previewFontFamily,
            fontSize: `${fontSize}px`,
            lineHeight: 1.7,
          }}
        >
          {t('general.fontPreview')}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ---- Terminal Font Size ---- */}
      <div>
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('general.terminalFontSize')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
          {t('general.terminalFontSizeDesc', { min: 10, max: 28 })}
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setTerminalFontSize(terminalFontSize - 1)}
            disabled={terminalFontSize <= 10}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)] text-[var(--vscode-foreground)] hover:border-[var(--vscode-focusBorder)] transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Minus className="w-4 h-4" />
          </button>

          <input
            type="range"
            min={10}
            max={28}
            step={1}
            value={terminalFontSize}
            onChange={(e) => setTerminalFontSize(Number(e.target.value))}
            className="flex-1 accent-[var(--vscode-focusBorder)] cursor-pointer"
          />

          <button
            onClick={() => setTerminalFontSize(terminalFontSize + 1)}
            disabled={terminalFontSize >= 28}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)] text-[var(--vscode-foreground)] hover:border-[var(--vscode-focusBorder)] transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Plus className="w-4 h-4" />
          </button>

          <span className="text-sm text-[var(--vscode-foreground)] tabular-nums w-16 text-center shrink-0 font-medium">
            {terminalFontSize} px
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ---- Data Location ---- */}
      <div>
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('general.dataLocation')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
          {t('general.dataLocationDesc')}
        </p>

        {error ? (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-[var(--vscode-inputValidation-errorBackground)] border border-[var(--vscode-inputValidation-errorBorder)]">
            <AlertCircle className="w-5 h-5 text-[var(--vscode-errorForeground)] shrink-0" />
            <span className="text-sm text-[var(--vscode-errorForeground)]">
              {error}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)]">
            <Folder className="w-5 h-5 text-[var(--vscode-descriptionForeground)] shrink-0" />
            <span className="text-sm text-[var(--vscode-foreground)] truncate flex-1 font-mono">
              {dataPath ?? t('general.loading')}
            </span>
            <button
              onClick={handleOpen}
              disabled={!dataPath || opening}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {opening ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FolderOpen className="w-4 h-4" />
              )}
              <span>{t('general.open')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// LanguageDropdown — custom dropdown matching FontDropdown / CodeBlockView style
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

  // Reset highlight when opening
  useEffect(() => {
    if (!open) return;
    const idx = LANGUAGE_OPTIONS.findIndex((o) => o.value === language);
    setHighlighted(idx >= 0 ? idx : 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Outside-click / Escape handling
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
      {/* Trigger badge */}
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

      {/* Dropdown panel */}
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
