/**
 * sidecar.ts — Electron main ↔ Rust sidecar stdio JSON-RPC bridge.
 *
 * Protocol (newline-delimited JSON):
 *   request      { id: number, method: string, params: unknown }
 *   response     { id: number, result?: unknown, error?: string }
 *   notification { event: string, label?: string, payload?: unknown }
 *
 * HARD CONSTRAINT: the sidecar's stdout is reserved for this protocol.
 * All logging inside the sidecar goes to stderr.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as readline from 'node:readline';
import * as path from 'node:path';

export type SidecarEventHandler = (event: string, label: string | undefined, payload: unknown) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

export class Sidecar {
  private child: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private onEvent: SidecarEventHandler;

  constructor(onEvent: SidecarEventHandler) {
    this.onEvent = onEvent;
  }

  /** Path to the sidecar binary (debug build in dev, bundled in prod). */
  static binaryPath(appPath: string, isPackaged: boolean, resourcesPath: string): string {
    const name = process.platform === 'win32' ? 'jstudio-sidecar.exe' : 'jstudio-sidecar';
    if (isPackaged) return path.join(resourcesPath, 'sidecar', name);
    return path.join(appPath, 'src-tauri', 'target', 'debug', name);
  }

  /**
   * Path to the Node sidecar script (electron/backend.ts → backend.cjs).
   * Packaged builds keep it OUTSIDE app.asar (extraResources) — the
   * ELECTRON_RUN_AS_NODE runtime is plain Node and cannot read asar.
   */
  static nodeScriptPath(appPath: string, isPackaged: boolean, resourcesPath: string): string {
    if (isPackaged) return path.join(resourcesPath, 'backend', 'backend.cjs');
    return path.join(appPath, 'dist-electron', 'backend.cjs');
  }

  start(binaryPath: string, opts?: { nodeScript?: boolean; env?: Record<string, string> }): void {
    if (this.child) return;
    // JSTUDIO_RESOURCE_DIR tells both sidecars where the bundled jcli lives
    // (dev: src-tauri/resources, packaged: resourcesPath) — jcli.rs's
    // bundled-path probe depends on it.
    const env = { ...process.env, ...opts?.env };
    const child = opts?.nodeScript
      ? // ELECTRON_RUN_AS_NODE turns the Electron binary into a plain Node
        // runtime — no second runtime to ship, same ABI as node-pty etc.
        spawn(process.execPath, [binaryPath], {
          stdio: ['pipe', 'pipe', 'inherit'],
          env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
        })
      : spawn(binaryPath, [], { stdio: ['pipe', 'pipe', 'inherit'], env });
    this.child = child;

    child.on('error', (err) => {
      console.error('[sidecar] spawn failed:', err);
    });
    child.on('exit', (code, signal) => {
      console.error(`[sidecar] exited code=${code} signal=${signal}`);
      this.child = null;
      const err = new Error(`sidecar exited (code=${code})`);
      for (const [, p] of this.pending) p.reject(err);
      this.pending.clear();
    });

    // stdout is protocol-only; parse line by line. Lines that fail to parse
    // are NOT protocol — drop them but log, since they indicate stdout
    // pollution (see migration plan risk #1).
    const rl = readline.createInterface({ input: child.stdout! });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line);
      } catch {
        console.error('[sidecar] non-JSON stdout line (pollution?):', line.slice(0, 200));
        return;
      }
      if (typeof msg.id === 'number') {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error !== undefined && msg.error !== null) {
          p.reject(new Error(String(msg.error)));
        } else {
          p.resolve(msg.result);
        }
      } else if (typeof msg.event === 'string') {
        this.onEvent(msg.event, msg.label as string | undefined, msg.payload);
      }
    });
  }

  invoke(method: string, params?: unknown): Promise<unknown> {
    if (!this.child?.stdin) return Promise.reject(new Error('sidecar not running'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child!.stdin!.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
  }
}
