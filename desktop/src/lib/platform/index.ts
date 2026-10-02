/**
 * Platform barrel — the renderer's ONLY gateway to native capabilities
 * (window.jstudioNative, injected by electron/preload.ts).
 *
 * Domain modules: invoke (commands + asset URLs), events, window,
 * webviewWindow (child windows), dialog, clipboard, opener.
 */

export { invoke, convertFileSrc } from './invoke';
export {
  listen,
  once,
  emit,
  type PlatformEvent,
  type UnlistenFn,
} from './events';
export { Window, getCurrentWindow, subscribeFocusChanged } from './window';
export {
  WebviewWindow,
  getCurrentWebviewWindow,
  type WebviewWindowOptions,
} from './webviewWindow';
export {
  open,
  save,
  type OpenDialogOptions,
  type SaveDialogOptions,
  type DialogFilter,
} from './dialog';
export { readText, readImage } from './clipboard';
export { openUrl } from './opener';
