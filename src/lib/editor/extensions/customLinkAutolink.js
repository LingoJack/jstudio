import {
  combineTransactionSteps,
  findChildrenInRange,
  getChangedRanges,
  getMarksBetween
} from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { tokenize } from "linkifyjs";
const UNICODE_WHITESPACE_PATTERN = "[\0- \xA0\u1680\u180E\u2000-\u2029\u205F\u3000]";
const UNICODE_WHITESPACE_REGEX = new RegExp(UNICODE_WHITESPACE_PATTERN);
const UNICODE_WHITESPACE_REGEX_END = new RegExp(
  `${UNICODE_WHITESPACE_PATTERN}$`
);
function isValidLinkStructure(tokens) {
  if (tokens.length === 1) {
    return tokens[0].isLink;
  }
  if (tokens.length === 3 && tokens[1].isLink) {
    return ["()", "[]"].includes(tokens[0].value + tokens[2].value);
  }
  return false;
}
function customLinkAutolink(options) {
  const defaultProtocol = options.defaultProtocol ?? "https";
  const validate = options.validate ?? (() => true);
  const shouldAutoLink = options.shouldAutoLink ?? (() => true);
  return new Plugin({
    key: new PluginKey("customAutolink"),
    appendTransaction: (transactions, oldState, newState) => {
      const docChanges = transactions.some((transaction) => transaction.docChanged) && !oldState.doc.eq(newState.doc);
      const preventAutolink = transactions.some(
        (transaction) => transaction.getMeta("preventAutolink")
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
          (node) => node.isTextblock
        );
        let textBlock;
        let textBeforeWhitespace;
        if (nodesInChangedRanges.length > 1) {
          textBlock = nodesInChangedRanges[0];
          textBeforeWhitespace = newState.doc.textBetween(
            textBlock.pos,
            textBlock.pos + textBlock.node.nodeSize,
            void 0,
            " "
          );
        } else if (nodesInChangedRanges.length) {
          const endText = newState.doc.textBetween(
            newRange.from,
            newRange.to,
            " ",
            " "
          );
          if (!UNICODE_WHITESPACE_REGEX_END.test(endText)) {
            return;
          }
          textBlock = nodesInChangedRanges[0];
          textBeforeWhitespace = newState.doc.textBetween(
            textBlock.pos,
            newRange.to,
            void 0,
            " "
          );
        }
        if (textBlock && textBeforeWhitespace) {
          const wordsBeforeWhitespace = textBeforeWhitespace.split(UNICODE_WHITESPACE_REGEX).filter(Boolean);
          if (wordsBeforeWhitespace.length <= 0) {
            return;
          }
          const lastWordBeforeSpace = wordsBeforeWhitespace[wordsBeforeWhitespace.length - 1];
          const lastWordAndBlockOffset = textBlock.pos + textBeforeWhitespace.lastIndexOf(lastWordBeforeSpace);
          if (!lastWordBeforeSpace) {
            return;
          }
          const linksBeforeSpace = tokenize(lastWordBeforeSpace).map(
            (t) => t.toObject(defaultProtocol)
          );
          if (!isValidLinkStructure(linksBeforeSpace)) {
            return;
          }
          linksBeforeSpace.filter((link) => link.isLink).map((link) => ({
            ...link,
            from: lastWordAndBlockOffset + link.start + 1,
            to: lastWordAndBlockOffset + link.end + 1
          })).filter((link) => {
            if (!newState.schema.marks.code) {
              return true;
            }
            return !newState.doc.rangeHasMark(
              link.from,
              link.to,
              newState.schema.marks.code
            );
          }).filter((link) => validate(link.value)).filter((link) => shouldAutoLink(link.value)).forEach((link) => {
            const existing = getMarksBetween(
              link.from,
              link.to,
              newState.doc
            ).filter((item) => item.mark.type === options.type);
            if (existing.length === 0) {
              tr.addMark(
                link.from,
                link.to,
                options.type.create({ href: link.href })
              );
              return;
            }
            const needsUpdate = existing.some(
              (item) => item.mark.attrs.href !== link.href
            );
            if (needsUpdate) {
              tr.removeMark(link.from, link.to, options.type);
              tr.addMark(
                link.from,
                link.to,
                options.type.create({ href: link.href })
              );
            }
          });
        }
      });
      if (!tr.steps.length) {
        return;
      }
      return tr;
    }
  });
}
export {
  customLinkAutolink
};
