// @ts-check
// The stamp is saved (`WARDEN_VENDOR`) so the offline road clock outlives a load; online, only the cell throws. A
// cell throw of my team (`onParkYeet`) waits for the next street frame and is never applied during a load.
import { wardenStamp, validWardenStamp, stampFits, wardenWordOf, offlineDue, footprintRoadShare, landingsOf, strayOf, horseThrownWith, WARDEN_ROAD_SHARE, WARDEN_SAME_NATIVES, WARDEN_TEXT } from '../wagonWarden.js';
import { findTownPath, pathLine } from '../../systems/livingWorld/townPaths.js';
import { NAV_CELL } from '../../world/cityNavigation.js';
import { WAGON_MODE, HORSE_MODE } from '../horseCartLaw.js';
import { mapPixelOfWire, cellRoomOfWire, parkSpotOf } from '../../net/wire.js';

export const WARDEN_SHOW_REACH = 200;
export const WARDEN_APPROACH_FROM = 18;
export const WARDEN_CELL_SEARCH = 6;

/**
 * Returns undefined where nothing is built, so the caller asks again next frame, and null on built ground that no
 * watch keeps.
 * @param {Iterable<any>} built
 * @param {(px: number, py: number) => number[]} translate
 * @param {number} size
 * @param {number} x
 * @param {number} z
 */
export function wardenTownIn(built, translate, size, x, z) {
  let ground = false;
  for (const p of built) {
    const t = translate(p.px, p.py);
    if (x < t[0] || z < t[2] || x >= t[0] + size || z >= t[2] + size) continue;
    ground = true;
    const nav = p.wardenTown != null && p.locOrigin ? p.population?.nav : null;
    if (!nav) continue;
    const ox = t[0] + p.locOrigin[0], oz = t[2] + p.locOrigin[2], u = x - ox, v = z - oz;
    if (u < 0 || v < 0 || u >= nav.width * NAV_CELL || v >= nav.height * NAV_CELL) continue;
    return { town: p.wardenTown, nav, places: p.population?.places ?? null, local: [u, v], toScene: (/** @type {number} */ a, /** @type {number} */ b) => [a + ox, b + oz] };
  }
  return ground ? null : undefined;
}

/**
 * @param {Iterable<any>} built
 * @param {(px: number, py: number) => number[]} translate
 * @param {number} px
 * @param {number} py
 */
export function wardenTownOfPixel(built, translate, px, py) {
  for (const p of built) {
    if (p.px !== px || p.py !== py) continue;
    const nav = p.wardenTown != null && p.locOrigin ? p.population?.nav : null;
    if (!nav) return null;
    const t = translate(p.px, p.py), ox = t[0] + p.locOrigin[0], oz = t[2] + p.locOrigin[2];
    return { town: p.wardenTown, nav, places: p.population?.places ?? null, local: null, toScene: (/** @type {number} */ a, /** @type {number} */ b) => [a + ox, b + oz] };
  }
  return null;
}

/** @param {{ hcc: any, runtime: () => any, shows: any, online: () => any, toWire: (scene: number[]) => number[], toScene: (wire: number[]) => number[], townAt: (x: number, z: number) => ({ town: number, nav: any, local: number[], toScene: (u: number, v: number) => number[] }|null|undefined), townName?: (town: number) => string, wallNow?: () => number, eye?: () => (number[]|null), street?: () => boolean, notify?: (lines: string[]) => void, myKey?: () => (string|null), thrown?: () => void, }} deps */
export function createWagonWarden({
  hcc, runtime, shows, online, toWire, toScene, townAt, townName = () => '', wallNow = () => Date.now(),
  eye = () => null, street = () => true, notify = () => {}, myKey = () => null,
  thrown = () => {},
}) {
  /** @type {any} */
  let stamp = null;
  /** @type {any[]} */
  const pending = [];

  function anchorOf() {
    if (hcc.enabled === false) return null;
    const v = runtime()?.view?.();
    const st = v?.state;
    if (!st || v.persistence === false || st.Mode !== WAGON_MODE.Deployed) return null;
    const a = [st.WorldX, st.WorldZ];
    return a.every(Number.isFinite) ? a : null;
  }
  function myHorseThrown(a) {
    const st = runtime()?.view?.()?.state;
    return !!st && st.HorseMode === HORSE_MODE.LooseStationary && horseThrownWith(a, [st.HorseWorldX, st.HorseWorldZ]);
  }
  function stampAt(a, now) {
    const st = runtime()?.view?.()?.state;
    const at = toScene([a[0], 0, a[1]]);
    const t = townAt(at[0], at[2]);
    if (t === undefined) return undefined;
    if (t === null) return wardenStamp(a, now);
    const box = hcc.parts?.box ?? null;
    if (!box) return undefined;
    const fl = Math.sqrt((st?.HeadingX ?? 0) ** 2 + (st?.HeadingZ ?? 1) ** 2) || 1;
    const fx = (st?.HeadingX ?? 0) / fl, fz = (st?.HeadingZ ?? 1) / fl;
    const cx = (box[0] + box[3]) / 2, cz = (box[2] + box[5]) / 2;
    const mid = [t.local[0] + cx * fz + cz * fx, t.local[1] - cx * fx + cz * fz];
    const nav = t.nav;
    const share = footprintRoadShare((gx, gy) => nav.weightAt(gx, gy), nav.width, nav.height, NAV_CELL, mid, [fx, fz], [(box[3] - box[0]) / 2, (box[5] - box[2]) / 2]);
    // Prefer a landing in the same map pixel, because a parked wagon is drawn only there. Next best is the same
    // cell, because a word from another cell drops the cell record.
    const lands = landingsOf([0, 0, nav.width * NAV_CELL, nav.height * NAV_CELL], mid, strayOf(a)).map((l) => {
      const sc = t.toScene(l[0], l[1]), w = toWire([sc[0], 0, sc[1]]);
      return [Math.round(w[0]), Math.round(w[2])];
    });
    const px = mapPixelOfWire(a[0], a[1]), cell = cellRoomOfWire(a[0], a[1]);
    const ly = lands.find((l) => { const q = mapPixelOfWire(l[0], l[1]); return q[0] === px[0] && q[1] === px[1]; })
      ?? lands.find((l) => cellRoomOfWire(l[0], l[1]) === cell) ?? lands[0];
    return wardenStamp(a, now, t.town, share >= WARDEN_ROAD_SHARE, ly);
  }

  function approach(lift, away) {
    const t = townAt(lift[0], lift[1]);
    if (!t) return null;
    const nav = t.nav;
    const walkable = (gx, gy) => gx >= 0 && gy >= 0 && gx < nav.width && gy < nav.height && nav.weightAt(gx, gy) > 0;
    const near = (gx, gy) => {
      for (let r = 0; r <= WARDEN_CELL_SEARCH; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (walkable(gx + dx, gy + dy)) return [gx + dx, gy + dy];
      }
      return null;
    };
    const cellOf = (u, v) => [Math.floor(u / NAV_CELL), Math.floor(v / NAV_CELL)];
    const end = near(...cellOf(t.local[0], t.local[1]));
    const start = near(...cellOf(t.local[0] - away[0] * WARDEN_APPROACH_FROM, t.local[1] - away[1] * WARDEN_APPROACH_FROM));
    if (!end || !start) return null;
    const cells = findTownPath(nav, start, end, { maxExpansions: 6000 });
    if (!cells || cells.length < 2) return null;
    const pts = pathLine(cells).pts.map((p) => t.toScene(p[0], p[1]));
    pts.push([lift[0], lift[1]]);
    return pts;
  }

  const near = (at) => { const e = eye(); return !!e && !!at && Math.sqrt((e[0] - at[0]) ** 2 + (e[2] - at[2]) ** 2) <= WARDEN_SHOW_REACH; };
  const onSpot = (snap, spot) => { if (!snap || !spot) return false; const w = toWire(snap.at); return Math.abs(w[0] - spot[0]) <= WARDEN_SAME_NATIVES && Math.abs(w[2] - spot[1]) <= WARDEN_SAME_NATIVES; };
  function throwMine(from, to) {
    const rt = runtime();
    const was = anchorOf();
    const town = stampFits(stamp, was) && stamp.tw !== null ? townName(stamp.tw) : '';
    // Snapshot the team before `adoptYeet` moves the save.
    const snap = street() && was ? hcc.teamSnapshot?.('', myHorseThrown(was)) ?? null : null;
    if (!rt?.adoptYeet?.(from, to)) return false;
    const landed = anchorOf();
    const alive = () => { const a = anchorOf(); return !!a && !!landed && Math.abs(a[0] - landed[0]) <= WARDEN_SAME_NATIVES && Math.abs(a[1] - landed[1]) <= WARDEN_SAME_NATIVES; };
    if (snap && near(snap.at)) shows.start({ key: 'mine', owners: [''], snap, origin: toWire(snap.at), landing: to, approach, alive });
    notify([WARDEN_TEXT.thrown(town), WARDEN_TEXT.fetch]);
    thrown();
    return true;
  }

  return {
    tick() {
      while (pending.length) { const y = pending.shift(); throwMine(y.from, y.to); }
      const a = anchorOf();
      if (!a) return;
      if (!stampFits(stamp, a)) { const s = stampAt(a, wallNow()); if (s) stamp = s; }
      if (!online() && offlineDue(stamp, a, wallNow())) throwMine(a, stamp.ly);
    },
    word: (/** @type {number[]} */ anchor) => wardenWordOf(stamp, anchor),
    onParkYeet(/** @type {string} */ room, /** @type {{at: number, from: number[], to: number[], k?: string|null}} */ y) {
      if (!y) return false;
      const k = myKey();
      if (y.k && k && y.k !== k) return false;
      if (pending.some((p) => p.at === y.at && p.from[0] === y.from[0] && p.from[1] === y.from[1])) return false;
      pending.push({ at: y.at, from: [y.from[0], y.from[1]], to: [y.to[0], y.to[1]] });
      return true;
    },
    // Call this before the pool stores the word: a throw is new only while `hcc.kept` holds no entry with this `k`
    // and `y`.
    keptWord(/** @type {string} */ room, /** @type {any} */ e) {
      if (!e || typeof e.k !== 'string' || !Number.isFinite(e.y) || !Array.isArray(e.r?.ly) || !Array.isArray(e.r?.w)) return false;
      for (const x of hcc.kept?.values?.() ?? []) if (x.k === e.k && x.y === e.y) return false;
      const key = `kept:${e.k}`;
      if (shows.playing(key) || !street()) return false;
      const spot = parkSpotOf(e.r), horse = Array.isArray(e.r.h) && horseThrownWith(spot, [e.r.h[0], e.r.h[2]]);
      const live = typeof e.id === 'string' ? hcc.teamSnapshot?.(e.id, horse) ?? null : null;
      const kept = hcc.keptOwner(e.k);
      const [snap, owners] = onSpot(live, spot) ? [live, [e.id, kept]] : [hcc.teamSnapshot?.(kept, horse) ?? null, [kept]];
      if (!snap || !near(snap.at)) return false;
      const alive = () => { for (const x of hcc.kept?.values?.() ?? []) if (x.k === e.k && x.y === e.y) return true; return false; };
      return shows.start({ key, owners, snap, origin: toWire(snap.at), landing: e.r.ly, approach, alive });
    },
    getSaveData: () => (stamp ? { a: [...stamp.a], at: stamp.at, tw: stamp.tw, rd: stamp.rd, ly: stamp.ly ? [...stamp.ly] : null } : null),
    restoreSaveData(/** @type {any} */ rec) { stamp = validWardenStamp(rec); pending.length = 0; },
    get stamp() { return stamp; },
  };
}
