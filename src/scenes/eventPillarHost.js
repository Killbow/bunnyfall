// @ts-check
// BUNNYFALL (2026-11-13, the owner: "a purple sky pillar at the location of the event"): A STAFF EVENT'S PILLAR. Over each
// staff event running (systems/staffEvents.js staffRaids) a column of purple light straight up from its town's ground, seen
// from EVENT_PILLAR_PX map pixels round, outside alone, coming up and thinning away as the event begins and ends. It is the
// Hollow's omen pass (render/superDungeon/sdOmenPass.js, the gate's beacon) in purple. A module the host wires (HOST-SPLIT):
// the host hands its doors; nothing here stands a foe, and the column is the same on every machine (the event's own pixel).
import { SdOmenPassRenderer } from '../render/superDungeon/sdOmenPass.js';
import { RiteSmokeRenderer, RITE_SMOKE_PROGRAMS } from '../render/riteSmoke.js';
import { compiledPass } from '../render/glProgram.js';

/** Its light, display-encoded as the beacons are: violet, near white at its heart. */
export const EVENT_PILLAR_COLOR = Object.freeze([0.62, 0.22, 1.0]);
/** The pixels round the player it is seen from (the Hollow's is further), and how long it takes to rise and to go (s). */
export const EVENT_PILLAR_PX = 4;
export const EVENT_PILLAR_FADE_S = 6;
/** The smoke over the event's town: columns spread over its houses (never fewer than SMOKE_GAP_M apart), each this big
 *  against the rite's (340 m), as many as SMOKE_MAX. */
export const EVENT_SMOKE_SCALE = 0.3;
export const EVENT_SMOKE_MAX = 7;
export const EVENT_SMOKE_GAP_M = 70;
/** The sky about the pillar: dark purple within EVENT_SKY_M of it, whole inside EVENT_SKY_FULL_M, and how strongly it
 *  takes the sky (the horizon's fog, the sky's own mix) and its colour. */
export const EVENT_SKY_M = 120;
export const EVENT_SKY_FULL_M = 50;
export const EVENT_SKY_MIX = 0.88;
export const EVENT_SKY_COLOR = Object.freeze([0.11, 0.035, 0.2]);
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
  const smokePass = gl ? compiledPass(gl, RITE_SMOKE_PROGRAMS, () => new RiteSmokeRenderer(gl, { max: EVENT_SMOKE_MAX }), (e) => console.warn('[event] the smoke would not build', e?.message ?? e)) : null;
  let smoke = null;

  /** The column's foot: the town's frame where its pixel is built, else the pixel's middle, on the ground there. */
  function footOf(/** @type {number} */ px, /** @type {number} */ py) {
    const t = translation(px, py);
    let lx = PIXEL_M / 2, lz = PIXEL_M / 2;
    for (const p of built()) if (p.px === px && p.py === py) { if (Array.isArray(p.locOrigin)) { lx = p.locOrigin[0]; lz = p.locOrigin[2]; } break; }
    const x = t[0] + lx, z = t[2] + lz;
    const y = heightAt(x, z);
    return [x, Number.isFinite(y) ? y : t[1], z];
  }

  /** A string's hash, 0..1 (the same on every machine). */
  function unit(/** @type {string} */ str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100003) / 100003;
  }

  /** The event town's smoke, in the pixel's frame: houses taken in the event's own order, each at least EVENT_SMOKE_GAP_M
   *  from those taken (so the columns spread over the town and stand in no ring), at most EVENT_SMOKE_MAX. */
  function smokeOf(/** @type {string} */ id, /** @type {number} */ px, /** @type {number} */ py) {
    let frames = null;
    for (const p of built()) if (p.px === px && p.py === py) { frames = p.homeFrames ?? null; break; }
    if (!frames) return null;
    const houses = [];
    for (const [bk, f] of frames) {
      const b = f?.box;
      if (!Array.isArray(b) || b.length < 6) continue;
      houses.push({ k: unit(`${id}:${bk}`), at: [(b[0] + b[3]) / 2, b[4], (b[2] + b[5]) / 2] });
    }
    houses.sort((a, b) => a.k - b.k);
    const out = [];
    for (const h of houses) {
      if (out.length >= EVENT_SMOKE_MAX) break;
      if (out.every((o) => Math.hypot(o[0] - h.at[0], o[2] - h.at[2]) >= EVENT_SMOKE_GAP_M)) out.push(h.at);
    }
    return out.length ? out : null;
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
      if (!fades.has(id)) fades.set(id, { id, px: r.px, py: r.py, fade: 0, local: null, again: 0 });
    }
    const me = pixel();
    const out = [];
    for (const [id, e] of fades) {
      e.fade = Math.max(0, Math.min(1, e.fade + (live.has(id) ? dt : -dt) / EVENT_PILLAR_FADE_S));
      if (!live.has(id) && e.fade <= 0) { fades.delete(id); continue; }
      if (Math.max(Math.abs(me.x - e.px), Math.abs(me.y - e.py)) > EVENT_PILLAR_PX) continue;
      out.push({ origin: footOf(e.px, e.py), fade: e.fade, px: e.px, py: e.py });
      if (!e.local && t >= e.again) { e.local = smokeOf(e.id, e.px, e.py); e.again = t + 5; }
    }
    return out;
  }

  /** The smoke's columns now, in the scene: [{ origin, fade, scale }]. */
  function smokes(/** @type {any[]} */ list) {
    const out = [];
    for (const c of list) {
      const e = [...fades.values()].find((x) => x.px === c.px && x.py === c.py);
      if (!e?.local) continue;
      const base = translation(e.px, e.py);
      for (const a of e.local) out.push({ origin: [a[0] + base[0], a[1] + base[1], a[2] + base[2]], fade: e.fade, scale: EVENT_SMOKE_SCALE });
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
      const sm = smokes(list);
      if (sm.length) { if (!smoke && smokePass) smoke = smokePass(); smoke?.draw(sm, proj, view, eye, seconds, fog); }
      if (pass === undefined) { try { pass = new SdOmenPassRenderer(gl, EVENT_PILLAR_COLOR); } catch (e) { console.warn('[event] the pillar would not build', e?.message ?? e); pass = null; } }
      return pass ? pass.draw(list, proj, view, eye, seconds, fog) : 0;
    },
    /** The pillar's foot for a staff raid (`{ staff: { id } }`), in the scene now: [x, y, z], or null where none stands. */
    footOf(/** @type {any} */ raid) {
      const e = fades.get(raid?.staff?.id);
      return e ? footOf(e.px, e.py) : (Number.isInteger(raid?.px) && Number.isInteger(raid?.py) ? footOf(raid.px, raid.py) : null);
    },
    /** The sky's weight about the nearest event's pillar from `eye` (0 away, 1 within EVENT_SKY_FULL_M), times its fade. */
    skyWeight(/** @type {ArrayLike<number>} */ eye) {
      let w = 0;
      for (const c of columns()) {
        const d = Math.hypot(c.origin[0] - eye[0], c.origin[2] - eye[2]);
        const k = Math.max(0, Math.min(1, (EVENT_SKY_M - d) / (EVENT_SKY_M - EVENT_SKY_FULL_M)));
        w = Math.max(w, k * k * (3 - 2 * k) * c.fade);
      }
      return w;
    },
    /** The fog's colour drawn toward the event's purple by weight `w` (a new array; `color` is not written). */
    tint(/** @type {ArrayLike<number>} */ color, /** @type {number} */ w) {
      const out = new Float32Array(color.length);
      for (let i = 0; i < out.length; i++) out[i] = i < 3 ? color[i] + (EVENT_SKY_COLOR[i] - color[i]) * Math.min(1, w) : color[i];
      return out;
    },
    /** For the probes. */
    list: () => columns(),
  };
}
