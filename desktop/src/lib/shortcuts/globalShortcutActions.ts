/**
 * globalShortcutActions.ts — Built-in action handlers for the global shortcut system.
 *
 * This module registers three built-in action types into the ACTION_REGISTRY:
 *   1. `open-panel`     — open a floating window (e.g. Command Palette)
 *   2. `open-terminal`   — open a terminal at a given directory, optionally running a command
 *   3. `toggle-window`   — show/hide the main application window
 *
 * Importing this module is all that's needed to activate these actions.
 * The `globalShortcuts.ts` engine + settings UI discover them automatically
 * via the registry.
 *
 * To add more actions, follow the same pattern: call `registerActionDef()`
 * in this file (or any side-effect module) and add i18n keys.
 */

import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LayoutGrid, TerminalSquare, Eye } from 'lucide-react';
import { ipc } from '../core/ipc';
import { registerActionDef } from './globalShortcuts';

// ──────────────────────────────────────────────────────────────────────────
// Action: open-panel
// ──────────────────────────────────────────────────────────────────────────
//
// Opens a floating, frameless window centered on screen (Spotlight/Raycast
// style). The `panelId` param selects which panel to show. Currently only
// `command-palette` is supported, but the param schema makes it trivial to
// add more panels in the future.

let panelWindowCounter = 0;

registerActionDef({
  type: 'open-panel',
  labelKey: 'globalShortcut.action.openPanel',
  descriptionKey: 'globalShortcut.action.openPanelDesc',
  icon: LayoutGrid,
  paramFields: [
    {
      key: 'panelId',
      labelKey: 'globalShortcut.param.panel',
      type: 'select',
      options: [
        { value: 'command-palette', labelKey: 'globalShortcut.panel.commandPalette' },
      ],
      defaultValue: 'command-palette',
    },
  ],
  handler: async (params) => {
    const panelId = (params.panelId as string) || 'command-palette';
    const label = `cp-${panelId}`;

    // Close any existing panel window of this type to avoid duplicates.
    const { WebviewWindow: WV } = await import('@tauri-apps/api/webviewWindow');
    const existing = await WV.getByLabel(label);
    if (existing) {
      await existing.close();
    }

    panelWindowCounter += 1;

    if (panelId === 'command-palette') {
      // Spotlight-style: the window starts as just an input bar.
      // The webview itself is transparent & frameless — the inner React
      // panel draws ALL visible chrome (rounded corners, shadow, border).
      // We must NOT set Tauri's `shadow: true` because that adds a native
      // OS-level rectangular shadow underneath, producing a visible
      // square frame around our rounded panel.
      const w = new WebviewWindow(label, {
        url: `index.html?window=command-palette&label=${encodeURIComponent(label)}`,
        title: 'Command Palette',
        width: 680,
        height: 600,
        maxWidth: 680,
        maxHeight: 600,
        minWidth: 480,
        minHeight: 56,
        resizable: false,
        decorations: false,
        transparent: true,
        alwaysOnTop: true,
        center: true,
        focus: true,
        shadow: false,
        // skipTaskbar: true, // Not available in all platforms
      });

      w.once('tauri://error', (e) => {
        console.error('[globalShortcuts] Command palette window error:', e);
      });
    }
  },
});

// ──────────────────────────────────────────────────────────────────────────
// Action: open-terminal
// ──────────────────────────────────────────────────────────────────────────
//
// Opens a standalone terminal window. The user can configure:
//   - `cwd`:     working directory (defaults to home `~`)
//   - `command`: optional shell command to execute after the shell starts
//
// Flow:
//   1. Create a PTY session via `ipc.ptyCreate({ cwd })`.
//   2. If a command is specified, write it to the PTY (appends `\n` to execute).
//   3. Open a terminal window, passing the session id via URL params.
//      The child window runs `TerminalWindowApp` which picks up the session.
//
// The terminal window reuses the same `?window=terminal` routing as detached
// terminals, but in "new session" mode (no detach payload needed).

let terminalWindowCounter = 0;

registerActionDef({
  type: 'open-terminal',
  labelKey: 'globalShortcut.action.openTerminal',
  descriptionKey: 'globalShortcut.action.openTerminalDesc',
  icon: TerminalSquare,
  paramFields: [
    {
      key: 'cwd',
      labelKey: 'globalShortcut.param.workingDirectory',
      type: 'directory',
      placeholderKey: 'globalShortcut.param.workingDirectoryPlaceholder',
      defaultValue: '~',
    },
    {
      key: 'command',
      labelKey: 'globalShortcut.param.command',
      type: 'text',
      placeholderKey: 'globalShortcut.param.commandPlaceholder',
    },
  ],
  handler: async (params) => {
    const cwd = (params.cwd as string) || '~';
    const command = (params.command as string | undefined)?.trim();

    // 1. Spawn a PTY session.
    const session = await ipc.ptyCreate({
      cwd,
      cols: 80,
      rows: 24,
    });

    // 2. If a command was specified, write it to the PTY.
    if (command) {
      // Small delay to let the shell initialize before sending the command.
      await new Promise((r) => setTimeout(r, 300));
      await ipc.ptyWrite(session.id, command + '\n');
    }

    // 3. Open the terminal window.
    terminalWindowCounter += 1;
    const label = `terminal-gs-${Date.now()}-${terminalWindowCounter}`;

    // Store the session info for the child window to pick up.
    // We use a global variable on `window` since the child window shares
    // the same JS bundle and can access it via a Tauri command.
    // However, child windows have separate JS contexts, so we need to pass
    // the session id via URL. The child window's TerminalWindowApp will
    // create a fresh group with this session.
    //
    // We use the same detach payload mechanism but with a synthetic payload
    // that indicates "new session" mode.
    const { invoke } = await import('@tauri-apps/api/core');

    const payload = {
      groupId: `gs-group-${label}`,
      layout: 'tabs' as const,
      activeSessionId: session.id,
      panes: [
        {
          sessionId: session.id,
          title: session.title,
          customTitle: null,
          autoTitle: null,
          templateId: null,
          cwd,
          scrollback: '',
        },
      ],
    };

    try {
      await invoke('set_terminal_detach_payload', { label, payload });
    } catch (e) {
      console.error('[globalShortcuts] Failed to store terminal payload:', e);
      return;
    }

    new WebviewWindow(label, {
      url: `index.html?window=terminal&label=${encodeURIComponent(label)}`,
      title: command ? `终端: ${command}` : '终端',
      width: 900,
      height: 600,
      minWidth: 400,
      minHeight: 240,
      resizable: true,
      decorations: true,
      center: true,
      focus: true,
    });
  },
});

// ──────────────────────────────────────────────────────────────────────────
// Action: toggle-window
// ──────────────────────────────────────────────────────────────────────────
//
// Toggles the main window's visibility. Useful for a "quick show/hide"
// global hotkey that brings JStudio to front or hides it.

registerActionDef({
  type: 'toggle-window',
  labelKey: 'globalShortcut.action.toggleWindow',
  descriptionKey: 'globalShortcut.action.toggleWindowDesc',
  icon: Eye,
  paramFields: [],
  handler: async () => {
    const win = getCurrentWindow();
    if (await win.isVisible()) {
      // Check if focused — if visible but not focused, bring to front instead of hiding.
      const focused = await win.isFocused();
      if (focused) {
        await win.hide();
      } else {
        await win.setFocus();
      }
    } else {
      await win.show();
      await win.setFocus();
    }
  },
});
