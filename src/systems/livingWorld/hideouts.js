// @ts-check
import { TENT_MODEL, FIRE_FLAT } from '../survival/camp.js';
import { trs } from '../../world/mat4.js';
import { sphereAabb } from '../../render/frustum.js';
import { drawSeen } from '../../homes/decorRoom.js';
import { NATIVE_PER_M, NATIVE_PIXEL } from './trips.js';
import { GLOBAL_SCALE } from '../../player/activate.js';
import { lwSeed, lwRng, textSeed } from './seed.js';
import { DAY_MIN } from './dayPlan.js';
import { takeOf, TAKE_DAYS } from './outlaws.js';
import { isBagItem } from '../../net/bagLaw.js';
import { isSurvivalItem } from '../survival/items.js';

export const BAND_LIVE_M = 200;
export const BAND_KEEP_M = 280;
export const TENT_RING_M = 6;
export const BAND_RING_M = Object.freeze([3, 9]);
export const tentsFor = (n) => Math.max(2, Math.ceil(n / 3));
export const HIDEOUT_DAY_H = Object.freeze([6, 20]);
export const HEARD_PX = 3;
export const RUMOUR_OFF_N = 16384;

/**
 * @param {any} band
 * @param {number} t
 */
export function standingAt(band, t) {
  const h = (((t % DAY_MIN) + DAY_MIN) % DAY_MIN) / 60;
  const night = h < HIDEOUT_DAY_H[0] || h >= HIDEOUT_DAY_H[1];
  return night ? band.people.slice(0, Math.ceil(band.people.length / 2)) : band.people;
}

export const HIDEOUTS_ASK_MS = 100;

/**
 * Only a death by a blow counts: a body removed by the relevance cull, one that escaped, or one taken out is not
 * killed.
 * @param {any} rec
 */
export const killed = (rec) => !!rec?.dead && (!!rec.corpse || !!rec.executed);

/**
 * @param {any} pile
 * @param {[any, any][]} minted
 */
const asMinted = (pile, minted) => { const items = pile?.items ?? []; return items.length === minted.length && minted.every(([it, n]) => items.includes(it) && it?.stackCount === n); };

/**
 * A region whose roads are not planned yet returns no hideouts and is retried after `HIDEOUTS_ASK_MS`; `resolved`
 * tells the host to rebuild troubles computed without bands meanwhile.
 * @param {{ of: (region: number) => (any[] | undefined), generation: () => number, resolved?: (region: number) => void, now?: () => number }} deps
 * @returns {(region: number) => any[]}
 */
export function createHideoutBook(deps) {
  /** @type {Map<number, any[]>} */
  const kept = new Map();
  /** @type {Map<number, number>} */
  const waiting = new Map();
  let gen = /** @type {number | null} */ (null);
  const now = deps.now ?? (() => performance.now());
  return (region) => {
    if (region == null || !Number.isFinite(region)) return [];
    if (deps.generation() !== gen) { kept.clear(); waiting.clear(); gen = deps.generation(); }
    const got = kept.get(region);
    if (got) return got;
    const at = waiting.get(region), ms = now();
    if (at != null && ms - at < HIDEOUTS_ASK_MS) return [];
    const h = deps.of(region);
    if (h === undefined) { waiting.set(region, ms); return []; }
    kept.set(region, h);
    if (waiting.delete(region) && h.length) deps.resolved?.(region);
    return h;
  };
}

/**
 * @param {any} h
 * @param {string} bandKey
 */
export function rumourAt(h, bandKey) {
  const s = lwSeed(textSeed(bandKey), 0x72756d);
  const a = ((s % 3600) / 3600) * Math.PI * 2, d = RUMOUR_OFF_N * (((s >>> 12) % 1000) / 1000);
  return { x: h.x + Math.sin(a) * d, z: h.z + Math.cos(a) * d };
}

// Frame budget in real ms for working a band's chest; reading the whole take in one frame costs tens of
// milliseconds.
export const CHEST_SLICE_MS = 3;

/**
 * Drops the general store's fixed stock (transportation, the Materials Bag, and survival items), which otherwise
 * fills every chest with the same pieces.
 * @param {any} it
 */
export const chestPiece = (it) => !!it && it.group !== 'Transportation' && !isBagItem(it) && !isSurvivalItem(it);

/**
 * @param {any} band
 * @param {number} t
 * @param {{ townOf: (mapId: number) => any, tripsOf: (town: any, t: number) => (any[] | undefined), shelf: (o: { rolls: () => number, shelfIndex: number }) => any[], gold: (n: number) => any }} deps
 * @returns {Generator<void, { items: any[], robbed: any[] }, void>}
 */
export function* bandChest(band, t, deps) {
  const towns = [band.hideout.a, band.hideout.b].map((id) => deps.townOf(id)).filter(Boolean);
  const trips = [];
  for (let d = 0; d <= TAKE_DAYS; d++) for (const town of towns) { trips.push(...(deps.tripsOf(town, t - d * DAY_MIN) ?? [])); yield; }
  const take = takeOf(band, trips, t);
  yield;
  const pool = take.goods ? deps.shelf({ rolls: lwRng(textSeed(band.key), 0x63687374), shelfIndex: 1 }).filter(chestPiece) : [];
  const draw = lwRng(textSeed(band.key), 0x676f6f64);
  const items = [];
  while (items.length < take.goods && pool.length) items.push(pool.splice(Math.floor(draw() * pool.length), 1)[0]);
  if (take.gold > 0) items.push(deps.gold(take.gold));
  return { items, robbed: take.robbed };
}

/** @param {{ hideoutsNear: (x: number, z: number) => any[], bandAt: (h: any, t: number) => any, clock: () => number, here: () => ({ x: number, z: number } | null), ready: () => boolean, owner: (feet: number[]) => boolean, sceneOf: (nx: number, nz: number) => number[], spawn: (type: number, feet: number[], o: any) => Promise<any>, remove: (rec: any) => void, inPool: (rec: any) => boolean, relations: () => any, say: (text: string) => void, chest: (band: any, t: number) => Iterator<void, { items: any[], robbed: any[] }>, dropPile: (items: any[], feet: number[]) => any, removePile: (pile: any) => void, engaged?: (rec: any) => boolean, now?: () => number, renderer?: any, meshes?: any, getTexture?: (archive: number) => any, uploadRecordFrame?: (archive: number, record: number, frame: number) => void, }} deps */
export function createHideouts(deps) {
  let stood = /** @type {any} */ (null);
  let timer = 0;
  let tent = /** @type {any} */ (null), tentLoading = false;
  let fire = /** @type {any} */ (null), fireLoading = false;
  const rel = () => deps.relations();
  const now = deps.now ?? (() => performance.now());
  // Struck-down outlaw ids by band key outlive a let-go for the session, so a camp shown again omits its dead;
  // cleared when the character changes.
  const downs = /** @type {Map<string, Set<string>>} */ (new Map());
  let downsRel = /** @type {any} */ (null);

  function ensureArt() {
    if (!tent && !tentLoading && deps.meshes?.getGpuMesh) {
      tentLoading = true;
      Promise.resolve(deps.meshes.getGpuMesh(TENT_MODEL)).then((gpu) => { tent = gpu ? { gpu } : null; }).catch(() => {});
    }
    if (!fire && !fireLoading && deps.getTexture) {
      fireLoading = true;
      Promise.resolve(deps.getTexture(FIRE_FLAT.archive)).then((t) => {
        if (!t) return;
        const count = t.getFrameCount?.(FIRE_FLAT.record) ?? 1;
        for (let i = 0; i < count; i++) deps.uploadRecordFrame?.(FIRE_FLAT.archive, FIRE_FLAT.record, i);
        const size = t.getSize(FIRE_FLAT.record);
        fire = { size: { w: size.width * GLOBAL_SCALE, h: size.height * GLOBAL_SCALE } };
      }).catch(() => {});
    }
  }

  const takeOut = (rec) => { try { if (deps.inPool(rec)) deps.remove(rec); } catch (e) { console.warn('[hideouts] a body would not leave', /** @type {any} */ (e)?.message ?? e); } };

  /** @param {any} h */
  const turnOf = (h) => (lwSeed(textSeed(h.key), 0x74656e74) % 628) / 100;

  function stand(h, t, owned) {
    const band = deps.bandAt(h, t);
    const n = band ? band.people.length : 4;
    const turn = turnOf(h);
    const tents = [];
    for (let i = 0; i < tentsFor(n); i++) {
      const a = turn + (i / tentsFor(n)) * Math.PI * 2;
      const nx = h.x + Math.sin(a) * TENT_RING_M * NATIVE_PER_M, nz = h.z + Math.cos(a) * TENT_RING_M * NATIVE_PER_M;
      const feet = deps.sceneOf(nx, nz);
      tents.push({ feet, yaw: a + Math.PI });
    }
    const centre = deps.sceneOf(h.x, h.z);
    stood = { h, band, tents, centre, foes: [], spawning: 0, pile: null, minted: /** @type {[any, any][]} */ ([]), robbed: [], routed: false, batch: null,
      rel: rel(), owned: false, looted: false, killed: new Set(), chest: /** @type {any} */ (null), wave: 0, allDown: false };
    if (band) {
      if (owned) standPeople(stood, t);
      stood.chest = deps.chest(band, t);
    }
  }

  /**
   * @param {any} s
   * @param {{ items: any[], robbed: any[] }} c
   */
  function layChest(s, c) {
    s.robbed = c.robbed;
    if (!rel()?.turns?.()?.looted?.has(s.band.key) && c.items.length) {
      s.pile = deps.dropPile(c.items, s.centre);
      s.minted = c.items.map((it) => [it, it?.stackCount]);
    }
  }

  /**
   * @param {any} s
   * @param {number} budgetMs
   */
  function workChest(s, budgetMs) {
    const t0 = now();
    while (s.chest) {
      if (now() - t0 >= budgetMs) return;
      let r;
      try { r = s.chest.next(); } catch (e) { console.warn('[hideouts] the chest', /** @type {any} */ (e)?.message ?? e); r = { done: true, value: null }; }
      if (r.done) { s.chest = null; layChest(s, r.value ?? { items: [], robbed: [] }); }
    }
  }

  /**
   * @param {any} s
   * @param {any} rec
   */
  function strike(s, rec) {
    const id = rec?.living?.outlaw;
    if (id == null) return;
    let set = downs.get(s.band.key);
    if (!set) { if (downs.size > 64) downs.clear(); downs.set(s.band.key, (set = new Set())); }
    set.add(id);
  }

  /**
   * @param {any} s
   * @param {number} t
   */
  function standPeople(s, t) {
    s.owned = true;
    const wave = ++s.wave, down = downs.get(s.band.key);
    const people = standingAt(s.band, t).filter((p) => !down?.has(p.id)), turn = turnOf(s.h);
    s.allDown = !people.length;
    people.forEach((p, i) => {
      const a = turn + 0.5 + (i / Math.max(1, people.length)) * Math.PI * 2;
      const r = BAND_RING_M[0] + (BAND_RING_M[1] - BAND_RING_M[0]) * ((lwSeed(textSeed(p.id)) % 100) / 100);
      const feet = deps.sceneOf(s.h.x + Math.sin(a) * r * NATIVE_PER_M, s.h.z + Math.cos(a) * r * NATIVE_PER_M);
      s.spawning++;
      deps.spawn(p.cls, feet, { yaw: a, level: p.level, gender: p.sex, allied: false }).then((rec) => {
        s.spawning--;
        if (!rec) return;
        if (stood !== s || s.wave !== wave) { takeOut(rec); return; }
        if (rec.entity) rec.entity.name = p.name;
        rec.living = { outlaw: p.id };
        s.foes.push(rec);
      }).catch(() => { s.spawning--; });
    });
  }

  /** @param {any} s */
  function takeOutPeople(s) {
    for (const rec of s.foes) if (s.killed.has(rec) || killed(rec)) strike(s, rec);
    for (const rec of s.foes) if (!rec.dead) takeOut(rec);
  }

  /** @param {any} s */
  function dropPeople(s) {
    takeOutPeople(s);
    s.foes = []; s.killed = new Set(); s.owned = false; s.allDown = false; s.wave++;
  }

  /** @param {any} s */
  function lootedYet(s) {
    if (!s.pile || s.looted || asMinted(s.pile, s.minted)) return;
    s.looted = true;
    if (rel() === s.rel) rel()?.turn?.('looted', s.band.key);
  }

  function letGo() {
    const s = stood;
    if (!s) return;
    stood = null;
    takeOutPeople(s);
    if (s.pile) {
      lootedYet(s);
      deps.removePile(s.pile);
    }
    if (s.batch) deps.renderer?.destroyBillboardBatch?.(s.batch);
  }

  function rout(s, t) {
    s.routed = true;
    if (s.chest) workChest(s, Infinity);
    const r = rel();
    const day = Math.floor((t - 240) / DAY_MIN);
    r?.turn?.('routed', `${s.h.key}@${s.band.gen}.${s.band.heir}`, { t, who: s.band.name });
    const thanked = new Set();
    for (const tr of s.robbed) for (const m of tr.party ?? []) if (!thanked.has(m.id)) { thanked.add(m.id); r?.note?.(m.id, 'helped', day); }
    deps.say(`You have routed ${s.band.name}.`);
  }

  return {
    /** @param {number} dt */
    frame(dt) {
      // A load or new game changes `rel()`; let the camp go first so its chest state is never written to the new
      // character.
      if (stood && rel() !== stood.rel) letGo();
      if (rel() !== downsRel) { downs.clear(); downsRel = rel(); }
      // Check `looted` every frame: a check only at let-go misses a swapped piece or a save made while the camp is
      // live.
      if (stood) lootedYet(stood);
      if (stood?.chest) workChest(stood, CHEST_SLICE_MS);
      if ((timer -= dt) > 0) return;
      timer = 1;
      const here = deps.here();
      const t = deps.clock();
      if (!here || !deps.ready()) { letGo(); return; }
      if (stood) {
        const d = Math.hypot(here.x - stood.h.x, here.z - stood.h.z) / NATIVE_PER_M;
        // Do not let the camp go while one of its people engages the player; letting go removes bodies the pool's
        // cull would spare.
        if (d > BAND_KEEP_M && !stood.foes.some((/** @type {any} */ rec) => !rec.dead && deps.engaged?.(rec))) { letGo(); return; }
        // Online, every client draws the camp but only the `owner` spawns its people, and they are dropped when
        // ownership passes to another client.
        if (stood.band && !stood.routed) {
          const mine = deps.owner(deps.sceneOf(stood.h.x, stood.h.z));
          if (mine && !stood.owned) standPeople(stood, t);
          else if (!mine && stood.owned) dropPeople(stood);
        }
        if (stood.band && stood.owned && !stood.routed && !stood.spawning && (stood.foes.length || stood.allDown)) {
          for (const rec of stood.foes) if (killed(rec)) stood.killed.add(rec);
          if (stood.foes.every((/** @type {any} */ rec) => stood.killed.has(rec))) rout(stood, t);
        }
        return;
      }
      const near = deps.hideoutsNear(here.x, here.z)
        .map((h) => ({ h, d: Math.hypot(here.x - h.x, here.z - h.z) / NATIVE_PER_M }))
        .filter((q) => q.d <= BAND_LIVE_M).sort((a, b) => a.d - b.d)[0];
      if (!near) return;
      ensureArt();
      stand(near.h, t, deps.owner(deps.sceneOf(near.h.x, near.h.z)));
    },
    batches() {
      const s = stood;
      if (!s?.band || s.routed || !fire || !deps.renderer?.createBillboardBatch) return [];
      if (!s.batch) { s.batch = deps.renderer.createBillboardBatch(FIRE_FLAT.archive, FIRE_FLAT.record, fire.size, [s.centre]); if (s.batch) s.batch.frame = 0; }
      return s.batch ? [s.batch] : [];
    },
    /**
     * @param {any} r
     * @param {any} [texRemap]
     * @param {any} [cull]
     */
    draw(r, texRemap = null, cull = null) {
      if (!stood || !tent?.gpu || !r?.drawMesh) return 0;
      let n = 0;
      for (const tt of stood.tents) {
        const m = trs(tt.feet[0], tt.feet[1], tt.feet[2], 0, (tt.yaw * 180) / Math.PI, 0);
        if (drawSeen(r, cull, cull ? sphereAabb(tent.gpu.bounds, m) : null, tent.gpu, m, texRemap)) n++;
      }
      return n;
    },
    /**
     * @param {number} x
     * @param {number} z
     * @param {number} t
     */
    unheardNear(x, z, t) {
      const heard = rel()?.turns?.()?.heard;
      for (const h of deps.hideoutsNear(x, z)) {
        if (Math.max(Math.abs(h.x - x), Math.abs(h.z - z)) > HEARD_PX * NATIVE_PIXEL) continue;
        const band = deps.bandAt(h, t);
        if (band && !heard?.has(band.key)) return band;
      }
      return null;
    },
    /** @param {any} band */
    heard(band) { return rel()?.turn?.('heard', band.key) ?? false; },
    /**
     * @param {number} x
     * @param {number} z
     * @param {number} t
     */
    marks(x, z, t) {
      const heard = rel()?.turns?.()?.heard;
      if (!heard?.size) return [];
      const out = [];
      for (const h of deps.hideoutsNear(x, z)) {
        const band = deps.bandAt(h, t);
        if (!band || !heard.has(band.key)) continue;
        const p = rumourAt(h, band.key);
        out.push({ key: `hideout:${h.key}`, at: deps.sceneOf(p.x, p.z), label: `Hideout of ${band.name} (rumoured)`, kind: 'wayfarer hideout' });
      }
      return out;
    },
    /**
     * Floating origin shift: moves the tents and fire and rebuilds the fire batch; the pool and the ground pile
     * move the people and the chest themselves.
     * @param {number[]} offset
     */
    offsetAll(offset) {
      const s = stood;
      if (!s) return;
      const move = (/** @type {number[]} */ p) => { p[0] += offset[0]; p[1] += offset[1]; p[2] += offset[2]; };
      for (const tt of s.tents) move(tt.feet);
      move(s.centre);
      if (s.batch) {
        const frame = s.batch.frame;
        deps.renderer?.destroyBillboardBatch?.(s.batch);
        s.batch = deps.renderer?.createBillboardBatch?.(FIRE_FLAT.archive, FIRE_FLAT.record, fire.size, [s.centre]) ?? null;
        if (s.batch) s.batch.frame = frame;
      }
    },
    shown: () => (stood ? { key: stood.h.key, band: stood.band?.key ?? null, foes: stood.foes.length, tents: stood.tents.length, pile: !!stood.pile, routed: stood.routed } : null),
    clear() { letGo(); timer = 0; },
  };
}
