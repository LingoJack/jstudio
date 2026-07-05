/**
 * Core infrastructure barrel export.
 *
 * These modules are the foundation of the application:
 *   - storage: Tauri IPC abstraction for all file system operations
 *   - i18n: Internationalization (zh-CN / en-US)
 *   - commandRegistry: Command palette action registry
 */

export * from './storage';
export { storage } from './storage';
export { useI18n } from './i18n';
export type { Language, TranslationKey } from './i18n';
export { buildCommands } from './commandRegistry';