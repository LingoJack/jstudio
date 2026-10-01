/**
 * protocol.ts — stdio JSON-RPC framing for the Node sidecar (backend.cjs).
 *
 * Byte-level contract mirrored from the Rust sidecar
 * (src-tauri/src/bin/sidecar.rs):
 *   request      {"id":N,"method":"...","params":...}
 *   response     {"id":N,"result":...} | {"id":N,"error":"..."}
 *   notification {"event":"...","label"?:"...","payload":...}
 *
 * HARD CONSTRAINT (smoke-asserted): stdout carries protocol frames ONLY —
 * one stray line breaks the bridge. Logs and diagnostics go to stderr via
 * `log()`.
 */

import * as readline from "node:readline";

export type Params = Record<string, unknown>;
export type Handler = (params: Params) => unknown;

interface RequestFrame {
  id: number;
  method: string;
  params?: unknown;
}

/**
 * One serialized write per frame — mirrors the Rust side's single-sink
 * mutex so interleaved responses and event notifications can't corrupt
 * the framing.
 */
export function writeFrame(frame: unknown): void {
  process.stdout.write(JSON.stringify(frame) + "\n");
}

/** Emit an event notification (terminal data/exit, agent stream, …). */
export function notify(event: string, payload?: unknown, label?: string): void {
  const frame: Record<string, unknown> = { event };
  if (label !== undefined) frame.label = label;
  if (payload !== undefined) frame.payload = payload;
  writeFrame(frame);
}

/** Sidecar diagnostics — stderr only, never the protocol stdout. */
export function log(...parts: unknown[]): void {
  process.stderr.write(["[jstudio-backend]", ...parts.map(String)].join(" ") + "\n");
}

/**
 * Run the protocol loop until stdin closes (main stops the sidecar by
 * ending stdin or killing the process — mirror of the Rust shutdown).
 */
export function runProtocol(handlers: Record<string, Handler>): void {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: RequestFrame;
    try {
      msg = JSON.parse(trimmed) as RequestFrame;
    } catch {
      log("non-JSON stdin line dropped");
      return;
    }
    if (typeof msg.id !== "number" || typeof msg.method !== "string") return;
    const params = (msg.params ?? {}) as Params;
    Promise.resolve()
      .then(() => {
        const handler = handlers[msg.method];
        if (!handler) throw new Error(`unknown method: ${msg.method}`);
        return handler(params);
      })
      .then((result) => writeFrame({ id: msg.id, result: result ?? null }))
      .catch((e: unknown) =>
        writeFrame({
          id: msg.id,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
  });
  rl.on("close", () => process.exit(0));
}
