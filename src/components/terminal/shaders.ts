/**
 * Re-export shaders from the shared cursor module.
 * Kept for backwards compatibility — existing imports from
 * './terminal/shaders' or '../../components/terminal/shaders' still work.
 */
export { TRAIL_VS, TRAIL_FS } from '../cursor/shaders';
