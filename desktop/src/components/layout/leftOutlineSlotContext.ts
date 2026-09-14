import { createContext } from 'react';

/**
 * DOM element of the left column's outline slot. Non-null only when the
 * outline docks left (main window + left layout + "文档大纲" tab selected).
 * DocumentPanel portals its SectionOutline into it; detached windows and
 * right-side layouts keep the provider default (null) and render the
 * outline in place with the pin-button semantics.
 */
export const LeftOutlineSlotContext = createContext<HTMLDivElement | null>(
  null,
);
