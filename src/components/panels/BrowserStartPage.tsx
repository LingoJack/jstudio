/**
 * BrowserStartPage — Chrome-style new tab page shown when the inline
 * browser panel has no tabs open.
 *
 * Layout (centered, top-weighted like Chrome's NTP):
 *   - Large search box with a search-engine selector (favicon + dropdown)
 *   - Shortcuts grid (quick links) with an "add" tile and a right-click
 *     context menu (edit / delete) per shortcut
 *
 * All navigation goes through `browserSlice.navigateBrowserUrl`, which
 * resolves raw input (URL vs search query) and creates the first tab.
 * Shortcuts are persisted via `browserSlice.setBrowserShortcuts`.
 */

import { useEffect, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useI18n } from "../../lib/core/i18n";
import { useStore } from "../../store/useStore";
import {
  SEARCH_ENGINES,
  getSearchEngineFaviconUrl,
  getFaviconUrl,
  type BrowserShortcut,
} from "../../store/browserSlice";
import { ShortcutDialog } from "./ShortcutDialog";
import { SearchEngineMenu } from "./SearchEngineMenu";
import { ShortcutContextMenu } from "./ShortcutContextMenu";

// ── Context menu state ──────────────────────────────────────

interface ShortcutMenuState {
  x: number;
  y: number;
  shortcut: BrowserShortcut;
}

// ── Shortcut icon tile ──────────────────────────────────────

function ShortcutIcon({ shortcut }: { shortcut: BrowserShortcut }) {
  const [faviconFailed, setFaviconFailed] = useState(false);
  const fav = getFaviconUrl(shortcut.url);

  if (fav && !faviconFailed) {
    return (
      <img
        src={fav}
        alt=""
        className="w-12 h-12 rounded-2xl object-contain group-hover:scale-105 transition-all"
        draggable={false}
        onError={() => setFaviconFailed(true)}
      />
    );
  }

  return (
    <span
      className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-medium text-white shadow-sm group-hover:scale-105 transition-all"
      style={{ backgroundColor: shortcut.color }}
    >
      {shortcut.icon}
    </span>
  );
}

// ── Main component ──────────────────────────────────────────

export default function BrowserStartPage() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [engineMenuOpen, setEngineMenuOpen] = useState(false);
  const [shortcutMenu, setShortcutMenu] = useState<ShortcutMenuState | null>(
    null,
  );
  const [dialog, setDialog] = useState<{
    mode: "add" | "edit";
    shortcut?: BrowserShortcut;
  } | null>(null);

  const navigateBrowserUrl = useStore((s) => s.navigateBrowserUrl);
  const searchEngine = useStore((s) => s.browserSearchEngine);
  const setBrowserSearchEngine = useStore((s) => s.setBrowserSearchEngine);
  const shortcuts = useStore((s) => s.browserShortcuts);
  const setBrowserShortcuts = useStore((s) => s.setBrowserShortcuts);

  const engine =
    SEARCH_ENGINES.find((e) => e.id === searchEngine) ?? SEARCH_ENGINES[0];

  const handleSearch = () => {
    if (!query.trim()) return;
    navigateBrowserUrl(query);
    setQuery("");
  };

  const handleShortcutClick = (shortcut: BrowserShortcut) => {
    navigateBrowserUrl(shortcut.url);
  };

  const handleDeleteShortcut = (shortcut: BrowserShortcut) => {
    setBrowserShortcuts(shortcuts.filter((s) => s.id !== shortcut.id));
    setShortcutMenu(null);
  };

  const handleDialogSave = (name: string, url: string) => {
    if (dialog?.mode === "edit" && dialog.shortcut) {
      setBrowserShortcuts(
        shortcuts.map((s) =>
          s.id === dialog.shortcut!.id
            ? { ...s, name, url, faviconUrl: getFaviconUrl(url) }
            : s,
        ),
      );
    } else {
      const id = `custom-${Date.now().toString(36)}`;
      // Derive a simple tile: first character of the name, deterministic
      // colour picked from a small palette by hash.
      const palette = [
        "#4285F4",
        "#EA4335",
        "#FBBC05",
        "#34A853",
        "#8E24AA",
        "#00897B",
        "#F4511E",
        "#3949AB",
      ];
      let hash = 0;
      for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
      const color = palette[Math.abs(hash) % palette.length];
      setBrowserShortcuts([
        ...shortcuts,
        { id, name, url, icon: name.charAt(0).toUpperCase(), color, faviconUrl: getFaviconUrl(url) },
      ]);
    }
    setDialog(null);
  };

  // Close the engine dropdown / shortcut context menu on outside click.
  //
  // We listen on `mousedown` so the menu closes before focus shifts, but we
  // must NOT close when the press lands inside the menu itself -- otherwise
  // the menu unmounts before the MenuItem's own click fires and the action
  // (delete / edit) silently does nothing. Both containers therefore get a
  // ref and are excluded from the "outside" test.
  const engineMenuRef = useRef<HTMLDivElement>(null);
  const shortcutMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!engineMenuOpen && !shortcutMenu) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        engineMenuOpen &&
        engineMenuRef.current &&
        !engineMenuRef.current.contains(target)
      ) {
        setEngineMenuOpen(false);
      }
      if (
        shortcutMenu &&
        shortcutMenuRef.current &&
        !shortcutMenuRef.current.contains(target)
      ) {
        setShortcutMenu(null);
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [engineMenuOpen, shortcutMenu]);

  return (
    <div className="absolute inset-0 overflow-y-auto bg-[var(--vscode-editor-background)]">
      <div className="min-h-full flex flex-col items-center px-8 pt-[22vh] pb-12">
        {/* ── Search box ── */}
        <div className="w-full max-w-2xl mb-12">
          <div className="flex items-center gap-3 h-14 pl-2 pr-5 rounded-full border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] shadow-sm focus-within:border-[var(--vscode-focusBorder)] transition-colors">
            {/* Engine selector */}
            <div ref={engineMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setEngineMenuOpen((v) => !v)}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--vscode-menu-hoverBackground)] transition-colors"
                title={engine.name}
              >
                <img
                  src={getSearchEngineFaviconUrl(engine.id)}
                  alt={engine.name}
                  className="w-6 h-6 rounded-sm"
                  draggable={false}
                  onError={(e) => {
                    // Fall back to the glyph if the favicon fails to load.
                    const el = e.currentTarget;
                    el.style.display = "none";
                    el.nextElementSibling?.classList.remove("hidden");
                  }}
                />
                <span className="hidden w-6 h-6 items-center justify-center text-base font-medium">
                  {engine.glyph}
                </span>
              </button>

              {engineMenuOpen && (
                <SearchEngineMenu
                  engines={SEARCH_ENGINES}
                  currentEngineId={engine.id}
                  onSelect={(id) => {
                    setBrowserSearchEngine(id);
                    setEngineMenuOpen(false);
                  }}
                  className="absolute left-0 top-full mt-1"
                />
              )}
            </div>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder={t("linkPreview.startPage.searchPlaceholder", {
                engine: engine.name,
              })}
              autoFocus
              className="flex-1 min-w-0 bg-transparent outline-none text-base text-[var(--vscode-input-foreground)] placeholder:opacity-50"
            />

            {query.trim() && (
              <button
                type="button"
                onClick={handleSearch}
                className="shrink-0 p-2 rounded-full text-[var(--vscode-button-background)] hover:bg-[var(--vscode-menu-hoverBackground)] transition-colors"
              >
                <Search className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* ── Shortcuts grid ── */}
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-6 max-w-2xl">
          {shortcuts.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleShortcutClick(s)}
              onContextMenu={(e) => {
                e.preventDefault();
                setShortcutMenu({ x: e.clientX, y: e.clientY, shortcut: s });
              }}
              className="group flex flex-col items-center gap-2 w-20"
            >
              <ShortcutIcon shortcut={s} />
              <span className="text-xs text-[var(--vscode-foreground)] opacity-80 truncate w-full text-center">
                {s.name}
              </span>
            </button>
          ))}

          {/* Add shortcut tile */}
          <button
            type="button"
            onClick={() => setDialog({ mode: "add" })}
            className="group flex flex-col items-center gap-2 w-20"
          >
            <span className="w-12 h-12 rounded-2xl flex items-center justify-center border border-dashed border-[var(--vscode-input-border)] text-[var(--vscode-foreground)] opacity-60 group-hover:opacity-100 group-hover:border-[var(--vscode-focusBorder)] transition-all">
              <Plus className="w-5 h-5" />
            </span>
            <span className="text-xs text-[var(--vscode-foreground)] opacity-60 group-hover:opacity-90 truncate w-full text-center">
              {t("linkPreview.startPage.addShortcut")}
            </span>
          </button>
        </div>
      </div>

      {/* ── Shortcut context menu ── */}
      {shortcutMenu && (
        <div ref={shortcutMenuRef}>
          <ShortcutContextMenu
            x={shortcutMenu.x}
            y={shortcutMenu.y}
            shortcut={shortcutMenu.shortcut}
            onEdit={(s) => {
              setDialog({ mode: "edit", shortcut: s });
              setShortcutMenu(null);
            }}
            onDelete={handleDeleteShortcut}
          />
        </div>
      )}

      {/* ── Add / edit dialog ── */}
      {dialog && (
        <ShortcutDialog
          initial={dialog.mode === "edit" ? dialog.shortcut : undefined}
          onSave={handleDialogSave}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
