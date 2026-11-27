// @ts-check
import { RiteSmokeRenderer, RITE_SMOKE_PROGRAMS } from '../render/riteSmoke.js';
import { compiledPass } from '../render/glProgram.js';
import { musterSides } from './raidMuster.js';

export const RAID_SMOKE_ON = true;
export const CAMP_SMOKE_SCALE = 0.42;
export const HOUSE_SMOKE_SCALE = 0.22;
export const HOUSES_PER_CAMP = 2;
export const HOUSE_SMOKE_REACH_M = 90;
export const RAID_SMOKE_FADE_S = 10;
export const RAID_SMOKE_AGAIN_S = 5;
export const RAID_SMOKE_MAX = 6;

/** @param {{ gl: WebGL2RenderingContext | null, raids: () => any[], keyOf: (raid: any) => string, sites: () => any, built: () => Iterable<any>, translation: (px: number, py: number) => number[], now: () => number }} deps */
export function createRaidSmoke({ gl, raids, keyOf, sites, built, translation, now }) {
  const passOf = gl ? compiledPass(gl, RITE_SMOKE_PROGRAMS, () => new RiteSmokeRenderer(gl, { max: RAID_SMOKE_MAX }), (e) => console.warn('[raid] the smoke would not build', e?.message ?? e)) : null;
  let pass = null;
  // Pillars are stored relative to the raid pixel, so a world origin shift needs no update here.
  const towns = new Map();
  let lastT = null;

  function pillarsOf(raid) {
    const s = sites();
    if (!s?.way || !Number.isInteger(raid.px) || !Number.isInteger(raid.py)) return null;
    // `sites().way` falls back to the town under the player when the raid pixel is not built, so confirm the pixel
    // is built first.
    let mine = false;
    for (const p of built()) if (p.px === raid.px && p.py === raid.py) { mine = true; break; }
    if (!mine || !s.townAtPixel?.(raid)) return null;
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
        houses.push({ bk, at: [(b[0] + b[3]) / 2, b[4], (b[2] + b[5]) / 2] });
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
    smoking: () => RAID_SMOKE_ON && (towns.size > 0 || (raids() ?? []).length > 0),
    draw(proj, view, eye, seconds, fog = null) {
      const list = smokes();
      if (!list.length) return 0;
      if (!pass && passOf) pass = passOf();
      if (!pass) return 0;
      list.sort((a, b) => Math.hypot(a.origin[0] - eye[0], a.origin[2] - eye[2]) - Math.hypot(b.origin[0] - eye[0], b.origin[2] - eye[2]));
      pass.draw(list, proj, view, eye, seconds, fog);
      return pass.drawn;
    },
    list: () => smokes(),
  };
}
