#!/usr/bin/env node
/**
 * sidecar-smoke.mjs — sidecar 协议冒烟 + stdout 静默断言（全方法面）。
 *
 * 验证：
 *   1. echo / settings(合并语义) / get_build_info / pty_list
 *   2. 错误路径（未知方法、缺文档）
 *   3. **stdout 静默断言**：sidecar stdout 的每一行都必须是合法 JSON
 *     （任何日志泄漏都会在此失败 —— 协议完整性守卫）。
 *   4. 事件通知：pty_create → pty-data-* → pty_kill → pty-exit-*。
 *   5. node 模式全方法面：KV 中继、日志、文档/文件夹/设置、备份、快照、
 *      资产回收站、.jnote 往返、markdown 扫描、jcli 状态、字体、graph 日志。
 *
 * 用法：
 *   node scripts/sidecar-smoke.mjs --backend node      # Node sidecar（沙箱数据目录）
 *   node scripts/sidecar-smoke.mjs --backend rust      # Rust sidecar（真实数据目录）
 *   node scripts/sidecar-smoke.mjs <binary-path>       # 等价 --backend rust
 * 退出码：0 = 全过，1 = 失败。
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── backend selection ──
let backend = 'rust';
let binary = null;
const args = process.argv.slice(2);
if (args.includes('--backend')) {
  backend = args[args.indexOf('--backend') + 1];
}
const positional = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--backend');
if (backend !== 'node' && positional) binary = positional;

let sc;
let sandbox = null;
if (backend === 'node') {
  // Sandbox studio dir so writes never touch the user's live data.
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'jstudio-smoke-'));
  fs.mkdirSync(path.join(sandbox, 'studio'), { recursive: true });
  const eb = (await import('node:child_process')).execSync('node -e "console.log(require(\'electron\'))"', {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  sc = spawn(eb, [path.join(repoRoot, 'dist-electron', 'backend.cjs')], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', JSTUDIO_STUDIO_DIR: path.join(sandbox, 'studio') },
  });
} else {
  binary = binary ?? path.join(repoRoot, 'src-tauri', 'target', 'debug', 'jstudio-sidecar');
  sc = spawn(binary, [], { stdio: ['pipe', 'pipe', 'inherit'] });
}

const rl = readline.createInterface({ input: sc.stdout });

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`FAIL: ${msg}`);
};
const ok = (msg) => console.log(`ok: ${msg}`);

const pending = new Map();
let nextId = 1;
const call = (method, params) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    sc.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });

const events = [];
let sawPtyData = false;
let sawPtyExit = false;

rl.on('line', (line) => {
  // ── stdout 静默断言：每一行必须是合法 JSON ──
  let m;
  try {
    m = JSON.parse(line);
  } catch {
    fail(`non-JSON stdout line (protocol pollution): ${line.slice(0, 120)}`);
    return;
  }
  if (typeof m.event === 'string') {
    events.push(m.event);
    if (m.event.startsWith('pty-data-')) sawPtyData = true;
    if (m.event.startsWith('pty-exit-')) sawPtyExit = true;
    return;
  }
  const p = pending.get(m.id);
  if (!p) {
    fail(`response with unknown id: ${m.id}`);
    return;
  }
  pending.delete(m.id);
  if (m.error !== undefined && m.error !== null) p.reject(new Error(String(m.error)));
  else p.resolve(m.result);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const must = (cond, okMsg, failMsg) => (cond ? ok(okMsg) : fail(failMsg));

try {
  // 1. echo
  const echo = await call('echo', { ping: 1 });
  must(echo?.echo?.ping === 1, 'echo', `echo mismatch: ${JSON.stringify(echo)}`);

  if (backend === 'rust') {
    // Slimmed agent host: echo + agent surface + error path only — every
    // other command lives on the Node sidecar now.
    const sessions = await call('agent_list_sessions');
    must(Array.isArray(sessions), `agent_list_sessions (${sessions?.length} sessions)`, 'agent_list_sessions not an array');
    await call('read_settings').then(
      () => fail('migrated method resolved on rust host (routing leak)'),
      () => ok('migrated methods rejected by rust host'),
    );
    await call('nope_method').then(
      () => fail('unknown method resolved'),
      () => ok('unknown method errors'),
    );
    sc.stdin.end();
    console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
    process.exit(failures === 0 ? 0 : 1);
  }

  // 2. settings round-trip (merge semantics: unknown key survives)
  await call('read_settings');
  const marker = `smoke-${Date.now()}`;
  await call('write_settings', { settings: { __smoke_marker__: marker } });
  const after = await call('read_settings');
  must(after?.__smoke_marker__ === marker, 'settings round-trip (merge)', 'settings round-trip lost marker');
  // cleanup: remove the marker key to leave user settings untouched
  delete after.__smoke_marker__;
  await call('write_settings', { settings: after });

  // 3. build info
  const info = await call('get_build_info');
  must(typeof info?.commit === 'string', `build info commit=${info?.commit}`, `bad build info: ${JSON.stringify(info)}`);

  // 4. error paths
  await call('nope_method').then(
    () => fail('unknown method resolved'),
    () => ok('unknown method errors'),
  );
  await call('read_document', { docId: '__smoke_nonexistent__' }).then(
    () => fail('missing doc resolved'),
    () => ok('missing doc errors'),
  );

  // ── node-mode full surface ──
  if (backend === 'node') {
    // KV relay caches (destructive reads), three groups.
    for (const [setM, getM, clearM, key, payload] of [
      ['set_preview_data', 'get_preview_data', 'clear_preview_data', 'data', { a: 1 }],
      ['set_diagram_update', 'get_diagram_update', 'clear_diagram_update', 'data', { b: [2] }],
      ['set_terminal_detach_payload', 'get_terminal_detach_payload', 'clear_terminal_detach_payload', 'payload', { c: 'x' }],
    ]) {
      await call(setM, { label: 'smoke-w', [key]: payload });
      const got = await call(getM, { label: 'smoke-w' });
      must(JSON.stringify(got) === JSON.stringify(payload), `${getM} returns payload`, `${getM} payload mismatch: ${JSON.stringify(got)}`);
      const gone = await call(getM, { label: 'smoke-w' });
      must(gone === null, `${getM} is destructive`, `${getM} returned twice: ${JSON.stringify(gone)}`);
      await call(clearM, { label: 'smoke-w' });
      ok(clearM);
    }

    // Logs.
    await call('append_log_line', { line: 'smoke log line' });
    const logPath = await call('get_log_file_path');
    must(typeof logPath === 'string' && fs.existsSync(logPath), `get_log_file_path (${path.basename(logPath)})`, 'log file missing');
    const removed = await call('clear_logs');
    must(typeof removed === 'number' && removed >= 1, `clear_logs removed ${removed}`, 'clear_logs removed nothing');

    // Documents round-trip (sandbox DB).
    const smokeDocId = 'doc-smoke-' + Date.now();
    const smokeDoc = {
      id: smokeDocId,
      title: 'Smoke Doc',
      emoji: '🧪',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      blocks: [{ type: 'paragraph', content: 'smoke content' }],
    };
    await call('write_document', { docId: smokeDocId, doc: smokeDoc });
    const readBack = await call('read_document', { docId: smokeDocId });
    must(readBack?.title === 'Smoke Doc', 'write/read_document', `document round-trip mismatch: ${JSON.stringify(readBack)?.slice(0, 120)}`);

    await call('write_index', { entries: [{ ...smokeDoc, isFavorite: false, folderId: null, trashedAt: null }] });
    const idx = await call('read_index');
    must(Array.isArray(idx) && idx.some((d) => d.id === smokeDocId), 'write/read_index', 'index missing smoke doc');

    // Backups: two writes → at least one backup; read + restore round-trip.
    await call('write_document', { docId: smokeDocId, doc: { ...smokeDoc, blocks: [{ type: 'paragraph', content: 'v2' }] } });
    const backups = await call('list_doc_backups', { docId: smokeDocId });
    must(Array.isArray(backups) && backups.length >= 1, `list_doc_backups (${backups?.length})`, 'no backups after rewrite');
    const backupBody = await call('read_doc_backup', { docId: smokeDocId, backupId: backups[0].id });
    must(backupBody?.blocks?.[0]?.content === 'smoke content', 'read_doc_backup restores first version', `backup body mismatch: ${JSON.stringify(backupBody)?.slice(0, 120)}`);
    await call('restore_doc_backup', { docId: smokeDocId, backupId: backups[0].id });
    const restored = await call('read_document', { docId: smokeDocId });
    must(restored?.blocks?.[0]?.content === 'smoke content', 'restore_doc_backup', `restore did not revert body: ${JSON.stringify(restored?.blocks)?.slice(0, 120)}`);

    // Snapshots.
    await call('save_doc_snapshot', { docId: smokeDocId, sections: [{ type: 'doc', content: [] }] });
    const snap = await call('read_doc_snapshot', { docId: smokeDocId });
    must(snap?.docId === smokeDocId && Array.isArray(snap?.sections), 'save/read_doc_snapshot', `snapshot mismatch: ${JSON.stringify(snap)?.slice(0, 120)}`);

    // Assets + recycle bin round-trip.
    const savedAsset = await call('save_doc_asset', { docId: smokeDocId, fileName: 'smoke.bin', data: [1, 2, 3] });
    must(savedAsset === 'smoke.bin', 'save_doc_asset', `unexpected name: ${savedAsset}`);
    let assets = await call('list_doc_assets', { docId: smokeDocId });
    must(assets.length === 1 && assets[0].sizeBytes === 3, 'list_doc_assets', `asset list: ${JSON.stringify(assets)}`);
    await call('trash_doc_asset', { docId: smokeDocId, fileName: 'smoke.bin' });
    const trashed = await call('list_trashed_assets');
    const row = trashed.find((t) => t.docId === smokeDocId && t.originalName === 'smoke.bin');
    must(!!row, 'trash/list_trashed_assets', 'trashed row missing');
    await call('restore_trashed_asset', { id: row.id });
    assets = await call('list_doc_assets', { docId: smokeDocId });
    must(assets.length === 1, 'restore_trashed_asset', 'asset not restored');
    await call('trash_doc_asset', { docId: smokeDocId, fileName: 'smoke.bin' });
    const trashed2 = await call('list_trashed_assets');
    const row2 = trashed2.find((t) => t.docId === smokeDocId && t.originalName === 'smoke.bin');
    await call('delete_trashed_asset', { id: row2.id });
    const afterDelete = await call('list_trashed_assets');
    must(!afterDelete.some((t) => t.id === row2.id), 'delete_trashed_asset', 'record not removed');

    // .jnote bundle: export → import (new id) → content matches with rewritten id.
    const bundlePath = path.join(sandbox, 'smoke.jnote');
    await call('export_document_bundle', { docId: smokeDocId, destPath: bundlePath });
    must(fs.existsSync(bundlePath) && fs.statSync(bundlePath).size > 0, 'export_document_bundle', 'bundle file missing');
    const imported = await call('import_document_bundle', { srcPath: bundlePath, newDocId: smokeDocId + '-import' });
    must(imported?.id === smokeDocId + '-import', 'import_document_bundle rewrites id', `imported id: ${imported?.id}`);
    const importedDoc = await call('read_document', { docId: smokeDocId + '-import' });
    must(importedDoc?.title === 'Smoke Doc', 'imported doc readable', `title: ${importedDoc?.title}`);

    // Folders round-trip.
    const folders = [
      { id: 'folder-smoke', name: 'Smoke', parentId: null, sortOrder: 0, collapsed: false, trashedAt: null },
      { id: 'folder-smoke2', name: 'Sub', parentId: 'folder-smoke', sortOrder: 1, collapsed: false, trashedAt: null },
    ];
    await call('write_folders', { entries: folders });
    const foldersBack = await call('read_folders');
    must(foldersBack.length === 2 && foldersBack[0].id === 'folder-smoke', 'write/read_folders', `folders: ${JSON.stringify(foldersBack)?.slice(0, 120)}`);

    // Markdown scan (sandbox tmp tree).
    const mdRoot = path.join(sandbox, 'mdscan');
    fs.mkdirSync(path.join(mdRoot, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(mdRoot, 'a.md'), '# a');
    fs.writeFileSync(path.join(mdRoot, 'sub', 'b.markdown'), '# b');
    fs.writeFileSync(path.join(mdRoot, 'skip.txt'), 'nope');
    const md = await call('list_markdown_files', { dir: mdRoot });
    must(md.length === 3 && md.every((e) => typeof e.path === 'string' && typeof e.isDir === 'boolean'),
      `list_markdown_files (${md.length})`, `md scan: ${JSON.stringify(md)}`);

    // Agent config: read + write-back verbatim (harmless, real location).
    const agentConfig = await call('read_agent_config');
    must(typeof agentConfig === 'object' && agentConfig !== null, 'read_agent_config', 'agent config not an object');
    await call('write_agent_config', { config: agentConfig });
    ok('write_agent_config (verbatim)');

    // jcli status + fonts + graph log.
    const jcli = await call('check_jcli');
    must(typeof jcli?.installed === 'boolean' && 'bundled' in jcli, 'check_jcli', `bad jcli status: ${JSON.stringify(jcli)}`);
    const fonts = await call('list_system_fonts');
    must(Array.isArray(fonts), `list_system_fonts (${fonts?.length} families)`, 'fonts not an array');
    await call('write_graph_log', { msg: 'smoke' });
    ok('write_graph_log');
  }

  // 5. PTY cycle with events
  // NOTE: struct-param commands arrive wrapped ({ params: {...} }) — same
  // shape the real frontend sends (Tauri named-struct-arg convention).
  const session = await call('pty_create', { params: { cwd: '~', cols: 80, rows: 24 } });
  if (!session?.id) fail('pty_create returned no id');
  await call('pty_write', { sessionId: session.id, data: 'echo __smoke_pty__\n' });
  await sleep(1200);
  await call('pty_kill', { sessionId: session.id });
  await sleep(400);
  if (!sawPtyData) fail('no pty-data event received');
  else ok('pty-data events');
  if (!sawPtyExit) fail('no pty-exit event received');
  else ok('pty-exit event');

  // Cleanup: sandbox dies with the tmp dir; kill the sidecar.
  sc.stdin.end();
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  setTimeout(() => process.exit(failures === 0 ? 0 : 1), 300);
} catch (e) {
  fail(`unexpected: ${e.message}`);
  sc.kill();
  process.exit(1);
}
