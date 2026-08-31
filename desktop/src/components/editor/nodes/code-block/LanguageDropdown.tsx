/**
 * LanguageDropdown - self-contained language selector for CodeBlockView.
 *
 * Renders the language badge (trigger) and a portal-based dropdown panel
 * with search, keyboard navigation, and click-outside-to-close.
 *
 * All internal state (open, search, highlight, position) and refs
 * (dropdown, search input, list, saved selection) are fully encapsulated.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import type { Node as PmNode } from "@tiptap/pm/model";
import { ChevronDown, Search } from "lucide-react";
import { LANGUAGES, getLanguageLabel } from "./codeBlockLanguages";
import { handleNativeSelectAll } from "../../../../lib/shortcuts/nativeSelectAll";
import type { TranslationKey } from "../../../../lib/core/i18n";

interface LanguageDropdownProps {
  language: string;
  onSelect: (language: string) => void;
  editor: Editor;
  getPos: (() => number | undefined) | undefined;
  node: PmNode;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

export function LanguageDropdown({
  language,
  onSelect,
  editor,
  getPos,
  node,
  t,
}: LanguageDropdownProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    right: 0,
  });
  const badgeRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const savedSelectionRef = useRef<number | null>(null);

  const selectLanguage = useCallback(
    (value: string) => {
      onSelect(value);
      setDropdownOpen(false);
      setSearchQuery("");
      setHighlightedIndex(0);

      // Restore editor focus after the dropdown closes. Use a microtask
      // so React has time to unmount the search input first.
      const savedPos = savedSelectionRef.current;
      queueMicrotask(() => {
        editor.commands.focus();
        if (savedPos != null) {
          // Place cursor at the saved position (clamped to the code block).
          try {
            const codeBlockPos = typeof getPos === "function" ? getPos() : null;
            if (codeBlockPos != null) {
              const nodeStart = codeBlockPos + 1; // +1 to enter the node
              const nodeEnd = nodeStart + node.content.size;
              const clamped = Math.max(nodeStart, Math.min(savedPos, nodeEnd));
              editor.commands.setTextSelection(clamped);
            }
          } catch {
            // best-effort; focus alone is sufficient fallback
          }
        }
      });
    },
    [onSelect, editor, getPos, node],
  );

  // Close dropdown on outside click / Escape
  useEffect(() => {
    if (!dropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        badgeRef.current &&
        !badgeRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
        setSearchQuery("");
        setHighlightedIndex(0);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDropdownOpen(false);
        setSearchQuery("");
        setHighlightedIndex(0);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    // Focus search input when opened
    requestAnimationFrame(() => searchInputRef.current?.focus());

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dropdownOpen]);

  const toggleDropdown = useCallback(() => {
    setDropdownOpen((prev) => {
      if (!prev) {
        // Opening - save current editor selection so we can restore it later
        savedSelectionRef.current = editor.state.selection.from;
        // Calculate position for portal rendering
        if (badgeRef.current) {
          const badgeRect = badgeRef.current.getBoundingClientRect();
          setDropdownPosition({
            top: badgeRect.bottom + 8,
            right: window.innerWidth - badgeRect.right,
          });
        }
      }
      return !prev;
    });
  }, [editor]);

  const filteredLanguages = searchQuery
    ? LANGUAGES.filter(({ label, value }) => {
        const q = searchQuery.toLowerCase();
        return (
          label.toLowerCase().includes(q) || value.toLowerCase().includes(q)
        );
      })
    : LANGUAGES;

  // Reset highlight when the filtered list changes
  useEffect(() => {
    if (!dropdownOpen) return;
    const currentIdx = filteredLanguages.findIndex((l) => l.value === language);
    setHighlightedIndex(currentIdx >= 0 ? currentIdx : 0);
  }, [searchQuery, dropdownOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll highlighted item into view
  useEffect(() => {
    if (!dropdownOpen) return;
    const list = listRef.current;
    if (!list) return;
    const item = list.children[highlightedIndex] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, dropdownOpen]);

  return (
    <>
      <div
        ref={badgeRef}
        className="code-lang-badge"
        onClick={toggleDropdown}
        role="button"
        tabIndex={0}
      >
        <span className="code-lang-label">
          {getLanguageLabel(language)}
        </span>
        <ChevronDown size={12} className="code-lang-chevron" />
      </div>

      {/* Custom dropdown panel - rendered via Portal to escape ProseMirror's event handling */}
      {dropdownOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="code-lang-dropdown code-lang-dropdown-portal"
            style={{
              position: "fixed",
              top: dropdownPosition.top,
              right: dropdownPosition.right,
            }}
          >
            <div className="code-lang-search">
              <Search size={13} className="code-lang-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (handleNativeSelectAll(e)) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    if (filteredLanguages.length === 0) return;
                    setHighlightedIndex((prev) =>
                      prev >= filteredLanguages.length - 1 ? 0 : prev + 1,
                    );
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    if (filteredLanguages.length === 0) return;
                    setHighlightedIndex((prev) =>
                      prev <= 0 ? filteredLanguages.length - 1 : prev - 1,
                    );
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const item =
                      filteredLanguages[highlightedIndex] ??
                      filteredLanguages[0];
                    if (item) selectLanguage(item.value);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setDropdownOpen(false);
                    setSearchQuery("");
                    setHighlightedIndex(0);
                  }
                }}
                placeholder={t("code.searchLang")}
                className="code-lang-search-input"
              />
            </div>
            <div ref={listRef} className="code-lang-list">
              {filteredLanguages.length === 0 ? (
                <div className="code-lang-empty">{t("code.noLangMatch")}</div>
              ) : (
                filteredLanguages.map(({ value, label }, index) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => selectLanguage(value)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`code-lang-option ${value === language ? "is-active" : ""} ${index === highlightedIndex ? "is-highlighted" : ""}`}
                  >
                    {label}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
