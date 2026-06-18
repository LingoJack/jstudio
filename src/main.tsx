import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import PreviewWindowApp from './components/PreviewWindowApp';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import './styles/vscode-theme.css';

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
