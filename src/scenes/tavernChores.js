// @ts-check
// BUNNYFALL: what served customers leave behind in the real room - their empties on the nearest table, or a spill on
// the floor beside them - drawn with Daggerfall's own flats and cleared where they lie. The shift law owns which chores
// exist and pays for them; this module only finds them a place, draws them and reports the player's work.
import { billboardSize } from '../world/rmbFlats.js';
import { RAY_DISTANCE, TREASURE_ACTIVATION_DISTANCE } from '../player/activate.js';
import { tavernOpenChores } from '../net/tavernServiceLaw.js';

/** The flats each chore shows: a tankard, a goblet and an empty bottle; a broken cup in a small dark puddle.
 *  [archive, record, dx, dz, size] - the heap (200.17) is a cart-load of dirt at its own size, so the puddle is a third of it. */
export const CHORE_ART = Object.freeze({
  table: Object.freeze([[200, 6, 0, 0, 1], [200, 0, .16, .09, 1], [205, 14, -.14, .1, 1]]),
  spill: Object.freeze([[200, 17, 0, .05, .3], [205, 44, .05, 0, 1]]),
});
const TABLE_MIN = .55, TABLE_MAX = 1.2;

/** A small stable number from a chore id, so the same chore lands in the same place after a reload. */
const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/** Where a chore sits beside a customer standing at `feet`: a table top for empties when one is in reach, else the floor.
 *  Uses the room's collider only - tables are whatever the room's real furniture is.
 *  @param {{ raycast: (o: number[], d: number[], max: number) => number, sphereOverlaps?: (p: number[], r: number) => boolean }} collider */
export function placeChore(collider, kind, feet, seed = 0) {
  const down = [0, -1, 0];
  const floorAt = (x, y, z) => { const d = collider.raycast([x, y, z], down, 3); return Number.isFinite(d) ? y - d : null; };
  const floor = floorAt(feet[0], feet[1] + 1, feet[2]) ?? feet[1];
  const turn = (seed % 360) / 360 * Math.PI * 2;
  const open = (x, y, z) => !collider.sphereOverlaps?.([x, y, z], .18);
  if (kind === 'table') {
    for (const r of [.7, 1, 1.3, 1.6, 2, 2.4]) for (let k = 0; k < 12; k++) {
      const a = turn + k / 12 * Math.PI * 2, x = feet[0] + Math.sin(a) * r, z = feet[2] + Math.cos(a) * r;
      const top = floorAt(x, floor + 1.7, z);
      if (top == null || top - floor < TABLE_MIN || top - floor > TABLE_MAX || !open(x, top + .25, z)) continue;
      return { pos: [x, top, z], onTable: true };
    }
  }
  for (const r of [.8, 1.1, .55, 1.4]) for (let k = 0; k < 12; k++) {
    const a = turn + k / 12 * Math.PI * 2, x = feet[0] + Math.sin(a) * r, z = feet[2] + Math.cos(a) * r;
    const ground = floorAt(x, floor + .5, z);
    if (ground == null || Math.abs(ground - floor) > .15 || !open(x, floor + .3, z)) continue;
    return { pos: [x, ground, z], onTable: false };
  }
  return { pos: [feet[0], floor, feet[2]], onTable: false };
}

/** @param {{ renderer: any, getTexture: (a: number) => Promise<any>, uploadRecordFrame: (a: number, r: number, f: number) => void,
 *   collider: () => any, people: () => any[], npcId: (pn: any) => string }} deps */
export function createTavernChores(deps) {
  /** id -> { chore, pos, onTable, items: [{ art, size, batch, gone }], scale } */
  const placed = new Map();
  let room = null;
  function free(entry) {
    for (const item of entry.items) if (item.batch) { deps.renderer?.destroyBillboardBatch?.(item.batch); item.batch = null; }
    entry.dead = true;
  }
  function mint(entry, item) {
    if (!item.size || entry.dead || item.gone) return;
    if (item.batch) deps.renderer.destroyBillboardBatch(item.batch);
    const k = entry.scale;
    const [, , dx, dz, own = 1] = item.art;
    item.batch = deps.renderer.createBillboardBatch(item.art[0], item.art[1], { w: item.size.w * k * own, h: item.size.h * k * own },
      [[entry.pos[0] + dx * k, entry.pos[1], entry.pos[2] + dz * k]]);
    item.batch.noShadow = true;
    item.batch.frame = 0;
  }
  function place(chore) {
    const pn = deps.people().find((p) => deps.npcId(p) === chore.patron);
    const collider = deps.collider();
    if (!pn || !collider) return null;
    const spot = placeChore(collider, chore.kind, [pn.x, pn.y, pn.z], hash(chore.id));
    const entry = { chore, ...spot, scale: 1, dead: false, items: (CHORE_ART[chore.kind] ?? CHORE_ART.table).map((art) => ({ art, size: null, batch: null, gone: false })) };
    if (deps.renderer?.createBillboardBatch) for (const item of entry.items) {
      deps.getTexture(item.art[0]).then((t) => {
        if (entry.dead) return;
        deps.uploadRecordFrame(item.art[0], item.art[1], 0);
        item.size = billboardSize(t, item.art[1]);
        mint(entry, item);
      }).catch(() => {});
    }
    return entry;
  }
  return {
    /** Follow the shift: new chores are set down, cleared ones vanish. `where` changes with the room. */
    sync(state, where) {
      if (room !== where) { for (const e of placed.values()) free(e); placed.clear(); room = where; }
      const open = new Map(tavernOpenChores(state).map((c) => [c.id, c]));
      for (const [id, e] of placed) if (!open.has(id)) { free(e); placed.delete(id); }
      for (const [id, chore] of open) if (!placed.has(id)) { const e = place(chore); if (e) placed.set(id, e); }
    },
    /** The chore under a key, with where it lies. */
    at: (key) => placed.get(String(key).replace(/^tchore:/, '')) ?? null,
    /** Visible progress while the player works: a sweep shrinks the mess, gathering lifts the cups one by one. */
    progress(id, { scale = null, taken = null } = {}) {
      const e = placed.get(id);
      if (!e) return;
      if (scale != null) e.scale = Math.max(.15, Math.min(1, scale));
      if (taken != null) e.items.forEach((item, i) => { item.gone = i < taken; if (item.gone && item.batch) { deps.renderer.destroyBillboardBatch(item.batch); item.batch = null; } });
      for (const item of e.items) if (!item.gone) mint(e, item);
    },
    /** Put a chore back as it was (a minigame left unfinished). */
    restore(id) { const e = placed.get(id); if (!e) return; e.scale = 1; for (const item of e.items) { item.gone = false; mint(e, item); } },
    targets() {
      const out = [];
      for (const [id, e] of placed) {
        out.push({ key: `tchore:${id}`, aabb: { min: [e.pos[0] - .45, e.pos[1], e.pos[2] - .45], max: [e.pos[0] + .45, e.pos[1] + .6, e.pos[2] + .45] },
          distance: RAY_DISTANCE, reach: TREASURE_ACTIVATION_DISTANCE });
      }
      return out;
    },
    batches: () => [...placed.values()].flatMap((e) => e.items.map((item) => item.batch).filter(Boolean)),
    clear() { for (const e of placed.values()) free(e); placed.clear(); room = null; },
  };
}
