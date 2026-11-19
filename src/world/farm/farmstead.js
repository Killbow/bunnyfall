// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 1 (docs/FARM-EXPANSION.md section 3): THE FARMSTEAD - where the farm's fixtures stand.
//
// A farm's crop fields are known (farmGardenSite.js `rects`); the open ground about them is not. This module finds it:
// a 1 m grid round the fields, kept where the ground is flat, outside every field and clear of every wall the collider
// knows, scored nearest the fields first with a jitter seeded by the farm's map id - so every client stands the same
// farmstead. Each fixture then claims the best plot left that is far enough from the ones already claimed, in FIXTURES'
// order; a farm too cramped for one simply lacks it. The scarecrow stands in the first field itself.
//
// Every picture is a record of the art register (docs/FARM-EXPANSION.md Appendix A), checked against ARENA2. A part
// with `min` is drawn only once the farm's upgrades reach it (section 3.6: upgrades you can see).

/** A part is sized by its height `h`, m - or, for a picture drawn lying (TEXTURE.214's tools are inventory pictures),
 *  by its width `w`, so a wide picture never stretches tall. */
import { FARM_ART } from '../farmGardenArt.js';   // a seed sack's crop, shown on top

/** @typedef {{ a: number, r: number, dx?: number, dz?: number, dy?: number, h?: number, w?: number, min?: Record<string, number>, lamp?: boolean }} Part */
/** @typedef {{ id: string, dx: number, dz: number, r: number, h: number }} Target */
/** @typedef {{ id: string, r: number, h: number, parts: Part[], targets?: Target[], field?: boolean, shelf?: boolean, pen?: string, pickR?: number }} FixtureDef */   // pickR: clicked only near its middle (a pen's trough), never as its whole ring

/** @type {readonly FixtureDef[]} */
export const FIXTURES = Object.freeze([
  { id: 'orderPost', r: .8, h: 2.6, parts: [{ a: 212, r: 5, h: 2.6 }, { a: 214, r: 5, dx: .55, h: 1.9, lamp: true }] },
  { id: 'wagon', r: 2.6, h: 1.8, parts: [
    { a: 205, r: 27, h: 1.5 }, { a: 201, r: 0, dx: -2.3, dz: .2, h: 1.75 },
    // the week's cargo, loaded by hauled sacks (haulLaw.js wagonCargo; cargoLevel below)
    { a: 205, r: 17, dx: .2, dz: .1, dy: .75, h: .55, min: { cargo: 1 } }, { a: 205, r: 19, dx: .6, dz: -.1, dy: .75, h: .5, min: { cargo: 2 } },
    { a: 205, r: 18, dx: -.2, dz: -.1, dy: .78, h: .5, min: { cargo: 3 } }, { a: 205, r: 26, dx: .35, dz: .15, dy: 1.05, h: .45, min: { cargo: 4 } },
  ] },
  { id: 'ledger', r: .7, h: 1.1, parts: [{ a: 211, r: 31, h: .65 }, { a: 211, r: 1, dy: .62, h: .4 }, { a: 214, r: 5, dx: -.5, h: 1.9, lamp: true }] },
  // the seed shelf's sacks are the farm's own seeds (its climate's: net/farm/cropLaw.js seedsFor), laid out by shelfOf
  { id: 'seedShelf', r: 1.7, h: 1.3, shelf: true, parts: [{ a: 205, r: 24, dz: .7, h: 1.05 }] },
  { id: 'toolRack', r: 1, h: 1.3, parts: [
    { a: 205, r: 25, dz: .3, h: 1 },
    { a: 214, r: 1, dx: -.3, dy: .55, w: .9 }, { a: 214, r: 4, dx: .25, dy: .35, w: .8 }, { a: 214, r: 7, dx: 0, dy: .1, w: .75 },
    { a: 214, r: 0, dx: -.55, dy: .05, w: .8, min: { tools: 1 } }, { a: 214, r: 14, dx: .6, dy: .7, w: .35, min: { tools: 1 } },
    { a: 214, r: 6, dx: .55, dy: .05, w: .8, min: { tools: 2 } }, { a: 214, r: 10, dx: -.75, h: 1.4, min: { tools: 2 } },
  ] },
  { id: 'well', r: 1.4, h: 2.6, parts: [
    { a: 212, r: 0, h: 2.6 }, { a: 214, r: 5, dx: .2, dz: -1.1, h: 1.9, lamp: true }, { a: 205, r: 29, dx: 1, dz: .2, h: .5, min: { irrigation: 1 } },
    { a: 212, r: 8, dx: -1.2, h: 1.3, min: { irrigation: 2 } }, { a: 205, r: 30, dx: -.9, dz: .4, h: .45, min: { irrigation: 2 } },
  ] },
  { id: 'compost', r: 1.2, h: 1.1, parts: [
    { a: 212, r: 7, h: .8 }, { a: 211, r: 3, dx: .85, dz: .2, h: .5, min: { soil: 1 } },
    { a: 212, r: 7, dx: -.7, dz: -.3, h: 1.1, min: { soil: 2 } }, { a: 205, r: 10, dx: .4, dz: .7, h: .45, min: { soil: 2 } },
  ] },
  { id: 'haystack', r: 1.6, h: 1.9, parts: [{ a: 212, r: 1, h: 1.8 }, { a: 301, r: 0, dx: 1.5, dz: .3, h: 1.6, sway: true }, { a: 301, r: 1, dx: -1.4, dz: -.2, h: 1.5, sway: true }] },
  // PHASE 3 (section 5): the pen (cows, horses) and the sty (pigs), ringed with posts; the drover's cart on his day
  { id: 'pen', r: 3.4, pickR: 1.1, h: 1.1, pen: 'pen', parts: [{ a: 212, r: 13, dx: 3.10, dz: 0.00, h: 1.1 }, { a: 212, r: 14, dx: 2.51, dz: 1.82, h: 1.1 }, { a: 212, r: 13, dx: 0.96, dz: 2.95, h: 1.1 }, { a: 212, r: 14, dx: -0.96, dz: 2.95, h: 1.1 }, { a: 212, r: 13, dx: -2.51, dz: 1.82, h: 1.1 }, { a: 212, r: 14, dx: -3.10, dz: 0.00, h: 1.1 }, { a: 212, r: 13, dx: -2.51, dz: -1.82, h: 1.1 }, { a: 212, r: 14, dx: -0.96, dz: -2.95, h: 1.1 }, { a: 212, r: 13, dx: 0.96, dz: -2.95, h: 1.1 }, { a: 212, r: 14, dx: 2.51, dz: -1.82, h: 1.1 }, { a: 212, r: 1, dx: -1.6, dz: -1.4, h: 1.1 }, { a: 205, r: 29, dx: 1.5, dz: 1.3, h: .45 }] },
  { id: 'sty', r: 2.4, pickR: .9, h: 1, pen: 'sty', parts: [{ a: 212, r: 13, dx: 2.10, dz: 0.00, h: 1.1 }, { a: 212, r: 14, dx: 1.48, dz: 1.48, h: 1.1 }, { a: 212, r: 13, dx: 0.00, dz: 2.10, h: 1.1 }, { a: 212, r: 14, dx: -1.48, dz: 1.48, h: 1.1 }, { a: 212, r: 13, dx: -2.10, dz: 0.00, h: 1.1 }, { a: 212, r: 14, dx: -1.48, dz: -1.48, h: 1.1 }, { a: 212, r: 13, dx: -0.00, dz: -2.10, h: 1.1 }, { a: 212, r: 14, dx: 1.48, dz: -1.48, h: 1.1 }, { a: 212, r: 7, dx: .6, dz: .5, h: .6 }, { a: 205, r: 30, dx: -1, dz: .9, h: .42 }] },
  { id: 'drover', r: 2.6, h: 1.8, parts: [{ a: 205, r: 28, h: 1.5, min: { drover: 1 } }, { a: 201, r: 1, dx: -2.3, dz: .3, h: 1.8, min: { drover: 1 } }] },
  { id: 'scarecrow', r: .6, h: 2.3, field: true, parts: [{ a: 211, r: 20, h: 2.3 }] },
]);
export const FIXTURE_ARCHIVES = Object.freeze([...new Set(FIXTURES.flatMap((f) => f.parts.map((p) => p.a)))]);

/** How far beyond a field the farmstead looks for ground, m. */
export const STEAD_REACH = 10;
/** Kept off a field's edge, m: the crops' own margin. */
export const STEAD_MARGIN = 1.3;
/** The most a plot's ground may rise across it, m. */
export const STEAD_SLOPE = .45;
/** Room left between two fixtures, m. */
export const STEAD_GAP = .9;
/** How strongly the fixtures gather round the yard's hub: score per metre from it. */
export const STEAD_PULL = .4;

/** A stable 0..1 for (seed, x, z). */
function hash01(seed, x, z) {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Distance from (x, z) to a rect [x0, z0, x1, z1]: 0 inside. */
const rectDistance = (r, x, z) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - z, 0, z - r[3]));

/**
 * THE FARMSTEAD of a farm's site. Pure but for the two probes it is handed.
 * @param {{ rects: number[][], mapId: number }} site
 * @param {{ heightAt: (x: number, z: number) => number, blocked: (x: number, y: number, z: number, r: number) => boolean }} probes
 */
export function layFarmstead(site, { heightAt, blocked }) {
  const rects = site.rects ?? [];
  if (!rects.length) return null;
  const base = rects[0], seed = (site.mapId >>> 0) || 1;
  const bx0 = Math.min(...rects.map((r) => r[0])) - STEAD_REACH, bz0 = Math.min(...rects.map((r) => r[1])) - STEAD_REACH;
  const bx1 = Math.max(...rects.map((r) => r[2])) + STEAD_REACH, bz1 = Math.max(...rects.map((r) => r[3])) + STEAD_REACH;
  /** @type {{ x: number, z: number, score: number }[]} */
  const ground = [];
  for (let z = Math.floor(bz0); z <= bz1; z++) for (let x = Math.floor(bx0); x <= bx1; x++) {
    const cx = x + .5, cz = z + .5;
    let d = Infinity;
    for (const r of rects) d = Math.min(d, rectDistance(r, cx, cz));
    if (d < STEAD_MARGIN || d > STEAD_REACH) continue;
    // the jitter is read in the field's own frame, so a moved origin (rebase) never reshuffles the farm
    ground.push({ x: cx, z: cz, score: d + hash01(seed, Math.round(cx - base[0]), Math.round(cz - base[1])) * 2.5 });
  }
  if (!ground.length) return null;
  // ONE YARD, NOT A SCATTER: the fixtures gather round a hub - the best ground by the first field - each plot's score
  // growing with its distance from it, so the farm reads as one farmstead and not things strewn round every field
  let hub = null;
  for (const g of ground) if (rectDistance(base, g.x, g.z) <= STEAD_REACH * .6 && (!hub || g.score < hub.score)) hub = g;
  hub ??= ground[0];
  for (const g of ground) g.score += Math.hypot(g.x - hub.x, g.z - hub.z) * STEAD_PULL;
  ground.sort((a, b) => a.score - b.score);
  const flat = (x, z, r) => {
    const hs = [heightAt(x, z), heightAt(x - r, z), heightAt(x + r, z), heightAt(x, z - r), heightAt(x, z + r)];
    if (!hs.every(Number.isFinite)) return null;
    return Math.max(...hs) - Math.min(...hs) <= STEAD_SLOPE ? hs[0] : null;
  };
  /** @type {{ id: string, def: FixtureDef, pos: number[] }[]} */
  const placed = [];
  for (const def of FIXTURES) {
    if (def.field) {
      const r = base, x = (r[0] + r[2]) / 2 + 1, z = (r[1] + r[3]) / 2 + 1, y = heightAt(x, z);   // between the beds' rows
      if (Number.isFinite(y)) placed.push({ id: def.id, def, pos: [x, y, z] });
      continue;
    }
    for (const g of ground) {
      if (placed.some((p) => !p.def.field && Math.hypot(p.pos[0] - g.x, p.pos[2] - g.z) < p.def.r + def.r + STEAD_GAP)) continue;
      if (rects.some((r) => rectDistance(r, g.x, g.z) < def.r + STEAD_MARGIN)) continue;
      const y = flat(g.x, g.z, def.r);
      if (y == null || blocked(g.x, y, g.z, def.r)) continue;
      placed.push({ id: def.id, def, pos: [g.x, y, g.z] });
      break;
    }
  }
  return {
    fixtures: placed,
    /** @param {number[]} delta */
    rebase(delta) { for (const p of placed) p.pos = p.pos.map((v, i) => v + delta[i]); },
  };
}

/** A lantern's light: its height on the pole, m, and its reach. */
export const LAMP_UP = 1.75, LAMP_RANGE = 8;
/** The farmstead's lanterns, as light positions: one a lantern part (TEXTURE.214's lantern on its pole). */
export function farmsteadLamps(stead) {
  const out = [];
  for (const f of stead?.fixtures ?? []) for (const p of f.def.parts) if (p.lamp) out.push({ key: f, pos: [f.pos[0] + (p.dx ?? 0), f.pos[1] + LAMP_UP, f.pos[2] + (p.dz ?? 0)] });
  return out;
}

/** How full the wagon looks for a week's hauled crops: 0 empty, then 1-4. */
export const cargoLevel = (crops) => (crops <= 0 ? 0 : crops < 20 ? 1 : crops < 100 ? 2 : crops < 400 ? 3 : 4);
/** A fixture's parts that stand at these upgrades. */
export const standingParts = (def, upgrades) => def.parts.filter((p) => !p.min || Object.entries(p.min).every(([k, v]) => (upgrades?.[k] ?? 0) >= v));

/** THE SEED SHELF: a sack for each of the farm's seeds, rows of SHELF_ROW, each with its crop's ripe picture on top
 *  (farmGardenArt.js FARM_ART) - its parts and its targets, one target a sack. */
export const SHELF_ROW = 5, SHELF_STEP = .55;
export function shelfOf(seeds) {
  const parts = [], targets = [];
  (seeds ?? []).forEach((id, i) => {
    const row = Math.floor(i / SHELF_ROW), inRow = Math.min(SHELF_ROW, seeds.length - row * SHELF_ROW);
    const dx = ((i % SHELF_ROW) - (inRow - 1) / 2) * SHELF_STEP, dz = -row * .55;
    const base = id.split('#')[0], crop = FARM_ART[base]?.ripe ?? FARM_ART.grain.ripe;   // a strain ('grain#3') shows its crop
    parts.push({ a: 205, r: 17 + (i % 3), dx, dz, h: .5 }, { a: crop[0], r: crop[1], dx, dz, dy: .42, h: base === 'mushroom' ? .18 : .3 });
    targets.push({ id: `seed:${id}`, dx, dz, r: .27, h: .85 });
  });
  return { parts, targets };
}
/** A placed fixture's parts: the shelf's sacks for the farm's seeds, and every part its upgrades raise. */
export const fixtureParts = (f, upgrades, seeds) => (f.def.shelf ? [...standingParts(f.def, upgrades), ...shelfOf(seeds).parts] : standingParts(f.def, upgrades));

/** Every pickable target of the farmstead: a fixture whole, or each of its own targets. */
export function farmsteadTargets(stead) {
  const out = [];
  for (const f of stead?.fixtures ?? []) {
    const own = f.def.shelf ? shelfOf(stead.seeds).targets : f.def.targets;
    if (own) for (const t of own) out.push({ id: t.id, fixture: f.id, pos: [f.pos[0] + t.dx, f.pos[1], f.pos[2] + t.dz], r: t.r, h: t.h });
    else out.push({ id: f.id, fixture: f.id, pos: f.pos, r: f.def.pickR ?? f.def.r, h: f.def.h });
  }
  return out;
}

/**
 * Where a ray from `eye` along `dir` meets a target's upright cylinder, or Infinity. The ray's nearest approach to the
 * axis in the ground plane, then the height at that point.
 */
export function rayHitsTarget(eye, dir, t) {
  const dx = dir[0], dz = dir[2], ox = eye[0] - t.pos[0], oz = eye[2] - t.pos[2], a = dx * dx + dz * dz;
  if (a < 1e-9) return Infinity;
  const s = -(ox * dx + oz * dz) / a;
  if (s <= 0) return Infinity;
  const px = ox + dx * s, pz = oz + dz * s;
  if (Math.hypot(px, pz) > t.r) return Infinity;
  const y = eye[1] + dir[1] * s;
  return y >= t.pos[1] - .2 && y <= t.pos[1] + t.h ? s : Infinity;
}
