import { RefreshCw, ExternalLink, X } from "lucide-react";
import { MenuList, MenuItem, MenuDivider } from "../ui/MenuList";
import { useI18n } from "../../lib/core/i18n";
import type { LinkPreviewTabInfo } from "../../types/browser";

export interface BrowserTabContextMenuProps {
  x: number;
  y: number;
  tab: LinkPreviewTabInfo | undefined;
  onRefresh: (tabId: string) => void;
  onOpenInBrowser: (url: string) => void;
  onClose: (tabId: string) => void;
}

/**
 * Right-click context menu for a browser tab in the BrowserSidebar.
 * Extracted from BrowserSidebar to reduce render complexity and
 * eliminate the IIFE pattern.
 */
export function BrowserTabContextMenu({
  x,
  y,
  tab,
  onRefresh,
  onOpenInBrowser,
  onClose,
}: BrowserTabContextMenuProps) {
  const { t } = useI18n();

  return (
    <MenuList x={x} y={y} onClick={(e) => e.stopPropagation()}>
      <MenuItem
        icon={<RefreshCw className="w-4 h-4" />}
        onClick={() => onRefresh(tab?.id ?? "")}
      >
        {t("linkPreview.refresh")}
      </MenuItem>

      <MenuItem
        icon={<ExternalLink className="w-4 h-4" />}
        onClick={() => {
          if (tab?.url) onOpenInBrowser(tab.url);
        }}
      >
        {t("linkPreview.openBrowser")}
      </MenuItem>

      <MenuDivider />

      <MenuItem
        variant="danger"
        icon={<X className="w-4 h-4" />}
        onClick={() => onClose(tab?.id ?? "")}
      >
        {t("linkPreview.closeTab")}
      </MenuItem>
    </MenuList>
  );
}
