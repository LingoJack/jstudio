#!/usr/bin/env node
/**
 * write-build-info.mjs — bake the current git short hash next to
 * dist-electron/backend.cjs so the Node sidecar's `get_build_info` reports
 * the same {commit, is_dev} shape the Rust sidecar baked at compile time.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch {
  // not a git checkout (packaged source drop) — keep "unknown"
}

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist-electron', 'build-info.json');
fs.writeFileSync(out, JSON.stringify({ commit }) + '\n');
console.log(`build-info: ${commit} -> ${out}`);
