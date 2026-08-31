/**
 * menu.ts — macOS application menu (replaces src-tauri/src/menu.rs).
 *
 * Mirrors the Tauri menu semantics: menu clicks become `native-command`
 * events (payload = plain command-id string) routed to the FOCUSED window;
 * the frontend's commandRegistry dispatches them. Cut/copy/paste use native
 * roles (Chromium handles them correctly in contenteditable — no objc
 * selector forwarding needed). "Select All" MUST stay a custom item: the
 * native role would only select within the focused editing host (one
 * section / one code block), bypassing the section-editor's scoped
 * selectAll registry.
 */

import { app, Menu, MenuItemConstructorOptions } from 'electron';

/** Injected by main: route a command id to the focused window. */
export type NativeCommandRouter = (command: string) => void;

/** Runtime overrides for menu accelerators (set_native_menu_accelerator). */
const acceleratorOverrides = new Map<string, string>();

export function setMenuAccelerator(command: string, accelerator: string): void {
  acceleratorOverrides.set(command, accelerator);
  rebuild();
}

let rebuild: () => void = () => {};

export function setupMenu(route: NativeCommandRouter): void {
  const item = (
    command: string,
    label: string,
    accelerator?: string,
  ): MenuItemConstructorOptions => ({
    id: command,
    label,
    accelerator: acceleratorOverrides.get(command) ?? accelerator,
    click: () => route(command),
  });

  const template: MenuItemConstructorOptions[] = [
    // ── App menu ──
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        item('app.openSettings', 'Settings…', 'CmdOrCtrl+,'),
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        item('app.quit', 'Quit JStudio', 'CmdOrCtrl+Q'),
      ],
    },
    // ── Edit menu ──
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        // Custom — sets the plain-text flag in JS before forwarding paste
        // (mirrors menu.rs's Cmd+Shift+V handling).
        item('app.pastePlainText', 'Paste and Match Style', 'CmdOrCtrl+Shift+V'),
        // Custom — see file header. Native role would break section scoping.
        item('app.selectAll', 'Select All', 'CmdOrCtrl+A'),
        { type: 'separator' },
        item('app.find', 'Find…', 'CmdOrCtrl+F'),
        item('app.globalSearch', 'Global Search…', 'CmdOrCtrl+Shift+F'),
      ],
    },
    // ── Tab menu (Tauri puts newTab/closeTab in the Window-adjacent area) ──
    {
      label: 'Window',
      submenu: [
        item('app.newTab', 'New Tab', 'CmdOrCtrl+T'),
        item('app.closeTab', 'Close Tab', 'CmdOrCtrl+W'),
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];

  rebuild = () => Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  rebuild();
}
