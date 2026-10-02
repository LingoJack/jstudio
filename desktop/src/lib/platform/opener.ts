/**
 * Platform shell-open — maps to shell.openExternal in main.
 */

import { native } from './native';

export async function openUrl(url: string): Promise<void> {
  await native().shellOpen(url);
}
