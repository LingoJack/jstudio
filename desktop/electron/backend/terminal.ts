/**
 * terminal.ts — PTY sessions via node-pty.
 * Port of src-tauri/src/commands/terminal.rs — event names mirror the Rust
 * side exactly (`pty-data-{id}` with `{data}`, `pty-exit-{id}`), sessions
 * spawn as login shells (`-l`) with the same env identity, and the error
 * strings match ("session not found: …"). node-pty decodes UTF-8 across
 * read boundaries internally, so the Rust reader-thread's leftover-bytes
 * dance is not needed here.
 */

import * as os from "node:os";
import * as pty from "node-pty";
import { notify } from "./protocol";
import type { HandlerTable } from "./router";
import { takeArray, takeNumber, takeObject, takeString } from "./params";

interface PtySession {
  id: string;
  title: string;
  proc: pty.IPty;
}

/** Global session registry, keyed by session id. */
const sessions = new Map<string, PtySession>();

function expandTilde(cwd: string): string {
  if (cwd === "~") return os.homedir();
  if (cwd.startsWith("~/")) return `${os.homedir()}/${cwd.slice(2)}`;
  return cwd;
}

function getSession(sessionId: string): PtySession {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`session not found: ${sessionId}`);
  return session;
}

interface CreateParams {
  cwd?: string;
  cols: number;
  rows: number;
}

function ptyCreate(params: CreateParams): { id: string; title: string } {
  // Login shell (`-l`) so ~/.zprofile and friends are sourced — matches
  // Terminal.app behaviour when launched from Finder with a minimal PATH.
  const isWindows = process.platform === "win32";
  const file = isWindows ? "cmd.exe" : process.env.SHELL || "/bin/sh";
  const args = isWindows ? [] : ["-l"];

  const proc = pty.spawn(file, args, {
    name: "xterm-256color",
    cols: params.cols,
    rows: params.rows,
    cwd: params.cwd !== undefined ? expandTilde(params.cwd) : undefined,
    env: {
      ...(process.env as Record<string, string>),
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      LANG: "en_US.UTF-8",
      LC_ALL: "en_US.UTF-8",
      // VS Code terminal identity: TUI agents (Codebuddy / Claude Code, …)
      // adapt their SGR output to it — see the Rust side's comment.
      TERM_PROGRAM: "vscode",
      TERM_PROGRAM_VERSION: "1.99.0",
    },
  });

  const sessionId = `term-${Date.now()}`;
  const title = "Terminal";

  proc.onData((data) => {
    notify(`pty-data-${sessionId}`, { data });
  });
  proc.onExit(() => {
    // Rust emits the unit payload — serialized as null.
    notify(`pty-exit-${sessionId}`, null);
  });

  sessions.set(sessionId, { id: sessionId, title, proc });
  return { id: sessionId, title };
}

export const terminalHandlers: HandlerTable = {
  pty_create: (p) => {
    const params = takeObject(p, "params") as unknown as CreateParams;
    return ptyCreate(params);
  },

  pty_write: (p) => {
    getSession(takeString(p, "sessionId")).proc.write(takeString(p, "data"));
    return null;
  },

  pty_write_batch: (p) => {
    const session = getSession(takeString(p, "sessionId"));
    for (const chunk of takeArray<string>(p, "chunks")) session.proc.write(chunk);
    return null;
  },

  pty_resize: (p) => {
    getSession(takeString(p, "sessionId")).proc.resize(
      takeNumber(p, "cols"),
      takeNumber(p, "rows"),
    );
    return null;
  },

  pty_kill: (p) => {
    const sessionId = takeString(p, "sessionId");
    const session = sessions.get(sessionId);
    if (session) {
      sessions.delete(sessionId);
      session.proc.kill();
    }
    return null;
  },

  pty_list: () => [...sessions.values()].map((s) => ({ id: s.id, title: s.title })),

  pty_set_title: (p) => {
    getSession(takeString(p, "sessionId")).title = takeString(p, "title");
    return null;
  },

  pty_is_alive: (p) => sessions.has(takeString(p, "sessionId")),

  pty_kill_all: () => {
    for (const session of sessions.values()) session.proc.kill();
    sessions.clear();
    return null;
  },
};
