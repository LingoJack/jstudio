import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import PreviewWindowApp from './components/PreviewWindowApp';
import DiagramWindowApp from './components/DiagramWindowApp';
import TerminalWindowApp from './components/terminal/TerminalWindowApp';
import CommandPaletteWindow from './components/CommandPaletteWindow';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import './styles/vscode-theme.css';

// ── Disable the native WebView context menu globally ──────────────
// Tauri uses the system WebView engine (WebKit on macOS, WebView2 on
// Windows, WebKitGTK on Linux). By default it shows "Inspect Element",
// "Reload", and — on contentEditable surfaces — formatting items like
// "Font", "Bold", etc. These are not appropriate for a polished desktop
// app, so we swallow the native menu at the window level.
//
// Components that need a *custom* right-click menu (DocumentList,
// TerminalTabs, …) still work: they call e.preventDefault() themselves
// and render a React overlay, which is independent of this handler.
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// Detect if this is a preview/diagram/terminal window via URL query param.
// These windows render their own root component instead of the main App.
const params = new URLSearchParams(window.location.search);
const windowType = params.get('window');
const isPreviewWindow = windowType === 'preview';
const isDiagramWindow = windowType === 'diagram';
const isTerminalWindow = windowType === 'terminal';
const isCommandPaletteWindow = windowType === 'command-palette';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isTerminalWindow ? (
        <TerminalWindowApp />
      ) : isCommandPaletteWindow ? (
        <CommandPaletteWindow />
      ) : isPreviewWindow ? (
        <PreviewWindowApp />
      ) : isDiagramWindow ? (
        <DiagramWindowApp />
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </StrictMode>,
);
