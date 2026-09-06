/**
 * BrowserTabStrip — horizontal browser tab strip rendered in the app title
 * bar's center zone (browser view only), Chrome-style: tabs + a "+" new-tab
 * button, then trailing drag region for window movement.
 *
 * Tabs live here instead of a vertical sidebar (the old BrowserSidebar) so
 * the layout matches a real browser: tabs on top, toolbar below, page under
 * the toolbar. Interactive elements opt out of the drag region explicitly
 * (`data-tauri-drag-region={false}`); empty space stays draggable.
 */

import { useState } from "react";
import { Compass, Plus, X } from "lucide-react";
import { useI18n } from "../../lib/core/i18n";
import { ipc } from "../../lib/core/ipc";
import { useStore } from "../../store/useStore";
import { getFaviconUrl } from "../../store/browserSlice";

function TabFavicon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const isBlank = !url || url.trim().toLowerCase() === "about:blank";
  const fav = isBlank ? undefined : getFaviconUrl(url);
  if (isBlank || failed || !fav) {
    return <Compass className="w-3.5 h-3.5 shrink-0 opacity-70" />;
  }
  return (
    <img
      src={fav}
      alt=""
      className="w-3.5 h-3.5 shrink-0 rounded-sm"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

export default function BrowserTabStrip() {
  const { t } = useI18n();
  const browserTabs = useStore((s) => s.browserTabs);
  const browserActiveTabId = useStore((s) => s.browserActiveTabId);
  const addBrowserTab = useStore((s) => s.addBrowserTab);

  const switchTab = (tabId: string) => {
    import("../../lib/core/ipc").then(({ ipc }) =>
      ipc.switchLinkPreviewTab("main", tabId).catch(console.error),
    );
  };
  const closeTab = (tabId: string) => {
    import("../../lib/core/ipc").then(({ ipc }) =>
      ipc.closeLinkPreviewTab("main", tabId).catch(console.error),
    );
  };

  return (
    <div
      className="flex-1 min-w-0 flex items-center gap-0.5 px-1 overflow-hidden"
      data-tauri-drag-region
    >
      {browserTabs.map((tab) => {
        const isActive = tab.id === browserActiveTabId;
        const isBlank = !tab.url || tab.url.trim().toLowerCase() === "about:blank";
        const title = isBlank
          ? t("linkPreview.newTab")
          : tab.title || tab.url;
        return (
          <div
            key={tab.id}
            data-tauri-drag-region={false}
            onClick={() => switchTab(tab.id)}
            title={tab.url}
            className={`no-drag group min-w-0 max-w-[180px] flex items-center gap-1.5 h-7 px-2 rounded-md cursor-pointer transition-colors duration-150 ${
              isActive
                ? "bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-foreground)]"
                : "text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]/60"
            }`}
          >
            <TabFavicon url={tab.url} />
            <span className="flex-1 min-w-0 truncate text-xs">{title}</span>
            <button
              type="button"
              title={t("linkPreview.closeTab")}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className={`shrink-0 p-0.5 rounded transition-colors duration-150 cursor-pointer ${
                isActive
                  ? "hover:bg-[var(--vscode-list-hoverBackground)]"
                  : "opacity-0 group-hover:opacity-100 hover:bg-[var(--vscode-list-hoverBackground)]"
              }`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      {/* New tab */}
      <button
        type="button"
        data-tauri-drag-region={false}
        title={t("linkPreview.newTab")}
        onClick={() => addBrowserTab()}
        className="no-drag shrink-0 p-1.5 rounded-md text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150 cursor-pointer"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
