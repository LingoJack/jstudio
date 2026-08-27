/**
 * protocol.ts — `jstudio-asset://` custom scheme (replaces Tauri's
 * assetProtocol + convertFileSrc, scope ~/.jdata/studio/**).
 *
 * URL format produced by the renderer shim's convertFileSrc:
 *   jstudio-asset://localhost/<percent-encoded-absolute-path>
 * The handler decodes the path, verifies it lives under the studio data
 * directory, and streams the file. Path traversal outside the root is
 * rejected.
 */

import { protocol, net } from 'electron';
import * as path from 'node:path';
import * as os from 'node:os';
import { pathToFileURL } from 'node:url';

export const ASSET_SCHEME = 'jstudio-asset';

/** ~/.jdata/studio — must match the Rust sidecar's studio_dir(). */
export function studioRoot(): string {
  return path.join(os.homedir(), '.jdata', 'studio');
}

export function registerAssetProtocol(): void {
  // Privileges for the scheme must be registered before app-ready.
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
}

export function handleAssetRequests(): void {
  const root = studioRoot();

  protocol.handle(ASSET_SCHEME, (request) => {
    try {
      const url = new URL(request.url);
      // pathname = '/Users/.../file.png' with percent-encoding per segment.
      const decoded = url.pathname
        .split('/')
        .map((seg) => decodeURIComponent(seg))
        .join('/');
      const resolved = path.normalize(decoded);

      // Scope check: must stay inside ~/.jdata/studio (the old assetProtocol
      // scope). normalize() collapses any '..' segments before the check.
      if (!resolved.startsWith(root + path.sep)) {
        return new Response('forbidden: outside asset scope', { status: 403 });
      }
      return net.fetch(pathToFileURL(resolved).toString());
    } catch (err) {
      return new Response(`bad asset url: ${String(err)}`, { status: 400 });
    }
  });
}
