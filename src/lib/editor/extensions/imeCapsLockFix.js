import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { isRawPinyinCommit, stripPinyinSpaces } from "../../ime/pinyinStrip";
const imeCapsLockPluginKey = new PluginKey("imeCapsLockFix");
const SUPPRESS_WINDOW = 500;
const STRAY_SPACE_WINDOW = 200;
const MAX_COMMIT_MEMORY = 32;
const ImeCapsLockFix = Extension.create({
  name: "imeCapsLockFix",
  addProseMirrorPlugins() {
    let composing = false;
    let lastCommittedText = "";
    let lastCommitTime = 0;
    let capsLockAtComposeTime = 0;
    let lastPinyinRaw = "";
    let pendingPinyinStrip = null;
    return [
      new Plugin({
        key: imeCapsLockPluginKey,
        props: {
          handleDOMEvents: {
            // ── composition lifecycle ───────────────────────────────
            compositionstart: () => {
              composing = true;
              return false;
            },
            compositionend: (view, event) => {
              composing = false;
              const ce = event;
              if (ce.data) {
                lastCommittedText = ce.data.slice(0, MAX_COMMIT_MEMORY);
                lastCommitTime = Date.now();
                if (isRawPinyinCommit(ce.data)) {
                  lastPinyinRaw = ce.data;
                  pendingPinyinStrip = stripPinyinSpaces(ce.data);
                  setTimeout(() => {
                    pendingPinyinStrip = null;
                    lastPinyinRaw = "";
                  }, 500);
                }
              }
              return false;
            },
            // ── detect CapsLock pressed while composing ─────────────
            keydown: (_view, event) => {
              const ke = event;
              if (ke.key === "CapsLock" && composing) {
                capsLockAtComposeTime = Date.now();
              }
              return false;
            },
            // ── filter phantom insertions ───────────────────────────
            beforeinput: (view, event) => {
              const ie = event;
              if (ie.inputType !== "insertText" || !ie.data) return false;
              if (pendingPinyinStrip !== null && ie.data === lastPinyinRaw) {
                event.preventDefault();
                const cleaned = pendingPinyinStrip;
                pendingPinyinStrip = null;
                lastPinyinRaw = "";
                view.dispatch(view.state.tr.insertText(cleaned));
                return true;
              }
              if (capsLockAtComposeTime === 0) return false;
              const now = Date.now();
              const sinceCapsLock = now - capsLockAtComposeTime;
              const sinceCommit = now - lastCommitTime;
              const text = ie.data;
              let shouldSuppress = false;
              if (lastCommittedText.length > 0 && text === lastCommittedText && sinceCapsLock < SUPPRESS_WINDOW && !isRawPinyinCommit(text)) {
                shouldSuppress = true;
              }
              if (text === " " && sinceCapsLock < SUPPRESS_WINDOW && sinceCommit < STRAY_SPACE_WINDOW) {
                shouldSuppress = true;
              }
              if (shouldSuppress) {
                event.preventDefault();
                capsLockAtComposeTime = 0;
                lastCommittedText = "";
                return true;
              }
              if (sinceCapsLock >= SUPPRESS_WINDOW) {
                capsLockAtComposeTime = 0;
              }
              return false;
            }
          },
          // ── Secondary fallback: catch text that bypasses beforeinput ──
          // Some older WebKit versions fire handleTextInput for committed
          // composition text; swallow the duplicate here too. Also mirrors
          // the pinyin-strip logic in case the beforeinput path was skipped.
          handleTextInput: (_view, _from, _to, text) => {
            if (pendingPinyinStrip !== null && text === lastPinyinRaw) {
              pendingPinyinStrip = null;
              lastPinyinRaw = "";
              return true;
            }
            if (capsLockAtComposeTime === 0) return false;
            const now = Date.now();
            const sinceCapsLock = now - capsLockAtComposeTime;
            const sinceCommit = now - lastCommitTime;
            if (sinceCapsLock < SUPPRESS_WINDOW && (lastCommittedText.length > 0 && text === lastCommittedText && !isRawPinyinCommit(text) || text === " " && sinceCommit < STRAY_SPACE_WINDOW)) {
              capsLockAtComposeTime = 0;
              lastCommittedText = "";
              return true;
            }
            if (sinceCapsLock >= SUPPRESS_WINDOW) {
              capsLockAtComposeTime = 0;
            }
            return false;
          }
        },
        // ── Pinyin strip fallback (post-composition) ──────────────────
        // On WebKit, ProseMirror processes composition commits through DOM
        // observation, not through beforeinput events. The beforeinput
        // handler above may never fire for composition commits (or may fire
        // with insertCompositionText, which it filters out). This
        // appendTransaction runs after ProseMirror applies ANY transaction,
        // including the one that inserts the committed composition text.
        // If the raw pinyin (with spaces) is found at the caret, it is
        // replaced with the compact (space-stripped) form - matching the
        // terminal's behavior where "ni hao" becomes "nihao".
        appendTransaction(_transactions, _oldState, newState) {
          if (pendingPinyinStrip === null) return null;
          const { selection } = newState;
          const head = selection.head;
          const len = lastPinyinRaw.length;
          if (len === 0) {
            pendingPinyinStrip = null;
            lastPinyinRaw = "";
            return null;
          }
          const from = head - len;
          if (from < 1) return null;
          const inserted = newState.doc.textBetween(from, head, "\n");
          if (inserted === lastPinyinRaw) {
            const cleaned = pendingPinyinStrip;
            pendingPinyinStrip = null;
            lastPinyinRaw = "";
            return newState.tr.insertText(cleaned, from, head);
          }
          return null;
        }
      })
    ];
  }
});
export {
  ImeCapsLockFix
};
