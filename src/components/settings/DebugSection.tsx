import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Bug,
  Terminal,
  GitCommit,
  FileText,
  FolderOpen,
  Trash2,
  ScrollText,
} from "lucide-react";
import { useI18n } from "../../lib/core/i18n";
import { useStore } from "../../store/useStore";
import { storage } from "../../lib/core/storage";
import { logger } from "../../lib/core/logger";
import { toast } from "../../lib/toast";

interface BuildInfo {
  commit: string;
  is_dev: boolean;
}

export default function DebugSection() {
  const { t } = useI18n();
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const runtimeLoggingEnabled = useStore((s) => s.runtimeLoggingEnabled);
  const setRuntimeLoggingEnabled = useStore((s) => s.setRuntimeLoggingEnabled);
  const [logFilePath, setLogFilePath] = useState<string>("");
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    invoke<BuildInfo>("get_build_info")
      .then(setBuildInfo)
      .catch(() => {});
    // Load the log file path for display (independent of whether logging
    // is currently enabled — the path is valid either way).
    storage
      .getLogFilePath()
      .then(setLogFilePath)
      .catch(() => {});
  }, []);

  const handleOpenDevtools = () => {
    invoke("open_devtools").catch(() => {});
  };

  /** Toggle the runtime logger on/off. Persists to settings AND applies the
   *  change to the singleton logger immediately so capture hooks are
   *  installed/removed without a window reload. */
  const handleToggleLogging = () => {
    const next = !runtimeLoggingEnabled;
    setRuntimeLoggingEnabled(next);
    logger.setEnabled(next);
    toast.info(
      next ? t("debug.loggingEnabledToast") : t("debug.loggingDisabledToast"),
    );
  };

  const handleOpenLogsDir = () => {
    storage.openLogsDir().catch(() => {
      toast.error(t("debug.openLogsDirFailed"));
    });
  };

  const handleClearLogs = async () => {
    setIsClearing(true);
    try {
      const removed = await storage.clearLogs();
      toast.info(t("debug.logsClearedToast", { count: removed }));
    } catch {
      toast.error(t("debug.clearLogsFailed"));
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 pb-2">
        <Bug className="w-6 h-6 text-[var(--vscode-focusBorder)] shrink-0" />
        <h2 className="text-xl font-bold text-[var(--vscode-foreground)]">
          {t("settings.debug")}
        </h2>
      </div>

      {/* ── DevTools ── */}
      <section className="space-y-2">
        <button
          onClick={handleOpenDevtools}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm text-[var(--vscode-foreground)] bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] transition-colors cursor-pointer"
        >
          <Terminal className="w-5 h-5 opacity-70 shrink-0" />
          <div className="flex-1 text-left">
            <div className="font-medium">{t("debug.openDevtools")}</div>
            <div className="text-xs opacity-60">
              {t("debug.openDevtoolsDesc")}
            </div>
          </div>
        </button>
      </section>

      {/* ── Runtime Logs ── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
          {t("debug.runtimeLogs")}
        </h3>

        {/* Enable toggle row */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[var(--vscode-textBlockQuote-background)]">
          <ScrollText className="w-5 h-5 opacity-70 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[var(--vscode-foreground)]">
              {t("debug.enableLogging")}
            </div>
            <div className="text-xs opacity-60">
              {t("debug.enableLoggingDesc")}
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleLogging}
            aria-label={t("debug.enableLogging")}
            className={`relative w-8 h-5 rounded-full transition-colors flex-shrink-0 cursor-pointer ${
              runtimeLoggingEnabled
                ? "bg-[var(--vscode-button-background)]"
                : "bg-[var(--vscode-input-border)]"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform ${
                runtimeLoggingEnabled
                  ? "translate-x-3 bg-[var(--vscode-button-foreground)]"
                  : "bg-[var(--vscode-descriptionForeground)]"
              }`}
            />
          </button>
        </div>

        {/* Log file path display */}
        {logFilePath && (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--vscode-textBlockQuote-background)]">
            <FileText className="w-4 h-4 opacity-60 shrink-0" />
            <span className="opacity-60 shrink-0 text-sm">
              {t("debug.logFilePath")}
            </span>
            <code
              className="ml-auto font-mono text-xs text-[var(--vscode-textLink-foreground)] truncate max-w-[60%]"
              title={logFilePath}
            >
              {logFilePath}
            </code>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleOpenLogsDir}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--vscode-foreground)] bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] transition-colors cursor-pointer"
          >
            <FolderOpen className="w-4 h-4 opacity-70 shrink-0" />
            {t("debug.openLogsDir")}
          </button>
          <button
            onClick={handleClearLogs}
            disabled={isClearing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--vscode-foreground)] bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4 opacity-70 shrink-0" />
            {isClearing ? t("debug.clearing") : t("debug.clearLogs")}
          </button>
        </div>
      </section>

      {/* ── Build Info ── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
          {t("debug.buildInfo")}
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--vscode-textBlockQuote-background)]">
            <GitCommit className="w-4 h-4 opacity-60 shrink-0" />
            <span className="opacity-60 shrink-0">
              {t("debug.buildCommit")}
            </span>
            <code className="ml-auto font-mono text-[var(--vscode-textLink-foreground)]">
              {buildInfo?.commit ?? "—"}
            </code>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--vscode-textBlockQuote-background)]">
            <span className="opacity-60 shrink-0">{t("debug.buildMode")}</span>
            <span className="ml-auto font-medium">
              {buildInfo
                ? buildInfo.is_dev
                  ? t("debug.buildModeDev")
                  : t("debug.buildModeRelease")
                : "—"}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
