// @ts-check
// BUNNYFALL (2026-11-13, the owner: "a purple sky pillar at the location of the event"): A STAFF EVENT'S PILLAR. Over each
// staff event running (systems/staffEvents.js staffRaids) a column of purple light straight up from its town's ground, seen
// from EVENT_PILLAR_PX map pixels round, outside alone, coming up and thinning away as the event begins and ends. It is the
// Hollow's omen pass (render/superDungeon/sdOmenPass.js, the gate's beacon) in purple. A module the host wires (HOST-SPLIT):
// the host hands its doors; nothing here stands a foe, and the column is the same on every machine (the event's own pixel).
import { SdOmenPassRenderer } from '../render/superDungeon/sdOmenPass.js';

/** Its light, display-encoded as the beacons are: violet, near white at its heart. */
export const EVENT_PILLAR_COLOR = Object.freeze([0.62, 0.22, 1.0]);
/** The pixels round the player it is seen from (the Hollow's is further), and how long it takes to rise and to go (s). */
export const EVENT_PILLAR_PX = 4;
export const EVENT_PILLAR_FADE_S = 6;
/** A pixel's width (m): where an event has no built town to stand on, its column stands at the pixel's middle. */
const PIXEL_M = 819.2;

/**
 * `deps`: `gl`; `events()` the staff raids running (each `{ staff: { id }, px, py }`); `built()` the world's built pixels
 * (`{ px, py, locOrigin }`); `translation(px, py)` a pixel's place in the scene now; `heightAt(x, z)` the ground, NaN where
 * none; `pixel()` the player's travel pixel `{ x, y }`; `now()` seconds.
 * @param {{ gl: WebGL2RenderingContext | null, events: () => any[], built: () => Iterable<any>, translation: (px: number, py: number) => number[], heightAt: (x: number, z: number) => number, pixel: () => { x: number, y: number }, now: () => number }} deps
 */
export function createEventPillar({ gl, events, built, translation, heightAt, pixel, now }) {
  /** @type {SdOmenPassRenderer | null | undefined} */
  let pass;
  /** id -> { px, py, fade } */
  const fades = new Map();
  let lastT = /** @type {number | null} */ (null);

  /** The column's foot: the town's frame where its pixel is built, else the pixel's middle, on the ground there. */
  function footOf(/** @type {number} */ px, /** @type {number} */ py) {
    const t = translation(px, py);
    let lx = PIXEL_M / 2, lz = PIXEL_M / 2;
    for (const p of built()) if (p.px === px && p.py === py) { if (Array.isArray(p.locOrigin)) { lx = p.locOrigin[0]; lz = p.locOrigin[2]; } break; }
    const x = t[0] + lx, z = t[2] + lz;
    const y = heightAt(x, z);
    return [x, Number.isFinite(y) ? y : t[1], z];
  }

  function columns() {
    const t = now();
    const dt = lastT == null ? 0 : Math.max(0, Math.min(1, t - lastT));
    lastT = t;
    const live = new Set();
    for (const r of events() ?? []) {
      const id = r?.staff?.id;
      if (typeof id !== 'string' || !Number.isInteger(r.px) || !Number.isInteger(r.py)) continue;
      live.add(id);
      if (!fades.has(id)) fades.set(id, { px: r.px, py: r.py, fade: 0 });
    }
    const me = pixel();
    const out = [];
    for (const [id, e] of fades) {
      e.fade = Math.max(0, Math.min(1, e.fade + (live.has(id) ? dt : -dt) / EVENT_PILLAR_FADE_S));
      if (!live.has(id) && e.fade <= 0) { fades.delete(id); continue; }
      if (Math.max(Math.abs(me.x - e.px), Math.abs(me.y - e.py)) > EVENT_PILLAR_PX) continue;
      out.push({ origin: footOf(e.px, e.py), fade: e.fade });
    }
    return out;
  }

  return {
    /** Whether any event stands (the host builds the pass's arguments only then). */
    showing: () => (events() ?? []).length > 0 || fades.size > 0,
    /** The pillars' pass, after the world's: how many it drew. */
    draw(proj, view, eye, seconds, fog = null) {
      const list = columns();
      if (!list.length || !gl) return 0;
      if (pass === undefined) { try { pass = new SdOmenPassRenderer(gl, EVENT_PILLAR_COLOR); } catch (e) { console.warn('[event] the pillar would not build', e?.message ?? e); pass = null; } }
      return pass ? pass.draw(list, proj, view, eye, seconds, fog) : 0;
    },
    /** For the probes. */
    list: () => columns(),
  };
}
