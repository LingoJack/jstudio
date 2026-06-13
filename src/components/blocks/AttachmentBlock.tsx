import React, { useState, useRef, useEffect, useCallback } from "react";
import { Block } from "../../types";
import { IconButton } from "../ui/IconButton";
import {
  Upload,
  FileText,
  FileCode,
  FileImage,
  File as FileIcon,
  Trash2,
  Eye,
  CreditCard,
  Download,
  RefreshCw,
} from "lucide-react";

/** Format bytes into a human-readable string. */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

/** Pick the right icon for a given MIME type. */
const getFileIcon = (mime: string) => {
  if (mime.startsWith("image/")) return FileImage;
  if (mime === "text/html") return FileCode;
  if (mime.startsWith("text/") || mime.includes("javascript") || mime.includes("json") || mime.includes("css"))
    return FileCode;
  return FileIcon;
};

/** Whether a given MIME type can be previewed inline. */
const isPreviewable = (mime: string): boolean => {
  return (
    mime.startsWith("image/") ||
    mime === "text/html" ||
    mime.startsWith("text/plain")
  );
};

interface AttachmentBlockProps {
  block: Block;
  onUpdateBlock: (updatedFields: Partial<Block>) => void;
}

/**
 * `attachment` block — a file container with two display modes:
 *
 *  - **preview**: HTML files render in an iframe, images render as `<img>`.
 *  - **card**: a compact metadata card (icon, name, size, type, download button).
 *
 * The file's data URL lives in `block.content` but is NOT persisted to
 * localStorage (large files would overflow it). Only metadata is saved via
 * `properties`.
 */
const AttachmentBlock: React.FC<AttachmentBlockProps> = ({
  block,
  onUpdateBlock,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File data URL — kept in component state only, not persisted.
  const [fileDataUrl, setFileDataUrl] = useState(block.content || "");

  // Metadata from properties (persisted).
  const fileName = block.properties?.attachmentName || "";
  const fileType = block.properties?.attachmentType || "";
  const fileSize = block.properties?.attachmentSize || "";
  const [mode, setMode] = useState<"preview" | "card">(
    block.properties?.attachmentMode || "preview",
  );

  const hasFile = !!fileName;

  // Restore file data when block content changes externally.
  useEffect(() => {
    if (block.content) {
      setFileDataUrl(block.content);
    }
  }, [block.id, block.content]);

  const handleFileSelect = useCallback(
    (file: File | null) => {
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl =
          typeof reader.result === "string" ? reader.result : "";
        setFileDataUrl(dataUrl);

        // Auto-select mode based on file type.
        const previewable = isPreviewable(file.type);
        const autoMode: "preview" | "card" = previewable ? "preview" : "card";
        setMode(autoMode);

        onUpdateBlock({
          content: dataUrl,
          properties: {
            ...block.properties,
            attachmentName: file.name,
            attachmentType: file.type,
            attachmentSize: formatFileSize(file.size),
            attachmentMode: autoMode,
          },
        });
      };
      reader.readAsDataURL(file);
    },
    [block.properties, onUpdateBlock],
  );

  const handleClear = useCallback(() => {
    setFileDataUrl("");
    onUpdateBlock({
      content: "",
      properties: {
        ...block.properties,
        attachmentName: "",
        attachmentType: "",
        attachmentSize: "",
        attachmentMode: "preview",
      },
    });
  }, [block.properties, onUpdateBlock]);

  const handleModeToggle = useCallback(
    (newMode: "preview" | "card") => {
      setMode(newMode);
      onUpdateBlock({
        properties: {
          ...block.properties,
          attachmentMode: newMode,
        },
      });
    },
    [block.properties, onUpdateBlock],
  );

  const handleDownload = useCallback(() => {
    if (!fileDataUrl) return;
    const a = document.createElement("a");
    a.href = fileDataUrl;
    a.download = fileName || "download";
    a.click();
  }, [fileDataUrl, fileName]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const isImage = fileType.startsWith("image/");
  const isHtml = fileType === "text/html";
  const canPreview = isImage || isHtml;
  const Icon = getFileIcon(fileType);

  // --- Empty state: upload prompt ---
  if (!hasFile) {
    return (
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="border border-dashed border-[var(--vscode-widget-border)] rounded-sm p-8 flex flex-col items-center justify-center gap-3 bg-[var(--vscode-textBlockQuote-background)] cursor-pointer transition-colors hover:border-[var(--vscode-focusBorder)]"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="w-8 h-8 text-[var(--vscode-icon-foreground)] opacity-60" />
        <p className="text-xs text-[var(--vscode-descriptionForeground)]">
          点击选择文件，或将文件拖放到此处
        </p>
        <p className="text-[10px] text-[var(--vscode-descriptionForeground)] opacity-60">
          支持 HTML、图片、文档等各种格式
        </p>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
        />
      </div>
    );
  }

  // --- Loaded state: toolbar + preview/card ---
  return (
    <div className="rounded-sm overflow-hidden bg-[var(--vscode-textBlockQuote-background)]">
      {/* Compact toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 bg-[var(--vscode-textBlockQuote-background)]">
        <Icon className="w-3.5 h-3.5 text-[var(--vscode-icon-foreground)] opacity-70 shrink-0" />
        <span className="text-xs font-medium text-[var(--vscode-foreground)] truncate max-w-[200px]">
          {fileName}
        </span>
        {fileSize && (
          <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
            {fileSize}
          </span>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          {/* Mode toggle — only if the file is previewable */}
          {canPreview && (
            <div className="flex items-center gap-0.5 mr-1">
              <IconButton
                onClick={() => handleModeToggle("preview")}
                title="预览模式"
                variant={mode === "preview" ? "active" : "default"}
              >
                <Eye className="w-3.5 h-3.5" />
              </IconButton>
              <IconButton
                onClick={() => handleModeToggle("card")}
                title="卡片模式"
                variant={mode === "card" ? "active" : "default"}
              >
                <CreditCard className="w-3.5 h-3.5" />
              </IconButton>
            </div>
          )}

          {/* Download */}
          <IconButton onClick={handleDownload} title="下载文件">
            <Download className="w-3.5 h-3.5" />
          </IconButton>

          {/* Re-upload */}
          <label
            title="重新上传"
            className="cursor-pointer inline-flex items-center justify-center w-6 h-6 rounded text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <input
              type="file"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
            />
          </label>

          {/* Clear */}
          <IconButton onClick={handleClear} title="清除" variant="danger">
            <Trash2 className="w-3.5 h-3.5" />
          </IconButton>
        </div>
      </div>

      {/* Content area: preview or card */}
      {mode === "preview" && canPreview && fileDataUrl ? (
        <div className="w-full h-[400px] bg-white dark:bg-slate-900">
          {isImage && (
            <div className="w-full h-full flex items-center justify-center p-4">
              <img
                src={fileDataUrl}
                alt={fileName}
                className="max-w-full max-h-full object-contain rounded-sm"
              />
            </div>
          )}
          {isHtml && (
            <iframe
              title={`Attachment Preview ${fileName}`}
              src={fileDataUrl}
              sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin"
              className="w-full h-full border-none bg-white dark:bg-slate-900"
            />
          )}
        </div>
      ) : (
        // Card mode (also the fallback for non-previewable types)
        <div className="p-4 flex items-center gap-4 bg-[var(--vscode-editor-background)]">
          <div className="w-12 h-12 rounded-md bg-[var(--vscode-textBlockQuote-background)] flex items-center justify-center shrink-0 border border-[var(--vscode-widget-border)]">
            <Icon className="w-6 h-6 text-[var(--vscode-icon-foreground)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--vscode-foreground)] truncate">
              {fileName}
            </p>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                {fileType || "未知类型"}
              </span>
              {fileSize && (
                <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                  {fileSize}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownload}
            className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-[var(--vscode-button-foreground)] bg-[var(--vscode-button-background)] hover:opacity-90 transition-opacity shrink-0"
          >
            <Download className="w-3 h-3" />
            下载
          </button>
        </div>
      )}
    </div>
  );
};

export default AttachmentBlock;
