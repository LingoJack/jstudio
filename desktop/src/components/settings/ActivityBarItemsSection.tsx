import { useEffect, useState, useRef } from 'react';
import { GripVertical, Pin } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { ACTIVITY_ITEM_META } from '../../lib/core/activityMeta';
import type { ActivityItemId } from '../../types/settings';

/**
 * ActivityBarItemsSection - configure visibility & order of the
 * left Activity Bar icons.
 */
export function ActivityBarItemsSection() {
  const { t } = useI18n();
  const activityBarItems = useStore((s) => s.activityBarItems);
  const setActivityBarItems = useStore((s) => s.setActivityBarItems);

  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  /**
   * Synchronous drag state - ref so pointermove always reads latest values.
   * During drag the data array is NEVER mutated; we only apply CSS
   * transforms for visual feedback and commit the reorder on pointerup.
   */
  const drag = useRef({
    id: '',
    startY: 0,
    dragIdx: -1, // index among movable (non-settings) items
    rowH: 0,
    movableIds: [] as string[],
  });

  /** Static midpoints captured once at drag start - the source of truth. */
  const staticMids = useRef<Map<string, number>>(new Map());
  /** Virtual target index (among movables), updated every pointermove. */
  const virtualIdx = useRef(-1);

  /** Visual state - triggers re-render. */
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [shifts, setShifts] = useState<Record<string, number>>({});

  /** Always-fresh items snapshot for window listeners. */
  const itemsRef = useRef(activityBarItems);
  itemsRef.current = activityBarItems;

  const handleToggle = (id: ActivityItemId) => {
    // Settings is pinned to the bottom and always visible - not toggleable.
    if (id === 'settings') return;
    const next = activityBarItems.map((item) =>
      item.id === id ? { ...item, visible: !item.visible } : item,
    );
    setActivityBarItems(next);
  };

  /** Begin dragging - the entire row is the drag handle (except the toggle). */
  const onRowPointerDown = (e: React.PointerEvent, id: ActivityItemId) => {
    if (e.button !== 0) return;
    const items = itemsRef.current;
    const container = containerRef.current;
    if (!container) return;

    const gap = parseFloat(getComputedStyle(container).rowGap) || 6;

    // Build movable items list (exclude settings - it's locked at bottom)
    const movableIds = items.filter((i) => i.id !== 'settings').map((i) => i.id);
    const dragIdx = movableIds.indexOf(id);
    if (dragIdx === -1) return;

    const row = rowRefs.current.get(id);
    if (!row) return;
    const rowH = row.getBoundingClientRect().height + gap;

    // Capture static midpoints for ALL movable items - this snapshot
    // never changes during drag, so all calculations are stable.
    const mids = new Map<string, number>();
    for (const mid of movableIds) {
      const el = rowRefs.current.get(mid);
      if (el) {
        const r = el.getBoundingClientRect();
        mids.set(mid, r.top + r.height / 2);
      }
    }

    drag.current = { id, startY: e.clientY, dragIdx, rowH, movableIds };
    staticMids.current = mids;
    virtualIdx.current = dragIdx;
    setDragId(id);
    setDragOffset(0);
    setShifts({});
  };

  /** Global pointer listeners - attached only while dragging. */
  useEffect(() => {
    if (!dragId) return;

    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (d.id !== dragId) return;
      e.preventDefault();

      const offset = e.clientY - d.startY;
      const dragCenter = (staticMids.current.get(d.id) ?? 0) + offset;

      // Virtual index = how many other movable items have their
      // static midpoint above the dragged item's current center.
      let count = 0;
      for (const otherId of d.movableIds) {
        if (otherId === d.id) continue;
        const midY = staticMids.current.get(otherId);
        if (midY !== undefined && midY < dragCenter) count++;
      }
      const vIdx = Math.max(0, Math.min(d.movableIds.length - 1, count));
      virtualIdx.current = vIdx;

      // Compute CSS shifts for each non-dragged movable item.
      // Items between the old position and the virtual position
      // get pushed by exactly one row height.
      const newShifts: Record<string, number> = {};
      for (let j = 0; j < d.movableIds.length; j++) {
        const itemId = d.movableIds[j];
        if (itemId === d.id) continue;
        if (vIdx > d.dragIdx && j > d.dragIdx && j <= vIdx) {
          newShifts[itemId] = -d.rowH; // shift up to make room
        } else if (vIdx < d.dragIdx && j < d.dragIdx && j >= vIdx) {
          newShifts[itemId] = d.rowH; // shift down to make room
        } else {
          newShifts[itemId] = 0;
        }
      }

      setDragOffset(offset);
      setShifts(newShifts);
    };

    const onUp = () => {
      const d = drag.current;
      const items = itemsRef.current;
      const vIdx = virtualIdx.current;

      // Commit: reorder data array once, only if position changed.
      if (vIdx !== d.dragIdx && vIdx >= 0) {
        const movables = d.movableIds
          .map((mid) => items.find((i) => i.id === mid))
          .filter(Boolean) as typeof items;
        const settingsItem = items.find((i) => i.id === 'settings');
        const newMovables = [...movables];
        const [moved] = newMovables.splice(d.dragIdx, 1);
        newMovables.splice(vIdx, 0, moved);
        const next = settingsItem ? [...newMovables, settingsItem] : newMovables;
        setActivityBarItems(next);
      }

      setDragId(null);
      setDragOffset(0);
      setShifts({});
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragId, setActivityBarItems]);

  return (
    <div>
      <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
        {t('appearance.activityBarItems')}
      </label>
      <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
        {t('appearance.activityBarItemsDesc')}
      </p>

      <div ref={containerRef} className="space-y-1.5 max-w-sm">
        {activityBarItems.map((item) => {
          const meta = ACTIVITY_ITEM_META[item.id];
          if (!meta) return null;
          const Icon = meta.icon;
          const isFixed = item.id === 'settings';
          const isDragging = dragId === item.id;
          const shift = shifts[item.id] ?? 0;
          const isDragActive = dragId !== null;

          // Inline styles:
          // - Dragged item: follows pointer with no transition.
          // - Other items during drag: shift with smooth transition.
          // - Idle (no drag): no inline style.
          let style: React.CSSProperties | undefined;
          if (isDragging) {
            style = {
              transform: `translateY(${dragOffset}px)`,
              zIndex: 20,
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              opacity: 0.92,
              transition: 'none',
            };
          } else if (isDragActive) {
            style = {
              transform: shift ? `translateY(${shift}px)` : undefined,
              transition: 'transform 200ms cubic-bezier(0.2, 0, 0, 1)',
            };
          }

          return (
            <div
              key={item.id}
              ref={(el) => {
                if (el) rowRefs.current.set(item.id, el);
                else rowRefs.current.delete(item.id);
              }}
              onPointerDown={isFixed ? undefined : (e) => onRowPointerDown(e, item.id)}
              style={style}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border select-none ${
                isDragging
                  ? 'border-[var(--vscode-focusBorder)] cursor-grabbing'
                  : isFixed
                    ? 'border-[var(--vscode-widget-border)] cursor-default'
                    : 'border-[var(--vscode-widget-border)] bg-[var(--vscode-list-hoverBackground)] cursor-grab'
              } ${!item.visible && !isDragging ? 'opacity-50' : ''}`}
            >
              {/* Drag handle (visual hint - entire row is draggable) */}
              <span className={`shrink-0 ${isFixed ? 'opacity-0' : 'text-[var(--vscode-descriptionForeground)]'}`}>
                <GripVertical className="w-4 h-4" />
              </span>

              {/* Icon preview */}
              <Icon className="w-4 h-4 text-[var(--vscode-foreground)] shrink-0" />

              {/* Label */}
              <span className="text-sm text-[var(--vscode-foreground)] flex-1">
                {t(meta.labelKey as 'app.documents')}
              </span>

              {/* Visibility toggle - stop pointer propagation so it
                  doesn't initiate a drag.
                  The off state uses an inset box-shadow instead of a real
                  border so the track keeps the same box size in both states
                  and the knob stays vertically centered.
                  Settings is not a toggle at all - it shows a pin icon to
                  communicate "always visible, pinned to the bottom". */}
              {isFixed ? (
                <span
                  className="w-9 h-5 flex items-center justify-center shrink-0 text-[var(--vscode-descriptionForeground)]"
                  title={t('appearance.activityBarItemSettingsLocked')}
                >
                  <Pin className="w-3.5 h-3.5" />
                </span>
              ) : (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => handleToggle(item.id)}
                  className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 cursor-pointer ${
                    item.visible
                      ? 'bg-[var(--vscode-button-background)]'
                      : 'bg-[var(--vscode-input-background)] shadow-[inset_0_0_0_1px_var(--vscode-input-border)]'
                  }`}
                  title={item.visible ? t('common.hide') : t('common.show')}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform duration-200 ${
                      item.visible
                        ? 'translate-x-4 bg-[var(--vscode-button-foreground)]'
                        : 'bg-[var(--vscode-descriptionForeground)]'
                    }`}
                  />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
