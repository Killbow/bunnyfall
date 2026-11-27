// @ts-check
// A WebGL context is freed only when its canvas is collected, so each owner registers a release here and the
// page's pagehide runs them all. A leaf with no imports, so the entry's static reach stays small.

export function loseGlContext(gl) {
  try { gl?.getExtension?.('WEBGL_lose_context')?.loseContext(); } catch { }
}

const releasers = new Set();

export function onPageGone(fn) {
  releasers.add(fn);
  return () => releasers.delete(fn);
}

export function releaseGlContexts() {
  const all = [...releasers];
  releasers.clear();
  for (const fn of all) { try { fn(); } catch { } }
}
