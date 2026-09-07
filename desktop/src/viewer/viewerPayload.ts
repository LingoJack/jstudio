/**
 * Data contract between the HTML export and the standalone viewer bundle.
 *
 * The exported file embeds this JSON in a `<script type="application/json">`
 * tag; `src/viewer/main.tsx` reads it and renders the document with the real
 * editor components — so folding, copy, preview toggles and every other node
 * view interaction behave exactly as they do in the app.
 */

import type { Block } from '../types';

export interface ViewerPayload {
  doc: {
    id: string;
    title: string;
  };
  /** Document body, in our own `Block[]` model. */
  blocks: Block[];
  /** Theme at export time — the viewer has no settings to read. */
  dark: boolean;
  language: 'zh' | 'en';
  /**
   * Document assets (`assets/<file>` → base64 bytes) so image and file node
   * views can resolve them without the sidecar.
   */
  assets: Record<string, string>;
}
