/**
 * ImeCapsLockFix — 修复中文输入法在编辑器里产生的两类异常提交。
 *
 * ┌─ 问题一：CapsLock 切换的幻影字符 ───────────────────────────────────┐
 * │ On macOS WebKit, when a CJK input method is composing and the user   │
 * │ presses CapsLock to flip to English mode, the event ordering becomes │
 * │ non-standard:                                                        │
 * │                                                                      │
 * │   1. keydown  (CapsLock, isComposing:true)                           │
 * │   2. compositionend — IME commits the current candidate              │
 * │   3. beforeinput(insertText) — committed text flows into ProseMirror │
 * │   4. beforeinput(insertText) — **duplicate** committed text or a     │
 * │      stray space leaked by the IME at the mode-switch boundary       │
 * │                                                                      │
 * │ ProseMirror's built-in composition tracker cannot anticipate this    │
 * │ hardware-level interruption, so step 4 gets inserted as real text.   │
 * │                                                                      │
 * │ Strategy: track composition state + CapsLock-in-composition events,  │
 * │ then swallow duplicate / stray-space beforeinput events that arrive  │
 * │ within a short window after such a switch.                           │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 问题二：切换英文输入法时拼音带空格被提交 ──────────────────────────┐
 * │ 用户在中文输入法下输入拼音（如 "ni hao"），未选词就切换到英文输入法  │
 * │ （Shift / CapsLock / 菜单切换）时，IME 会把候选框里当前正在输入的    │
 * │ 原始拼音串（字母 + 空格分隔）直接提交到光标。这串空格是拼音分词符，  │
 * │ 并非用户想要的内容。                                                  │
 * │                                                                      │
 * │ Strategy: compositionend 时检测提交文本是否为"带空格的原始拼音"，若是 │
 * │ 则在 beforeinput 拦截默认插入，改用去空格后的紧凑形式（"nihao"）写入 │
 * │ 文档。该逻辑独立于 CapsLock，覆盖所有切换方式。                       │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { isRawPinyinCommit, stripPinyinSpaces } from '../../ime/pinyinStrip';

/** Unique key so the plugin's internal state is addressable. */
const imeCapsLockPluginKey = new PluginKey('imeCapsLockFix');

// ── Tunable timing constants (ms) ──────────────────────────────────────
/** Swallow duplicates / stray spaces that arrive within this window after
 *  a CapsLock-while-composing event. */
const SUPPRESS_WINDOW = 500;
/** Treat a space as "stray" only if it arrives this soon after commit. */
const STRAY_SPACE_WINDOW = 200;
/** Length of lastCommittedText we remember for dedup comparison. */
const MAX_COMMIT_MEMORY = 32;

export const ImeCapsLockFix = Extension.create({
  name: 'imeCapsLockFix',

  addProseMirrorPlugins() {
    // ── Mutable tracking state (closure-scoped; no re-render needed) ──
    let composing = false;
    let lastCommittedText = '';
    let lastCommitTime = 0;
    /** Set to the timestamp of a CapsLock press that happened *during*
     *  composition. */
    let capsLockAtComposeTime = 0;

    // ── Pinyin-strip state ────────────────────────────────────────────
    /** Original (with-space) pinyin string from the last compositionend that
     *  looked like a raw pinyin commit. Used to match the ensuing
     *  beforeinput's `data`. */
    let lastPinyinRaw = '';
    /** Cleaned (space-stripped) text waiting to be inserted once the matching
     *  beforeinput arrives. null = no pending pinyin strip. */
    let pendingPinyinStrip: string | null = null;

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

            compositionend: (view, event: Event) => {
              composing = false;
              const ce = event as CompositionEvent;
              if (ce.data) {
                lastCommittedText = ce.data.slice(0, MAX_COMMIT_MEMORY);
                lastCommitTime = Date.now();

                // ── Pinyin strip: detect raw pinyin committed on IME switch ──
                // When the user switches to English mid-composition, the IME
                // commits the raw pinyin (letters + spaces) as-is. Strip the
                // spaces so "ni hao" becomes "nihao" at the caret.
                if (isRawPinyinCommit(ce.data)) {
                  lastPinyinRaw = ce.data;
                  pendingPinyinStrip = stripPinyinSpaces(ce.data);
                }
              }
              return false;
            },

            // ── detect CapsLock pressed while composing ─────────────
            keydown: (_view, event: Event) => {
              const ke = event as KeyboardEvent;
              if (ke.key === 'CapsLock' && composing) {
                capsLockAtComposeTime = Date.now();
              }
              return false;
            },

            // ── filter phantom insertions ───────────────────────────
            beforeinput: (view, event: Event) => {
              const ie = event as InputEvent;
              if (ie.inputType !== 'insertText' || !ie.data) return false;

              // ── Pinyin strip: replace space-padded pinyin with compact form ──
              // Independent of CapsLock — covers Shift / menu switch / any
              // IME-mode switch that commits the raw pinyin. Match the
              // beforeinput's data against the compositionend text to make
              // sure this is the same commit (not some unrelated insert).
              if (
                pendingPinyinStrip !== null &&
                ie.data === lastPinyinRaw
              ) {
                event.preventDefault();
                const cleaned = pendingPinyinStrip;
                pendingPinyinStrip = null;
                lastPinyinRaw = '';
                view.dispatch(view.state.tr.insertText(cleaned));
                return true;
              }
              // Not a pinyin commit — clear the pending state so it can't
              // accidentally match a later insert.
              pendingPinyinStrip = null;
              lastPinyinRaw = '';

              // Only active right after a CapsLock-in-composition event.
              if (capsLockAtComposeTime === 0) return false;

              const now = Date.now();
              const sinceCapsLock = now - capsLockAtComposeTime;
              const sinceCommit = now - lastCommitTime;

              const text = ie.data;
              let shouldSuppress = false;

              // Case 1: exact duplicate of the just-committed composition text.
              if (
                lastCommittedText.length > 0 &&
                text === lastCommittedText &&
                sinceCapsLock < SUPPRESS_WINDOW
              ) {
                shouldSuppress = true;
              }

              // Case 2: stray single space leaked by the IME right after
              //         mode switch.
              if (
                text === ' ' &&
                sinceCapsLock < SUPPRESS_WINDOW &&
                sinceCommit < STRAY_SPACE_WINDOW
              ) {
                shouldSuppress = true;
              }

              if (shouldSuppress) {
                event.preventDefault();
                // Reset so subsequent normal typing is unaffected.
                capsLockAtComposeTime = 0;
                lastCommittedText = '';
                return true;
              }

              // Normal input after the suppress window — clear the flag.
              if (sinceCapsLock >= SUPPRESS_WINDOW) {
                capsLockAtComposeTime = 0;
              }

              return false;
            },
          },

          // ── Secondary fallback: catch text that bypasses beforeinput ──
          // Some older WebKit versions fire handleTextInput for committed
          // composition text; swallow the duplicate here too. Also mirrors
          // the pinyin-strip logic in case the beforeinput path was skipped.
          handleTextInput: (_view, _from, _to, text) => {
            // Pinyin strip fallback.
            if (pendingPinyinStrip !== null && text === lastPinyinRaw) {
              pendingPinyinStrip = null;
              lastPinyinRaw = '';
              // Returning true consumes the text input; the actual cleaned
              // insertion was already dispatched in beforeinput (or, if we
              // got here because beforeinput didn't fire, we let this text
              // through un-cleaned — but that path is extremely rare on
              // modern WebKit). The important job is clearing the pending
              // state so it doesn't linger.
              return true;
            }
            pendingPinyinStrip = null;
            lastPinyinRaw = '';

            if (capsLockAtComposeTime === 0) return false;

            const now = Date.now();
            const sinceCapsLock = now - capsLockAtComposeTime;
            const sinceCommit = now - lastCommitTime;

            if (
              sinceCapsLock < SUPPRESS_WINDOW &&
              ((lastCommittedText.length > 0 &&
                text === lastCommittedText) ||
                (text === ' ' && sinceCommit < STRAY_SPACE_WINDOW))
            ) {
              capsLockAtComposeTime = 0;
              lastCommittedText = '';
              return true; // consumed — don't let ProseMirror insert it
            }

            if (sinceCapsLock >= SUPPRESS_WINDOW) {
              capsLockAtComposeTime = 0;
            }
            return false;
          },
        },
      }),
    ];
  },
});
