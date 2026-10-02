#!/usr/bin/env node
/**
 * guard-no-tauri — asserts the renderer has no Tauri residue.
 *
 * The shell is Electron; the old tauriShim compatibility layer is gone.
 * This guard keeps it gone: any reintroduction of Tauri-style imports,
 * the drag-region attribute bridge, or the legacy lifecycle event names
 * fails the build instead of quietly resurrecting dead-shell idioms.
 *
 * Patterns (all must be absent from desktop/src):
 *   @tauri-apps              — the shimmed import specifiers
 *   data-tauri-drag-region   — the attribute the CSS bridge used to map
 *   tauri://                 — the legacy lifecycle event namespace
 *
 * Usage: node scripts/guard-no-tauri.mjs   (wired into `npm run lint`)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');
const PATTERNS = [
  /@tauri-apps/,
  /data-tauri-drag-region/,
  /tauri:\/\//,
];
const EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.html']);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (EXTENSIONS.has(name.match(/\.[^.]+$/)?.[0] ?? '')) yield p;
  }
}

const offenders = [];
for (const file of walk(SRC)) {
  const rel = relative(SRC, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const pattern of PATTERNS) {
      if (pattern.test(line)) {
        offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
      }
    }
  });
}

if (offenders.length > 0) {
  console.error(
    `[guard-no-tauri] Tauri residue found (shell is Electron — remove it):\n` +
      offenders.map((o) => `  ${o}`).join('\n'),
  );
  process.exit(1);
}
console.log('[guard-no-tauri] clean — no Tauri residue in src/');
