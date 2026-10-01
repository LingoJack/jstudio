/**
 * jcli.ts — jcli (the `j` CLI) install management.
 * Port of src-tauri/src/commands/jcli.rs: status check (PATH + known
 * locations + bundled binary), install (copy to ~/.jdata/bin/j + global
 * symlink with osascript elevation fallback), uninstall.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { HandlerTable } from "./router";

const binName = process.platform === "win32" ? "j.exe" : "j";
const jdataBinDir = path.join(os.homedir(), ".jdata", "bin");
const jdataBinPath = path.join(jdataBinDir, binName);
const globalLinkPath = process.platform === "win32" ? jdataBinPath : "/usr/local/bin/j";

/** Locate the `j` binary bundled in the app resources.
 *  Main sets JSTUDIO_RESOURCE_DIR (dev: src-tauri/resources, prod: resourcesPath). */
function bundledJPath(): string | null {
  const envDir = process.env.JSTUDIO_RESOURCE_DIR;
  if (envDir) {
    const candidate = path.join(envDir, "bin", binName);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Strip ANSI escape sequences (CSI … final byte 0x40–0x7E). */
function stripAnsiEscapes(s: string): string {
  return s.replace(/\x1b\[[@-~]*[^@-~]*?[@-~]/g, "");
}

/**
 * Version from a `j` binary. `j version` (subcommand) prints a Unicode table
 * ("│ kernel   │ 12.11.5 │") — extract the kernel cell; `--version` is the
 * fallback for generic CLIs.
 */
function getVersion(binary: string): string | null {
  let res = spawnSync(binary, ["version"], { encoding: "utf8" });
  if (res.status === 0) {
    const trimmed = (res.stdout ?? "").trim();
    if (trimmed !== "") return extractKernelVersion(trimmed);
  }
  res = spawnSync(binary, ["--version"], { encoding: "utf8" });
  if (res.status !== 0) return null;
  const stdout = (res.stdout ?? "").trim();
  if (stdout !== "") return stdout;
  const stderr = (res.stderr ?? "").trim();
  return stderr !== "" ? stderr : null;
}

function extractKernelVersion(table: string): string | null {
  for (const line of table.split("\n")) {
    if (!line.includes("kernel")) continue;
    const parts = stripAnsiEscapes(line).split("│");
    if (parts.length >= 3) {
      const value = parts[2].trim();
      if (value !== "") return value;
    }
  }
  return null;
}

function whichJ(): string | null {
  const res = spawnSync(process.platform === "win32" ? "where" : "which", ["j"], {
    encoding: "utf8",
  });
  if (res.status !== 0) return null;
  const first = (res.stdout ?? "").split("\n")[0]?.trim();
  return first === "" ? null : first;
}

/** Probe well-known install locations — macOS GUI apps inherit a minimal
 *  PATH from launchd, so a plain `which j` usually misses /usr/local/bin. */
function checkJAtKnownLocations(): [boolean, string | null, string | null] {
  const candidates = [jdataBinPath];
  if (process.platform !== "win32") {
    candidates.push("/usr/local/bin/j");
    if (process.platform === "darwin") candidates.push("/opt/homebrew/bin/j");
  }
  const home = os.homedir();
  candidates.push(path.join(home, ".local", "bin", "j"));

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const version = getVersion(candidate);
    // Binary exists but printed no version — still installed.
    return [true, version, candidate];
  }
  return [false, null, null];
}

function checkSystemJ(): [boolean, string | null, string | null] {
  try {
    const res = spawnSync(binName, ["--version"], { encoding: "utf8" });
    if (res.status === 0) {
      const v = (res.stdout ?? "").trim();
      return [true, v !== "" ? v : null, whichJ()];
    }
  } catch {
    // not on PATH — probe known locations
  }
  return checkJAtKnownLocations();
}

function runOscript(script: string): void {
  const res = spawnSync("osascript", ["-e", script], { encoding: "utf8" });
  if (res.status !== 0) {
    const stderr = (res.stderr ?? "").trim();
    if (stderr.includes("User canceled") || stderr.includes("-128")) {
      throw new Error("Installation cancelled by user.");
    }
    throw new Error(`Failed to create symlink with administrator privileges: ${stderr}`);
  }
}

function checkJcli(): Record<string, unknown> {
  const [installed, version, p] = checkSystemJ();
  const bundled = bundledJPath();
  return {
    installed,
    version,
    path: p,
    bundled: bundled != null,
    bundledVersion: bundled != null ? getVersion(bundled) : null,
  };
}

function installJcli(): string {
  // 1. Locate the bundled binary.
  const bundled = bundledJPath();
  if (!bundled) {
    throw new Error(
      "Bundled jcli binary not found. The app may have been built without embedding it.",
    );
  }

  // 2. Ensure ~/.jdata/bin/ exists.
  fs.mkdirSync(jdataBinDir, { recursive: true });

  // 3. Copy bundled binary → ~/.jdata/bin/j (executable).
  fs.copyFileSync(bundled, jdataBinPath);
  if (process.platform !== "win32") {
    fs.chmodSync(jdataBinPath, 0o755);
  }

  // 4. Global symlink (direct first, osascript elevation fallback on macOS).
  if (process.platform !== "win32") {
    try {
      fs.rmSync(globalLinkPath, { force: true });
    } catch {
      // refresh attempt only
    }
    try {
      fs.symlinkSync(jdataBinPath, globalLinkPath);
    } catch {
      const script =
        `do shell script "mkdir -p /usr/local/bin && ln -sf '${jdataBinPath}' '${globalLinkPath}'" ` +
        "with administrator privileges";
      runOscript(script);
    }
    return `jcli installed to ${jdataBinPath} and linked to ${globalLinkPath}`;
  }

  return `jcli installed to ${jdataBinPath}. Please add ${jdataBinDir} to your PATH.`;
}

function uninstallJcli(): null {
  // Remove the global symlink (direct first, osascript elevation fallback).
  try {
    fs.lstatSync(globalLinkPath);
    try {
      fs.rmSync(globalLinkPath, { force: true });
    } catch {
      if (process.platform === "darwin") {
        const script = `do shell script "rm -f '${globalLinkPath}'" with administrator privileges`;
        const res = spawnSync("osascript", ["-e", script], { encoding: "utf8" });
        if (res.status !== 0) {
          const stderr = (res.stderr ?? "").trim();
          if (stderr.includes("User canceled") || stderr.includes("-128")) {
            throw new Error("Uninstall cancelled by user.");
          }
          throw new Error(`Failed to remove symlink with administrator privileges: ${stderr}`);
        }
      } else {
        throw new Error(
          `Failed to remove ${globalLinkPath}. Please run: \`sudo rm -f ${globalLinkPath}\``,
        );
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Failed to remove")) throw e;
    // lstat ENOENT — no symlink present, fall through
  }

  // Remove ~/.jdata/bin/j.
  if (fs.existsSync(jdataBinPath)) {
    try {
      fs.rmSync(jdataBinPath, { force: true });
    } catch (e) {
      throw new Error(`Failed to remove ${jdataBinPath}: ${String(e)}`);
    }
  }
  return null;
}

export const jcliHandlers: HandlerTable = {
  check_jcli: () => checkJcli(),
  install_jcli: () => installJcli(),
  uninstall_jcli: () => uninstallJcli(),
};
