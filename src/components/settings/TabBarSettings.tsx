import { ArrowDownToLine, ArrowUpFromLine, type LucideIcon } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';

/** Min/max bounds (must match uiSlice.ts). */
const TAB_BAR_OPACITY_MIN = 0.02;
const TAB_BAR_OPACITY_MAX = 0.15;

/**
 * TabBarGlassOpacitySlider - controls the glassmorphism background
 * opacity of the floating pill-shaped tab bar.
 */
export function TabBarGlassOpacitySlider() {
  const opacity = useStore((s) => s.tabBarGlassOpacity);
  const setOpacity = useStore((s) => s.setTabBarGlassOpacity);

  // Convert 0.02–0.15 range to 0–100 percentage for UI.
  const percent = Math.round(
    ((opacity - TAB_BAR_OPACITY_MIN) / (TAB_BAR_OPACITY_MAX - TAB_BAR_OPACITY_MIN)) * 100,
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const p = parseInt(e.target.value, 10);
    const raw =
      TAB_BAR_OPACITY_MIN + (p / 100) * (TAB_BAR_OPACITY_MAX - TAB_BAR_OPACITY_MIN);
    // Round to 3 decimal places to avoid floating-point noise.
    setOpacity(Math.round(raw * 1000) / 1000);
  };

  return (
    <div className="flex items-center gap-4 max-w-sm">
      <input
        type="range"
        min="0"
        max="100"
        value={percent}
        onChange={handleChange}
        className="flex-1 h-2 rounded-full appearance-none cursor-pointer
                   bg-[var(--vscode-input-background)]
                   border border-[var(--vscode-widget-border)]
                   [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:w-4
                   [&::-webkit-slider-thumb]:h-4
                   [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-[var(--vscode-button-background)]
                   [&::-webkit-slider-thumb]:border-2
                   [&::-webkit-slider-thumb]:border-[var(--vscode-focusBorder)]
                   [&::-webkit-slider-thumb]:cursor-pointer
                   [&::-webkit-slider-thumb]:transition-transform
                   [&::-webkit-slider-thumb]:hover:scale-110
                   [&::-moz-range-thumb]:w-4
                   [&::-moz-range-thumb]:h-4
                   [&::-moz-range-thumb]:rounded-full
                   [&::-moz-range-thumb]:bg-[var(--vscode-button-background)]
                   [&::-moz-range-thumb]:border-2
                   [&::-moz-range-thumb]:border-[var(--vscode-focusBorder)]
                   [&::-moz-range-thumb]:cursor-pointer"
      />
      <span
        className="text-sm text-[var(--vscode-foreground)] font-mono w-16 text-right tabular-nums"
        title={`${opacity.toFixed(3)}`}
      >
        {opacity.toFixed(2)}
      </span>
    </div>
  );
}

const TAB_BAR_POSITION_OPTIONS: { value: 'top' | 'bottom'; icon: LucideIcon }[] = [
  { value: 'bottom', icon: ArrowDownToLine },
  { value: 'top', icon: ArrowUpFromLine },
];

/**
 * TabBarPositionSelector - controls the tab bar position (top/bottom).
 */
export function TabBarPositionSelector() {
  const { t } = useI18n();
  const position = useStore((s) => s.tabBarPosition);
  const setPosition = useStore((s) => s.setTabBarPosition);

  return (
    <div className="flex gap-3 max-w-sm">
      {TAB_BAR_POSITION_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const selected = position === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => setPosition(opt.value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all duration-150 cursor-pointer ${
              selected
                ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)]'
                : 'border-transparent bg-[var(--vscode-list-hoverBackground)] hover:border-[var(--vscode-widget-border)]'
            }`}
          >
            <Icon
              className={`w-4 h-4 ${selected ? 'text-[var(--vscode-foreground)]' : 'text-[var(--vscode-descriptionForeground)]'}`}
            />
            <span
              className={`text-sm ${selected ? 'text-[var(--vscode-foreground)] font-medium' : 'text-[var(--vscode-sideBar-foreground)]'}`}
            >
              {t(`general.tabBarPosition_${opt.value}` as 'general.tabBarPosition_top')}
            </span>
          </button>
        );
      })}
    </div>
  );
}
