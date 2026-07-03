/**
 * LinkView — React NodeView for the web link block.
 *
 * Three visual states:
 *   1. Placeholder (no URL): card with URL input.
 *   2. Editing: inline form to change name + URL.
 *   3. Loaded card: favicon, title, description, thumbnail.
 *
 * Interaction model:
 *   - Hover → toolbar floats at top-right (preview, refresh, browser, edit, delete).
 *   - Click card body → local "selected" state (blue border).
 *   - Click input → focus input for typing.
 *
 * Critical WKWebView caret fix:
 *   ProseMirror registers its mousedown handler on `view.dom`, which is an
 *   ANCESTOR of this NodeView. React's synthetic onMouseDown is delegated at
 *   the React root — also above view.dom — so a React-level stopPropagation
 *   runs *after* ProseMirror has already handled the event and called
 *   preventDefault() (to make a NodeSelection on this atom node). That cancels
 *   the browser's native "drop the caret where you clicked" action, so clicking
 *   inside an input no longer moves the caret.
 *
 *   The fix is a NATIVE, bubble-phase listener on the figure element (which
 *   sits *below* view.dom): it fires before the event bubbles up to
 *   ProseMirror. For clicks on form controls / buttons we stopPropagation, so
 *   ProseMirror never sees the mousedown and never calls preventDefault — the
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

import { storage, type LinkMetadata } from '../../../lib/storage';
import { useNodeResize } from '../hooks/useNodeResize';
import { useEditorWidth } from '../hooks/useEditorWidth';
import { ResizeHandle } from '../../ui/ResizeHandle';
import type { LinkNodeAttributes } from '../../../lib/extensions/linkExtension';

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

  const [hovered, setHovered] = useState(false);
  const [isSelected, setIsSelected] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const editTitleRef = useRef<HTMLInputElement>(null);
  const placeholderInputRef = useRef<HTMLInputElement>(null);

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

  /* -------------------------------------------------------------- */
  /* Deselect when clicking outside                                 */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    if (!isSelected) return;
    const handleDown = () => setIsSelected(false);
    document.addEventListener('mousedown', handleDown, true);
    return () => document.removeEventListener('mousedown', handleDown, true);
  }, [isSelected]);

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
        const meta: LinkMetadata = await storage.fetchLinkMetadata(normalized);
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

  /* -------------------------------------------------------------- */
  /* Caret shield (see file header)                                  */
  /* -------------------------------------------------------------- */

  /**
   * Native bubble-phase mousedown listener on the figure. Runs before the
   * event bubbles up to ProseMirror (on view.dom). When the click lands on a
   * form control, we stopPropagation so ProseMirror never preventDefault()s
   * it — letting the browser place the caret where the user clicked.
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
    storage
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
    storage.openLinkPreview(url).catch(() => {});
  }, [url]);

  const handleOpenExternal = useCallback(() => {
    if (!url) return;
    import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(url));
  }, [url]);

  const handleStartEdit = useCallback(() => {
    setEditTitle(title || '');
    setEditUrl(url || '');
    setEditing(true);
  }, [title, url]);

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

    if (normalized !== url) {
      setLoading(true);
      storage
        .fetchLinkMetadata(normalized)
        .then((meta) => {
          updateAttributes({
            url: meta.url || normalized,
            title: editTitle.trim() || meta.title || hostnameFromUrl(normalized),
            description: meta.description,
            favicon: meta.faviconUrl,
            ogImage: meta.ogImage,
            siteName: meta.siteName,
          });
        })
        .catch(() => {
          updateAttributes({
            url: normalized,
            title: editTitle.trim() || hostnameFromUrl(normalized),
            description: '',
            favicon: '',
            ogImage: '',
            siteName: '',
          });
        })
        .finally(() => setLoading(false));
    } else {
      updateAttributes({ title: editTitle.trim() });
    }

    setEditing(false);
  }, [editUrl, editTitle, url, updateAttributes]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const handleDelete = useCallback(() => deleteNode(), [deleteNode]);

  /* -------------------------------------------------------------- */
  /* Click card body → select                                        */
  /* -------------------------------------------------------------- */

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Don't toggle selection when clicking form controls.
    if (SHIELD_TAGS.has(target.tagName) || target.closest('button')) return;
    e.stopPropagation();
    setIsSelected((prev) => !prev);
  }, []);

  /* -------------------------------------------------------------- */
  /* Render                                                          */
  /* -------------------------------------------------------------- */

  const showToolbar = hovered || isSelected;
  const activeClass = showToolbar ? 'is-active' : '';
  const displayName = title || hostnameFromUrl(url);
  const displayDesc = description || '';
  const hostname = hostnameFromUrl(url);

  /** Shared toolbar — rendered inside figure when showToolbar is true. */
  const toolbar = url && !editing && (
    <div className="link-block-hover-toolbar" contentEditable={false}>
      <button className="link-block-hover-btn" title="Open preview window" onClick={handleOpenPreview}>
        <Eye size={15} />
      </button>
      <button className="link-block-hover-btn" title="Refresh metadata" onClick={handleRefresh}>
        <RefreshCw size={15} />
      </button>
      <button className="link-block-hover-btn" title="Open in browser" onClick={handleOpenExternal}>
        <ExternalLink size={15} />
      </button>
      <div className="link-block-hover-divider" />
      <button className="link-block-hover-btn" title="Edit name and URL" onClick={handleStartEdit}>
        <Pencil size={15} />
      </button>
      <button
        className="link-block-hover-btn link-block-hover-btn-danger"
        title="Delete"
        onClick={handleDelete}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );

  /** Placeholder-only toolbar (just delete). */
  const placeholderToolbar = (
    <div className="link-block-hover-toolbar" contentEditable={false}>
      <button
        className="link-block-hover-btn link-block-hover-btn-danger"
        title="Delete"
        onClick={handleDelete}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );

  return (
    <NodeViewWrapper className="link-block-wrapper" data-align={effectiveAlign} as="div">
      <div className="link-block-container">
        {/* ── Placeholder state (no URL) — card style with URL input ── */}
        {!url ? (
          <div
            ref={setFigureRef}
            className={`link-block-figure is-card is-placeholder ${activeClass}`}
            style={figureStyle}
            contentEditable={false}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            {showToolbar && placeholderToolbar}

            <div
              className="link-block-card link-block-card-placeholder"
              onClick={handleCardClick}
            >
              <div className="link-block-card-left">
                <Link2 size={16} className="link-block-card-favicon-fallback" />
                <div className="link-block-card-info">
                  <input
                    ref={placeholderInputRef}
                    type="url"
                    className="link-block-card-url-input"
                    placeholder="Paste a URL (e.g. https://github.com)"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    onKeyDown={(e) => {
                      // Stop propagation to prevent ProseMirror from handling keyboard events
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        submitUrl(inputUrl);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        // Cancel and clear
                        setInputUrl('');
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

            <ResizeHandle onPointerDown={onResizeStart} />
          </div>
        ) : editing ? (
          /* ── Inline edit form ── */
          <div
            ref={setFigureRef}
            className="link-block-figure is-card is-editing"
            style={figureStyle}
            contentEditable={false}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <div
              className="link-block-edit-form"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="link-block-edit-row">
                <label className="link-block-edit-label">Name</label>
                <input
                  ref={editTitleRef}
                  type="text"
                  className="link-block-edit-input"
                  value={editTitle}
                  placeholder={hostname}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveEdit();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      handleCancelEdit();
                    }
                  }}
                />
              </div>
              <div className="link-block-edit-row">
                <label className="link-block-edit-label">URL</label>
                <input
                  type="url"
                  className="link-block-edit-input"
                  value={editUrl}
                  placeholder="https://"
                  onChange={(e) => setEditUrl(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveEdit();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      handleCancelEdit();
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
            className={`link-block-figure is-card ${activeClass}`}
            style={figureStyle}
            contentEditable={false}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            {showToolbar && toolbar}

            <div
              className="link-block-card"
              onClick={handleCardClick}
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleOpenPreview();
              }}
              title="Click to select · Double-click to open preview"
            >
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

            <ResizeHandle onPointerDown={onResizeStart} />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}