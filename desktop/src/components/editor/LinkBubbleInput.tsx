/**
 * LinkBubbleInput — the URL entry row shown inside FormatBubbleMenu when the
 * user is creating/editing an inline link.
 *
 * Rendered as a child of <BubbleMenu> so it is portaled into the menu
 * element: that keeps it inside the plugin's blur-relatedTarget guard (an
 * editor -> input focus handoff does not hide the bubble) and outside the
 * editor DOM (input keydowns never reach the capture-phase editor listener).
 *
 * Presentational: the parent (FormatBubbleMenu) owns validation and editor
 * mutations. Confirm/remove/cancel are reported via callbacks; `handledRef`
 * makes the subsequent programmatic blur (parent refocuses the editor) a
 * no-op instead of a second cancel.
 */

import { useCallback, useEffect, useRef } from "react";
import { Check, Link2Off, X } from "lucide-react";
import { useI18n } from "../../lib/core/i18n";

/**
 * The bubble element starts as `visibility:hidden` until the plugin's
 * computePosition resolves, so a single focus() on mount can silently fail.
 * Retry on animation frames for at most this many frames (~330ms).
 */
const LINK_INPUT_FOCUS_MAX_RETRIES = 20;

export type LinkInputMode = "range" | "insert";

interface LinkBubbleInputProps {
  mode: LinkInputMode;
  /** Existing href to prefill ('' when creating). */
  initialHref: string;
  /** Show the invalid-URL outline + tooltip (parent-validated). */
  invalid: boolean;
  onConfirm: (rawUrl: string) => void;
  onRemove: () => void;
  onCancel: () => void;
}

export default function LinkBubbleInput({
  mode,
  initialHref,
  invalid,
  onConfirm,
  onRemove,
  onCancel,
}: LinkBubbleInputProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  // Set by every deliberate exit path (confirm/remove/cancel) so the blur
  // caused by the parent refocusing the editor cannot re-enter onCancel.
  const handledRef = useRef(false);

  // Autofocus with rAF retries until the plugin makes the menu visible.
  useEffect(() => {
    let attempts = 0;
    let raf = 0;
    const tryFocus = () => {
      attempts += 1;
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      if (document.activeElement === input) return;
      if (attempts >= LINK_INPUT_FOCUS_MAX_RETRIES) return;
      raf = requestAnimationFrame(tryFocus);
    };
    raf = requestAnimationFrame(tryFocus);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Never intercept during IME composition: Enter confirms the
      // composition, Escape cancels it — neither may apply/close the input.
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter") {
        e.preventDefault();
        handledRef.current = true;
        onConfirm(e.currentTarget.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handledRef.current = true;
        onCancel();
      } else if (e.key === "Tab") {
        // The input row replaces the roving-focus buttons; Tab is a no-op.
        e.preventDefault();
      }
    },
    [onConfirm, onCancel],
  );

  const handleBlur = useCallback(() => {
    if (!handledRef.current) onCancel();
  }, [onCancel]);

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        defaultValue={initialHref}
        placeholder={t("bubble.linkPlaceholder")}
        spellCheck={false}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={`bubble-menu-link-input ${invalid ? "is-invalid" : ""}`}
        title={invalid ? t("bubble.linkInvalid") : undefined}
        aria-label={t("bubble.linkPlaceholder")}
        aria-invalid={invalid}
      />
      <button
        type="button"
        title={t("bubble.linkApply")}
        aria-label={t("bubble.linkApply")}
        onMouseDown={(e) => {
          e.preventDefault();
          handledRef.current = true;
        }}
        onClick={() => onConfirm(inputRef.current?.value ?? "")}
        className="editor-toolbar-btn bubble-menu-btn"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      {mode === "range" && initialHref !== "" && (
        <button
          type="button"
          title={t("bubble.linkRemove")}
          aria-label={t("bubble.linkRemove")}
          onMouseDown={(e) => {
            e.preventDefault();
            handledRef.current = true;
          }}
          onClick={onRemove}
          className="editor-toolbar-btn bubble-menu-btn"
        >
          <Link2Off className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        type="button"
        title="Esc"
        aria-label={t("bubble.linkCancel")}
        onMouseDown={(e) => {
          e.preventDefault();
          handledRef.current = true;
        }}
        onClick={onCancel}
        className="editor-toolbar-btn bubble-menu-btn"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </>
  );
}
