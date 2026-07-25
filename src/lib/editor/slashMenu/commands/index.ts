import type { SlashCommandItem } from '../types';

import { heading1Command } from './heading1';
import { heading2Command } from './heading2';
import { heading3Command } from './heading3';
import { bulletListCommand } from './bulletList';
import { numberedListCommand } from './numberedList';
import { todoListCommand } from './todoList';
import { quoteCommand } from './quote';
import { codeBlockCommand } from './codeBlock';
import { imageCommand } from './image';
import { fileCommand } from './file';
import { linkCommand } from './link';
import { tableCommand } from './table';
import { dividerCommand } from './divider';
import { diagramCommand } from './diagram';
import { collapsibleCommand } from './collapsible';
import { mathCommand } from './math';

/**
 * Ordered list of every slash-menu command.
 *
 * To add a new command, create a file in this directory and append its
 * exported item below. To reorder, simply adjust this array.
 */
export const slashCommands: SlashCommandItem[] = [
  heading1Command,
  heading2Command,
  heading3Command,
  bulletListCommand,
  numberedListCommand,
  todoListCommand,
  quoteCommand,
  codeBlockCommand,
  imageCommand,
  fileCommand,
  linkCommand,
  tableCommand,
  dividerCommand,
  diagramCommand,
  collapsibleCommand,
  mathCommand,
];

/**
 * Filter the command list by the current query string.
 *
 * Matching is case-insensitive against title and aliases.
 */
export function filterSlashCommands(query: string): SlashCommandItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return slashCommands;

  return slashCommands.filter((item) => {
    if (item.title.toLowerCase().includes(q)) return true;
    return item.aliases.some((alias) => alias.toLowerCase().includes(q));
  });
}
