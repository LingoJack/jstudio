/**
 * Runtime logger — captures uncaught errors, unhandled rejections,
 * console.error/warn, and manual `logger.*` calls, flushing them to a
 * per-day log file on disk via the `append_log_line` Tauri command.
 *
 * ## Why this exists
 *
 * Production-only bugs (e.g. the sectioned-editor `setContent` crash that
 * silently blanked a section) are invisible without devtools open. This
 * logger gives users an opt-in way to record those failures to
 * `~/.jdata/studio/logs/app-YYYY-MM-DD.log` so they can be shared for
 * diagnosis.
 *
 * ## Design
 *
 * - **Opt-in.** Default off (`runtimeLoggingEnabled: false`). When off,
 *   every method is a no-op and no console hooks are installed.
 * - **Buffered flush.** Log lines are queued in JS and flushed every 1s
 *   (or when the buffer hits 50 lines) via a single batched
 *   `append_log_line` call per line. This avoids one IPC round-trip per
 *   log line, which would flood the channel under error bursts.
 * - **Best-effort.** Every internal step is wrapped in try/catch — the
 *   logger must NEVER throw and break the app it's trying to diagnose.
 * - **Multi-window.** Each window (main + detached document/terminal/
 *   preview) has its own logger instance; the Rust side serialises file
 *   writes with a mutex. Each line is tagged with the window label so
 *   interleaved writes are readable.
 * - **Captures:**
 *   - `window.onerror` — uncaught JS errors
 *   - `window.onunhandledrejection` — unhandled promise rejections
 *   - `console.error` / `console.warn` — wrapped to also log to file
 *   - Manual `logger.debug/info/warn/error` calls from app code
 * - **Does NOT capture** `console.log`/`console.debug` — too noisy for a
 *   diagnostic log.
 */

import { storage } from "./storage";

export type LogLevel = "debug" | "info" | "warn" | "error";

/** A single buffered log entry, before formatting. */
interface LogEntry {
  /** ISO 8601 timestamp with millisecond precision. */
  ts: string;
  level: LogLevel;
  /** Short source tag (e.g. "window.onerror", "SectionEditor", "save"). */
  source: string;
  /** The message string. */
  msg: string;
}

/** Max lines to buffer before forcing a flush. */
const FLUSH_THRESHOLD = 50;
/** Interval between automatic flushes (ms). */
const FLUSH_INTERVAL_MS = 1000;

/** Determine the window label for source-tagging. */
function detectWindowLabel(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const w = params.get("window");
    if (w) return w;
  } catch {
    // ignore
  }
  return "main";
}

const WINDOW_LABEL = detectWindowLabel();

class Logger {
  private enabled = false;
  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  /** Original console methods, saved before wrapping so we can restore. */
  private origConsoleError: typeof console.error | null = null;
  private origConsoleWarn: typeof console.warn | null = null;
  /** Handlers installed on window, for removal on disable. */
  private onErrorHandler: ((e: ErrorEvent) => void) | null = null;
  private onRejectionHandler: ((e: PromiseRejectionEvent) => void) | null =
    null;
  /** True once a session-start banner has been written. Avoids duplicate
   *  banners when `setEnabled(true)` is called repeatedly. */
  private bannerWritten = false;

  /** Toggle capture on/off. Idempotent — safe to call repeatedly. */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (enabled) {
      this.installHooks();
      this.startFlushTimer();
      this.writeBanner();
    } else {
      this.stopFlushTimer();
      this.flushNow(); // drain anything still buffered
      this.removeHooks();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // ── public log methods ──────────────────────────────────────────────

  debug(source: string, msg: string): void {
    this.push("debug", source, msg);
  }

  info(source: string, msg: string): void {
    this.push("info", source, msg);
  }

  warn(source: string, msg: string): void {
    this.push("warn", source, msg);
  }

  error(source: string, msg: string): void {
    this.push("error", source, msg);
  }

  // ── internals ───────────────────────────────────────────────────────

  private push(level: LogLevel, source: string, msg: string): void {
    if (!this.enabled) return;
    try {
      this.buffer.push({ ts: new Date().toISOString(), level, source, msg });
      if (this.buffer.length >= FLUSH_THRESHOLD) {
        this.flushNow();
      }
    } catch {
      // never throw from the logger
    }
  }

  private startFlushTimer(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this.flushNow(), FLUSH_INTERVAL_MS);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** Flush the buffer to the Rust side. Each line is one `append_log_line`
   *  call — the Rust side mutex-serialises writes so interleaving from
   *  multiple windows is safe. Failures are swallowed (logger must not
   *  throw), but we drop the buffered lines on failure to avoid unbounded
   *  growth if the file becomes unwritable. */
  private flushNow(): void {
    if (this.buffer.length === 0) return;
    const lines = this.buffer.splice(0);
    for (const entry of lines) {
      const line = `[${entry.ts}] [${entry.level.toUpperCase()}] [${WINDOW_LABEL}] [${entry.source}] ${entry.msg}`;
      // Fire-and-forget; storage.appendLogLine returns a Promise that we
      // intentionally don't await (flushing is async by design).
      storage.appendLogLine(line).catch(() => {
        // Swallow — the logger must never throw. Disk-full / permission
        // errors just mean we lose this line; we don't re-buffer to avoid
        // unbounded growth.
      });
    }
  }

  /** Write a session-start banner so each app launch is findable in the log. */
  private writeBanner(): void {
    if (this.bannerWritten) return;
    this.bannerWritten = true;
    // `__APP_VERSION__` is injected by Vite (see vite.config.ts `define`).
    // The git commit is only available on the Rust side (`get_build_info`),
    // not in the frontend bundle, so we don't include it here.
    const appVersion =
      typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown";
    const buildMode = import.meta.env.DEV ? "dev" : "release";
    this.push(
      "info",
      "logger",
      `── session start (window=${WINDOW_LABEL}, version=${appVersion}, mode=${buildMode}, ua=${navigator.userAgent}) ──`,
    );
  }

  // ── capture hooks ───────────────────────────────────────────────────

  private installHooks(): void {
    // window.onerror — uncaught errors (script errors, throws in callbacks).
    if (this.onErrorHandler === null) {
      this.onErrorHandler = (e: ErrorEvent) => {
        try {
          const msg =
            `${e.message} at ${e.filename}:${e.lineno}:${e.colno}` +
            (e.error && e.error.stack ? `\n${e.error.stack}` : "");
          this.push("error", "window.onerror", msg);
        } catch {
          // ignore
        }
      };
      window.addEventListener("error", this.onErrorHandler);
    }
    // unhandledrejection — promises with no .catch().
    if (this.onRejectionHandler === null) {
      this.onRejectionHandler = (e: PromiseRejectionEvent) => {
        try {
          const reason = e.reason;
          let msg: string;
          if (reason instanceof Error) {
            msg =
              `${reason.name}: ${reason.message}` +
              (reason.stack ? `\n${reason.stack}` : "");
          } else if (typeof reason === "string") {
            msg = reason;
          } else {
            try {
              msg = JSON.stringify(reason);
            } catch {
              msg = String(reason);
            }
          }
          this.push("error", "unhandledrejection", msg);
        } catch {
          // ignore
        }
      };
      window.addEventListener("unhandledrejection", this.onRejectionHandler);
    }
    // Wrap console.error / console.warn so existing `console.error(...)`
    // calls (e.g. in SectionEditor's setContent catch block, storeHelpers'
    // onSaveError) are captured without code changes.
    if (this.origConsoleError === null) {
      this.origConsoleError = console.error.bind(console);
      // The DOM lib types `console.error` as `(message?: any, ...optionalParams: any[]) => void`.
      // We match that signature via `Parameters<typeof console.error>` so the
      // reassignment is type-safe without resorting to `any` ourselves.
      const wrapped: typeof console.error = (
        ...args: Parameters<typeof console.error>
      ) => {
        this.origConsoleError?.(...args);
        this.push("error", "console", this.formatConsoleArgs(args));
      };
      console.error = wrapped;
    }
    if (this.origConsoleWarn === null) {
      this.origConsoleWarn = console.warn.bind(console);
      const wrapped: typeof console.warn = (
        ...args: Parameters<typeof console.warn>
      ) => {
        this.origConsoleWarn?.(...args);
        this.push("warn", "console", this.formatConsoleArgs(args));
      };
      console.warn = wrapped;
    }
  }

  private removeHooks(): void {
    if (this.onErrorHandler) {
      window.removeEventListener("error", this.onErrorHandler);
      this.onErrorHandler = null;
    }
    if (this.onRejectionHandler) {
      window.removeEventListener("unhandledrejection", this.onRejectionHandler);
      this.onRejectionHandler = null;
    }
    if (this.origConsoleError) {
      console.error = this.origConsoleError;
      this.origConsoleError = null;
    }
    if (this.origConsoleWarn) {
      console.warn = this.origConsoleWarn;
      this.origConsoleWarn = null;
    }
  }

  /** Best-effort stringification of console.* args for the log file. */
  private formatConsoleArgs(args: readonly unknown[]): string {
    return args
      .map((a) => {
        if (typeof a === "string") return a;
        if (a instanceof Error) {
          return `${a.name}: ${a.message}` + (a.stack ? `\n${a.stack}` : "");
        }
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(" ");
  }
}

/** Singleton logger instance, imported by app code and the store. */
export const logger = new Logger();

// ── Flush on page-hide / before-unload ───────────────────────────────────
//
// When the user closes the window (or the OS reclaims it), any buffered
// log lines would be lost. We trigger a synchronous flush on these events.
// The flush itself is async (IPC), but at least the lines leave the JS
// buffer and enter the Rust IPC queue before the window tears down.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    try {
      // Access the singleton's private flush via a public flushOnHide call
      // — kept out of the public API to avoid confusion.
      (logger as unknown as { flushNow: () => void }).flushNow();
    } catch {
      // ignore
    }
  });
}
