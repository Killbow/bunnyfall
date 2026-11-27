import { framesBegun } from '../platform/frameClock.js';

export const FIRST_FRAME_WAIT_MS = 15000;

/** @param {() => void} fn */
export function afterFirstFrame(fn) {
  const raf = globalThis.requestAnimationFrame;
  if (typeof raf !== 'function' || typeof globalThis.document === 'undefined') { void Promise.resolve().then(fn); return; }
  const idle = globalThis.requestIdleCallback;
  const run = () => (typeof idle === 'function' ? idle(() => fn(), { timeout: 1000 }) : setTimeout(fn, 0));
  const from = framesBegun(), until = performance.now() + FIRST_FRAME_WAIT_MS;
  // A rising `framesBegun` count means a frame has started; the next animation frame callback runs after that frame
  // is drawn.
  const wait = () => raf(() => (framesBegun() > from || performance.now() > until ? raf(run) : wait()));
  wait();
}
