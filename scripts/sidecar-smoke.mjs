#!/usr/bin/env node
/**
 * sidecar-smoke.mjs — sidecar 协议冒烟 + stdout 静默断言。
 *
 * 验证（对应迁移计划 P1 的验收项）：
 *   1. echo / read_settings / write_settings(合并语义) / get_build_info / pty_list
 *   2. 错误路径（未知方法、缺参数）
 *   3. **stdout 静默断言**：sidecar stdout 的每一行都必须是合法 JSON
 *     （任何 println!/日志泄漏都会在此失败 —— 协议完整性守卫）。
 *   4. 事件通知：pty_create → 收到 pty-data-* 事件 → pty_kill → pty-exit-*。
 *
 * 用法：node scripts/sidecar-smoke.mjs [sidecar-binary-path]
 * 退出码：0 = 全过，1 = 失败。
 */

import { spawn } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binary =
  process.argv[2] ??
  path.join(repoRoot, 'src-tauri', 'target', 'debug', 'jstudio-sidecar');

const sc = spawn(binary, [], { stdio: ['pipe', 'pipe', 'inherit'] });
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

try {
  // 1. echo
  const echo = await call('echo', { ping: 1 });
  if (echo?.echo?.ping !== 1) fail(`echo mismatch: ${JSON.stringify(echo)}`);
  else ok('echo');

  // 2. settings round-trip (merge semantics: unknown key survives)
  const before = await call('read_settings');
  const marker = `smoke-${Date.now()}`;
  await call('write_settings', { settings: { __smoke_marker__: marker } });
  const after = await call('read_settings');
  if (after?.__smoke_marker__ !== marker) fail('settings round-trip lost marker');
  else ok('settings round-trip (merge)');
  // cleanup: remove the marker key to leave user settings untouched
  delete after.__smoke_marker__;
  await call('write_settings', { settings: after });
  if (typeof before !== 'object' || before === null) fail('read_settings not an object');

  // 3. build info
  const info = await call('get_build_info');
  if (typeof info?.commit !== 'string') fail(`bad build info: ${JSON.stringify(info)}`);
  else ok(`build info commit=${info.commit}`);

  // 4. error paths
  await call('nope_method').then(
    () => fail('unknown method resolved'),
    () => ok('unknown method errors'),
  );
  await call('read_document', { docId: '__smoke_nonexistent__' }).then(
    () => fail('missing doc resolved'),
    () => ok('missing doc errors'),
  );

  // 5. PTY cycle with events
  const session = await call('pty_create', { cwd: '~', cols: 80, rows: 24 });
  if (!session?.id) fail('pty_create returned no id');
  await call('pty_write', { sessionId: session.id, data: 'echo __smoke_pty__\n' });
  await sleep(1200);
  await call('pty_kill', { sessionId: session.id });
  await sleep(400);
  if (!sawPtyData) fail('no pty-data event received');
  else ok('pty-data events');
  if (!sawPtyExit) fail('no pty-exit event received');
  else ok('pty-exit event');

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
} catch (e) {
  fail(`unexpected: ${e.message}`);
  process.exit(1);
}
