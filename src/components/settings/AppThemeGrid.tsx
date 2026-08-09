import { getAppThemesByMode, type AppTheme } from '../../lib/themes';

/**
 * App theme grid card - shows a preview of the 3-layer background hierarchy.
 */
export function AppThemePreview({ theme }: { theme: AppTheme }) {
  const colors = theme.colors;
  return (
    <div className="w-12 h-12 rounded-md shrink-0 overflow-hidden border" style={{ borderColor: colors['widget-border'] }}>
      {/* 3-layer vertical stack: activity bar > sidebar > editor */}
      <div className="flex flex-col h-full">
        <div style={{ background: colors['activityBar-background'], height: '25%' }} />
        <div style={{ background: colors['sideBar-background'], height: '25%' }} />
        <div style={{ background: colors['editor-background'], height: '50%' }} className="flex items-center justify-center">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: colors['focusBorder'] }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Renders a 2-column grid of app theme cards for a given `isDark` filter.
 */
export function AppThemeGrid({
  isDark,
  selectedId,
  onSelect,
  label,
}: {
  isDark: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  label: (id: string) => string;
}) {
  const themes = getAppThemesByMode(isDark);
  return (
    <div className="grid grid-cols-2 gap-4">
      {themes.map((th) => {
        const selected = selectedId === th.id;
        const colors = th.colors;
        return (
          <button
            key={th.id}
            onClick={() => onSelect(th.id)}
            className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all duration-150 cursor-pointer text-left ${
              selected
                ? 'border-[var(--vscode-focusBorder)]'
                : 'border-transparent hover:border-[var(--vscode-widget-border)]'
            }`}
            style={{ background: colors['editor-background'] }}
          >
            <AppThemePreview theme={th} />
            <div className="min-w-0">
              <div
                className="text-sm font-medium truncate"
                style={{ color: colors['foreground'] }}
              >
                {label(th.id)}
              </div>
              <div className="flex gap-1 mt-1.5">
                {[colors['button-background'], colors['editorGutter-addedBackground'], colors['editorGutter-modifiedBackground'], colors['focusBorder']].map(
                  (c, i) => (
                    <span
                      key={i}
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
  );
}
