import { useI18n } from '../../lib/core/i18n';

// ──────────────────────────────────────────────────────────────────
// Shared building blocks for the shortcuts settings pages
// (ShortcutsSection + GlobalShortcutsSection).
//
// Layout language: shortcut ROWS in a bordered panel — the row reads
// left → right as "what it does" → "how to trigger it".
//   - Key caps: per-key <kbd> with hairline border, bottom edge
//     shadow + top inner highlight (color-mix theme vars, adapts to
//     light/dark without hardcoded colors)
//   - Panels: rounded-[10px] hairline border, hairline row dividers,
//     and a barely-there elevated surface
//   - Group headings: muted 12px semibold with a hairline rule and the
//     row count on the right
// ──────────────────────────────────────────────────────────────────

const CAP_BASE =
  'inline-flex items-center justify-center h-[22px] min-w-[22px] px-[6px] rounded-[6px] text-[11px] font-medium leading-none select-none';

const CAP_NORMAL = `${CAP_BASE} bg-[color-mix(in_srgb,var(--vscode-foreground)_6%,var(--vscode-editor-background))] border-[color-mix(in_srgb,var(--vscode-foreground)_15%,transparent)] text-[var(--vscode-foreground)] shadow-[0_1px_0_0_color-mix(in_srgb,var(--vscode-foreground)_10%,transparent),inset_0_1px_0_0_color-mix(in_srgb,var(--vscode-foreground)_6%,transparent)]`;

const CAP_CONFLICT = `${CAP_BASE} bg-[var(--vscode-inputValidation-errorBackground)] border-[color-mix(in_srgb,var(--vscode-errorForeground)_40%,transparent)] text-[var(--vscode-errorForeground)]`;

export function KbdKeycap({
  display,
  recording = false,
  recordingLabel,
  unboundLabel,
  conflicted = false,
}: {
  /** Space-separated display string, as returned by bindingToDisplay(). */
  display: string;
  recording?: boolean;
  /** Label shown while recording; defaults to shortcut.pressKeys. */
  recordingLabel?: string;
  /** Label shown when unbound; defaults to shortcut.unbound. */
  unboundLabel?: string;
  conflicted?: boolean;
}) {
  const { t } = useI18n();

  if (recording) {
    return (
      <span className="inline-flex items-center h-[24px] px-3 rounded-[6px] border border-[var(--vscode-focusBorder)] bg-[color-mix(in_srgb,var(--vscode-focusBorder)_14%,transparent)] text-[var(--vscode-foreground)] text-[11px] font-medium animate-pulse">
        {recordingLabel ?? t('shortcut.pressKeys')}
      </span>
    );
  }

  if (!display) {
    return (
      <span className="inline-flex items-center h-[24px] px-3 rounded-[6px] border border-dashed border-[color-mix(in_srgb,var(--vscode-foreground)_15%,transparent)] text-[var(--vscode-descriptionForeground)] text-[11px] italic transition-colors hover:border-[var(--vscode-focusBorder)] hover:text-[var(--vscode-foreground)]">
        {unboundLabel ?? t('shortcut.unbound')}
      </span>
    );
  }

  const capClass = conflicted ? CAP_CONFLICT : CAP_NORMAL;
  return (
    <span className="inline-flex items-center gap-[3px]">
      {display.split(' ').map((key, i) => (
        <kbd key={`${key}-${i}`} className={capClass}>
          {key}
        </kbd>
      ))}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────
// List primitives — used by the shortcuts list editor
// ──────────────────────────────────────────────────────────────

/** Hairline border around a list panel. */
export const PANEL_BORDER =
  'border border-[color-mix(in_srgb,var(--vscode-foreground)_10%,transparent)]';

/** Hairline dividers between rows inside a list panel. */
export const PANEL_DIVIDER =
  'divide-y divide-[color-mix(in_srgb,var(--vscode-foreground)_8%,transparent)]';

/** Elevated panel surface used by list panels. */
export const PANEL_SURFACE =
  'bg-[color-mix(in_srgb,var(--vscode-foreground)_2%,var(--vscode-editor-background))]';

/** Group heading above a list panel: muted title, hairline rule, row count. */
export function GroupHeading({
  title,
  count,
}: {
  title: React.ReactNode;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <h4 className="shrink-0 text-[12px] font-semibold text-[var(--vscode-descriptionForeground)]">
        {title}
      </h4>
      <span
        aria-hidden
        className="h-px flex-1 bg-[color-mix(in_srgb,var(--vscode-foreground)_10%,transparent)]"
      />
      {count !== undefined && (
        <span className="text-[11px] tabular-nums text-[var(--vscode-descriptionForeground)] opacity-70">
          {count}
        </span>
      )}
    </div>
  );
}
