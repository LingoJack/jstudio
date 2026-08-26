import { ArrowRight } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────
// CollapsedRail — mini instrument for the 48px collapsed strip.
//
// A single 1px rail hangs directly below the pin icon, at x=8 — the SAME
// x as the expanded tree's row rail, so the line visually continues
// across the collapse/expand transition. No per-item ticks: the rail only
// carries (a) a progress segment from the top to the ACTIVE item's
// proportional position, tinted accent 45% like the outline's consumed
// rail, and (b) the active item's "->" cursor straddling the rail
// (clickable — opens that item).
//
// Shared by DocumentSidebar (documents/folders) and AgentSidebar
// (agent sessions).
// ──────────────────────────────────────────────────────────────────

export interface RailItem {
  id: string;
  kind: 'folder' | 'doc';
  title: string;
}

export function CollapsedRail({
  items,
  activeDocId,
  onOpenDoc,
}: {
  items: RailItem[];
  activeDocId: string;
  onOpenDoc: (id: string) => void;
}) {
  const activeIndex = items.findIndex((i) => i.kind === 'doc' && i.id === activeDocId);
  const activePct =
    activeIndex >= 0
      ? items.length <= 1
        ? 50
        : (activeIndex / (items.length - 1)) * 100
      : null;
  const activeItem = activeIndex >= 0 ? items[activeIndex] : null;

  return (
    <div className="relative flex-1 w-full">
      {/* The rail itself, hanging flush below the pin icon */}
      <span className="absolute left-[8px] top-0 bottom-2 w-px bg-[var(--vscode-sideBar-border)]" />

      {activePct !== null && activeItem && (
        <>
          {/* Progress segment: top → active position, tinted accent 45% */}
          <span
            className="absolute left-[8px] top-0 w-px bg-[color-mix(in_srgb,var(--vscode-focusBorder)_45%,transparent)]"
            style={{ height: `${activePct}%` }}
          />
          {/* "->" cursor straddling the rail at the active position; the bg
              patch masks the rail underneath so the arrow reads embedded. */}
          <button
            title={activeItem.title}
            onClick={() => onOpenDoc(activeItem.id)}
            className="group absolute flex items-center h-3 w-5 cursor-pointer"
            style={{ left: 0, top: `${activePct}%`, transform: 'translateY(-50%)' }}
          >
            <span className="py-[3px] ml-[1px] bg-[var(--vscode-sideBar-background)] text-[var(--vscode-focusBorder)]">
              <ArrowRight className="w-3 h-3" strokeWidth={2.5} />
            </span>
          </button>
        </>
      )}
    </div>
  );
}
