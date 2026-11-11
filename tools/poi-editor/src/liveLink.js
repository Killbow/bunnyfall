// @ts-check

// THE LIVE VIEW'S BUILDER SIDE: opens the game at /play/?live&nointro in another tab and streams the open draft to it on a
// same-origin BroadcastChannel (src/scenes/poiLive.js is the game's half). The game lays the draft over the real world on
// its own screen; nothing is saved or sent to players. The bearer goes along only so a draft's uploaded models can load.

export const POI_LIVE_CHANNEL = 'bunnyfall-poi-live';

/** Where the game's live page is: next to /builder/ on a host, the dev game's port on localhost. */
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
  // the game says it is ready (a fresh tab, or a reload): hand it the draft and take it to the POI
  if (ch) ch.onmessage = (e) => { if (on && e.data?.type === 'ready') send(true); };
  return {
    supported: () => !!ch,
    active: () => on,
    /** Open the game's live tab and start streaming; if it is already open, send the draft and move it there. */
    open() { on = true; const w = openTab(liveUrl()); send(true); return !!w || true; },
    /** Take the game's body to the POI's spot without opening anything. */
    go() { return send(true); },
    /** The draft changed: send it a moment later (a drag makes many changes). */
    changed() { if (!on) return; clearTimeout(timer); timer = setTimeout(() => send(false), delay); },
    stop() { on = false; clearTimeout(timer); },
  };
}
