// @ts-check
// BUNNYFALL (2026-11-04, the owner: "visible smoke columns at gathering points"; asked, "camps plus burning houses"): A
// RAID'S SMOKE. Over each of a raided town's camps (systems/raidMuster.js - where its waves gather) a column of smoke,
// and a thinner one over each of the houses nearest it, burning while the raid lasts and thinning away after it - seen
// across the town and from the road in, on every machine: the camps are the raid's own (its tuple's sides, the town's
// own walk grid), the houses the camp's nearest by the town's own building frames, so every client sees the same.
// Drawn with the rite's pillar (render/riteSmoke.js), smaller. A module the host wires (HOST-SPLIT): the host hands its
// doors; nothing here stands a foe.
import { RiteSmokeRenderer, RITE_SMOKE_PROGRAMS } from '../render/riteSmoke.js';
import { compiledPass } from '../render/glProgram.js';
import { musterSides } from '../systems/raidMuster.js';

/** The pillars' sizes over the rite's (340 m): a camp's, a burning house's. */
export const CAMP_SMOKE_SCALE = 0.42;
export const HOUSE_SMOKE_SCALE = 0.22;
/** How many houses burn by each camp, and how far from it a house may stand to be one (m). */
export const HOUSES_PER_CAMP = 2;
export const HOUSE_SMOKE_REACH_M = 90;
/** How long the smoke takes to come and to go (s), and how soon a town's camps not found are asked again (s). */
export const RAID_SMOKE_FADE_S = 10;
export const RAID_SMOKE_AGAIN_S = 5;
/** The most pillars a frame: two camps and their houses. */
export const RAID_SMOKE_MAX = 6;

/**
 * `deps`: `gl`; `raids()` the raids burning now (active, not a staff event's); `keyOf(raid)`; `sites()` the raid sites
 * (scenes/raidSitesHost.js - `way`, `bigTown`); `built()` the world's built pixels (`{ px, py, homeFrames }`);
 * `translation(px, py)` a pixel's place in the scene now; `now()` seconds.
 * @param {{ gl: WebGL2RenderingContext | null, raids: () => any[], keyOf: (raid: any) => string, sites: () => any, built: () => Iterable<any>, translation: (px: number, py: number) => number[], now: () => number }} deps
 */
export function createRaidSmoke({ gl, raids, keyOf, sites, built, translation, now }) {
  const passOf = gl ? compiledPass(gl, RITE_SMOKE_PROGRAMS, () => new RiteSmokeRenderer(gl, { max: RAID_SMOKE_MAX }), (e) => console.warn('[raid] the smoke would not build', e?.message ?? e)) : null;
  let pass = null;
  /** key -> { px, py, local: [{ at: [x, y, z], scale }] | null, again, fade, last } - each raid's pillars in its pixel's frame
   *  (so the world's origin moving moves nothing here). */
  const towns = new Map();
  let lastT = null;

  /** The raid's pillars, its pixel's frame: its camps' hearts, and the houses nearest each. */
  function pillarsOf(raid) {
    const s = sites();
    if (!s?.way || !Number.isInteger(raid.px) || !Number.isInteger(raid.py)) return null;
    const base = translation(raid.px, raid.py);
    const camps = musterSides(raid, !!s.bigTown?.(raid)).map((side) => s.way(side, raid)?.[0]).filter((p) => Array.isArray(p));
    if (!camps.length) return null;
    const out = camps.map((c) => ({ at: [c[0] - base[0], c[1] - base[1], c[2] - base[2]], scale: CAMP_SMOKE_SCALE }));
    let frames = null;
    for (const p of built()) if (p.px === raid.px && p.py === raid.py) { frames = p.homeFrames ?? null; break; }
    if (frames) {
      const houses = [];
      for (const [bk, f] of frames) {
        const b = f?.box;
        if (!Array.isArray(b) || b.length < 6) continue;
        houses.push({ bk, at: [(b[0] + b[3]) / 2, b[4], (b[2] + b[5]) / 2] });   // the roof's top, its middle
      }
      const taken = new Set();
      for (const c of out.slice(0, camps.length)) {
        const near = houses.filter((h) => !taken.has(h.bk)).map((h) => ({ h, d: Math.hypot(h.at[0] - c.at[0], h.at[2] - c.at[2]) }))
          .filter((x) => x.d <= HOUSE_SMOKE_REACH_M).sort((x, y) => x.d - y.d || x.h.bk - y.h.bk).slice(0, HOUSES_PER_CAMP);
        for (const { h } of near) { taken.add(h.bk); out.push({ at: h.at, scale: HOUSE_SMOKE_SCALE }); }
      }
    }
    return out;
  }

  /** The frame's pillars, in the scene: [{ origin, fade, scale }]. */
  function smokes() {
    const t = now();
    const dt = lastT == null ? 0 : Math.max(0, Math.min(1, t - lastT));
    lastT = t;
    const burning = new Set();
    for (const r of raids() ?? []) {
      const key = keyOf(r);
      burning.add(key);
      let e = towns.get(key);
      if (!e) { e = { px: r.px, py: r.py, local: null, again: 0, fade: 0 }; towns.set(key, e); }
      if (!e.local && t >= e.again) { e.local = pillarsOf(r); e.again = t + RAID_SMOKE_AGAIN_S; }
    }
    const out = [];
    for (const [key, e] of towns) {
      e.fade = Math.max(0, Math.min(1, e.fade + (burning.has(key) ? dt : -dt) / RAID_SMOKE_FADE_S));
      if (!burning.has(key) && e.fade <= 0) { towns.delete(key); continue; }
      if (!e.local || e.fade <= 0) continue;
      const base = translation(e.px, e.py);
      for (const p of e.local) out.push({ origin: [p.at[0] + base[0], p.at[1] + base[1], p.at[2] + base[2]], fade: e.fade, scale: p.scale });
    }
    return out;
  }

  return {
    /** Whether any smoke stands - the host builds the pass's arguments only then. */
    smoking: () => towns.size > 0 || (raids() ?? []).length > 0,
    /** The smoke's pass, after the world's: how many pillars it drew. */
    draw(proj, view, eye, seconds, fog = null) {
      const list = smokes();
      if (!list.length) return 0;
      if (!pass && passOf) pass = passOf();
      if (!pass) return 0;
      // the nearest first, so the cap keeps the town the player is in
      list.sort((a, b) => Math.hypot(a.origin[0] - eye[0], a.origin[2] - eye[2]) - Math.hypot(b.origin[0] - eye[0], b.origin[2] - eye[2]));
      pass.draw(list, proj, view, eye, seconds, fog);
      return pass.drawn;
    },
    /** For the probes: the pillars as they would stand now. */
    list: () => smokes(),
  };
}
