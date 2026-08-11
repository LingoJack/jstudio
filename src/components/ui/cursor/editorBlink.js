const BLINK_SOLID_MS = 400;
const BLINK_PERIOD_MS = 700;
const THROTTLE_FPS = 20;
function computeBlink(cursorVisibleStartTime, cursorStyle) {
  const elapsed = performance.now() - cursorVisibleStartTime;
  if (elapsed < BLINK_SOLID_MS) return 1;
  if (cursorStyle === "block") {
    const t = (elapsed - BLINK_SOLID_MS) % BLINK_PERIOD_MS;
    return t < BLINK_PERIOD_MS * 0.5 ? 1 : 0;
  }
  const phase = (elapsed - BLINK_SOLID_MS) % BLINK_PERIOD_MS / BLINK_PERIOD_MS;
  const wave = (Math.cos(phase * Math.PI * 2) + 1) * 0.5;
  const floor = 0.15;
  return floor + (1 - floor) * wave;
}
export {
  BLINK_PERIOD_MS,
  BLINK_SOLID_MS,
  THROTTLE_FPS,
  computeBlink
};
