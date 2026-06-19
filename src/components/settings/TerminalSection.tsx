import { Minus, Plus } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/i18n';
import { MONOSPACE_FONTS } from '../../lib/fonts';
import { TERMINAL_THEMES } from '../../lib/terminalThemes';
import type { TerminalCursorStyle } from '../../lib/storage';

/** Cursor style options shown in the settings picker. */
const CURSOR_STYLES: { id: TerminalCursorStyle; glyph: string }[] = [
  { id: 'block', glyph: '▋' },
  { id: 'underline', glyph: '_' },
  { id: 'bar', glyph: '|' },
];

/**
 * TerminalSection — all terminal-related settings in one place.
 *
 * Grouped into three blocks:
 *   1. Color theme (Anthropic Dark/Light, JStudio Dark/Light)
 *   2. Monospace font family
 *   3. Font size
 */
export default function TerminalSection() {
  const { t } = useI18n();

  const terminalThemeId = useStore((s) => s.terminalThemeId);
  const setTerminalThemeId = useStore((s) => s.setTerminalThemeId);
  const terminalFontId = useStore((s) => s.terminalFontId);
  const setTerminalFontId = useStore((s) => s.setTerminalFontId);
  const terminalFontSize = useStore((s) => s.terminalFontSize);
  const setTerminalFontSize = useStore((s) => s.setTerminalFontSize);
  const terminalCursorStyle = useStore((s) => s.terminalCursorStyle);
  const setTerminalCursorStyle = useStore((s) => s.setTerminalCursorStyle);

  return (
    <div className="max-w-2xl space-y-8">
      {/* ── Color Theme ── */}
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

      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ── Monospace Font ── */}
      <div>
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('terminal.fontFamily')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
          {t('terminal.fontFamilyDesc')}
        </p>

        <div className="flex flex-wrap gap-2">
          {MONOSPACE_FONTS.map((font) => {
            const selected = terminalFontId === font.id;
            return (
              <button
                key={font.id}
                onClick={() => setTerminalFontId(font.id)}
                className={`px-4 py-2.5 rounded-lg border-2 transition-all duration-150 cursor-pointer ${
                  selected
                    ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)]'
                    : 'border-[var(--vscode-widget-border)] hover:border-[var(--vscode-focusBorder)]'
                }`}
              >
                <div
                  className="text-sm text-[var(--vscode-foreground)]"
                  style={{ fontFamily: font.fontFamily }}
                >
                  {font.label}
                </div>
                <div
                  className="text-xs text-[var(--vscode-descriptionForeground)] mt-0.5"
                  style={{ fontFamily: font.fontFamily }}
                >
                  {font.preview}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ── Cursor Style ── */}
      <div>
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('terminal.cursorStyle')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
          {t('terminal.cursorStyleDesc')}
        </p>

        <div className="flex flex-wrap gap-2">
          {CURSOR_STYLES.map((cs) => {
            const selected = terminalCursorStyle === cs.id;
            return (
              <button
                key={cs.id}
                onClick={() => setTerminalCursorStyle(cs.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all duration-150 cursor-pointer ${
                  selected
                    ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)]'
                    : 'border-[var(--vscode-widget-border)] hover:border-[var(--vscode-focusBorder)]'
                }`}
              >
                <span
                  className="text-lg leading-none font-mono text-[var(--vscode-foreground)]"
                  style={{ minWidth: '0.6em', textAlign: 'center' }}
                >
                  {cs.glyph}
                </span>
                <span className="text-sm text-[var(--vscode-foreground)]">
                  {t(`terminal.cursorStyle_${cs.id}` as const)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ── Font Size ── */}
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
    </div>
  );
}
