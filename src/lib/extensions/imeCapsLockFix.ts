/**
 * ImeCapsLockFix — suppress phantom characters emitted by Chinese IMEs when the
 * user presses CapsLock mid-composition to switch to direct (Latin) input.
 *
 * ┌─ Background ────────────────────────────────────────────────────────┐
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
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Strategy: track composition state + CapsLock-in-composition events, then
 * swallow duplicate / stray-space beforeinput events that arrive within a
 * short window after such a switch.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

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
          // composition text; swallow the duplicate here too.
          handleTextInput: (_view, _from, _to, text) => {
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
