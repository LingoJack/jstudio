import { useI18n } from '../../lib/core/i18n';

// ──────────────────────────────────────────────────────────────────
// Shared building blocks for the shortcuts settings pages
// (ShortcutsSection + GlobalShortcutsSection).
//
// Layout language: shortcut TILES in a 2-column grid — the key caps
// are the hero (top of tile), label + status live at the bottom.
//   - Key caps: per-key <kbd> with hairline border, bottom edge
//     shadow + top inner highlight (color-mix theme vars, adapts to
//     light/dark without hardcoded colors)
//   - Tiles: rounded-[10px] elevated surface, hairline border that
//     brightens on hover
//   - Section titles: 13px semibold with optional muted description
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

// ──────────────────────────────────────────────────────────────────
// Tile primitives
// ──────────────────────────────────────────────────────────────────

/** Tile shell: relative/group so hover actions can anchor inside. */
export const tileBase =
  'relative group flex flex-col gap-1 p-3 rounded-[10px] border transition-colors';

/** Elevated tile surface + hover border brighten. */
export const tileSurface =
  'border-[color-mix(in_srgb,var(--vscode-foreground)_9%,transparent)] bg-[color-mix(in_srgb,var(--vscode-foreground)_3%,var(--vscode-editor-background))] hover:border-[color-mix(in_srgb,var(--vscode-foreground)_18%,transparent)]';

/** Section title above a tile grid. */
export function SectionTitle({
  title,
  description,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <div className="px-1 space-y-0.5">
      <div className="text-[13px] font-semibold text-[var(--vscode-foreground)]">{title}</div>
      {description && (
        <div className="text-xs text-[var(--vscode-descriptionForeground)]">{description}</div>
      )}
    </div>
  );
}
