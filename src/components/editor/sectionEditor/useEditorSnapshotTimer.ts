/**
 * useEditorSnapshotTimer — periodically dumps the live TipTap editor JSON
 * (per-section `editor.getJSON()`) to disk via `ipc.saveDocSnapshot`,
 * BYPASSING the Block[] serialization. Crash-recovery side-channel.
 *
 * Motivation: serialization bugs (like the one that dropped lists typed
 * inside table cells) corrupt `documents.body` AND pollute the backup
 * chain (which snapshots the already-corrupted DB body). This timer writes
 * the raw editor state directly to `.snapshots/editor.{n}.json` so the
 * pre-serialization content survives even when the adapter loses data.
 *
 * Best-effort: errors are logged via the project logger and swallowed.
 * Does NOT replace `scheduleDocumentSave` — Block[] remains canonical.
 *
 * Rotated on the Rust side (keeps last 3). Per-window: each window owns
 * its own timer; last-write-wins on the same on-disk path is acceptable
 * for crash recovery.
 */

import { useEffect, useRef } from 'react';
import type { Editor, JSONContent } from '@tiptap/react';
import { ipc } from '../../../lib/core/ipc';
import { logger } from '../../../lib/core/logger';

/** Snapshot interval (ms). Co-located constant — hook-specific. */
const SNAPSHOT_INTERVAL_MS = 30_000;

interface UseEditorSnapshotTimerArgs {
  editorDocId: string | undefined;
  sectionEditorsRef: React.MutableRefObject<Map<string, Editor>>;
  sectionOrderRef: React.MutableRefObject<string[]>;
  showSkeleton: boolean;
  /** Gate: skip when static/read-only mode (no live edits to capture). */
  enabled: boolean;
}

export function useEditorSnapshotTimer({
  editorDocId,
  sectionEditorsRef,
  sectionOrderRef,
  showSkeleton,
  enabled,
}: UseEditorSnapshotTimerArgs) {
  // Refs to avoid stale closures inside the interval callback.
  const docIdRef = useRef(editorDocId);
  docIdRef.current = editorDocId;
  const skeletonRef = useRef(showSkeleton);
  skeletonRef.current = showSkeleton;

  // The snapshot function lives in a ref so the interval callback never
  // goes stale, and the interval effect doesn't re-subscribe on every render.
  const takeSnapshot = useRef(() => {
    const docId = docIdRef.current;
    if (!docId) return;
    if (skeletonRef.current) return; // Still loading — partial snapshot useless.
    const order = sectionOrderRef.current;
    const editors = sectionEditorsRef.current;
    // Skip if not all sections are mounted yet (progressive mount in flight).
    if (editors.size < order.length) return;

    const sections: JSONContent[] = [];
    for (const id of order) {
      const ed = editors.get(id);
      if (!ed || ed.isDestroyed) return; // Missing section — skip this tick.
      sections.push(ed.getJSON());
    }

    ipc
      .saveDocSnapshot(docId, sections)
      .catch((e) => logger.warn('snapshot', `saveDocSnapshot failed: ${String(e)}`));
  });

  // ── Interval timer ──
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => takeSnapshot.current(), SNAPSHOT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [enabled]);

  // ── Flush a final snapshot on page hide / unload ──
  useEffect(() => {
    if (!enabled) return;
    const flush = () => takeSnapshot.current();
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [enabled]);
}
