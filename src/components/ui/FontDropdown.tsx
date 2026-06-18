/**
 * FontDropdown — a reusable, searchable font selector styled to match
 * the VSCode Quick Pick language dropdown used in CodeBlockView.
 *
 * Each option renders its own preview text in the font's own face so the
 * user can see what the font looks like before selecting it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import type { FontPreset } from '../../lib/fonts';

export interface FontDropdownProps {
  /** Available font presets to show in the list. */
  options: FontPreset[];
  /** Currently selected font id. */
  value: string;
  /** Called when the user picks a font. */
  onChange: (id: string) => void;
  /** Placeholder text for the search input. */
  searchPlaceholder?: string;
  /** Whether the dropdown is disabled. */
  disabled?: boolean;
}

export default function FontDropdown({
  options,
  value,
  onChange,
  searchPlaceholder = '搜索字体…',
  disabled = false,
}: FontDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);

  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value) ?? options[0];

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setHighlighted(0);
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      onChange(id);
      close();
    },
    [onChange, close],
  );

  const filtered = query
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          o.id.toLowerCase().includes(query.toLowerCase()),
      )
    : options;

  // Reset highlight when the filtered list changes
  useEffect(() => {
    if (!open) return;
    const idx = filtered.findIndex((o) => o.id === value);
    setHighlighted(idx >= 0 ? idx : 0);
  }, [query, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const item = list.children[highlighted] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlighted, open]);

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
    requestAnimationFrame(() => inputRef.current?.focus());

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, close]);

  return (
    <div className={`font-dropdown ${disabled ? 'is-disabled' : ''}`}>
      {/* Trigger badge */}
      <div
        ref={triggerRef}
        className="font-dropdown-trigger"
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((p) => !p)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span
          className="font-dropdown-label"
          style={selected ? { fontFamily: selected.fontFamily } : undefined}
        >
          {selected?.label ?? '—'}
        </span>
        <ChevronDown size={14} className="font-dropdown-chevron" />
      </div>

      {/* Dropdown panel */}
      {open && (
        <div ref={panelRef} className="font-dropdown-panel">
          <div className="font-dropdown-search">
            <Search size={13} className="font-dropdown-search-icon" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (filtered.length === 0) return;
                  setHighlighted((p) => (p >= filtered.length - 1 ? 0 : p + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (filtered.length === 0) return;
                  setHighlighted((p) => (p <= 0 ? filtered.length - 1 : p - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  const item = filtered[highlighted] ?? filtered[0];
                  if (item) handleSelect(item.id);
                }
              }}
              placeholder={searchPlaceholder}
              className="font-dropdown-search-input"
            />
          </div>
          <div ref={listRef} className="font-dropdown-list">
            {filtered.length === 0 ? (
              <div className="font-dropdown-empty">无匹配字体</div>
            ) : (
              filtered.map((opt, index) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelect(opt.id)}
                  onMouseEnter={() => setHighlighted(index)}
                  className={`font-dropdown-option ${opt.id === value ? 'is-active' : ''} ${index === highlighted ? 'is-highlighted' : ''}`}
                >
                  <span className="font-dropdown-option-label">{opt.label}</span>
                  {opt.preview && (
                    <span
                      className="font-dropdown-option-preview"
                      style={{ fontFamily: opt.fontFamily }}
                    >
                      {opt.preview}
                    </span>
                  )}
                  {opt.id === value && <Check size={13} className="font-dropdown-check" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
