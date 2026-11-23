// @ts-check

// THE LIVE VIEW (`/play/?live`): the World Builder's open draft, standing in the real world. The builder (tools/poi-editor/)
// sends its draft on a same-origin BroadcastChannel; this lays it over the POI feed on this screen alone (poiFeed.setOverlay:
// never sent anywhere) and, when asked, takes the body to the POI's spot. The builder's bearer rides along only so the
// draft's uploaded models can be fetched. Not a DFU member. Refused online with the other powers (onlineLane.js).

export const POI_LIVE_CHANNEL = 'bunnyfall-poi-live';

const num = (v) => typeof v === 'number' && Number.isFinite(v);
/** A draft the host can stand: a place on the map and a list of parts. Anything else is ignored, never thrown at. */
export const liveDraftOk = (doc) => !!doc && typeof doc === 'object' && !!doc.place && num(doc.place.px) && num(doc.place.py) && num(doc.place.x) && num(doc.place.z)
  && doc.place.px >= 0 && doc.place.px < 1000 && doc.place.py >= 0 && doc.place.py < 500 && Array.isArray(doc.parts);

/**
 * @param {{ feed: { setOverlay: (m: Map<string, any>) => void }, goTo: (place: { px: number, py: number, x: number, z: number }, tries?: number) => void,
 *   say?: (line: string) => void, channel?: { postMessage: (m: any) => void, onmessage: any, close: () => void } | null }} deps
 */
export function createPoiLive({ feed, goTo, say = () => {}, channel = typeof globalThis.BroadcastChannel === 'function' ? new globalThis.BroadcastChannel(POI_LIVE_CHANNEL) : null }) {
  /** @type {Map<string, { doc: any, rev: number }>} */
  const drafts = new Map();
  let bearer = /** @type {string | null} */ (null);
  const lay = () => feed.setOverlay(new Map(drafts));
  const take = (/** @type {any} */ m) => {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'draft' && typeof m.id === 'string' && liveDraftOk(m.doc)) {
      if (typeof m.auth === 'string') bearer = m.auth;
      drafts.set(m.id, { doc: m.doc, rev: num(m.rev) ? m.rev : 0 });
      lay();
      if (m.go) goTo(m.doc.place);
    } else if (m.type === 'clear' && typeof m.id === 'string') {
      drafts.delete(m.id); lay();
    } else if (m.type === 'go' && m.place && num(m.place.px) && num(m.place.py) && num(m.place.x) && num(m.place.z)) {
      goTo(m.place);
    }
  };
  if (channel) {
    channel.onmessage = (e) => take(e.data);
    channel.postMessage({ type: 'ready' });
    say('Live view: waiting for the World Builder. In the builder, choose View, Live view.');
  } else say('Live view needs a browser with BroadcastChannel.');
  return { take, goTo, auth: () => bearer, drafts: () => drafts.size, close() { channel?.close(); drafts.clear(); lay(); } };
}
