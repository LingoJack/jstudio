/** Terminal and jcli types - mirrors Rust structs for IPC. */

/**
 * Lightweight terminal session info returned by the Rust PTY backend.
 */
export interface TerminalSessionInfo {
  id: string;
  title: string;
}

/**
 * jcli installation status - mirrors the Rust `JcliStatus` struct.
 */
export interface JcliStatus {
  /** Whether `j` is available on the system PATH. */
  installed: boolean;
  /** Version string reported by `j --version`. */
  version: string | null;
  /** Absolute path to the resolved binary, if found. */
  path: string | null;
  /** Whether the bundled version embedded in JStudio is available. */
  bundled: boolean;
  /** Version of the bundled binary, if extractable. */
  bundledVersion: string | null;
}
