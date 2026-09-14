/**
 * OutlineSideSelector — settings control for which side of the editor the
 * document outline panel docks to (left / right). Same two-button pattern
 * as TabBarPositionSelector.
 */

import { PanelLeft, PanelRight, type LucideIcon } from 'lucide-react';
import { useI18n } from '../../lib/core/i18n';
import { useStore } from '../../store/useStore';

const OUTLINE_SIDE_OPTIONS: { value: 'left' | 'right'; icon: LucideIcon }[] = [
  { value: 'left', icon: PanelLeft },
  { value: 'right', icon: PanelRight },
];

export function OutlineSideSelector() {
  const { t } = useI18n();
  const outlineSide = useStore((s) => s.outlineSide);
  const setOutlineSide = useStore((s) => s.setOutlineSide);

  return (
    <div className="flex gap-3 max-w-sm">
      {OUTLINE_SIDE_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const selected = outlineSide === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => setOutlineSide(opt.value)}
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
              {t(`general.outlineSide_${opt.value}` as 'general.outlineSide_left')}
            </span>
          </button>
        );
      })}
    </div>
  );
}
