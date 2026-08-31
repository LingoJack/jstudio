# Plan: Add `/Link` Block Type

## Overview

Add a new `link` block type to JStudio's Tiptap-based block editor. The block supports two display modes (mirroring the existing `/File` block pattern):

1. **Preview (embed) mode** — Inline web page preview rendered in a sandboxed iframe, with the page HTML fetched through a Rust-side proxy that injects Chrome cookies to preserve the user's login state.
2. **Card mode** — Compact bookmark card showing title, description, favicon, and OG thumbnail (no page preview).

The "login state from Chrome" requirement is handled entirely on the Rust side: Chrome's cookie database is read and decrypted (macOS Keychain + AES-128-CBC), then used as `Cookie` headers when fetching link metadata and page HTML.

---

## Architecture (follows existing `/File` block 7-step pattern)

```
src/
├── types/document.ts          ← Add 'link' to BlockType + properties
├── lib/
│   ├── linkExtension.ts       ← NEW: Tiptap Node definition (mirror fileExtension.ts)
│   ├── tiptapAdapter.ts       ← Add 'link' ↔ 'linkBlock' mapping cases
│   ├── tiptapExtensions.tsx   ← Add /link slash command
│   └── storage.ts             ← Add fetchLinkMeta / fetchLinkPage wrappers
├── components/
│   ├── LinkView.tsx           ← NEW: React NodeView (mirror FileView.tsx)
│   └── BlockEditor.tsx        ← Register LinkExtension
├── styles/vscode-theme.css    ← Add link-block-* CSS classes
└── hooks/
    ├── useNodeResize.ts       ← (reuse, no change)
    └── useNodeToolbarNav.ts   ← (reuse, no change)

src-tauri/
├── Cargo.toml                 ← Add deps: reqwest, rusqlite, aes, cbc, sha1, pbkdf2, hmac
├── src/lib.rs                 ← Register new commands in generate_handler!
└── src/commands/
    ├── mod.rs                 ← Add `pub mod link;`
    └── link.rs                ← NEW: Chrome cookie decryption + HTTP fetch
```

---

## Step-by-step Implementation

### Step 1: Rust Backend — `src-tauri/src/commands/link.rs` (NEW)

This is the most complex part. It handles Chrome cookie extraction and HTTP fetching.

#### 1a. Chrome Cookie Decryption (macOS)

**Cookie DB location:** `~/Library/Application Support/Google/Chrome/Default/Cookies`

**Decryption chain:**
1. Retrieve the Chrome Safe Storage password from macOS Keychain:
   - Shell command: `security find-generic-password -ga Chrome -s "Chrome Safe Storage"`
   - This returns a hex-encoded password string
2. Derive the AES key using PBKDF2:
   - Algorithm: PBKDF2-HMAC-SHA1
   - Password: the Keychain password (UTF-8)
   - Salt: `b'saltysalt'`
   - Iterations: 1003
   - Key length: 16 bytes (AES-128)
3. For each cookie value in the DB:
   - First 3 bytes = version prefix (`v10` or `v11`)
   - Strip prefix → remaining bytes are ciphertext
   - IV: 16 bytes of `0x20` (space character)
   - Decrypt with AES-128-CBC
   - Strip PKCS7 padding

**Key function:** `fn read_chrome_cookies(url: &str) -> Result<Vec<(String, String)>, String>`
- Parse the URL to get the domain
- Open the Chrome Cookies SQLite DB (read-only)
- Query: `SELECT name, encrypted_value, host_key, path, expires_utc FROM cookies WHERE host_key LIKE ?`
- Decrypt each cookie value
- Return as `Vec<(name, value)>` pairs

#### 1b. HTTP Commands

**Command 1: `fetch_link_metadata`**
```rust
#[derive(Serialize)]
struct LinkMetadata {
    title: String,
    description: String,
    favicon_url: String,
    og_image: String,
    site_name: String,
    url: String,  // final URL after redirects
}

#[tauri::command]
pub async fn fetch_link_metadata(url: String) -> Result<LinkMetadata, String>
```
- Reads Chrome cookies for the URL's domain
- Makes an HTTP GET request with `Cookie` header injected
- Parses the HTML response for `<title>`, `<meta name="description">`, `<meta property="og:*">`, `<link rel="icon">`
- Returns structured metadata

**Command 2: `fetch_link_page`**
```rust
#[tauri::command]
pub async fn fetch_link_page(url: String) -> Result<LinkPageResponse, String>

#[derive(Serialize)]
struct LinkPageResponse {
    html: String,       // full HTML body
    base_url: String,   // final URL for resolving relative links
    content_type: String,
}
```
- Reads Chrome cookies
- Fetches the full page HTML with cookies
- Returns the HTML for the frontend to render in an iframe via `srcdoc`

**Graceful degradation:** If Chrome is not installed or cookie reading fails, the commands fall back to making requests without cookies (still works for public pages).

#### 1c. Register Dependencies & Commands

**Cargo.toml additions:**
```toml
reqwest = { version = "0.12", features = ["blocking"] }
rusqlite = { version = "0.31", features = ["bundled"] }
aes = "0.8"
cbc = "0.1"
pbkdf2 = { version = "0.12", features = ["simple"] }
hmac = "0.12"
sha1 = "0.10"
```

**`src/commands/mod.rs`:** Add `pub mod link;`

**`src/lib.rs`:** Add to `generate_handler![]`:
```rust
commands::link::fetch_link_metadata,
commands::link::fetch_link_page,
```

---

### Step 2: Types — `src/types/document.ts`

Add `'link'` to the `BlockType` union:
```typescript
export type BlockType =
  | 'text' | 'heading-1' | 'heading-2' | 'heading-3'
  | 'quote' | 'code' | 'image' | 'file'
  | 'table' | 'bullet-list' | 'ordered-list'
  | 'divider' | 'collapsible'
  | 'link';  // ← NEW
```

Add link properties to `BlockProperties`:
```typescript
/** Link block — URL embed or bookmark card */
linkUrl?: string;
linkTitle?: string;
linkDescription?: string;
linkFavicon?: string;
linkOgImage?: string;
linkSiteName?: string;
linkDisplayMode?: 'card' | 'preview';
linkWidth?: number | null;
linkAlign?: 'left' | 'center' | null;
```

---

### Step 3: Tiptap Extension — `src/lib/linkExtension.ts` (NEW)

Mirror the structure of `fileExtension.ts`:

```typescript
export interface LinkNodeAttributes {
  url: string;
  title: string;
  description: string;
  favicon: string;
  ogImage: string;
  siteName: string;
  displayMode: 'card' | 'preview';
  width: number | null;
  align: 'left' | 'center';
}

export const LinkExtension = Node.create({
  name: 'linkBlock',
  group: 'block',
  atom: true,
  draggable: false,
  addAttributes() { /* url, title, description, favicon, ogImage, siteName, displayMode, width, align */ },
  parseHTML() { return [{ tag: 'div[data-type="link-block"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { 'data-type': 'link-block', ...HTMLAttributes }]; },
  addCommands() {
    return {
      setLink: (attrs) => ({ commands }) => commands.insertContent([
        { type: 'linkBlock', attrs: { url:'', ...defaults, ...attrs } },
        { type: 'paragraph' },
      ]),
    };
  },
  addNodeView() { return ReactNodeViewRenderer(LinkView); },
});
```

Type augmentation for `Commands<ReturnType>` interface (same as fileExtension).

---

### Step 4: React NodeView — `src/components/LinkView.tsx` (NEW)

Mirror the structure of `FileView.tsx`. Three states:

#### State 1: Placeholder (no URL)
- Dashed-border input field with placeholder "Paste a URL..."
- On paste/Enter: call `fetch_link_metadata` → populate attrs → switch to card mode
- Link icon + helper text

#### State 2: Card Mode
Layout (reuses `.file-block-card` pattern):
```
┌──────────────────────────────────────────────┐
│  [Favicon]  Title (clickable)                │
│             description text...              │
│             site-name · url-path             │
│  [OG Thumbnail image if available]           │
└──────────────────────────────────────────────┘
```
- Click anywhere → open in system browser via `tauri-plugin-opener`
- When the block is selected, a floating toolbar appears (same as FileView)

#### State 3: Preview (Embed) Mode
Layout:
```
┌──────────────────────────────────────────────┐
│  [Loading spinner while fetching page HTML]  │
│  ┌────────────────────────────────────────┐  │
│  │                                        │  │
│  │  <iframe srcdoc={html}>                │  │
│  │  (sandboxed, scrolling)                │  │
│  │                                        │  │
│  └────────────────────────────────────────┘  │
│  [Selection overlay — same as FileView]      │
└──────────────────────────────────────────────┘
```
- On entering preview mode: call `fetch_link_page` to get HTML with Chrome cookies
- Render in `<iframe sandbox="allow-same-origin allow-scripts" srcdoc={html}>` with `<base href={baseUrl}>` prepended to resolve relative resources
- Same selection overlay pattern as FileView (transparent div over iframe when not selected)
- If fetch fails, show error state with "Open in Browser" fallback

#### Floating Toolbar (visible when selected)
Same visual style as FileView toolbar:
- `Align Left` / `Align Center` toggle
- `Preview` / `Card` toggle
- `Refresh` (re-fetch metadata + page)
- `Open External` (open URL in system browser)
- Resize handle (bottom-right, shared `useNodeResize` hook)

#### Key behaviors
- Reuse `useNodeResize` for width control
- Reuse `useNodeToolbarNav` for Tab/Enter/Esc keyboard navigation
- Debounce metadata fetch to avoid spamming on rapid edits
- URL validation before fetch (must start with `http://` or `https://`)

---

### Step 5: Adapter — `src/lib/tiptapAdapter.ts`

Add two switch cases:

**`ourBlockToTiptapJSON` — case `'link'`:**
```typescript
case 'link': {
  const props = block.properties ?? {};
  return {
    type: 'linkBlock',
    attrs: {
      url: block.content?.toString() ?? props.linkUrl ?? '',
      title: props.linkTitle ?? '',
      description: props.linkDescription ?? '',
      favicon: props.linkFavicon ?? '',
      ogImage: props.linkOgImage ?? '',
      siteName: props.linkSiteName ?? '',
      displayMode: props.linkDisplayMode ?? 'card',
      width: props.linkWidth ?? null,
      align: props.linkAlign ?? 'center',
    },
  };
}
```

**`tiptapJSONToOurBlock` — case `'linkBlock'`:**
```typescript
case 'linkBlock': {
  const a = node.attrs ?? {};
  const props: BlockProperties = {};
  if (a.title) props.linkTitle = a.title;
  if (a.description) props.linkDescription = a.description;
  if (a.favicon) props.linkFavicon = a.favicon;
  if (a.ogImage) props.linkOgImage = a.ogImage;
  if (a.siteName) props.linkSiteName = a.siteName;
  props.linkDisplayMode = a.displayMode === 'preview' ? 'preview' : 'card';
  if (a.width) props.linkWidth = a.width;
  if (a.align) props.linkAlign = a.align;
  return {
    id: blockId,
    type: 'link',
    content: a.url ?? '',
    properties: props,
  };
}
```

---

### Step 6: Slash Command — `src/lib/tiptapExtensions.tsx`

Add to the `slashCommands` array (after the File entry):
```typescript
{
  title: 'Link',
  description: 'Embed a web link with preview',
  icon: '🔗',  // or 'URL'
  aliases: ['link', 'url', 'bookmark', 'web', '链接', '网页'],
  command: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).setLink().run();
  },
},
```

---

### Step 7: Register Extension — `src/components/BlockEditor.tsx`

Add `LinkExtension` to the `extensions` array in `useEditor()`:
```typescript
import { LinkExtension } from '../lib/linkExtension';
// ...
extensions: [
  // ... existing extensions
  FileExtension,
  LinkExtension,  // ← NEW
  // ...
]
```

---

### Step 8: CSS — `src/styles/vscode-theme.css`

Add `link-block-*` CSS classes mirroring the `file-block-*` classes:
- `.link-block-wrapper` (margin, align)
- `.ProseMirror-selectednode:has(> .link-block-wrapper)` (hide default outline)
- `.link-block-container` (position relative)
- `.link-block-figure` (border, radius)
- `.link-block-toolbar` + `.link-block-toolbar-btn` + `.link-block-toolbar-divider`
- `.link-block-card` + `.link-block-card-icon` + `.link-block-card-info` + `.link-block-card-name` + `.link-block-card-meta` + `.link-block-card-thumbnail`
- `.link-block-preview` + `.link-block-preview-frame` + `.link-block-preview-overlay`
- `.link-block-placeholder` (dashed border input)
- `.link-block-resize-handle`
- `.link-block-loading` (spinner)

---

### Step 9: Storage Layer — `src/lib/storage.ts`

Add wrappers for the two new commands:
```typescript
// ---- link preview ----

fetchLinkMetadata: (url: string) =>
  invoke<LinkMetadata>('fetch_link_metadata', { url }),

fetchLinkPage: (url: string) =>
  invoke<LinkPageResponse>('fetch_link_page', { url }),
```

Add corresponding TS types:
```typescript
export interface LinkMetadata {
  title: string;
  description: string;
  faviconUrl: string;
  ogImage: string;
  siteName: string;
  url: string;
}

export interface LinkPageResponse {
  html: string;
  baseUrl: string;
  contentType: string;
}
```

---

## Chrome Cookie Decryption Details (macOS)

```
┌─────────────────────────┐
│ macOS Keychain          │
│ "Chrome Safe Storage"   │──→ security find-generic-password -ga Chrome -s "Chrome Safe Storage"
└────────────┬────────────┘
             │ password (e.g. "a1b2c3...")
             ▼
┌─────────────────────────┐
│ PBKDF2-HMAC-SHA1        │
│ salt = b'saltysalt'     │
│ iterations = 1003       │
│ key_len = 16            │──→ AES-128 key (16 bytes)
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐     ┌──────────────────────────┐
│ Chrome Cookies DB       │     │ AES-128-CBC Decrypt      │
│ ~/Library/Application   │     │ IV = 16 × 0x20           │
│   Support/Google/Chrome │──→  │ Ciphertext = value[3:]   │──→ plaintext cookie value
│   /Default/Cookies      │     │ (strip 'v10'/'v11' prefix)│
│ (SQLite, encrypted_value)│    └──────────────────────────┘
└─────────────────────────┘
```

---

## Limitations & Notes

1. **Iframe embedding**: Many sites send `X-Frame-Options: DENY` or `Content-Security-Policy: frame-ancestors`. The proxy approach (fetching HTML via Rust, rendering via `srcdoc`) bypasses these headers since the content is served locally. However, dynamic content (AJAX-loaded) won't work in the srcdoc iframe.

2. **Chrome must be closed**: On macOS, Chrome locks the Cookies SQLite DB while running. We open it in read-only mode (immutable), so this should work even while Chrome is open.

3. **Profile support**: Initial implementation uses Chrome's "Default" profile. Multi-profile support can be added later.

4. **Cross-platform**: The initial implementation targets macOS only (Chrome on macOS). Linux/Windows use different cookie encryption schemes and can be added later.

5. **Open in browser fallback**: The floating toolbar always includes an "Open External" button that opens the URL in the system default browser (which is Chrome for most users), guaranteeing full login state for interactive use.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `src-tauri/Cargo.toml` | Edit | Add HTTP + crypto + SQLite deps |
| `src-tauri/src/commands/link.rs` | **NEW** | Chrome cookie decryption + HTTP fetch commands |
| `src-tauri/src/commands/mod.rs` | Edit | Register `link` module |
| `src-tauri/src/lib.rs` | Edit | Register commands in `generate_handler!` |
| `src/types/document.ts` | Edit | Add `'link'` type + properties |
| `src/lib/linkExtension.ts` | **NEW** | Tiptap Node extension |
| `src/lib/tiptapAdapter.ts` | Edit | Add link↔linkBlock mapping |
| `src/lib/tiptapExtensions.tsx` | Edit | Add `/link` slash command |
| `src/lib/storage.ts` | Edit | Add fetch wrappers + types |
| `src/components/LinkView.tsx` | **NEW** | React NodeView component |
| `src/components/BlockEditor.tsx` | Edit | Register LinkExtension |
| `src/styles/vscode-theme.css` | Edit | Add link-block CSS |
