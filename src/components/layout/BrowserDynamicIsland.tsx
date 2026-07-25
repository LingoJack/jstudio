import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import {
  SEARCH_ENGINES,
  getSearchEngineFaviconUrl,
} from '../../store/browserSlice';
import { RefreshCw, ExternalLink, Loader2, X, Search } from 'lucide-react';

/**
 * Dynamic-Island-style address bar rendered inside AppTitleBar.
 *
 * When the browser sidebar view is active, this compact pill replaces the
 * empty drag-region in the title bar's centre area. It provides:
 *
 * - A search-engine selector (click the favicon)
 * - A URL / search input (Enter to navigate, ⌘L to focus)
 * - A refresh button (spins while the active tab is loading)
 * - An open-in-external-browser button
 *
 * The whole pill is **not** a drag region so the input and buttons receive
 * pointer events normally.
 */
export default function BrowserDynamicIsland() {
  const { t } = useI18n();

  // ── Store state ──
  const browserTabs = useStore((s) => s.browserTabs);
  const browserActiveTabId = useStore((s) => s.browserActiveTabId);
  const browserAddressUrl = useStore((s) => s.browserAddressUrl);
  const browserSearchEngine = useStore((s) => s.browserSearchEngine);
  const setBrowserAddressUrl = useStore((s) => s.setBrowserAddressUrl);
  const setBrowserSearchEngine = useStore((s) => s.setBrowserSearchEngine);
  const navigateBrowserUrl = useStore((s) => s.navigateBrowserUrl);
  const refreshBrowserTab = useStore((s) => s.refreshBrowserTab);
  const openInExternalBrowser = useStore((s) => s.openInExternalBrowser);

  // ── Local state ──
  const addressInputRef = useRef<HTMLInputElement>(null);
  const [engineDropdownOpen, setEngineDropdownOpen] = useState(false);
  const engineDropdownRef = useRef<HTMLDivElement>(null);

  const activeTab = browserTabs.find((tb) => tb.id === browserActiveTabId);
  const isLoading = activeTab?.loading ?? false;
  const hasActiveTab = !!activeTab;

  // ── ⌘L / Ctrl+L to focus address bar ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        addressInputRef.current?.focus();
        addressInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Close engine dropdown on outside click ──
  useEffect(() => {
    if (!engineDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (engineDropdownRef.current && !engineDropdownRef.current.contains(e.target as Node)) {
        setEngineDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [engineDropdownOpen]);

  // ── Handlers ──
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      navigateBrowserUrl(browserAddressUrl);
      addressInputRef.current?.blur();
    } else if (e.key === 'Escape') {
      // Restore the active tab's URL and blur
      if (activeTab) setBrowserAddressUrl(activeTab.url);
      addressInputRef.current?.blur();
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  return (
    <div
      className="flex items-center gap-1 flex-1 max-w-[640px] mx-auto px-1"
      data-tauri-drag-region={false}
    >
      {/* Search engine selector */}
      <div className="relative shrink-0" ref={engineDropdownRef}>
        <button
          type="button"
          onClick={() => setEngineDropdownOpen((v) => !v)}
          title={t('browser.searchEngine')}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[var(--vscode-list-hoverBackground)] transition-colors cursor-pointer"
        >
          <img
            src={getSearchEngineFaviconUrl(browserSearchEngine)}
            alt=""
            className="w-4 h-4 rounded-sm"
          />
        </button>

        {engineDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 min-w-[160px] bg-[var(--vscode-quickInput-background)] border border-[var(--vscode-panel-border)] rounded-md shadow-lg py-1 z-50">
            {SEARCH_ENGINES.map((engine) => (
              <button
                key={engine.id}
                type="button"
                onClick={() => {
                  setBrowserSearchEngine(engine.id);
                  setEngineDropdownOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left hover:bg-[var(--vscode-list-hoverBackground)] transition-colors cursor-pointer ${
                  engine.id === browserSearchEngine
                    ? 'text-[var(--vscode-list-activeSelectionForeground)]'
                    : 'text-[var(--vscode-foreground)]'
                }`}
              >
                <img
                  src={getSearchEngineFaviconUrl(engine.id)}
                  alt=""
                  className="w-4 h-4 rounded-sm shrink-0"
                />
                <span className="truncate">{engine.name}</span>
                {engine.id === browserSearchEngine && (
                  <span className="ml-auto text-[var(--vscode-textLink-foreground)]">✓</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Address / search input */}
      <div className="flex-1 relative flex items-center">
        <Search className="absolute left-2.5 w-3 h-3 text-[var(--vscode-input-placeholderForeground)] pointer-events-none" />
        <input
          ref={addressInputRef}
          type="text"
          value={browserAddressUrl}
          onChange={(e) => setBrowserAddressUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          spellCheck={false}
          placeholder={t('browser.addressPlaceholder')}
          className="w-full bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded-full pl-7 pr-7 py-[3px] text-[12px] text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)] focus:outline-none focus:border-[var(--vscode-focusBorder)] transition-colors"
        />
        {/* Clear button */}
        {browserAddressUrl && (
          <button
            type="button"
            onClick={() => setBrowserAddressUrl('')}
            className="absolute right-2 w-4 h-4 flex items-center justify-center text-[var(--vscode-input-placeholderForeground)] hover:text-[var(--vscode-foreground)] cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Refresh / loading indicator */}
      <button
        type="button"
        onClick={refreshBrowserTab}
        disabled={!hasActiveTab}
        title={t('browser.refresh')}
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <RefreshCw className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Open in external browser */}
      <button
        type="button"
        onClick={openInExternalBrowser}
        disabled={!hasActiveTab}
        title={t('browser.openExternal')}
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
