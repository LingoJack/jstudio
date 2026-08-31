/**
 * Shim for `@tauri-apps/plugin-dialog` (Electron shell, via vite alias).
 * Maps to Electron's dialog.showOpenDialog / showSaveDialog in main.
 */

import { native } from './native';

export interface DialogFilter {
  name: string;
  extensions: string[];
}

export interface OpenDialogOptions {
  title?: string;
  defaultPath?: string;
  directory?: boolean;
  multiple?: boolean;
  filters?: DialogFilter[];
}

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: DialogFilter[];
}

export async function open(options: OpenDialogOptions = {}): Promise<string | string[] | null> {
  const properties: string[] = [];
  if (options.directory) properties.push('openDirectory');
  else properties.push('openFile');
  if (options.multiple) properties.push('multiSelections');

  return (await native().dialogOpen({
    title: options.title,
    defaultPath: options.defaultPath,
    filters: options.filters,
    properties,
  })) as string | string[] | null;
}

export async function save(options: SaveDialogOptions = {}): Promise<string | null> {
  return (await native().dialogSave({
    title: options.title,
    defaultPath: options.defaultPath,
    filters: options.filters,
  })) as string | null;
}
