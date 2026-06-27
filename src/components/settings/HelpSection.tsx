/**
 * HelpSection — rendered as a read-only JStudio document.
 *
 * The help content is defined as a `Block[]` in `data/helpDocument.ts`
 * (the same data model as any user-created document), then rendered by the
 * real `BlockEditor` component in read-only mode.
 *
 * This guarantees that ANY change to the editor's rendering — extensions,
 * styles, layout, outline panel — is automatically reflected here.
 * There is zero duplication of rendering logic.
 */

import { useMemo } from 'react';
import BlockEditor from '../editor/BlockEditor';
import { getHelpBlocks } from '../../data/helpDocument';
import { useI18n } from '../../lib/i18n';

export default function HelpSection() {
  const { t } = useI18n();

  // Build the static document once
  const helpDoc = useMemo(
    () => ({ title: t('about.helpGuide'), blocks: getHelpBlocks() }),
    [t],
  );

  return <BlockEditor doc={helpDoc} readOnly />;
}
