import { heading1Command } from "./heading1";
import { heading2Command } from "./heading2";
import { heading3Command } from "./heading3";
import { heading4Command } from "./heading4";
import { heading5Command } from "./heading5";
import { heading6Command } from "./heading6";
import { bulletListCommand } from "./bulletList";
import { numberedListCommand } from "./numberedList";
import { todoListCommand } from "./todoList";
import { quoteCommand } from "./quote";
import { codeBlockCommand } from "./codeBlock";
import { imageCommand } from "./image";
import { fileCommand } from "./file";
import { linkCommand } from "./link";
import { tableCommand } from "./table";
import { dividerCommand } from "./divider";
import { diagramCommand } from "./diagram";
import { collapsibleCommand } from "./collapsible";
import { mathCommand } from "./math";
const slashCommands = [
  heading1Command,
  heading2Command,
  heading3Command,
  heading4Command,
  heading5Command,
  heading6Command,
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
  mathCommand
];
function filterSlashCommands(query) {
  const q = query.toLowerCase().trim();
  if (!q) return slashCommands;
  return slashCommands.filter((item) => {
    if (item.title.toLowerCase().includes(q)) return true;
    return item.aliases.some((alias) => alias.toLowerCase().includes(q));
  });
}
export {
  filterSlashCommands,
  slashCommands
};
