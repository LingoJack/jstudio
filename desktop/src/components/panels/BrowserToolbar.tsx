/**
 * BrowserToolbar — Chrome-style toolbar row at the top of the inline browser
 * panel: back / forward / reload + the address input + open-external.
 *
 * The panel's chrome takes real layout space (the page view starts below the
 * toolbar — see BrowserPanel's reported rect), so site headers never collide
 * with it.
 *
 * Address input follows the document sidebar's flat tokens (h-7 rounded-md,
 * 5% foreground mix background, focus ring). Loading state spins the reload
 * button.
 */

import { useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useI18n } from "../../lib/core/i18n";
import { useStore } from "../../store/useStore";

const navBtn =
  "shrink-0 p-1.5 rounded-md text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent";

export default function BrowserToolbar() {
  const { t } = useI18n();
  const browserTabs = useStore((s) => s.browserTabs);
  const browserActiveTabId = useStore((s) => s.browserActiveTabId);
  const browserCanGoBack = useStore((s) => s.browserCanGoBack);
  const browserCanGoForward = useStore((s) => s.browserCanGoForward);
  const browserAddressUrl = useStore((s) => s.browserAddressUrl);
  const setBrowserAddressUrl = useStore((s) => s.setBrowserAddressUrl);
  const navigateBrowserUrl = useStore((s) => s.navigateBrowserUrl);
  const goBackBrowserTab = useStore((s) => s.goBackBrowserTab);
  const goForwardBrowserTab = useStore((s) => s.goForwardBrowserTab);
  const refreshBrowserTab = useStore((s) => s.refreshBrowserTab);
  const openInExternalBrowser = useStore((s) => s.openInExternalBrowser);

  const inputRef = useRef<HTMLInputElement>(null);
  const activeTab = browserTabs.find((tb) => tb.id === browserActiveTabId);
  const isLoading = activeTab?.loading ?? false;
  const hasActiveTab = !!activeTab;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      navigateBrowserUrl(browserAddressUrl);
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      if (activeTab) setBrowserAddressUrl(activeTab.url);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="shrink-0 h-9 flex items-center gap-1 px-2 border-b border-[var(--vscode-sideBar-border)] bg-[var(--vscode-sideBar-background)]">
      {/* History navigation */}
      <button
        type="button"
        title={t("browser.back")}
        disabled={!browserCanGoBack}
        onClick={goBackBrowserTab}
        className={navBtn}
      >
        <ArrowLeft className="w-4 h-4" />
      </button>
      <button
        type="button"
        title={t("browser.forward")}
        disabled={!browserCanGoForward}
        onClick={goForwardBrowserTab}
        className={navBtn}
      >
        <ArrowRight className="w-4 h-4" />
      </button>

      {/* Reload / stop indicator */}
      <button
        type="button"
        title={t("browser.refresh")}
        disabled={!hasActiveTab}
        onClick={refreshBrowserTab}
        className={navBtn}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <RefreshCw className="w-4 h-4" />
        )}
      </button>

      {/* Address / search input (sidebar-flat tokens) */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5 h-7 px-2 rounded-md border border-[var(--vscode-input-border)] bg-[color-mix(in_srgb,var(--vscode-foreground)_5%,transparent)] focus-within:ring-1 focus-within:ring-[var(--vscode-focusBorder)] transition-colors duration-150">
        <Search className="w-3.5 h-3.5 shrink-0 text-[var(--vscode-input-placeholderForeground)] pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={browserAddressUrl}
          onChange={(e) => setBrowserAddressUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={(e) => e.target.select()}
          spellCheck={false}
          placeholder={t("browser.addressPlaceholder")}
          className="flex-1 min-w-0 bg-transparent outline-none text-xs text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)]"
        />
        {browserAddressUrl && (
          <button
            type="button"
            title={t("browser.clearAddress")}
            onClick={() => setBrowserAddressUrl("")}
            className="shrink-0 p-0.5 rounded text-[var(--vscode-input-placeholderForeground)] hover:text-[var(--vscode-foreground)] transition-colors duration-150 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Open in external browser */}
      <button
        type="button"
        title={t("browser.openExternal")}
        disabled={!hasActiveTab}
        onClick={openInExternalBrowser}
        className={navBtn}
      >
        <ExternalLink className="w-4 h-4" />
      </button>
    </div>
  );
}
