/**
 * LinkView — React NodeView for the web link block.
 *
 * Three visual states (mirrors FileView pattern):
 *   1. Placeholder (no URL): dashed-border input prompting the user to paste a URL.
 *   2. Card mode: compact bookmark card with favicon, title, description, and
 *      optional OG thumbnail.
 *   3. Preview mode: inline web page preview rendered in a sandboxed iframe.
 *      Page HTML is fetched via the Rust backend (fetch_link_page) which injects
 *      Chrome cookies to preserve the user's login state.
 *
 * Selection model:
 *   - When NOT selected, a transparent overlay sits above the iframe preview so
 *     the user can click to select the node.
 *   - When selected, the overlay disappears and a floating toolbar appears.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type NodeViewProps,
  NodeViewWrapper,
  type Editor,
} from '@tiptap/react';
import {
  Link2,
  Eye,
  PanelsTopLeft,
  Loader2,
  ExternalLink,
  RefreshCw,
  Globe,
} from 'lucide-react';

import { storage, type LinkMetadata } from '../lib/storage';
import { useNodeResize } from '../hooks/useNodeResize';
import { useNodeToolbarNav } from '../hooks/useNodeToolbarNav';
import { AlignLeftIcon, AlignCenterIcon } from './shared/icons';
import type { LinkNodeAttributes } from '../lib/linkExtension';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Check whether a string is a valid http(s) URL. */
function isValidUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Extract a readable hostname from a URL string. */
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
    displayMode,
    width,
    align,
  } = node.attrs as LinkNodeAttributes;

  const isPreviewMode = displayMode === 'preview';

  // Toolbar button count: align-left, align-center, toggle-mode, refresh, open-external
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

  // Preview page HTML (fetched on demand when in preview mode)
  const [pageHtml, setPageHtml] = useState<string | null>(null);
  const [pageBaseUrl, setPageBaseUrl] = useState('');
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  // Bump this to force a re-fetch of the preview page.
  const [refreshKey, setRefreshKey] = useState(0);

  // Track the current URL so we can reset pageHtml when it changes.
  const trackedUrlRef = useRef('');

  /* -------------------------------------------------------------- */
  /* URL submission (placeholder → card)                            */
  /* -------------------------------------------------------------- */

  const submitUrl = useCallback(
    async (rawUrl: string) => {
      const trimmed = rawUrl.trim();
      if (!trimmed) return;

      // Auto-prepend https:// if the user typed a bare domain.
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
        // Even if metadata fetch fails, still set the URL so the user sees something.
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
  /* Preview page fetch (on entering preview mode or URL change)    */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    if (!isPreviewMode || !url) {
      setPageHtml(null);
      return;
    }

    // Reset cached page when URL changes.
    if (trackedUrlRef.current !== url) {
      trackedUrlRef.current = url;
      setPageHtml(null);
    }

    if (pageHtml !== null) return; // Already loaded

    setPageLoading(true);
    setPageError(null);

    storage
      .fetchLinkPage(url)
      .then((resp) => {
        // Inject <base> so relative resources resolve against the original URL.
        const baseTag = `<base href="${resp.baseUrl}">`;
        let html = resp.html;
        // Insert <base> right after <head> or at the beginning of the document.
        if (/<head[^>]*>/i.test(html)) {
          html = html.replace(/<head[^>]*>/i, (match) => `${match}${baseTag}`);
        } else if (/<html[^>]*>/i.test(html)) {
          html = html.replace(
            /<html[^>]*>/i,
            (match) => `${match}<head>${baseTag}</head>`,
          );
        } else {
          html = `${baseTag}${html}`;
        }
        setPageHtml(html);
        setPageBaseUrl(resp.baseUrl);
      })
      .catch(() => {
        setPageError('Failed to load page preview');
      })
      .finally(() => {
        setPageLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreviewMode, url, pageHtml, refreshKey]);

  /* -------------------------------------------------------------- */
  /* Resize handle                                                   */
  /* -------------------------------------------------------------- */

  const figureRefInternal = useRef<HTMLDivElement>(null);

  const { ref: figureRef, displayWidth, onResizeStart } =
    useNodeResize<HTMLDivElement>({
      width,
      updateAttributes,
      minWidth: 240,
      fallbackWidth: 480,
      maxWidth: () => {
        const el = figureRefInternal.current;
        const editorSurface = el?.closest('.ProseMirror') as HTMLElement | null;
        return (editorSurface?.clientWidth ?? window.innerWidth) - 24;
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
    // Re-fetch both metadata and page HTML.
    if (url) {
      setRefreshKey((k) => k + 1);
      setPageHtml(null);
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
    }
  }, [url, updateAttributes]);

  const handleOpenExternal = useCallback(() => {
    if (!url) return;
    // Use the opener plugin to launch the URL in the system browser.
    import('@tauri-apps/plugin-opener').then(({ openUrl }) => {
      openUrl(url);
    });
  }, [url]);

  /* -------------------------------------------------------------- */
  /* Render                                                          */
  /* -------------------------------------------------------------- */

  // Display name for the card
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
                // Auto-submit on paste
                const pasted = e.clipboardData.getData('text');
                if (pasted) {
                  e.preventDefault();
                  submitUrl(pasted);
                }
              }}
              disabled={loading}
            />
            {loading && <Loader2 size={16} className="animate-spin ml-2" />}
            {error && (
              <span className="link-block-error">{error}</span>
            )}
          </div>
        ) : (
          /* Loaded state */
          <div
            ref={setFigureRef}
            className={`link-block-figure ${selected ? 'is-selected' : ''} ${
              isPreviewMode ? 'is-preview' : 'is-card'
            }`}
            style={figureStyle}
          >
            {/* Floating toolbar */}
            {selected && (
              <div className="link-block-toolbar" contentEditable={false}>
                <button
                  type="button"
                  ref={registerButton(0)}
                  className={`link-block-toolbar-btn ${
                    effectiveAlign === 'left' ? 'is-active' : ''
                  } ${activeIndex === 0 ? 'is-focused' : ''}`}
                  onClick={() => updateAttributes({ align: 'left' })}
                  title="Left align"
                >
                  <AlignLeftIcon />
                </button>
                <button
                  type="button"
                  ref={registerButton(1)}
                  className={`link-block-toolbar-btn ${
                    effectiveAlign === 'center' ? 'is-active' : ''
                  } ${activeIndex === 1 ? 'is-focused' : ''}`}
                  onClick={() => updateAttributes({ align: 'center' })}
                  title="Center align"
                >
                  <AlignCenterIcon />
                </button>
                <span className="link-block-toolbar-divider" />
                <button
                  type="button"
                  ref={registerButton(2)}
                  className={`link-block-toolbar-btn ${
                    activeIndex === 2 ? 'is-focused' : ''
                  }`}
                  onClick={() =>
                    updateAttributes({
                      displayMode: isPreviewMode ? 'card' : 'preview',
                    })
                  }
                  title={isPreviewMode ? 'Switch to card' : 'Switch to preview'}
                >
                  {isPreviewMode ? (
                    <PanelsTopLeft size={15} />
                  ) : (
                    <Eye size={15} />
                  )}
                </button>
                <button
                  type="button"
                  ref={registerButton(3)}
                  className={`link-block-toolbar-btn ${
                    activeIndex === 3 ? 'is-focused' : ''
                  }`}
                  onClick={handleRefresh}
                  title="Refresh"
                >
                  <RefreshCw size={15} />
                </button>
                <button
                  type="button"
                  ref={registerButton(4)}
                  className={`link-block-toolbar-btn ${
                    activeIndex === 4 ? 'is-focused' : ''
                  }`}
                  onClick={handleOpenExternal}
                  title="Open in browser"
                >
                  <ExternalLink size={15} />
                </button>
              </div>
            )}

            {/* Card mode */}
            {!isPreviewMode && (
              <div
                className="link-block-card"
                contentEditable={false}
                onClick={handleOpenExternal}
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
            )}

            {/* Preview mode */}
            {isPreviewMode && (
              <div className="link-block-preview" contentEditable={false}>
                {/* Transparent overlay when NOT selected */}
                {!selected && <div className="link-block-preview-overlay" />}

                {pageLoading && (
                  <div className="link-block-preview-loading">
                    <Loader2 size={20} className="animate-spin" />
                    <span>Loading preview…</span>
                  </div>
                )}

                {pageError && !pageLoading && (
                  <div className="link-block-preview-error">
                    <span>{pageError}</span>
                    <button
                      type="button"
                      className="link-block-preview-error-btn"
                      onClick={handleOpenExternal}
                    >
                      Open in browser
                    </button>
                  </div>
                )}

                {!pageLoading && !pageError && pageHtml !== null && (
                  <iframe
                    srcDoc={pageHtml}
                    className="link-block-preview-frame"
                    sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                    title={displayName}
                  />
                )}

                {/* Preview header bar (always visible in preview mode) */}
                <div className="link-block-preview-header" contentEditable={false}>
                  <a
                    href={url}
                    onClick={(e) => {
                      e.preventDefault();
                      handleOpenExternal();
                    }}
                    className="link-block-preview-header-link"
                  >
                    {favicon && (
                      <img
                        src={favicon}
                        alt=""
                        className="link-block-preview-header-favicon"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <span>{displayName}</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            )}

            {/* Resize handle */}
            {selected && (
              <div
                className="link-block-resize-handle"
                onPointerDown={onResizeStart}
                contentEditable={false}
              />
            )}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
