/**
 * BrowserStartPage — Chrome-style new tab page shown when the inline
 * browser panel has no tabs open.
 *
 * Layout (centered, top-weighted like Chrome's NTP):
 *   - App icon + title
 *   - Large search box with a search-engine selector (favicon + dropdown)
 *   - Shortcuts grid (quick links) with an "add" tile and a right-click
 *     context menu (edit / delete) per shortcut
 *
 * All navigation goes through `browserSlice.navigateBrowserUrl`, which
 * resolves raw input (URL vs search query) and creates the first tab.
 * Shortcuts are persisted via `browserSlice.setBrowserShortcuts`.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import appIcon from "../../assets/app-icon.png";
import { useI18n } from "../../lib/core/i18n";
import { useStore } from "../../store/useStore";
import {
  SEARCH_ENGINES,
  getSearchEngineFaviconUrl,
  type BrowserShortcut,
} from "../../store/browserSlice";
import { MenuDivider, MenuItem, MenuList } from "../ui/MenuList";

// ── Context menu state ──────────────────────────────────────

interface ShortcutMenuState {
  x: number;
  y: number;
  shortcut: BrowserShortcut;
}

// ── Shortcut add / edit dialog ──────────────────────────────

interface ShortcutDialogProps {
  /** Existing shortcut when editing, `undefined` when adding. */
  initial?: BrowserShortcut;
  onSave: (name: string, url: string) => void;
  onClose: () => void;
}

function ShortcutDialog({ initial, onSave, onClose }: ShortcutDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const canSave = name.trim().length > 0 && url.trim().length > 0;

  const handleSubmit = () => {
    if (!canSave) return;
    onSave(name.trim(), url.trim());
  };

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/40"
      onMouseDown={onClose}
    >
      <div
        className="w-80 rounded-xl border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-xl p-4 space-y-3"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-[var(--vscode-foreground)]">
            {initial
              ? t("linkPreview.startPage.editShortcut")
              : t("linkPreview.startPage.addShortcut")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--vscode-menu-hoverBackground)] opacity-70"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <label className="block space-y-1">
          <span className="text-xs opacity-70 text-[var(--vscode-foreground)]">
            {t("linkPreview.startPage.nameLabel")}
          </span>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="w-full px-2.5 py-1.5 rounded-md text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] outline-none focus:border-[var(--vscode-focusBorder)]"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs opacity-70 text-[var(--vscode-foreground)]">
            {t("linkPreview.startPage.urlLabel")}
          </span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="https://"
            className="w-full px-2.5 py-1.5 rounded-md text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] outline-none focus:border-[var(--vscode-focusBorder)]"
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm text-[var(--vscode-foreground)] hover:bg-[var(--vscode-menu-hoverBackground)]"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSave}
            className="px-3 py-1.5 rounded-md text-sm bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:opacity-90 disabled:opacity-40"
          >
            {t("linkPreview.startPage.save")}
          </button>
        </div>
      </div>
    </div>
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
          s.id === dialog.shortcut!.id ? { ...s, name, url } : s,
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
        { id, name, url, icon: name.charAt(0).toUpperCase(), color },
      ]);
    }
    setDialog(null);
  };

  // Close the engine dropdown / shortcut context menu on outside click.
  const engineMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!engineMenuOpen && !shortcutMenu) return;
    const onMouseDown = (e: MouseEvent) => {
      if (
        engineMenuOpen &&
        engineMenuRef.current &&
        !engineMenuRef.current.contains(e.target as Node)
      ) {
        setEngineMenuOpen(false);
      }
      if (shortcutMenu) setShortcutMenu(null);
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [engineMenuOpen, shortcutMenu]);

  return (
    <div className="absolute inset-0 overflow-y-auto bg-[var(--vscode-editor-background)]">
      <div className="min-h-full flex flex-col items-center px-8 pt-[14vh] pb-12">
        {/* ── Logo ── */}
        <div className="flex flex-col items-center gap-4 mb-10 select-none">
          <img
            src={appIcon}
            alt="JStudio"
            className="w-20 h-20 rounded-2xl object-cover"
            draggable={false}
          />
          <h1 className="text-xl font-semibold tracking-tight text-[var(--vscode-foreground)] opacity-90">
            JStudio
          </h1>
        </div>

        {/* ── Search box ── */}
        <div className="w-full max-w-xl mb-12">
          <div className="flex items-center gap-2 h-12 px-4 rounded-full border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] shadow-sm focus-within:border-[var(--vscode-focusBorder)] transition-colors">
            {/* Engine selector */}
            <div ref={engineMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setEngineMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-full hover:bg-[var(--vscode-menu-hoverBackground)] transition-colors"
                title={engine.name}
              >
                <img
                  src={getSearchEngineFaviconUrl(engine.id)}
                  alt={engine.name}
                  className="w-4 h-4 rounded-sm"
                  draggable={false}
                  onError={(e) => {
                    // Fall back to the glyph if the favicon fails to load.
                    const el = e.currentTarget;
                    el.style.display = "none";
                    el.nextElementSibling?.classList.remove("hidden");
                  }}
                />
                <span className="hidden w-4 h-4 items-center justify-center text-xs font-medium">
                  {engine.glyph}
                </span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>

              {engineMenuOpen && (
                <MenuList className="absolute left-0 top-full mt-1">
                  {SEARCH_ENGINES.map((e) => (
                    <MenuItem
                      key={e.id}
                      icon={
                        <img
                          src={getSearchEngineFaviconUrl(e.id)}
                          alt=""
                          className="w-3.5 h-3.5 rounded-sm"
                          draggable={false}
                        />
                      }
                      onClick={() => {
                        setBrowserSearchEngine(e.id);
                        setEngineMenuOpen(false);
                      }}
                      className={
                        e.id === engine.id
                          ? "bg-[var(--vscode-menu-hoverBackground)]"
                          : ""
                      }
                    >
                      {e.name}
                    </MenuItem>
                  ))}
                </MenuList>
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
              className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[var(--vscode-input-foreground)] placeholder:opacity-50"
            />

            {query.trim() && (
              <button
                type="button"
                onClick={handleSearch}
                className="shrink-0 p-1.5 rounded-full text-[var(--vscode-button-background)] hover:bg-[var(--vscode-menu-hoverBackground)] transition-colors"
              >
                <Search className="w-4 h-4" />
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
              <span
                className="w-12 h-12 rounded-full flex items-center justify-center text-lg text-white shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all"
                style={{ backgroundColor: s.color }}
              >
                {s.icon}
              </span>
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
            <span className="w-12 h-12 rounded-full flex items-center justify-center border border-dashed border-[var(--vscode-input-border)] text-[var(--vscode-foreground)] opacity-60 group-hover:opacity-100 group-hover:border-[var(--vscode-focusBorder)] transition-all">
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
        <MenuList
          x={shortcutMenu.x}
          y={shortcutMenu.y}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem
            icon={<Pencil className="w-3.5 h-3.5" />}
            onClick={() => {
              setDialog({ mode: "edit", shortcut: shortcutMenu.shortcut });
              setShortcutMenu(null);
            }}
          >
            {t("linkPreview.startPage.editShortcut")}
          </MenuItem>
          <MenuDivider />
          <MenuItem
            variant="danger"
            icon={<Trash2 className="w-3.5 h-3.5" />}
            onClick={() => handleDeleteShortcut(shortcutMenu.shortcut)}
          >
            {t("linkPreview.startPage.deleteShortcut")}
          </MenuItem>
        </MenuList>
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
