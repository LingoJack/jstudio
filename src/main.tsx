import { StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import PreviewWindowApp from "./components/windows/PreviewWindowApp";
import DiagramWindowApp from "./components/windows/DiagramWindowApp";
import TerminalWindowApp from "./components/terminal/TerminalWindowApp";
import DocumentWindowApp from "./components/windows/DocumentWindowApp";
import CommandPaletteWindowApp from "./components/windows/CommandPaletteWindowApp";
import LinkPreviewTabsWindowApp from "./components/windows/LinkPreviewTabsWindowApp";
import ErrorBoundary from "./components/layout/ErrorBoundary";
import { logger } from "./lib/core/logger";
import { ipc } from "./lib/core/ipc";
import { useWindowFocusTracking } from "./lib/windows/useWindowFocusTracking";
import "./index.css";
import "./styles/vscode-theme.css";

// ── Runtime logger early bootstrap ──────────────────────────────────────
//
// We tentatively enable the logger BEFORE React renders and before the
// store finishes loading settings. This ensures that any error thrown
// during the initial render / store init is captured even if the user's
// `runtimeLoggingEnabled` setting hasn't been read yet. The store's init
// path (documentsSlice) will later call `logger.setEnabled(...)` with the
// persisted value — flipping it off if the user has it disabled.
//
// Why tentatively-on rather than waiting for the store: the very bug that
// motivated the logger (SectionEditor setContent silently blanking a
// section) can fire during the first render of a document, which happens
// inside store init. Waiting would miss it.
//
// The cost of tentatively-on when the user has it off: a few log lines
// written between app launch and store init (~50-200ms) — negligible, and
// they're clearly tagged in the file so they're easy to filter out.
logger.setEnabled(true);
logger.info("main", "app bootstrap");

// ── Disable WKWebView "Live Text" (macOS) ───────────────────────────────
// Otherwise clicking an image in the editor starts a text selection over
// text recognized *inside* the rendered image instead of selecting the
// image node. DOM-level preventDefault cannot cancel this UA-driven
// interaction, so it is turned off natively via WKPreferences.
// No-op on non-macOS platforms. main.tsx runs in every window, so this
// covers the main window and all detached child windows.
//
// TEMPORARILY DISABLED: setTextInteractionEnabled(false) disables ALL text
// interaction in the webview — not just Live Text, but also contentEditable
// focus/caret placement. This caused "click many times to focus a line" and
// "multi-click selects all text" across the entire editor. Need a more
// targeted approach (e.g. CSS user-select:none on images) that doesn't
// nuke editor focus.
// ipc.disableTextInteraction().catch((err) => {
//   logger.warn("main", `disableTextInteraction failed: ${String(err)}`);
// });

// ── React 19 sandbox iframe workaround (development mode) ──────────────
// React 19's development-mode reconciliation traverses DOM trees including
// sandboxed iframes, triggering SecurityError: Sandbox access violation.
// This error cascades and blocks ALL subsequent user interactions.
// We disable StrictMode in development to prevent double-rendering and
// the associated DOM traversal that triggers this bug.
// See: https://github.com/facebook/react/issues/...
const USE_STRICT_MODE = !import.meta.env.DEV;

// ── Disable the native WebView context menu globally ──────────────
// Tauri uses the system WebView engine (WebKit on macOS, WebView2 on
// Windows, WebKitGTK on Linux). By default it shows "Inspect Element",
// "Reload", and — on contentEditable surfaces — formatting items like
// "Font", "Bold", etc. These are not appropriate for a polished desktop
// app, so we swallow the native menu at the window level.
//
// Components that need a *custom* right-click menu (DocumentSidebar,
// TerminalTabs, …) still work: they call e.preventDefault() themselves
// and render a React overlay, which is independent of this handler.
window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

// Detect if this is a preview/diagram/terminal/document window via URL query param.
// These windows render their own root component instead of the main App.
const params = new URLSearchParams(window.location.search);
const windowType = params.get("window");
const isPreviewWindow = windowType === "preview";
const isDiagramWindow = windowType === "diagram";
const isTerminalWindow = windowType === "terminal";
const isDocumentWindow = windowType === "document";
const isCommandPaletteWindow = windowType === "command-palette";
const isLinkPreviewTabsWindow = windowType === "link-preview-tabs";

// Command palette window is transparent & frameless — the body must not
// paint an opaque background, otherwise it fills the whole window rect
// and hides the rounded corners / shadow of the inner panel.
//
// We inject a <style> with !important to override vscode-theme.css's
// `body { background-color: var(--vscode-editor-background) }` rule.
// This must happen BEFORE React renders, so there's no white flash.
if (isCommandPaletteWindow) {
  const s = document.createElement("style");
  s.id = "cpw-transparent";
  s.textContent = `
    html, body, #root {
      background: transparent !important;
      background-color: transparent !important;
    }
  `;
  document.head.appendChild(s);
}

const rootElement = (
  <ErrorBoundary>
    <WindowFocusReporter>
      {isTerminalWindow ? (
        <TerminalWindowApp />
      ) : isDocumentWindow ? (
        <DocumentWindowApp />
      ) : isCommandPaletteWindow ? (
        <CommandPaletteWindowApp />
      ) : isPreviewWindow ? (
        <PreviewWindowApp />
      ) : isDiagramWindow ? (
        <DiagramWindowApp />
      ) : isLinkPreviewTabsWindow ? (
        <LinkPreviewTabsWindowApp />
      ) : (
        <App />
      )}
    </WindowFocusReporter>
  </ErrorBoundary>
);

/**
 * Mount-once wrapper that reports this window's label to Rust whenever
 * the OS window gains focus. Keeps the Rust-side `FocusedWindow` state
 * accurate so native menu commands (Cmd+W, etc.) route to the correct
 * window. See `useWindowFocusTracking` for why Tauri's built-in focus
 * tracking can't be relied on for child webview windows.
 */
function WindowFocusReporter({ children }: { children: ReactNode }) {
  useWindowFocusTracking();
  return <>{children}</>;
}

createRoot(document.getElementById("root")!).render(
  USE_STRICT_MODE ? <StrictMode>{rootElement}</StrictMode> : rootElement,
);
