// @ts-check
// The gate site depends only on the day and the map files, so every client rolls the same spot and World of
// Daggerfall pieces yield to it. Positions here are meters local to the named pixel: x east, z north, (0, 0) at its
// south-west corner, and north is the row above (py - 1).
import { PIXEL_M } from '../net/gateLaw.js';
import { riteLocalOf } from '../net/gateRite.js';
import { wodPiecewise, WOD_SITE_OBJECT_RADIUS_M } from './roadClearance.js';

export const GATE_CLEAR_M = 24;
export const WOD_FLAT_GATE_CLEAR_M = 2;
export const RITE_CLEAR_M = 20;

/** @param {{day:number, px:number, py:number, spot:number[]}|null} site */
export function gateClearFor(site) {
  if (!site || !Number.isSafeInteger(site.px) || !Number.isSafeInteger(site.py) || !Array.isArray(site.spot)) return null;
  const [x, z] = site.spot;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const [rx, rz] = Number.isSafeInteger(site.day) ? riteLocalOf(site.day) : [NaN, NaN];
  return Object.freeze({ key: `${site.day}:${site.px},${site.py}`, day: site.day, px: site.px, py: site.py, x, z, rx, rz });
}

export const gatePointIn = (clear, px, py) => [(clear.px - px) * PIXEL_M + clear.x, (py - clear.py) * PIXEL_M + clear.z];
export const ritePointIn = (clear, px, py) => [(clear.px - px) * PIXEL_M + clear.rx, (py - clear.py) * PIXEL_M + clear.rz];

const boxNear = (cx, cz, x0, z0, x1, z1, r) => {
  const dx = Math.max(x0 - cx, 0, cx - x1), dz = Math.max(z0 - cz, 0, cz - z1);
  return dx * dx + dz * dz <= r * r;
};

/** @param {{px:number, py:number, x:number, z:number, rx?:number, rz?:number, r?:number, list?:ReadonlyArray<any>}|null} clear */
export function boxNearGate(clear, px, py, x0, z0, x1, z1, margin = 0) {
  if (!clear) return false;
  if (Array.isArray(clear.list)) return clear.list.some((c) => boxNearGate(c, px, py, x0, z0, x1, z1, margin));
  const [gx, gz] = gatePointIn(clear, px, py);
  if (Number.isFinite(clear.r)) return boxNear(gx, gz, x0, z0, x1, z1, clear.r + margin);
  if (boxNear(gx, gz, x0, z0, x1, z1, GATE_CLEAR_M + margin)) return true;
  if (!Number.isFinite(clear.rx) || !Number.isFinite(clear.rz)) return false;
  const [cx, cz] = ritePointIn(clear, px, py);
  return boxNear(cx, cz, x0, z0, x1, z1, RITE_CLEAR_M + margin);
}

export const EG_ARCH_ROCK_M = 14;
export const STAR_ROCK_M = 28;
export const CLEAR_KEY_JOIN = '|';
function membersFrom(items, id, prefix, r) {
  const out = [];
  const seen = new Set();
  for (const a of [...(items ?? [])].sort((p, q) => (p?.[id] < q?.[id] ? -1 : p?.[id] > q?.[id] ? 1 : 0))) {
    if (!a || typeof a[id] !== 'string' || seen.has(a[id]) || !Number.isSafeInteger(a.px) || !Number.isSafeInteger(a.py) || !Number.isFinite(a.x) || !Number.isFinite(a.z)) continue;
    seen.add(a[id]);
    out.push(Object.freeze({ key: `${prefix}${a[id]}`, px: a.px, py: a.py, x: a.x, z: a.z, r }));
  }
  return out;
}
/**
 * @param {ReturnType<typeof gateClearFor>} gate
 * @param {ReadonlyArray<{b: string, px: number, py: number, x: number, z: number}>} [arches]
 * @param {ReadonlyArray<{s: string, px: number, py: number, x: number, z: number}>} [stars]
 */
export function gateClearSet(gate, arches = [], stars = []) {
  /** @type {any[]} */
  const list = [...(gate ? [gate] : []), ...membersFrom(arches, 'b', 'eg:', EG_ARCH_ROCK_M), ...membersFrom(stars, 's', 'star:', STAR_ROCK_M)];
  if (!list.length) return null;
  if (list.length === 1 && list[0] === gate) return gate;
  return Object.freeze({ key: list.map((c) => c.key).join(CLEAR_KEY_JOIN), list: Object.freeze(list) });
}
// Memoized by identity: owners must replace the gate record and the arch and star lists rather than mutate them, or
// the set goes stale.
export function gateClearMemo() {
  let g = null, a = null, s = null, set = null;
  return (gate, arches, stars) => {
    if (gate !== g || arches !== a || stars !== s) { g = gate; a = arches; s = stars; set = gateClearSet(gate, arches ?? [], stars ?? []); }
    return set;
  };
}
const membersOf = (clear) => (clear ? (Array.isArray(clear.list) ? clear.list : [clear]) : []);

export const pointNearGate = (clear, px, py, x, z, margin = 0) => boxNearGate(clear, px, py, x, z, x, z, margin);

export function wodSiteOffGate(clear, px, py, prefabName, prefab, rect, tileMetres = 6.4) {
  if (!clear || wodPiecewise(prefabName)) return true;
  for (const o of prefab?.obj ?? []) {
    if (pointNearGate(clear, px, py, rect.x * tileMetres + o.pos.x, rect.y * tileMetres + o.pos.z, WOD_SITE_OBJECT_RADIUS_M)) return false;
  }
  return true;
}

/**
 * Runs after the road test in the `&&` chain, so the ledger only sees sites that already passed it.
 * @param {ReturnType<typeof gateClearFor>} clear
 * @param {number} px
 * @param {number} py
 * @param {{refused:boolean, reach:number[]}} ledger
 */
export function gateSiteTest(clear, px, py, ledger, tileMetres = 6.4) {
  return (prefabName, prefab, rect) => {
    if (!wodSiteOffGate(clear, px, py, prefabName, prefab, rect, tileMetres)) { ledger.refused = true; return false; }
    if (!wodPiecewise(prefabName)) {
      for (const o of prefab?.obj ?? []) {
        const x = rect.x * tileMetres + o.pos.x, z = rect.y * tileMetres + o.pos.z;
        ledger.reach.push(x, z, x, z, WOD_SITE_OBJECT_RADIUS_M);
      }
    }
    return true;
  };
}

export const GATE_REACH_STRIDE = 5;

/**
 * Asks exactly what the pick and the placement ask, so a pixel is rebuilt only when a fresh build would differ.
 * @param {ArrayLike<number>|null} reach
 */
export function reachNearGate(reach, clear, px, py) {
  if (!clear || !reach?.length) return false;
  for (let i = 0; i + GATE_REACH_STRIDE <= reach.length; i += GATE_REACH_STRIDE) {
    if (boxNearGate(clear, px, py, reach[i], reach[i + 1], reach[i + 2], reach[i + 3], reach[i + 4])) return true;
  }
  return false;
}

export function createGateClearSweep() {
  let swept = null;
  const due = new Set();
  return {
    // A pixel whose build began before the last sweep read an old clearing, so it is queued to be asked again.
    published(k, key) { if ((key ?? null) !== swept) due.add(k); },
    /**
     * @param {ReturnType<typeof gateClearFor>} clear
     * @param {Map<string, any>} built
     */
    step(clear, built) {
      const key = clear?.key ?? null;
      if (key !== swept) { swept = key; for (const k of built.keys()) due.add(k); }
      const again = [];
      const now = membersOf(clear);
      for (const k of due) {
        const p = built.get(k);
        due.delete(k);
        if (!p) continue;
        if ((p.gateClearKey ?? null) === key) continue;
        const had = new Set(String(p.gateClearKey ?? '').split(CLEAR_KEY_JOIN).filter(Boolean));
        const gone = [...had].some((x) => !now.some((c) => c.key === x));
        const come = now.filter((c) => !had.has(c.key));
        if ((gone && p.gateRefused) || come.some((c) => reachNearGate(p.wodReach, c, p.px, p.py))) again.push(p);
        else p.gateClearKey = key;
      }
      return again;
    },
    state: () => ({ swept, due: due.size }),
  };
}
