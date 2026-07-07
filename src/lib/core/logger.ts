/**
 * Lightweight logger — silences debug/info in production builds.
 *
 * `import.meta.env.PROD` is a compile-time constant in Vite, so the
 * `if (!isProd)` branches around `debug`/`info` are dead-code eliminated
 * in production and emit nothing. `warn`/`error` always emit so real
 * runtime problems are never hidden.
 *
 * Prefer `logger.debug` over `console.log` for development diagnostics.
 */

const isProd = import.meta.env.PROD;

export const logger = {
  debug(...args: unknown[]) {
    if (!isProd) console.debug(...args);
  },
  info(...args: unknown[]) {
    if (!isProd) console.info(...args);
  },
  warn(...args: unknown[]) {
    console.warn(...args);
  },
  error(...args: unknown[]) {
    console.error(...args);
  },
};
