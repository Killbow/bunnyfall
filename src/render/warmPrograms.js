// @ts-check

// Each step waits on its own idle callback, so compiles never run back to back in one callback.
/**
 * @param {ReadonlyArray<(() => void) | { start: () => () => boolean, run: () => void, need?: () => boolean }>} steps
 * @param {{ idle?: (fn: (v?: any) => void) => any, alive?: () => boolean }} [opts]
 */
export async function warmPrograms(steps, {
  idle = (fn) => (globalThis.requestIdleCallback
    ? globalThis.requestIdleCallback(fn, { timeout: 4000 })
    : setTimeout(fn, 1500)),
  alive = () => true,
} = {}) {
  let done = 0;
  for (const step of steps) {
    if (!alive()) break;
    await new Promise((resolve) => idle(resolve));
    if (!alive()) break;
    // A warm never fails: a step that throws is skipped, and the draw that needs its program builds it on demand.
    try {
      if (typeof step !== 'function') {
        // A step whose pass the draw already built is skipped, so its poll never starts a second compile.
        if (step.need?.() === false) continue;
        const ready = step.start();
        while (!ready()) {
          await new Promise((resolve) => idle(resolve));
          if (!alive()) return done;
          if (step.need?.() === false) break;
        }
        if (step.need?.() === false) continue;
      }
      (typeof step === 'function' ? step : step.run)();
      done++;
    } catch { }
  }
  return done;
}
