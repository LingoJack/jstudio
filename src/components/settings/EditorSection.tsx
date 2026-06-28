import { Minus, Plus } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/i18n';
import {
  LATIN_FONTS,
  CJK_FONTS,
  resolveFontFamily,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_LINE_HEIGHT,
  MAX_LINE_HEIGHT,
} from '../../lib/editor/fonts';
import FontDropdown from '../ui/FontDropdown';
import type { EditorCursorStyle } from '../../lib/storage';

/** Cursor style options shown in the settings picker. */
const CURSOR_STYLES: { id: EditorCursorStyle; glyph: string }[] = [
  { id: 'bar', glyph: '|' },
  { id: 'block', glyph: '▋' },
  { id: 'underline', glyph: '_' },
];

/**
 * EditorSection — editor font settings only.
 *
 *   - Latin font family
 *   - CJK font family
 *   - Font size
 *   - Line height (line spacing)
 *   (App-wide theme / border settings live in GeneralSection.)
 */
export default function EditorSection() {
  const { t } = useI18n();

  const fontId = useStore((s) => s.fontId);
  const cjkFontId = useStore((s) => s.cjkFontId);
  const fontSize = useStore((s) => s.fontSize);
  const editorLineHeight = useStore((s) => s.editorLineHeight);
  const editorCursorStyle = useStore((s) => s.editorCursorStyle);
  const setFontId = useStore((s) => s.setFontId);
  const setCjkFontId = useStore((s) => s.setCjkFontId);
  const setFontSize = useStore((s) => s.setFontSize);
  const setEditorLineHeight = useStore((s) => s.setEditorLineHeight);
  const setEditorCursorStyle = useStore((s) => s.setEditorCursorStyle);

  const previewFontFamily = resolveFontFamily(fontId, cjkFontId);

  return (
    <div className="space-y-8">
      {/* ── Latin Font ── */}
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

      {/* ── CJK Font ── */}
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

      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ── Font Size ── */}
      <div id="settings-editor-fontSize">
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
            lineHeight: editorLineHeight,
          }}
        >
          {t('general.fontPreview')}
        </div>
      </div>

      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ── Line Height ── */}
      <div>
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('general.lineHeight')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
          {t('general.lineHeightDesc')}
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setEditorLineHeight(editorLineHeight - 0.1)}
            disabled={editorLineHeight <= MIN_LINE_HEIGHT}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)] text-[var(--vscode-foreground)] hover:border-[var(--vscode-focusBorder)] transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Minus className="w-4 h-4" />
          </button>

          <input
            type="range"
            min={MIN_LINE_HEIGHT}
            max={MAX_LINE_HEIGHT}
            step={0.1}
            value={editorLineHeight}
            onChange={(e) => setEditorLineHeight(Number(e.target.value))}
            className="flex-1 accent-[var(--vscode-focusBorder)] cursor-pointer"
          />

          <button
            onClick={() => setEditorLineHeight(editorLineHeight + 0.1)}
            disabled={editorLineHeight >= MAX_LINE_HEIGHT}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)] text-[var(--vscode-foreground)] hover:border-[var(--vscode-focusBorder)] transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Plus className="w-4 h-4" />
          </button>

          <span className="text-sm text-[var(--vscode-foreground)] tabular-nums w-16 text-center shrink-0 font-medium">
            {editorLineHeight.toFixed(1)}
          </span>
        </div>
      </div>

      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ── Cursor Style ── */}
      <div id="settings-editor-cursorStyle">
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('general.editorCursorStyle')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
          {t('general.editorCursorStyleDesc')}
        </p>

        <div className="flex flex-wrap gap-2">
          {CURSOR_STYLES.map((cs) => {
            const selected = editorCursorStyle === cs.id;
            return (
              <button
                key={cs.id}
                onClick={() => setEditorCursorStyle(cs.id)}
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
                  {t(`general.editorCursorStyle_${cs.id}` as const)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
