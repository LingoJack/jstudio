import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import PreviewWindowApp from './components/windows/PreviewWindowApp';
import DiagramWindowApp from './components/windows/DiagramWindowApp';
import TerminalWindowApp from './components/terminal/TerminalWindowApp';
import DocumentWindowApp from './components/windows/DocumentWindowApp';
import CommandPaletteWindow from './components/windows/CommandPaletteWindow';
import LinkPreviewTabsApp from './components/windows/LinkPreviewTabsApp';
import BrowserTabsOverlayApp from './components/windows/BrowserTabsOverlayApp';
import ErrorBoundary from './components/layout/ErrorBoundary';
import './index.css';
import './styles/vscode-theme.css';

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
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// Detect if this is a preview/diagram/terminal/document window via URL query param.
// These windows render their own root component instead of the main App.
const params = new URLSearchParams(window.location.search);
const windowType = params.get('window');
const isPreviewWindow = windowType === 'preview';
const isDiagramWindow = windowType === 'diagram';
const isTerminalWindow = windowType === 'terminal';
const isDocumentWindow = windowType === 'document';
const isCommandPaletteWindow = windowType === 'command-palette';
const isLinkPreviewTabsWindow = windowType === 'link-preview-tabs';
const isBrowserTabbarOverlayWindow = windowType === 'browser-tabbar-overlay';

// Command palette window is transparent & frameless — the body must not
// paint an opaque background, otherwise it fills the whole window rect
// and hides the rounded corners / shadow of the inner panel.
//
// The browser tab-bar overlay window needs the same treatment for a
// different reason: it's a fully transparent child webview stacked above
// the browser panel's content webview. Pixels with alpha=0 let mouse
// clicks pass through to the content webview beneath; only the opaque
// glass tab pill itself should capture clicks.
//
// We inject a <style> with !important to override vscode-theme.css's
// `body { background-color: var(--vscode-editor-background) }` rule.
// This must happen BEFORE React renders, so there's no white flash.
//
// For the browser tab-bar overlay, we additionally zero out margins and
// set height: 100% so #root fills the entire (short) overlay webview --
// otherwise #root collapses to content height and TabBar's absolute
// positioning context can be shorter than the webview, clipping the pill.
if (isCommandPaletteWindow || isBrowserTabbarOverlayWindow) {
  const s = document.createElement('style');
  s.id = 'cpw-transparent';
  const overlayExtra = isBrowserTabbarOverlayWindow
    ? `
      margin: 0 !important;
      height: 100% !important;
      width: 100% !important;`
    : '';
  s.textContent = `
    html, body, #root {
      background: transparent !important;
      background-color: transparent !important;${overlayExtra}
    }
  `;
  document.head.appendChild(s);
}

const rootElement = (
  <ErrorBoundary>
    {isTerminalWindow ? (
      <TerminalWindowApp />
    ) : isDocumentWindow ? (
      <DocumentWindowApp />
    ) : isCommandPaletteWindow ? (
      <CommandPaletteWindow />
    ) : isPreviewWindow ? (
      <PreviewWindowApp />
    ) : isDiagramWindow ? (
      <DiagramWindowApp />
    ) : isLinkPreviewTabsWindow ? (
      <LinkPreviewTabsApp />
    ) : isBrowserTabbarOverlayWindow ? (
      <BrowserTabsOverlayApp />
    ) : (
      <App />
    )}
  </ErrorBoundary>
);

createRoot(document.getElementById('root')!).render(
  USE_STRICT_MODE ? <StrictMode>{rootElement}</StrictMode> : rootElement,
);
