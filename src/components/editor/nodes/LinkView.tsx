/**
 * LinkView - React NodeView for the web link block.
 *
 * Three visual states:
 *   1. Placeholder (no URL): card with URL input.
 *   2. Editing: inline form to change name + URL.
 *   3. Loaded card: favicon, title, description, thumbnail.
 *
 * Interaction model (consistent with ImageView / FileView / DiagramBlock):
 *   - Click card body -> ProseMirror NodeSelection (via useNodeSelectionClick).
 *   - Selected -> BlockToolbar floats at top-center (align, preview, refresh,
 *     browser, edit, delete) + resize handle.
 *   - Tab / Shift+Tab -> cycle toolbar buttons; Enter -> activate; Escape ->
 *     deselect. (useNodeToolbarNav)
 *   - Edit button -> enter editing mode (interactive); the form owns the
 *     keyboard; Escape exits back to selected.
 *
 * Critical WKWebView caret fix:
 *   ProseMirror registers its mousedown handler on `view.dom`, which is an
 *   ANCESTOR of this NodeView. React's synthetic onMouseDown is delegated at
 *   the React root - also above view.dom - so a React-level stopPropagation
 *   runs *after* ProseMirror has already handled the event and called
 *   preventDefault() (to make a NodeSelection on this atom node). That cancels
 *   the browser's native "drop the caret where you clicked" action, so clicking
 *   inside an input no longer moves the caret.
 *
 *   The fix is a NATIVE, bubble-phase listener on the figure element (which
 *   sits *below* view.dom): it fires before the event bubbles up to
 *   ProseMirror. For clicks on form controls / buttons we stopPropagation, so
 *   ProseMirror never sees the mousedown and never calls preventDefault - the
 *   browser then runs its default action and places the caret exactly where
 *   the user clicked.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import {
  Link2,
  Eye,
  Loader2,
  ExternalLink,
  RefreshCw,
  Globe,
  Pencil,
  Trash2,
  Check,
  X,
} from 'lucide-react';

import { ipc } from '../../../lib/core/ipc';
import type { LinkMetadata } from '../../../types/browser';
import { handleNativeSelectAll } from '../../../lib/shortcuts/nativeSelectAll';
import { useNodeResize } from '../hooks/useNodeResize';
import { useEditorWidth } from '../hooks/useEditorWidth';
import { useNodeToolbarNav } from '../hooks/useNodeToolbarNav';
import { useNodeSelected } from '../hooks/useNodeSelected';
import { useNodeSelectionClick } from '../hooks/useNodeSelectionClick';
import {
  BlockToolbar,
  AlignButtonGroup,
  BlockToolbarButton,
  BlockToolbarDivider,
} from '../../ui/BlockToolbar';
import { ResizeHandle } from '../../ui/ResizeHandle';
import type { LinkNodeAttributes } from '../../../lib/editor/extensions/linkExtension';
import { useCursorTrailHostRef } from '../CursorTrailContext';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function isValidUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Tags that should be shielded from ProseMirror's event interception. */
const SHIELD_TAGS = new Set(['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT']);

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function LinkView({
  node,
  editor,
  getPos,
  updateAttributes,
  deleteNode,
}: NodeViewProps) {
  const {
    url,
    title,
    description,
    favicon,
    ogImage,
    siteName,
    width,
    widthPct,
    align,
  } = node.attrs as LinkNodeAttributes;

  const effectiveAlign = (align ?? 'center') as 'left' | 'center';

  const [inputUrl, setInputUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const editTitleRef = useRef<HTMLInputElement>(null);
  const editUrlRef = useRef<HTMLInputElement>(null);
  const placeholderInputRef = useRef<HTMLInputElement>(null);
  const editTitleTrailRef = useCursorTrailHostRef(editTitleRef);
  const editUrlTrailRef = useCursorTrailHostRef(editUrlRef);
  const placeholderTrailRef = useCursorTrailHostRef(placeholderInputRef);

  /* -------------------------------------------------------------- */
  /* Selection + toolbar keyboard navigation                        */
  /* -------------------------------------------------------------- */

  const selected = useNodeSelected(editor, getPos);

  // Loaded card: align(2) + preview + refresh + browser + edit + delete = 7
  // Placeholder:  align(2) + delete = 3
  const toolbarBtnCount = url ? 7 : 3;

  const {
    activeIndex,
    registerButton,
    editing,
    enterEditing,
    exitEditing,
    interactiveRef,
  } = useNodeToolbarNav(selected, editor, toolbarBtnCount, true);

  const nav = { activeIndex, registerButton };

  const handleSelectMouseDown = useNodeSelectionClick(editor, getPos, {
    selected,
  });

  /* -------------------------------------------------------------- */
  /* Focus management                                                */
  /* -------------------------------------------------------------- */

  // Focus the title input when entering edit mode.
  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => editTitleRef.current?.focus());
    }
  }, [editing]);

  // Focus the placeholder input on mount.
  useEffect(() => {
    if (!url) {
      requestAnimationFrame(() => placeholderInputRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear error whenever we leave editing mode.
  useEffect(() => {
    if (!editing) {
      setError(null);
    }
  }, [editing]);

  /* -------------------------------------------------------------- */
  /* URL submission                                                 */
  /* -------------------------------------------------------------- */

  const submitUrl = useCallback(
    async (rawUrl: string) => {
      const trimmed = rawUrl.trim();
      if (!trimmed) return;

      let normalized = trimmed;
      if (!/^https?:\/\//i.test(trimmed)) {
        normalized = `https://${trimmed}`;
      }

      if (!isValidUrl(normalized)) {
        setError('Please enter a valid URL');
        return;
      }

      setError(null);
      setLoading(true);
      try {
        const meta: LinkMetadata = await ipc.fetchLinkMetadata(normalized);
        updateAttributes({
          url: meta.url || normalized,
          title: meta.title || hostnameFromUrl(normalized),
          description: meta.description,
          favicon: meta.faviconUrl,
          ogImage: meta.ogImage,
          siteName: meta.siteName,
        });
      } catch {
        updateAttributes({
          url: normalized,
          title: hostnameFromUrl(normalized),
          description: '',
          favicon: '',
          ogImage: '',
          siteName: '',
        });
      } finally {
        setLoading(false);
      }
    },
    [updateAttributes],
  );

  /* -------------------------------------------------------------- */
  /* Resize                                                          */
  /* -------------------------------------------------------------- */

  const editorWidth = useEditorWidth();

  useEffect(() => {
    if (width != null && widthPct == null && editorWidth > 0) {
      const pct = Math.min(100, Math.max(1, Math.round((width / editorWidth) * 100)));
      updateAttributes({ widthPct: pct, width: null });
    }
  }, [width, widthPct, editorWidth, updateAttributes]);

  const widthPx = widthPct != null ? Math.round((widthPct * editorWidth) / 100) : width;

  const figureRefInternal = useRef<HTMLDivElement>(null);

  const { ref: figureRef, displayWidth, onResizeStart } =
    useNodeResize<HTMLDivElement>({
      width: widthPx,
      updateAttributes,
      minWidth: 240,
      fallbackWidth: 480,
      maxWidth: () => {
        const el = figureRefInternal.current;
        const editorSurface = el?.closest('.ProseMirror') as HTMLElement | null;
        if (editorSurface) {
          const style = getComputedStyle(editorSurface);
          const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
          return editorSurface.clientWidth - padX - 24;
        }
        return window.innerWidth - 24;
      },
      onCommit: (finalWidth) => {
        const pct =
          editorWidth > 0
            ? Math.min(100, Math.max(1, Math.round((finalWidth / editorWidth) * 100)))
            : 50;
        return { widthPct: pct, width: null };
      },
    });

  /**
   * Combined ref: useNodeResize returns a RefObject (not a callback ref),
   * so we assign .current manually and also keep our internal ref synced.
   */
  const setFigureRef = useCallback(
    (el: HTMLDivElement | null) => {
      (figureRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      figureRefInternal.current = el;
    },
    [],
  );

  /** Merged ref for the editing figure: also feeds interactiveRef. */
  const setEditingFigureRef = useCallback(
    (el: HTMLDivElement | null) => {
      setFigureRef(el);
      interactiveRef(el);
    },
    [setFigureRef, interactiveRef],
  );

  /* -------------------------------------------------------------- */
  /* Caret shield (see file header)                                  */
  /* -------------------------------------------------------------- */

  /**
   * Native bubble-phase mousedown listener on the figure. Runs before the
   * event bubbles up to ProseMirror (on view.dom). When the click lands on a
   * form control, we stopPropagation so ProseMirror never preventDefault()s
   * it - letting the browser place the caret where the user clicked.
   */
  useEffect(() => {
    const el = figureRefInternal.current;
    if (!el) return;

    const shield = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (SHIELD_TAGS.has(target.tagName) || target.closest('input, textarea, select, button')) {
        e.stopPropagation();
      }
    };

    el.addEventListener('mousedown', shield);
    return () => el.removeEventListener('mousedown', shield);
    // Re-bind whenever the figure element is (re)created across states.
  }, [url, editing]);

  const figureStyle: React.CSSProperties = {};
  figureStyle.width = displayWidth ? `${displayWidth}px` : '480px';

  /* -------------------------------------------------------------- */
  /* Actions                                                         */
  /* -------------------------------------------------------------- */

  const handleRefresh = useCallback(() => {
    if (!url) return;
    setLoading(true);
    ipc
      .fetchLinkMetadata(url)
      .then((meta) => {
        updateAttributes({
          title: meta.title,
          description: meta.description,
          favicon: meta.faviconUrl,
          ogImage: meta.ogImage,
          siteName: meta.siteName,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [url, updateAttributes]);

  const handleOpenPreview = useCallback(() => {
    if (!url) return;
    ipc.openLinkPreviewWithTabs(url).catch(() => {});
  }, [url]);

  const handleOpenExternal = useCallback(() => {
    if (!url) return;
    import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(url));
  }, [url]);

  const handleStartEdit = useCallback(() => {
    setEditTitle(title || '');
    setEditUrl(url || '');
    enterEditing();
  }, [title, url, enterEditing]);

  const handleSaveEdit = useCallback(() => {
    const trimmedUrl = editUrl.trim();
    if (!trimmedUrl) return;

    let normalized = trimmedUrl;
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      normalized = `https://${trimmedUrl}`;
    }

    if (!isValidUrl(normalized)) {
      setError('Please enter a valid URL');
      return;
    }

    setError(null);

    const newTitle = editTitle.trim();

    if (normalized !== url) {
      // Optimistic update: write the new URL + title to the node IMMEDIATELY,
      // before kicking off the async metadata fetch. Otherwise the component
      // flips back to the loaded-card state (exitEditing() below) while
      // `url` is still the OLD value - any click / toolbar "open" action
      // taken during the fetch window would navigate to the previous URL.
      // Clearing the metadata fields here also avoids showing stale
      // favicon/description for the old page while the new one loads.
      updateAttributes({
        url: normalized,
        title: newTitle || hostnameFromUrl(normalized),
        description: '',
        favicon: '',
        ogImage: '',
        siteName: '',
      });

      setLoading(true);
      ipc
        .fetchLinkMetadata(normalized)
        .then((meta) => {
          // Refine with fetched metadata. meta.url may differ from normalized
          // (e.g. redirects), so we overwrite url too.
          updateAttributes({
            url: meta.url || normalized,
            title: newTitle || meta.title || hostnameFromUrl(normalized),
            description: meta.description,
            favicon: meta.faviconUrl,
            ogImage: meta.ogImage,
            siteName: meta.siteName,
          });
        })
        .catch(() => {
          // Keep the optimistic values already written above (url + title).
          // Nothing to do here except stop the spinner.
        })
        .finally(() => setLoading(false));
    } else {
      // URL unchanged - only update the title.
      updateAttributes({ title: newTitle });
    }

    exitEditing();
  }, [editUrl, editTitle, url, updateAttributes, exitEditing]);

  const handleCancelEdit = useCallback(() => {
    exitEditing();
  }, [exitEditing]);

  const handleDelete = useCallback(() => deleteNode(), [deleteNode]);

  /* -------------------------------------------------------------- */
  /* Render                                                          */
  /* -------------------------------------------------------------- */

  const displayName = title || hostnameFromUrl(url);
  const displayDesc = description || '';
  const hostname = hostnameFromUrl(url);

  /** Shared toolbar for loaded card - rendered inside figure when selected. */
  const toolbar = url && !editing && (
    <BlockToolbar selected={selected}>
      <AlignButtonGroup
        nav={nav}
        align={effectiveAlign}
        onAlignChange={(a) => updateAttributes({ align: a })}
      />
      <BlockToolbarDivider />
      <BlockToolbarButton
        index={2}
        nav={nav}
        title="Open preview window"
        onClick={handleOpenPreview}
      >
        <Eye size={15} />
      </BlockToolbarButton>
      <BlockToolbarButton
        index={3}
        nav={nav}
        title="Refresh metadata"
        onClick={handleRefresh}
      >
        <RefreshCw size={15} />
      </BlockToolbarButton>
      <BlockToolbarButton
        index={4}
        nav={nav}
        title="Open in browser"
        onClick={handleOpenExternal}
      >
        <ExternalLink size={15} />
      </BlockToolbarButton>
      <BlockToolbarDivider />
      <BlockToolbarButton
        index={5}
        nav={nav}
        title="Edit name and URL"
        onClick={handleStartEdit}
      >
        <Pencil size={15} />
      </BlockToolbarButton>
      <BlockToolbarButton
        index={6}
        nav={nav}
        title="Delete"
        onClick={handleDelete}
        className="block-toolbar-btn-danger"
      >
        <Trash2 size={15} />
      </BlockToolbarButton>
    </BlockToolbar>
  );

  /** Placeholder-only toolbar (align + delete). */
  const placeholderToolbar = !url && (
    <BlockToolbar selected={selected}>
      <AlignButtonGroup
        nav={nav}
        align={effectiveAlign}
        onAlignChange={(a) => updateAttributes({ align: a })}
      />
      <BlockToolbarDivider />
      <BlockToolbarButton
        index={2}
        nav={nav}
        title="Delete"
        onClick={handleDelete}
        className="block-toolbar-btn-danger"
      >
        <Trash2 size={15} />
      </BlockToolbarButton>
    </BlockToolbar>
  );

  return (
    <NodeViewWrapper className="link-block-wrapper" data-align={effectiveAlign} as="div">
      <div className="link-block-container">
        {/* ── Placeholder state (no URL) - card style with URL input ── */}
        {!url ? (
          <div
            ref={setFigureRef}
            className={`link-block-figure is-card is-placeholder ${selected ? 'is-selected' : ''}`}
            style={figureStyle}
            contentEditable={false}
            onMouseDown={handleSelectMouseDown}
          >
            {placeholderToolbar}

            <div className="link-block-card link-block-card-placeholder">
              <div className="link-block-card-left">
                <Link2 size={16} className="link-block-card-favicon-fallback" />
                <div className="link-block-card-info">
                  <input
                    ref={placeholderTrailRef}
                    type="url"
                    className="link-block-card-url-input"
                    placeholder="Paste a URL (e.g. https://github.com)"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    onKeyDown={(e) => {
                      // Stop propagation to prevent ProseMirror from handling keyboard events
                      e.stopPropagation();
                      if (handleNativeSelectAll(e)) return;
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        submitUrl(inputUrl);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        // Clear input text, or delete the block if already empty
                        if (inputUrl) {
                          setInputUrl('');
                        } else {
                          deleteNode();
                        }
                      }
                    }}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData('text');
                      if (pasted) {
                        e.preventDefault();
                        submitUrl(pasted);
                      }
                    }}
                    disabled={loading}
                  />
                  {loading && (
                    <span className="link-block-card-loading">
                      <Loader2 size={12} className="animate-spin" />
                      <span>Fetching link…</span>
                    </span>
                  )}
                  {error && <span className="link-block-card-error">{error}</span>}
                </div>
              </div>
            </div>

            {selected && <ResizeHandle onPointerDown={onResizeStart} />}
          </div>
        ) : editing ? (
          /* ── Inline edit form ── */
          <div
            ref={setEditingFigureRef}
            className="link-block-figure is-card is-editing"
            style={figureStyle}
            contentEditable={false}
          >
            <div
              className="link-block-edit-form"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="link-block-edit-row">
                <label className="link-block-edit-label">Name</label>
                <input
                  ref={editTitleTrailRef}
                  type="text"
                  className="link-block-edit-input"
                  value={editTitle}
                  placeholder={hostname}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (handleNativeSelectAll(e)) return;
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveEdit();
                    }
                  }}
                />
              </div>
              <div className="link-block-edit-row">
                <label className="link-block-edit-label">URL</label>
                <input
                  ref={editUrlTrailRef}
                  type="url"
                  className="link-block-edit-input"
                  value={editUrl}
                  placeholder="https://"
                  onChange={(e) => setEditUrl(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (handleNativeSelectAll(e)) return;
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveEdit();
                    }
                  }}
                />
              </div>
              {error && <span className="link-block-error">{error}</span>}
              <div className="link-block-edit-actions">
                <button
                  className="link-block-edit-btn link-block-edit-btn-primary"
                  onClick={handleSaveEdit}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  <span>Save</span>
                </button>
                <button className="link-block-edit-btn" onClick={handleCancelEdit}>
                  <X size={14} />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ── Loaded card state ── */
          <div
            ref={setFigureRef}
            className={`link-block-figure is-card ${selected ? 'is-selected' : ''}`}
            style={figureStyle}
            contentEditable={false}
            onMouseDown={handleSelectMouseDown}
          >
            {toolbar}

            <div className="link-block-card">
              <div className="link-block-card-left">
                {favicon ? (
                  <img
                    src={favicon}
                    alt=""
                    className="link-block-card-favicon"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <Globe size={16} className="link-block-card-favicon-fallback" />
                )}
                <div className="link-block-card-info">
                  <span className="link-block-card-title" title={displayName}>
                    {displayName}
                  </span>
                  {displayDesc && (
                    <span className="link-block-card-desc">
                      {displayDesc.length > 120
                        ? `${displayDesc.slice(0, 120)}…`
                        : displayDesc}
                    </span>
                  )}
                  <span className="link-block-card-url">
                    {siteName ? `${siteName} · ` : ''}
                    {hostname}
                  </span>
                </div>
              </div>
              {ogImage && (
                <div className="link-block-card-right">
                  <img
                    src={ogImage}
                    alt=""
                    className="link-block-card-thumbnail"
                    onError={(e) => {
                      (e.target as HTMLImageElement).parentElement!.style.display =
                        'none';
                    }}
                  />
                </div>
              )}
            </div>

            {selected && <ResizeHandle onPointerDown={onResizeStart} />}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
