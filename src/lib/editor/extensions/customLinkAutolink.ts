/**
 * customLinkAutolink — replacement for @tiptap/extension-link's built-in
 * autolink plugin.
 *
 * WHY: The upstream autolink plugin
 * (node_modules/@tiptap/extension-link/src/helpers/autolink.ts) only ADDS a
 * link mark to text that has NO existing link mark. When the user edits an
 * already-linked URL (e.g. pastes a bilibili URL → autolink creates a link
 * mark → user deletes part of the URL and types a new one), the surviving
 * text still carries the OLD link mark with the OLD href. Upstream autolink
 * re-scans the text, detects the new URL, but `getMarksBetween` finds an
 * existing link mark and returns early — so the href is NEVER updated.
 * Clicking the link then navigates to the original (stale) URL.
 *
 * FIX: When autolink detects a URL whose range already has a link mark,
 * compare the existing href with the detected href. If they differ, remove
 * the old mark and add a new one with the detected href.
 *
 * USAGE: Disable the upstream autolink (`autolink: false`) and register this
 * plugin via `Link.extend({ addProseMirrorPlugins() { return [
 * customLinkAutolink({ type: this.type }) ] } })`.
 */

import type { NodeWithPos } from '@tiptap/core';
import {
  combineTransactionSteps,
  findChildrenInRange,
  getChangedRanges,
  getMarksBetween,
} from '@tiptap/core';
import type { MarkType } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { MultiToken } from 'linkifyjs';
import { tokenize } from 'linkifyjs';

// Unicode whitespace regexes — mirrored from @tiptap/extension-link's internal
// whitespace.ts (that module isn't exported, so we redefine it here).
const UNICODE_WHITESPACE_PATTERN =
  '[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]';
const UNICODE_WHITESPACE_REGEX = new RegExp(UNICODE_WHITESPACE_PATTERN);
const UNICODE_WHITESPACE_REGEX_END = new RegExp(
  `${UNICODE_WHITESPACE_PATTERN}$`,
);

function isValidLinkStructure(
  tokens: Array<ReturnType<MultiToken['toObject']>>,
) {
  if (tokens.length === 1) {
    return tokens[0].isLink;
  }

  if (tokens.length === 3 && tokens[1].isLink) {
    return ['()', '[]'].includes(tokens[0].value + tokens[2].value);
  }

  return false;
}

type CustomAutolinkOptions = {
  type: MarkType;
  defaultProtocol?: string;
  validate?: (url: string) => boolean;
  shouldAutoLink?: (url: string) => boolean;
};

export function customLinkAutolink(options: CustomAutolinkOptions): Plugin {
  const defaultProtocol = options.defaultProtocol ?? 'https';
  const validate = options.validate ?? (() => true);
  const shouldAutoLink = options.shouldAutoLink ?? (() => true);

  return new Plugin({
    key: new PluginKey('customAutolink'),
    appendTransaction: (transactions, oldState, newState) => {
      const docChanges =
        transactions.some(transaction => transaction.docChanged) &&
        !oldState.doc.eq(newState.doc);

      const preventAutolink = transactions.some(transaction =>
        transaction.getMeta('preventAutolink'),
      );

      if (!docChanges || preventAutolink) {
        return;
      }

      const { tr } = newState;
      const transform = combineTransactionSteps(oldState.doc, [...transactions]);
      const changes = getChangedRanges(transform);

      changes.forEach(({ newRange }) => {
        const nodesInChangedRanges = findChildrenInRange(
          newState.doc,
          newRange,
          node => node.isTextblock,
        );

        let textBlock: NodeWithPos | undefined;
        let textBeforeWhitespace: string | undefined;

        if (nodesInChangedRanges.length > 1) {
          textBlock = nodesInChangedRanges[0];
          textBeforeWhitespace = newState.doc.textBetween(
            textBlock.pos,
            textBlock.pos + textBlock.node.nodeSize,
            undefined,
            ' ',
          );
        } else if (nodesInChangedRanges.length) {
          const endText = newState.doc.textBetween(
            newRange.from,
            newRange.to,
            ' ',
            ' ',
          );
          if (!UNICODE_WHITESPACE_REGEX_END.test(endText)) {
            return;
          }
          textBlock = nodesInChangedRanges[0];
          textBeforeWhitespace = newState.doc.textBetween(
            textBlock.pos,
            newRange.to,
            undefined,
            ' ',
          );
        }

        if (textBlock && textBeforeWhitespace) {
          const wordsBeforeWhitespace = textBeforeWhitespace
            .split(UNICODE_WHITESPACE_REGEX)
            .filter(Boolean);

          if (wordsBeforeWhitespace.length <= 0) {
            return;
          }

          const lastWordBeforeSpace =
            wordsBeforeWhitespace[wordsBeforeWhitespace.length - 1];
          const lastWordAndBlockOffset =
            textBlock.pos + textBeforeWhitespace.lastIndexOf(lastWordBeforeSpace);

          if (!lastWordBeforeSpace) {
            return;
          }

          const linksBeforeSpace = tokenize(lastWordBeforeSpace).map(t =>
            t.toObject(defaultProtocol),
          );

          if (!isValidLinkStructure(linksBeforeSpace)) {
            return;
          }

          linksBeforeSpace
            .filter(link => link.isLink)
            .map(link => ({
              ...link,
              from: lastWordAndBlockOffset + link.start + 1,
              to: lastWordAndBlockOffset + link.end + 1,
            }))
            .filter(link => {
              if (!newState.schema.marks.code) {
                return true;
              }
              return !newState.doc.rangeHasMark(
                link.from,
                link.to,
                newState.schema.marks.code,
              );
            })
            .filter(link => validate(link.value))
            .filter(link => shouldAutoLink(link.value))
            .forEach(link => {
              const existing = getMarksBetween(
                link.from,
                link.to,
                newState.doc,
              ).filter(item => item.mark.type === options.type);

              if (existing.length === 0) {
                // No link mark yet — add one.
                tr.addMark(
                  link.from,
                  link.to,
                  options.type.create({ href: link.href }),
                );
                return;
              }

              // Range already has a link mark. Update its href if it differs
              // from the detected URL — this is the fix for the "edited link
              // still navigates to the old URL" bug. Upstream skips here.
              const needsUpdate = existing.some(
                item => item.mark.attrs.href !== link.href,
              );
              if (needsUpdate) {
                tr.removeMark(link.from, link.to, options.type);
                tr.addMark(
                  link.from,
                  link.to,
                  options.type.create({ href: link.href }),
                );
              }
            });
        }
      });

      if (!tr.steps.length) {
        return;
      }

      return tr;
    },
  });
}
