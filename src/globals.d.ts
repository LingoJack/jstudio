/// <reference types="vite/client" />

/** Application version, injected at build time from package.json. */
declare const __APP_VERSION__: string;

/** mammoth.browser.js bundle has no bundled type declarations. */
declare module 'mammoth/mammoth.browser' {
  export interface ConvertResult {
    value: string;
    messages: unknown[];
  }
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<ConvertResult>;
}
