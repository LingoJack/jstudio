/**
 * DocumentWindowApp — root component for a torn-off document window
 * (?window=document).
 *
 * Flow:
 *   1. Retrieve the docId from the Rust memory payload.
 *   2. Run the same `init()` as the main window (settings, theme, etc.).
 *   3. Load the document by ID.
 *   4. Render BlockEditor fullscreen — no sidebar, no tab bar, no terminal.
 */

import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { fetchDocumentDetachPayload } from '../../lib/windows/documentDetach';
import BlockEditor from '../editor/BlockEditor';
import { useI18n } from '../../lib/core/i18n';

type Status = 'loading' | 'ready' | 'error';

export default function DocumentWindowApp() {
  const [status, setStatus] = useState<Status>('loading');
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const payload = await fetchDocumentDetachPayload();
      if (cancelled) return;

      if (!payload || !payload.docId) {
        setStatus('error');
        return;
      }

      // Load settings (theme, fonts, dark class) to match the main window.
      try {
        await useStore.getState().init();
      } catch (e) {
        console.error('[DocumentWindow] init failed:', e);
      }
      if (cancelled) return;

      // Load the specific document.
      const docId = payload.docId;
      await useStore.getState().openDocument(docId);

      if (cancelled) return;
      setStatus('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'error') {
    return (
      <div className="w-screen h-screen flex items-center justify-center text-[var(--vscode-errorForeground)] text-sm">
        {t('document.loadError')}
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="w-screen h-screen flex items-center justify-center text-[var(--vscode-descriptionForeground)] text-sm">
        {t('document.loading')}
      </div>
    );
  }

  return (
    <div className="w-screen h-screen overflow-hidden bg-[var(--vscode-editor-background)]">
      {/* Editor fills the entire window — no tab bar, no action bar */}
      <BlockEditor />
    </div>
  );
}
