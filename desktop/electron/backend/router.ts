/**
 * router.ts — method → handler table for the Node sidecar.
 *
 * Each domain module exports a handler table; `buildRouter` merges them.
 * The method surface is tracked in electron/backend/PORTING.md — the
 * agent_* nine methods intentionally stay on the Rust host and must NOT
 * appear here (a direct call must fail with `unknown method`, which the
 * smoke suite uses as the routing-correctness negative test).
 */

import type { Handler } from "./protocol";

export type HandlerTable = Record<string, Handler>;

export function buildRouter(...tables: HandlerTable[]): Record<string, Handler> {
  return Object.assign({} as Record<string, Handler>, ...tables);
}
