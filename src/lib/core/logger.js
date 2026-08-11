import { ipc } from "./ipc";
const FLUSH_THRESHOLD = 50;
const FLUSH_INTERVAL_MS = 1e3;
function detectWindowLabel() {
  try {
    const params = new URLSearchParams(window.location.search);
    const w = params.get("window");
    if (w) return w;
  } catch {
  }
  return "main";
}
const WINDOW_LABEL = detectWindowLabel();
class Logger {
  enabled = false;
  buffer = [];
  flushTimer = null;
  /** Original console methods, saved before wrapping so we can restore. */
  origConsoleError = null;
  origConsoleWarn = null;
  /** Handlers installed on window, for removal on disable. */
  onErrorHandler = null;
  onRejectionHandler = null;
  /** True once a session-start banner has been written. Avoids duplicate
   *  banners when `setEnabled(true)` is called repeatedly. */
  bannerWritten = false;
  /** Toggle capture on/off. Idempotent — safe to call repeatedly. */
  setEnabled(enabled) {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (enabled) {
      this.installHooks();
      this.startFlushTimer();
      this.writeBanner();
    } else {
      this.stopFlushTimer();
      this.flushNow();
      this.removeHooks();
    }
  }
  isEnabled() {
    return this.enabled;
  }
  // ── public log methods ──────────────────────────────────────────────
  debug(source, msg) {
    this.push("debug", source, msg);
  }
  info(source, msg) {
    this.push("info", source, msg);
  }
  warn(source, msg) {
    this.push("warn", source, msg);
  }
  error(source, msg) {
    this.push("error", source, msg);
  }
  // ── internals ───────────────────────────────────────────────────────
  push(level, source, msg) {
    if (!this.enabled) return;
    try {
      this.buffer.push({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, source, msg });
      if (this.buffer.length >= FLUSH_THRESHOLD) {
        this.flushNow();
      }
    } catch {
    }
  }
  startFlushTimer() {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this.flushNow(), FLUSH_INTERVAL_MS);
  }
  stopFlushTimer() {
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
  flushNow() {
    if (this.buffer.length === 0) return;
    const lines = this.buffer.splice(0);
    for (const entry of lines) {
      const line = `[${entry.ts}] [${entry.level.toUpperCase()}] [${WINDOW_LABEL}] [${entry.source}] ${entry.msg}`;
      ipc.appendLogLine(line).catch(() => {
      });
    }
  }
  /** Write a session-start banner so each app launch is findable in the log. */
  writeBanner() {
    if (this.bannerWritten) return;
    this.bannerWritten = true;
    const appVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown";
    const buildMode = import.meta.env.DEV ? "dev" : "release";
    this.push(
      "info",
      "logger",
      `\u2500\u2500 session start (window=${WINDOW_LABEL}, version=${appVersion}, mode=${buildMode}, ua=${navigator.userAgent}) \u2500\u2500`
    );
  }
  // ── capture hooks ───────────────────────────────────────────────────
  installHooks() {
    if (this.onErrorHandler === null) {
      this.onErrorHandler = (e) => {
        try {
          const msg = `${e.message} at ${e.filename}:${e.lineno}:${e.colno}` + (e.error && e.error.stack ? `
${e.error.stack}` : "");
          this.push("error", "window.onerror", msg);
        } catch {
        }
      };
      window.addEventListener("error", this.onErrorHandler);
    }
    if (this.onRejectionHandler === null) {
      this.onRejectionHandler = (e) => {
        try {
          const reason = e.reason;
          let msg;
          if (reason instanceof Error) {
            msg = `${reason.name}: ${reason.message}` + (reason.stack ? `
${reason.stack}` : "");
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
        }
      };
      window.addEventListener("unhandledrejection", this.onRejectionHandler);
    }
    if (this.origConsoleError === null) {
      this.origConsoleError = console.error.bind(console);
      const wrapped = (...args) => {
        this.origConsoleError?.(...args);
        this.push("error", "console", this.formatConsoleArgs(args));
      };
      console.error = wrapped;
    }
    if (this.origConsoleWarn === null) {
      this.origConsoleWarn = console.warn.bind(console);
      const wrapped = (...args) => {
        this.origConsoleWarn?.(...args);
        this.push("warn", "console", this.formatConsoleArgs(args));
      };
      console.warn = wrapped;
    }
  }
  removeHooks() {
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
  formatConsoleArgs(args) {
    return args.map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) {
        return `${a.name}: ${a.message}` + (a.stack ? `
${a.stack}` : "");
      }
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    }).join(" ");
  }
}
const logger = new Logger();
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    try {
      logger.flushNow();
    } catch {
    }
  });
}
export {
  logger
};
