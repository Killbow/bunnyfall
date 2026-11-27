// @ts-check

// The game's side of this channel is src/poi/poiLive.js; the 'draft' and 'ready' messages must match it.
export const POI_LIVE_CHANNEL = 'bunnyfall-poi-live';

export function liveUrl(loc = globalThis.location) {
  if (!loc) return '/play/?live&nointro';
  if (/^(localhost|127\.0\.0\.1)$/.test(loc.hostname)) return `${loc.protocol}//${loc.hostname}:5173/play/?live&nointro`;
  return new URL('../play/?live&nointro', loc.href).href;
}

/**
 * @param {{ getDoc: () => any, getId: () => string | null, getRev: () => number, getAuth: () => string | null, openTab?: (url: string) => any, delay?: number }} deps
 */
export function createLiveLink({ getDoc, getId, getRev, getAuth, openTab = (u) => globalThis.open?.(u, 'bunnyfall-live'), delay = 200 }) {
  const ch = typeof globalThis.BroadcastChannel === 'function' ? new globalThis.BroadcastChannel(POI_LIVE_CHANNEL) : null;
  let on = false, timer = /** @type {any} */ (null);
  const send = (go) => {
    const doc = getDoc(), id = getId();
    if (!ch || !doc || !id) return false;
    ch.postMessage({ type: 'draft', id, rev: getRev(), doc: JSON.parse(JSON.stringify(doc)), auth: getAuth(), go: !!go });
    return true;
  };
  if (ch) ch.onmessage = (e) => { if (on && e.data?.type === 'ready') send(true); };
  return {
    supported: () => !!ch,
    active: () => on,
    open() { on = true; const w = openTab(liveUrl()); send(true); return !!w || true; },
    go() { return send(true); },
    changed() { if (!on) return; clearTimeout(timer); timer = setTimeout(() => send(false), delay); },
    stop() { on = false; clearTimeout(timer); },
  };
}
