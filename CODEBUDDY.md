# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## Project Overview

JStudio is an offline-first, Notion-style local note-taking desktop app built on **Tauri v2 + React 19**. All data lives locally at `~/.jdata/studio/` (SQLite + filesystem); there is no cloud sync.

The `jcli/` directory is a git submodule (the `j` CLI). JStudio links against `jcli/j-agent` (Rust) for the in-app Agent chat feature.

## Common Commands

| Task | Command |
|------|---------|
| Dev (Tauri + Vite hot reload, port 1420) | `make dev` or `npm run tauri:dev` |
| Build production app | `make build` or `npm run tauri:build` |
| Install to `/Applications` (macOS) | `make install` |
| Format everything | `make fmt` (runs `cargo fmt` + prettier check) |
| Lint (TS + Rust clippy) | `make lint` |
| Pre-commit gate (fmt + lint + test) | `make pre-commit` |
| Rust check only | `make check-rust` (cargo check) |
| TypeScript type check | `npm run lint` (tsc --noEmit) |
| Dead-code / unused-export check | `npm run knip` |
| Frontend tests | `npm run test:shortcuts` and `npm run test:cursor` |
| Rust tests | `cd src-tauri && cargo test` |
| Bump patch version (syncs 3 files) | `make bump-version` |
| Set specific version | `make set-version V=1.2.3` |

Tests use Node's built-in test runner via `tsx --test` (no Jest/Vitest). Run a single test file:

```bash
npx tsx --test src/lib/shortcuts/keyboardShortcuts.test.ts
```

`make help` lists all available Make targets.

## Architecture

### Two-process app

- **Frontend** (`src/`) — React 19 + TypeScript (strict) + Vite 6 + Tailwind v4 + Zustand. The TipTap v3 / ProseMirror editor is the largest subsystem.
- **Backend** (`src-tauri/src/`) — Rust. Owns SQLite, the PTY terminal backend, j-agent integration, link preview HTTP, and `.jnote` bundle import/export. Exposes `#[tauri::command]`s registered in `src-tauri/src/lib.rs`.

### IPC boundary — `src/lib/core/storage.ts` is the only gate

Frontend code MUST NOT call `invoke()` directly. All Tauri IPC goes through `src/lib/core/storage.ts`, which exports a typed `storage` object with one method per Rust command. Every Rust command in `src-tauri/src/lib.rs` `invoke_handler!` must have a corresponding method here. Rust commands return `Result<T, String>`.

### Editor — sectioned ProseMirror

The editor (`src/components/editor/sectionEditor/`) splits each document into ~30-block sections (`SECTION_SIZE`, `lib/editor/sectioning.ts`), each with its own ProseMirror instance (`SectionEditor.tsx`). This is a performance fix for the 232KB-contenteditable lag in WebKit — a keystroke only re-lays-out its own section. `SectionedEditorPanel.tsx` is the orchestrator; block-level ops are debounced (500ms per-document, keyed by doc id in `store/storeHelpers.ts`) and reassembled into the full `Block[]` before being written back to the store. Sections are recomputed on document switch, not live-rebalanced.

Known limitation: no cross-section selection / Cmd+A / copy-paste across sections.

### Data adapter — `lib/editor/tiptapAdapter/`

The single source of truth for converting between JStudio's `Block[]` format (`types/document.ts`) and TipTap's `JSONContent[]`. Files split by concern: `blocks.ts` (main), `richText.ts` (inline), `table.ts`, `list.ts`, `todo.ts`. Neither the editor nor the store knows about the other's representation.

### Block types — 5-layer addition

Adding a new block type touches all 5 layers (see `docs/how-to-add-block-type.md` for a worked example):
1. `src/types/document.ts` — `BlockType` union + `BlockProperties` fields (prefix field names with the block type, e.g. `collapsible*`)
2. `src/lib/editor/extensions/` — TipTap `Node` definition + commands
3. `src/components/editor/nodes/` — React NodeView component
4. `src/lib/editor/tiptapAdapter/blocks.ts` — bidirectional Block ↔ TipTap JSON
5. Registration in the section editor extensions + slash menu (`lib/editor/slashMenu/`)

### Diagram blocks

Two coexisting engines share the same `properties.diagramSnapshot` string channel. `kind: 'jgraph'` magic key selects the in-house maxGraph format (`components/editor/nodes/graph/`); anything else parseable as JSON falls back to Excalidraw. Detection lives in `nodes/graph/graphSnapshot.ts`. Mermaid import converts flowchart/sequence syntax to jgraph nodes.

### State — Zustand slice pattern

`src/store/useStore.ts` composes 8 slices (documents, editor, ui, terminal, toast, folders, workspace, agent) into one store. Each slice is a `createXxxSlice(set, get)` function returning a `Partial<StoreState>`. The full interface is in `src/store/storeHelpers.ts`. Selectors in `src/store/selectors.ts` are the preferred way to subscribe — always subscribe to primitives/booleans, not object references, to avoid re-rendering the editor on every debounced content update.

Per-document save timers are keyed by doc id (`storeHelpers.ts`) so switching documents within the debounce window doesn't drop pending edits.

### Multi-window architecture

`src/main.tsx` dispatches on `?window=` query param to render one of: main `App`, `DocumentWindowApp`, `TerminalWindowApp`, `DiagramWindowApp`, `PreviewWindowApp`, `CommandPaletteWindow`, `LinkPreviewTabsApp`. Knip entry points (`knip.json`) enumerate these `*WindowApp.tsx` files. Rust passes detach payloads via in-process mailbox commands in `commands/detach.rs`. The main window intercepts `Cmd+W` (see `on_window_close_requested` in `src-tauri/src/lib.rs`) and emits `window-close-requested` to JS; child windows close directly.

### macOS menu quirk

`src-tauri/src/lib.rs::build_app_menu` installs a custom macOS menu identical to Tauri's default EXCEPT it omits Edit > "Select All". The default `Cmd+A` menu item is intercepted by macOS via `performKeyEquivalent:` before any DOM keydown fires, breaking in-editor Cmd+A. Removing the menu item lets Cmd+A flow through to the webview. `docs/bug-graveyard.md` records this and similar WKWebView quirks (e.g. `Cmd+Arrow` requires window-capture-stage interception).

## Data Storage

Canonical store is SQLite (`~/.jdata/studio/studio.db`, WAL mode, single global `Mutex<Connection>` in `src-tauri/src/db/connection.rs`). All DB access goes through `db::db()`. Schema lives in `src-tauri/src/db/schema.rs` with `ensure_column` for incremental migrations.

Tables: `documents` (metadata + `body` column), `folders`, `settings` (key/value, JSON value), `deleted_documents` (tombstones), `trashed_assets` (per-doc recycle bin).

Filesystem holds binaries and backups only: `documents/{docId}/assets/` (images), `documents/{docId}/.backups/` (write-before-overwrite snapshots), `documents/{docId}/.trash/` (trashed assets), and legacy `document.json` (fallback path / migration source).

On startup, `connection.rs::open_and_init` runs: schema create → `migrate_from_json` (one-time import of legacy `index.json`/`folders.json`/`settings.json`, renaming to `*.json.bak`) → `reconcile_orphan_documents` (scans `documents/` for folders not in the DB, skipping tombstoned ids, skipping fully-blank docs) → `migrate_document_bodies` (backfills the `body` column from `document.json`).

## Layering rules (`docs/architecture.md`)

- `src/lib/` = logic layer (pure functions, store adapters, tiptap extensions, conversions, themes, shortcuts, i18n, constants). No business components.
- `src/components/` = view layer (all React components).
- Dependency direction is one-way: `components/` → `lib/`. `lib/` MUST NOT import business components from `components/`.
- Sole exception: TipTap extension UI tightly bound to a suggestion plugin (e.g. `lib/editor/slashMenu/SlashMenuList.tsx`) may live in `lib/editor/`.
- File-size red line: > 400 lines (component) / > 500 lines (logic) should be split. Run `npm run knip` before committing to catch unused exports.

## Conventions

- Tauri command naming: `snake_case` on the Rust side, called via `storage.<camelCaseMethod>` on the TS side.
- Block property fields are prefixed with their block type (e.g. `codeWidthPct`, `collapsibleOpen`, `diagramSnapshot`).
- Legacy px-based dimensions (`width`, `height`) are kept for backward compat; prefer percentage variants (`widthPct`, `heightPct`) for new code.
- Theme: use Tailwind v4 + VSCode-style CSS variables in `src/styles/vscode-theme.css`. Do not hardcode colors.
- Rust: `Result<T, String>` for all command return types. Register new commands in `src-tauri/src/lib.rs` `invoke_handler!` AND add a typed method to `src/lib/core/storage.ts`.
- Patches: `patches/prosemirror-view+1.41.9.patch` fixes a WKWebView caret-positioning bug inside code blocks with lowlight decorations. Applied via `patch-package` (`postinstall` hook).
- Vite manual chunks split heavy vendors (excalidraw, mermaid, cytoscape, katex, mammoth) into separate bundles.

## Key Entry Points

| File | Role |
|------|------|
| `src/main.tsx` | Root mount; multi-window dispatch on `?window=` |
| `src/App.tsx` | Main window layout (title bar, activity bar, sidebar, tabs, editor, terminal, agent, settings) |
| `src/lib/core/storage.ts` | **Only** Tauri IPC surface (typed `storage` object) |
| `src/store/useStore.ts` | Zustand store composition (8 slices) |
| `src/store/storeHelpers.ts` | `StoreState` interface, debounced save timers |
| `src/components/editor/sectionEditor/SectionedEditorPanel.tsx` | Editor orchestrator |
| `src/components/editor/sectionEditor/SectionEditor.tsx` | One ProMirror instance per section |
| `src/lib/editor/tiptapAdapter/index.ts` | Block ↔ TipTap conversion barrel |
| `src/lib/editor/sectioning.ts` | `SECTION_SIZE` / `splitIntoSections` |
| `src/types/document.ts` | `Block`, `BlockType`, `BlockProperties`, `Document` |
| `src-tauri/src/lib.rs` | Plugin registration + `invoke_handler!` (all commands) |
| `src-tauri/src/db/connection.rs` | Global SQLite `Mutex<Connection>` + init pipeline |
| `src-tauri/src/db/schema.rs` | Table DDL + `ensure_column` incremental migrations |
| `src-tauri/src/commands/storage/mod.rs` | Storage command modules (paths/documents/folders/settings/assets/backups/cache/markdown) |

## Gotchas

- Subscribing to `activeDoc` (object reference) in a parent component causes ProseMirror cursor lag — subscribe to `hasActiveDoc` (boolean) or use a selector. See comment in `src/App.tsx:33-38`.
- Dev mode disables React `StrictMode` intentionally (`src/main.tsx:21`) — React 19's dev-mode DOM traversal triggers SecurityError on sandboxed iframes.
- Native context menu is disabled globally in `src/main.tsx`; components that need a custom right-click menu must call `e.preventDefault()` themselves.
- macOS WKWebView swallows `Cmd+Arrow` and (by default) `Cmd+A` before JS sees the keydown. Window-capture-stage handlers are the only fix. See `docs/bug-graveyard.md`.
- `src-tauri/resources/bin/` is gitignored — bundled `j` binary lives there at build time, not in the repo.
- `jcli/` is a submodule; the Cargo workspace pulls `jcli/j-agent` via `path = "../jcli/j-agent"`. Updating `jcli` requires committing the new submodule pointer.
