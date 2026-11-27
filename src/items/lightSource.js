// Every write of an entity light source goes through setLightSource, so listeners hear each change at once.
const listeners = new Set();
let _faultSaid = false;

export function setLightSource(entity, item) {
  if (!entity) return;
  const was = entity.lightSource ?? null;
  const now = item ?? null;
  entity.lightSource = now;
  if (was === now) return;
  for (const f of [...listeners]) {
    try { f(entity, now, was); } catch (e) {
      if (!_faultSaid) { _faultSaid = true; console.warn(`[light-source] a listener threw and was skipped: ${e?.message ?? e}`); }
    }
  }
}

export function addLightSourceListener(f) {
  listeners.add(f);
  return () => { listeners.delete(f); };
}

export const lightSourceListenerCount = () => listeners.size;
