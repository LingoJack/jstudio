/**
 * Core infrastructure barrel export.
 *
 * These modules are the foundation of the application:
 *   - ipc: Tauri IPC gateway for all backend operations
 *   - i18n: Internationalization (zh-CN / en-US)
 *   - commandRegistry: Command palette action registry
 */

export * from './ipc';
export { useI18n } from './i18n';
export type { Language, TranslationKey } from './i18n';
export { buildCommands } from './commandRegistry';