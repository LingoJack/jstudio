/**
 * LinkClickOpen — Cmd/Ctrl+click a link to open it in the system browser.
 *
 * Plain click keeps the in-editor behavior (caret moves into the link text so
 * the user can edit it; see ModClickCaretFix for the mod-click caret fix).
 * Following the link is a deliberate mod-click gesture, matching VSCode /
 * Typora.
 *
 * Opening goes through the `@tauri-apps/plugin-opener` shim → Electron main
 * `shell.openExternal`, i.e. the system default browser — the app window
 * itself never navigates away from the document.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { openUrl } from '@tauri-apps/plugin-opener';
import { logger } from '../../core/logger';

const LOG_SOURCE = 'linkClickOpen';

export const LinkClickOpen = Extension.create({
  name: 'linkClickOpen',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('linkClickOpen'),
        props: {
          handleDOMEvents: {
            click(view, event) {
              if (event.button !== 0) return false;
              if (!(event.metaKey || event.ctrlKey)) return false;
              const target = event.target as HTMLElement | null;
              const link = target?.closest('a');
              if (!link || !view.dom.contains(link)) return false;
              const href = link.getAttribute('href');
              if (!href) return false;
              event.preventDefault();
              openUrl(href).catch((err) =>
                logger.error(LOG_SOURCE, `openUrl failed: ${String(err)}`),
              );
              return true;
            },
          },
        },
      }),
    ];
  },
});
