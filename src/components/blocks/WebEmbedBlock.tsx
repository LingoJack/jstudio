import React, { useState, useEffect, useCallback } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Block } from "../../types";
import { IconButton } from "../ui/IconButton";
import {
  Link,
  RefreshCw,
  ExternalLink,
  Globe,
  Trash2,
} from "lucide-react";

/** Auto-prefix `https://` when the user types a bare domain. */
const normalizeUrl = (url: string) => {
  const value = url.trim();
  if (!value) return "";
  if (/^(https?:|file:|data:|tauri:)\/\//i.test(value)) return value;
  return `https://${value}`;
};

interface WebEmbedBlockProps {
  block: Block;
  onUpdateBlock: (updatedFields: Partial<Block>) => void;
}

/**
 * `web-embed` block — embeds a single external web page by URL in an iframe.
 * Keeps the responsibility laser-focused: URL in, rendered page out.
 */
const WebEmbedBlock: React.FC<WebEmbedBlockProps> = ({
  block,
  onUpdateBlock,
}) => {
  const [urlInput, setUrlInput] = useState(block.properties?.embedUrl || "");
  const [reloadKey, setReloadKey] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Keep local state synced when the block changes externally (e.g. undo).
  useEffect(() => {
    setUrlInput(block.properties?.embedUrl || "");
  }, [block.id, block.properties?.embedUrl]);

  const normalizedUrl = normalizeUrl(urlInput);

  const handleUrlChange = useCallback(
    (val: string) => {
      setUrlInput(val);
      onUpdateBlock({
        properties: {
          ...block.properties,
          embedUrl: val,
        },
      });
    },
    [block.properties, onUpdateBlock],
  );

  const handleReload = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  const handleClear = useCallback(() => {
    handleUrlChange("");
  }, [handleUrlChange]);

  const openInNewWindow = useCallback(() => {
    const url = normalizeUrl(urlInput);
    if (!url) return;

    const label = `webembed-${block.id}-${Date.now()}`.replace(
      /[^a-zA-Z0-9-/:_]/g,
      "-",
    );
    const webview = new WebviewWindow(label, {
      url,
      title: `Preview: ${url}`,
      width: 1200,
      height: 800,
      resizable: true,
    });

    webview.once("tauri://error", (event) => {
      const message =
        typeof event.payload === "string"
          ? event.payload
          : "open preview window failed";
      console.error("[web-embed] open window error:", message);
    });
  }, [block.id, urlInput]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.types.includes("text/uri-list")) {
      const url = e.dataTransfer.getData("text/uri-list").split("\n")[0].trim();
      if (url) handleUrlChange(url);
    }
  };

  return (
    <div className="rounded-sm overflow-hidden bg-[var(--vscode-textBlockQuote-background)]">
      {/* Toolbar: URL input + actions */}
      <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 bg-[var(--vscode-textBlockQuote-background)]">
        <div className="min-w-[180px] flex-1 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-[var(--vscode-icon-foreground)] opacity-60 shrink-0" />
          <input
            type="url"
            value={urlInput}
            onChange={(e) => handleUrlChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleReload();
              }
            }}
            placeholder="输入网址，例如 example.com 或 https://..."
            className="min-w-0 flex-1 bg-transparent border-none text-xs text-[var(--vscode-editor-foreground)] focus:outline-none placeholder:text-[var(--vscode-descriptionForeground)]"
          />
        </div>

        <div className="flex items-center gap-0.5">
          {normalizedUrl && (
            <>
              <IconButton onClick={handleReload} title="刷新">
                <RefreshCw className="w-3.5 h-3.5" />
              </IconButton>
              <IconButton onClick={openInNewWindow} title="在独立窗口中打开">
                <ExternalLink className="w-3.5 h-3.5" />
              </IconButton>
            </>
          )}
          {urlInput && (
            <IconButton onClick={handleClear} title="清除" variant="danger">
              <Trash2 className="w-3.5 h-3.5" />
            </IconButton>
          )}
        </div>
      </div>

      {/* Preview area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative w-full h-[400px] bg-white dark:bg-slate-900 transition-shadow ${
          isDragging
            ? "ring-2 ring-[var(--vscode-focusBorder)] ring-offset-1 ring-offset-[var(--vscode-editor-background)]"
            : ""
        }`}
      >
        {normalizedUrl ? (
          <>
            <iframe
              key={`web-${normalizedUrl}-${reloadKey}`}
              title={`Web Embed ${normalizedUrl}`}
              src={normalizedUrl}
              sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin"
              referrerPolicy="no-referrer"
              className="w-full h-full border-none bg-white dark:bg-slate-900"
            />
            <div className="absolute top-2 left-2 pointer-events-none flex items-center gap-1.5 text-[10px] text-[var(--vscode-descriptionForeground)] bg-[var(--vscode-editorWidget-background)] backdrop-blur-sm px-1.5 py-0.5 rounded border border-[var(--vscode-widget-border)] max-w-[80%]">
              <Link className="w-2.5 h-2.5 opacity-60" />
              <span className="truncate">{normalizedUrl}</span>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500">
            <Globe className="w-6 h-6 opacity-50" />
            <p>输入网址以嵌入网页，或将链接拖放到此处</p>
          </div>
        )}

        {isDragging && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none bg-[var(--vscode-editorWidget-background)]"
            style={{ opacity: 0.5 }}
          >
            <div className="px-3 py-2 rounded-md bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] text-xs font-medium shadow-lg">
              拖放链接以嵌入网页
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WebEmbedBlock;
