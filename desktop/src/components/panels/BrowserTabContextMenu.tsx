import { RefreshCw, ExternalLink, X } from "lucide-react";
import { MenuList, MenuItem, MenuDivider } from "../ui/MenuList";
import { useI18n } from "../../lib/core/i18n";
import type { LinkPreviewTabInfo } from "../../types/browser";

export interface BrowserTabContextMenuProps {
  x: number;
  y: number;
  tab: LinkPreviewTabInfo | undefined;
  /** 是否显示「关闭标签」项（默认 true）。单标签场景可设 false 隐藏。 */
  canClose?: boolean;
  onRefresh: (tabId: string) => void;
  onOpenInBrowser: (url: string) => void;
  onClose: (tabId: string) => void;
}

/**
 * Right-click context menu for a browser/link-preview tab.
 *
 * Extracted from BrowserSidebar; also reused by LinkPreviewTabsApp to
 * eliminate the duplicated inline menu (Refresh / Open in Browser / Close).
 */
export function BrowserTabContextMenu({
  x,
  y,
  tab,
  canClose = true,
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

      {canClose && (
        <>
          <MenuDivider />
          <MenuItem
            variant="danger"
            icon={<X className="w-4 h-4" />}
            onClick={() => onClose(tab?.id ?? "")}
          >
            {t("linkPreview.closeTab")}
          </MenuItem>
        </>
      )}
    </MenuList>
  );
}
