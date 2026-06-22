/**
 * HelpSection — rendered as a read-only JStudio document.
 *
 * The help content is defined as a `Block[]` in `data/helpDocument.ts`
 * (the same data model as any user-created document), then rendered by the
 * real `BlockEditor` component in read-only mode. This guarantees that any
 * change to the editor's rendering extensions or styles is automatically
 * reflected here — there is zero duplication.
 */

import { useMemo, useEffect } from 'react';
import BlockEditor from '../BlockEditor';
import { getHelpBlocks } from '../../data/helpDocument';
import { useI18n } from '../../lib/i18n';

export default function HelpSection() {
  const { t } = useI18n();

  // Build the static document once
  const helpDoc = useMemo(
    () => ({ title: t('about.helpGuide'), blocks: getHelpBlocks() }),
    [t],
  );

  // Inject anchor IDs onto <h2> headings so the Settings sidebar nav works.
  // BlockEditor renders content via TipTap, so we attach IDs post-render
  // by matching heading text → anchor id (must match Settings.tsx subItems).
  useEffect(() => {
    const anchorMap: Record<string, string> = {
      编辑器与块: 'settings-help-editor',
      终端: 'settings-help-terminal',
      快速上手: 'settings-help-quickstart',
      数据与存储: 'settings-help-storage',
      常见问题: 'settings-help-faq',
    };
    // Allow time for BlockEditor to mount and TipTap to render content.
    const timer = setTimeout(() => {
      const headings = document.querySelectorAll(
        '.ProseMirror h2',
      );
      headings.forEach((h2) => {
        const text = h2.textContent?.trim() ?? '';
        const anchorId = anchorMap[text];
        if (anchorId) {
          h2.id = anchorId;
          h2.classList.add('scroll-mt-8');
        }
      });
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  return <BlockEditor doc={helpDoc} readOnly />;
}
