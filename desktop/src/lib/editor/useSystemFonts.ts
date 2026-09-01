/**
 * Fonts installed on this machine, loaded once per session.
 *
 * Chromium's Local Font Access API (`navigator.fonts`) is unavailable in
 * Electron, so the family list comes from the sidecar
 * (`list_system_fonts`). Cached at module scope so re-opening the
 * settings panel does not re-query the OS.
 */

import { useEffect, useState } from 'react';
import { ipc } from '../core/ipc';
import { logger } from '../core/logger';
import { toSystemFontPreset, type FontPreset } from './fonts';

let cached: FontPreset[] | null = null;
let pending: Promise<FontPreset[]> | null = null;

function loadSystemFonts(): Promise<FontPreset[]> {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  pending = ipc
    .listSystemFonts()
    .then((families) => {
      cached = families.map(toSystemFontPreset);
      return cached;
    })
    .catch((err) => {
      logger.warn('fonts', `list_system_fonts failed: ${String(err)}`);
      cached = [];
      return cached;
    });
  return pending;
}

/** Installed system fonts as presets (empty until loaded, or on failure). */
export function useSystemFonts(): FontPreset[] {
  const [fonts, setFonts] = useState<FontPreset[]>(() => cached ?? []);

  useEffect(() => {
    if (cached) return;
    let alive = true;
    void loadSystemFonts().then((list) => {
      if (alive) setFonts(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  return fonts;
}
