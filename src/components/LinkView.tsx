/**
 * LinkView — React NodeView for the web link block.
 *
 * Two visual states:
 *   1. Placeholder (no URL): dashed-border input prompting the user to paste a URL.
 *   2. Card mode: compact bookmark card with favicon, title, description, and
 *      optional OG thumbnail.
 *
 * Preview opens in a **native WebviewWindow** (real browser engine) via
 * `storage.openLinkPreview(url)`. This preserves the user's Chrome login
 * state without iframe/CORS/proxy limitations.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type NodeViewProps,
  NodeViewWrapper,
  type Editor,
} from '@tiptap/react';
import {
  Link2,
  Eye,
  Loader2,
  ExternalLink,
  RefreshCw,
  Globe,
} from 'lucide-react';

import { storage, type LinkMetadata } from '../lib/storage';
import { useNodeResize } from '../hooks/useNodeResize';
import { useEditorWidth } from '../hooks/useEditorWidth';
import { useNodeToolbarNav } from '../hooks/useNodeToolbarNav';
import {
  BlockToolbar,
  AlignButtonGroup,
  BlockToolbarButton,
  BlockToolbarDivider,
} from './ui/BlockToolbar';
import { ResizeHandle } from './ui/ResizeHandle';
import type { LinkNodeAttributes } from '../lib/linkExtension';

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

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function LinkView({
  node,
  selected,
  updateAttributes,
  editor,
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

  // Toolbar buttons: align-left, align-center, preview-window, refresh, open-external
  const toolbarBtnCount = 5;
  const { activeIndex, registerButton } = useNodeToolbarNav(
    selected,
    (editor as Editor | null) ?? null,
    toolbarBtnCount,
  );

  const effectiveAlign = (align ?? 'center') as 'left' | 'center';

  const [inputUrl, setInputUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* -------------------------------------------------------------- */
  /* URL submission (placeholder → card)                            */
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
  /* Resize handle                                                   */
  /* -------------------------------------------------------------- */

  const editorWidth = useEditorWidth();

  // Lazy migration: if legacy pixel `width` exists but `widthPct` is null,
  // compute the percentage from the current editor width and persist it.
  useEffect(() => {
    if (width != null && widthPct == null && editorWidth > 0) {
      const pct = Math.min(100, Math.max(1, Math.round((width / editorWidth) * 100)));
      updateAttributes({ widthPct: pct, width: null });
    }
  }, [width, widthPct, editorWidth, updateAttributes]);

  // Compute the pixel width from widthPct (preferred) or fall back to legacy px.
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
        return (editorSurface?.clientWidth ?? window.innerWidth) - 24;
      },
      onCommit: (finalWidth) => {
        const pct =
          editorWidth > 0
            ? Math.min(100, Math.max(1, Math.round((finalWidth / editorWidth) * 100)))
            : 50;
        return { widthPct: pct, width: null };
      },
    });

  const setFigureRef = useCallback((el: HTMLDivElement | null) => {
    figureRef.current = el;
    figureRefInternal.current = el;
  }, []);

  const figureStyle: React.CSSProperties = {};
  if (displayWidth) {
    figureStyle.width = `${displayWidth}px`;
  } else {
    figureStyle.width = '480px';
  }

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
    import('@tauri-apps/plugin-opener').then(({ openUrl }) => {
      openUrl(url);
    });
  }, [url]);

  /* -------------------------------------------------------------- */
  /* Render                                                          */
  /* -------------------------------------------------------------- */

  const displayName = title || hostnameFromUrl(url);
  const displayDesc = description || '';
  const hostname = hostnameFromUrl(url);

  return (
    <NodeViewWrapper
      className="link-block-wrapper"
      data-align={effectiveAlign}
      as="div"
    >
      <div className="link-block-container">
        {/* Placeholder state */}
        {!url ? (
          <div
            className={`link-block-placeholder ${error ? 'has-error' : ''}`}
            contentEditable={false}
          >
            <Link2 size={20} className="link-block-placeholder-icon" />
            <input
              type="url"
              className="link-block-input"
              placeholder="Paste a URL (e.g. https://github.com)"
              value={inputUrl}
              autoFocus
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitUrl(inputUrl);
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
            {loading && <Loader2 size={16} className="animate-spin ml-2" />}
            {error && <span className="link-block-error">{error}</span>}
          </div>
        ) : (
          /* Loaded state — always card mode */
          <div
            ref={setFigureRef}
            className={`link-block-figure ${selected ? 'is-selected' : ''} is-card`}
            style={figureStyle}
          >
            {/* Floating toolbar */}
            <BlockToolbar selected={selected}>
              <AlignButtonGroup
                nav={{ activeIndex, registerButton }}
                align={effectiveAlign}
                onAlignChange={(a) => updateAttributes({ align: a })}
              />
              <BlockToolbarDivider />
              <BlockToolbarButton
                nav={{ activeIndex, registerButton }}
                index={2}
                title="Open preview window"
                onClick={handleOpenPreview}
              >
                <Eye size={15} />
              </BlockToolbarButton>
              <BlockToolbarButton
                nav={{ activeIndex, registerButton }}
                index={3}
                title="Refresh"
                onClick={handleRefresh}
              >
                <RefreshCw size={15} />
              </BlockToolbarButton>
              <BlockToolbarButton
                nav={{ activeIndex, registerButton }}
                index={4}
                title="Open in browser"
                onClick={handleOpenExternal}
              >
                <ExternalLink size={15} />
              </BlockToolbarButton>
            </BlockToolbar>

            {/* Card — Cmd/Ctrl+Click opens preview, plain click selects the block */}
            <div
              className="link-block-card"
              contentEditable={false}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleOpenPreview();
                }
                // Plain click: do nothing — let ProseMirror select the node.
              }}
              onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleOpenPreview();
              }}
              title="Cmd+Click to open preview · Double-click to open"
              role="link"
              tabIndex={0}
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

            {/* Resize handle */}
            {selected && <ResizeHandle onPointerDown={onResizeStart} />}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
