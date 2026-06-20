import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import PreviewWindowApp from './components/PreviewWindowApp';
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

// Detect if this is a preview window via URL query param.
// Preview windows render PreviewWindowApp instead of the main App.
const params = new URLSearchParams(window.location.search);
const isPreviewWindow = params.get('window') === 'preview';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isPreviewWindow ? <PreviewWindowApp /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
);
