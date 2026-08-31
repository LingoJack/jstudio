/**
 * SelectDropdown — a VSCode-styled custom dropdown replacement for `<select>`.
 *
 * Follows the same visual language as FontDropdown: trigger badge with
 * border + background + chevron, floating panel using MenuList styling.
 * Keyboard + mouse navigation uses a single `selectedIndex` state per the
 * project convention (no CSS :hover highlighting).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  /** Optional secondary description shown below the label. */
  description?: string;
}

interface SelectDropdownProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** Disable the dropdown (greyed out, non-interactive). */
  disabled?: boolean;
  /** Extra class on the trigger button. */
  className?: string;
}

export function SelectDropdown({
  value,
  options,
  onChange,
  disabled = false,
  className = '',
}: SelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const currentIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  // Sync selectedIndex when opening
  useEffect(() => {
    if (open) setSelectedIndex(currentIndex);
  }, [open, currentIndex]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const selectOption = useCallback(
    (idx: number) => {
      const opt = options[idx];
      if (opt) {
        onChange(opt.value);
        setOpen(false);
      }
    },
    [options, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        selectOption(selectedIndex);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
    }
  };

  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? value;

  return (
    <div className={`font-dropdown ${disabled ? 'is-disabled' : ''} ${className}`}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={handleKeyDown}
        className="font-dropdown-trigger w-full"
      >
        <span className="font-dropdown-label">{selectedLabel}</span>
        <ChevronDown className="font-dropdown-chevron w-3.5 h-3.5 shrink-0" />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 right-0 top-full mt-1 z-dropdown min-w-menu py-1 rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-lg text-sm max-h-60 overflow-y-auto"
        >
          {options.map((opt, idx) => (
            <button
              key={opt.value}
              type="button"
              onMouseEnter={() => setSelectedIndex(idx)}
              onClick={() => selectOption(idx)}
              className={`w-full flex items-start gap-2 px-3 py-1.5 text-left cursor-pointer ${
                idx === selectedIndex
                  ? 'bg-[var(--vscode-menu-hoverBackground)]'
                  : ''
              }`}
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0 mt-0.5">
                {opt.value === value && (
                  <Check className="w-3.5 h-3.5 text-[var(--vscode-foreground)]" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[var(--vscode-menu-foreground)] truncate">
                  {opt.label}
                </span>
                {opt.description && (
                  <span className="block text-xs text-[var(--vscode-descriptionForeground)] truncate mt-0.5">
                    {opt.description}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
