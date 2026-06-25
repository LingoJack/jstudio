# Fix: Terminal Chinese IME Shift+key requires long press

## Problem

When using Chinese IME (Pinyin, Wubi, etc.) on macOS, pressing `Shift + <any key>` requires a long press to toggle/switch, while English mode is very responsive.

## Root Cause

The `attachCustomKeyEventHandler` in `useTerminalManager.ts` (line ~203) does **not** check `event.isComposing` or `event.keyCode === 229`.

### xterm.js internal flow (confirmed from source code analysis):

1. `CoreBrowserTerminal._keyDown()` calls `_customKeyEventHandler(e)` first
2. If the custom handler returns `true`, xterm proceeds to call `_compositionHelper.keydown(e)`
3. When IME is composing and a non-modifier key arrives, `CompositionHelper.keydown()` calls `_finalizeComposition(false)` (commits raw composition text), then returns `true`
4. Back in `_keyDown()`, since the composition helper returned `true`, xterm calls `e.preventDefault()` and `e.stopPropagation()`
5. This prevents the IME from receiving the keydown event, breaking the Shift+key toggle mechanism

### Why the existing modifier-only fix is insufficient:

The current code already returns `false` for standalone Shift/Control/Alt/CapsLock keydown events. This handles the IME's Shift-only toggle. But when the user presses Shift **combined** with another key (e.g., Shift+2 for `@`), the `@` keydown event has `event.key === '@'`, which is NOT in `MODIFIER_ONLY_KEYS`, so the handler returns `true`, letting xterm process it — which then calls `preventDefault()`, interfering with the IME.

## Fix

Add an `isComposing` / `keyCode === 229` check at the **very beginning** of `attachCustomKeyEventHandler`, before all other logic:

```ts
term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
  // During IME composition (Chinese/Japanese/Korean input), let the
  // browser/IME handle everything. Returning false tells xterm to skip
  // ALL processing — including preventDefault() — so the IME receives
  // the complete key cycle. Without this, xterm's CompositionHelper
  // would finalize the current composition and then preventDefault()
  // the event, breaking the IME's Shift+key toggle mechanism on macOS.
  if (event.isComposing || event.keyCode === 229) return false;

  // Let modifier-only keys pass through for ALL event types ...
  if (MODIFIER_ONLY_KEYS.has(event.key)) return false;
  // ... rest unchanged
});
```

### Why this works:

- `event.isComposing` is `true` when the IME is actively processing input
- `keyCode === 229` is the legacy fallback for older browsers that don't support `isComposing`
- Returning `false` makes xterm skip ALL processing of the event (including `preventDefault()`)
- This lets the IME see the complete keydown → keyup cycle for Shift+key combinations
- This is the same approach used by VSCode's terminal and other web-based terminals

### What this does NOT break:

- **Paste (Cmd/Ctrl+V):** Paste only fires when NOT composing (IME is idle), so `isComposing` will be `false` — the paste handler still works
- **Modifier-only keys (Shift toggle):** The existing `MODIFIER_ONLY_KEYS` check still runs, but now AFTER the `isComposing` check. During composition, `isComposing` catches it first. When NOT composing (standalone Shift press to toggle IME), `MODIFIER_ONLY_KEYS` catches it. Both paths return `false`.
- **Normal typing without IME:** `isComposing` is `false` when no IME is active, so xterm processes everything normally

## File to change

- `src/components/terminal/useTerminalManager.ts` — lines ~203-206

## Verification

After applying the fix:
1. Switch to Chinese IME (Pinyin/Sougo/etc.)
2. Type Chinese characters — should work normally
3. Press Shift+2 (should type `@` immediately without long press)
4. Press Shift alone to toggle Chinese/English — should toggle immediately
5. Switch to English mode, type normally — should work as before
6. Cmd/Ctrl+V paste — should still work
