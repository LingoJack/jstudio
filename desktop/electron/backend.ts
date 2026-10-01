/**
 * backend.ts — Node sidecar entry.
 *
 * Electron main spawns this file with `process.execPath` +
 * `ELECTRON_RUN_AS_NODE=1` (pure Node — no Electron APIs; and in a packaged
 * build it must live OUTSIDE app.asar, see design D1). The protocol mirrors
 * the Rust sidecar byte-for-byte; the method surface is tracked in
 * electron/backend/PORTING.md. The agent_* nine methods stay on the Rust
 * sidecar (j_agent engine host) — main routes before this process ever
 * sees them.
 */

import { buildRouter } from "./backend/router";
import { kvHandlers } from "./backend/kv";
import { logsHandlers } from "./backend/logs";
import { miscHandlers } from "./backend/misc";
import { storageHandlers } from "./backend/storage";
import { assetsHandlers } from "./backend/assets";
import { bundleHandlers } from "./backend/bundle";
import { terminalHandlers } from "./backend/terminal";
import { fetchHandlers } from "./backend/fetch";
import { jcliHandlers } from "./backend/jcli";
import { fontsHandlers } from "./backend/fonts";
import { log, runProtocol } from "./backend/protocol";

log(`started (pid=${process.pid})`);
runProtocol(
  buildRouter(
    {
      // Transport health check (P0 self-test) — mirrors sidecar.rs.
      echo: (params) => ({ echo: params }),
    },
    miscHandlers,
    kvHandlers,
    logsHandlers,
    storageHandlers,
    assetsHandlers,
    bundleHandlers,
    terminalHandlers,
    fetchHandlers,
    jcliHandlers,
    fontsHandlers,
  ),
);
