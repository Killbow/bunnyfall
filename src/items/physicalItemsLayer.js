// @ts-check
// Scene layer for the Physical Items mod, built by each host's ground-pile pool so items show in the world.
// A body keeps its items and each proxy is only a picture, so the body window, quick loot, and room record still hold.
import {
  PHYSICAL_ITEMS_VENDOR, readPhysicalItemsSettings, showsOnCorpse, worldHeight, visibleBox, cropTo, artworkSize, colliderDepth,
  scatterOffset, proxyLaunch, makeBody, settleBody, flyBody, shoulder, rarityRim, presentItem, diedRecently, markDeath,
  spiralDrop, PI_SPIRAL, PI_SCATTER, hasVisible, bleedEdges, constrainMove, itemLook, dropRadius, nearestFloor, PI_FLOOR_PROBE,
  PI_PATH, PI_REACH,
} from './physicalItems.js';
import { modSetting, modSettingsGeneration } from '../mods/modSettings.js';
import { registerEnemyDeathHandler } from '../characters/corpseMarker.js';
import { setBatchGlint } from '../combat/hitFlash.js';
import { lootCrown } from './lootLines.js';
import { RAY_DISTANCE } from '../player/activate.js';
import { itemIconColor32, itemIconKey } from '../ui/itemIconColor32.js';
import { inventoryItemImage } from './itemTemplates.js';
import { toColor32 } from '../formats/color32Order.js';
import { takeOneItem, quickLootSpend, tookItemText, QUICK_LOOT_REFUSED } from './quickLoot.js';
import { isMap, USE_TEXT } from './useItem.js';
import { isSummoned, takeOneInto } from './inventory.js';
import { silverFindAt } from './silverFinds.js';
import { CANNOT_REMOVE_ITEM_TEXT } from './createItem.js';

// A pseudo-archive id that must not collide with the other pseudo-archives, such as 38151 and 38171.
export const PI_ICON_ARCHIVE = 38161;
export const PI_KEY_PREFIX = 'droppedLoot:pi';
export const PI_BOX_MIN_HALF = 0.2;
export const PI_BOX_MIN_H = 0.25;
// Matches the classic icon density, so the two-texel tier rim reads as a rim.
export const PI_MW_PX = 64;
export const PI_RETRY_MS = 5000;
export const PI_RETRY_MAX = 3;

registerEnemyDeathHandler('physical-items', (entity) => markDeath(entity));

// Loaded lazily to keep this layer's importers off the fpArm module graph.
let _fpArm = null, _fpArmLoading = null;
const fpArmOnce = () => (_fpArmLoading ??= import('../combat/fpArm.js').then((m) => { _fpArm = m.fpArm; return _fpArm; }).catch(() => null));
const defaultMw = {
  stamp: () => { if (!_fpArm) { fpArmOnce(); return null; } return _fpArm.mountPictureStamp(); },
  picture: (item) => fpArmOnce().then((a) => a?.mountPicture(item, { px: PI_MW_PX }) ?? null),
};

// The renderer's texture cache is shared by every layer, so each picture is counted per renderer across layers
// and freed only when the last proxy using it lets go.
const _held = new WeakMap();
function holdTexture(renderer, record, pic) {
  if (!renderer) return;
  let m = _held.get(renderer);
  if (!m) _held.set(renderer, (m = new Map()));
  const n = (m.get(record) ?? 0) + 1;
  m.set(record, n);
  const cached = renderer.textures?.has?.(`${PI_ICON_ARCHIVE}_${record}`);
  if (cached === false || (cached === undefined && n === 1)) renderer.uploadTexture?.(PI_ICON_ARCHIVE, record, { width: pic.vw, height: pic.vh, colors: pic.colors });
}
function letTexture(renderer, record) {
  const m = renderer ? _held.get(renderer) : null;
  if (!m || !m.has(record)) return;
  const n = /** @type {number} */ (m.get(record)) - 1;
  if (n > 0) { m.set(record, n); return; }
  m.delete(record);
  renderer.releaseTexture?.(PI_ICON_ARCHIVE, record);
}
export const heldTextureCount = (renderer, record) => _held.get(renderer)?.get(record) ?? 0;

/**
 * @param {{ renderer?: any, enabled?: () => any, settings?: (() => any)|null, iconOf?: (item: any, identity: any) => any,
 *   mw?: { stamp: () => any, picture: (item: any) => any }, rolls?: () => number, now?: () => number }} [deps]
 */
export function createPhysicalItems({
  renderer, enabled = () => modSetting(PHYSICAL_ITEMS_VENDOR, 'Enabled'), settings = null,
  iconOf = (item, identity) => itemIconColor32(item, { identity }), mw = defaultMw, rolls = Math.random, now = () => Date.now(),
} = {}) {
  /** @type {any} */
  let host = { collider: () => null, corpses: () => [], identity: () => undefined, getQuest: null, took: null, say: () => {}, revealMap: null, taken: null, emptied: null, paused: () => false };
  let _settings = null, _gen = -1, _dressedGen = null;
  const settingsNow = () => {
    if (settings) return settings();
    const g = modSettingsGeneration();
    if (!_settings || g !== _gen) { _gen = g; _settings = readPhysicalItemsSettings(); }
    return _settings;
  };
  const on = () => { try { return !!enabled(); } catch { return false; } };
  const colliderNow = () => { try { return host.collider?.() ?? null; } catch { return null; } };

  let _nextId = 0;
  const proxies = new Map();
  const groups = new Map();
  const pileProxies = new Map();
  const pictures = new Map();
  let _stamp = null;

  function standPicture(key, width, height, colors) {
    const had = pictures.get(key);
    if (had) return had;
    if (!hasVisible(colors)) return null;
    const box = visibleBox(colors, width, height);
    const cut = bleedEdges(cropTo(colors, width, box), box.w, box.h);
    const pic = { record: `${key}@${box.x},${box.y},${box.w},${box.h}`, vw: box.w, vh: box.h, colors: cut };
    pictures.set(key, pic);
    return pic;
  }
  function classicKey(item) {
    try { const img = inventoryItemImage(item, host.identity?.()); return img ? `c:${itemIconKey(img)}` : null; } catch { return null; }
  }
  function askPicture(p) {
    p.asking = true;
    p.retryAt = 0;
    const ask = p.ask = {};
    const stamp = _stamp;
    const classic = () => {
      const k = classicKey(p.item);
      if (k && pictures.has(k)) return Promise.resolve(pictures.get(k));
      return Promise.resolve().then(() => iconOf(p.item, host.identity?.())).then((img) => (img?.colors && img.width > 0 && img.height > 0 ? standPicture(`c:${img.key}`, img.width, img.height, img.colors) : null));
    };
    const morrowind = () => (stamp == null ? Promise.resolve(null) : Promise.resolve().then(() => mw.picture(p.item)).then((pic) => {
      if (!pic?.image?.width || !pic.key) return null;
      const had = pictures.get(`m:${pic.key}`);
      if (had) return had;
      const c = toColor32(pic.image);
      return standPicture(`m:${pic.key}`, c.width, c.height, c.colors);
    }));
    let mwMissed = false;
    morrowind().catch(() => null).then((got) => { mwMissed = stamp != null && !got; return got ?? classic(); }).catch(() => null).then((got) => {
      if (p.ask !== ask || p.dead) return;
      p.asking = false;
      if (got) {
        p.tries = mwMissed ? p.tries : 0;
        if (got !== p.pic) { p.pic = got; dress(p); }
        if (mwMissed && p.tries < PI_RETRY_MAX) p.retryAt = now() + PI_RETRY_MS * 2 ** p.tries++;
      } else if (p.batch) {
        if (p.tries < PI_RETRY_MAX) p.retryAt = now() + PI_RETRY_MS * 2 ** p.tries++;
      } else {
        p.pic = 'none';
        presentItem(p.item, false);
        if (p.tries < PI_RETRY_MAX) p.retryAt = now() + PI_RETRY_MS * 2 ** p.tries++;
      }
    }, () => { if (p.ask === ask) { p.asking = false; if (!p.batch) p.pic = 'none'; } });
  }
  function dress(p) {
    const pic = p.pic;
    if (!pic || typeof pic !== 'object' || p.dead) return;
    const size = artworkSize(pic.vw, pic.vh, worldHeight(p.item, settingsNow()));
    p.size = size;
    p.body.half = [size.w / 2, colliderDepth(size.w, size.h) / 2];
    p.body.h = size.h;
    if (p.held !== pic.record) {
      holdTexture(renderer, pic.record, pic);
      if (p.held) letTexture(renderer, p.held);
      p.held = pic.record;
    }
    if (p.batch) renderer?.destroyBillboardBatch?.(p.batch);
    p.batch = null;
    try {
      p.batch = renderer?.createBillboardBatch?.(PI_ICON_ARCHIVE, pic.record, size, [[0, 0, 0]]) ?? null;
    } catch { p.batch = null; }
    if (!p.batch) return;
    p.batch.noShadow = true;
    p.batch.origin = [...p.body.pos];
    setBatchGlint(p.batch, rarityRim(p.item));
    presentItem(p.item, true);
  }

  function mint(item, pos, vel, backing) {
    const H = worldHeight(item, settingsNow());
    const p = { id: ++_nextId, item, backing, body: makeBody(pos, vel, [H / 2, H / 2], H), pic: null, ask: null, asking: false, batch: null, size: null, held: null, dead: false, floorY: pos[1], tries: 0, retryAt: 0 };
    proxies.set(p.id, p);
    askPicture(p);
    return p;
  }
  function retire(p) {
    if (p.dead) return;
    p.dead = true;
    presentItem(p.item, false);
    if (p.batch) renderer?.destroyBillboardBatch?.(p.batch);
    p.batch = null;
    if (p.held) letTexture(renderer, p.held);
    p.held = null;
    proxies.delete(p.id);
  }

  function rayHitOf() {
    const col = colliderNow();
    if (!col?.raycast) return null;
    return (from, dir, len) => {
      if (col.raycastHit) { const h = col.raycastHit(from, dir, len); return Number.isFinite(h?.dist) ? { dist: h.dist, normal: h.normal ?? undefined } : null; }
      const d = col.raycast(from, dir, len);
      return Number.isFinite(d) ? { dist: d } : null;
    };
  }
  function reconcileBodies() {
    const s = settingsNow();
    const seen = new Set();
    let list;
    // A feed that throws returns early, so it never reads as no bodies and retires every proxy.
    try { list = host.corpses?.() ?? []; } catch { return; }
    const rayHit = rayHitOf();
    for (const c of list) {
      const entity = c?.entity;
      if (!entity || !Array.isArray(c.pos)) continue;
      seen.add(entity);
      let g = groups.get(entity);
      const fresh = !g && diedRecently(entity, now());
      if (!g) { g = { entity, pos: [...c.pos], key: c.key ?? null, silver: c.silver ?? c.entry ?? null, silvered: false, proxies: new Map() }; groups.set(entity, g); }
      const dx = c.pos[0] - g.pos[0], dy = c.pos[1] - g.pos[1], dz = c.pos[2] - g.pos[2];
      if (dx || dy || dz) {
        for (const p of g.proxies.values()) { p.body.pos[0] += dx; p.body.pos[1] += dy; p.body.pos[2] += dz; p.floorY += dy; }
        g.pos[0] = c.pos[0]; g.pos[1] = c.pos[1]; g.pos[2] = c.pos[2];
      }
      if (c.key != null) g.key = c.key;
      const items = Array.isArray(entity.items) ? entity.items : [];
      const want = items.filter((it) => showsOnCorpse(it, s));
      const wanted = new Set(want);
      const orphans = [];
      for (const [it, p] of g.proxies) {
        if (p.dead) { g.proxies.delete(it); continue; }
        if (!wanted.has(it)) orphans.push(it);
      }
      for (const it of want) {
        if (g.proxies.has(it)) continue;
        const look = itemLook(it);
        const oi = orphans.findIndex((o) => itemLook(o) === look);
        if (oi >= 0) {
          const o = orphans.splice(oi, 1)[0], p = g.proxies.get(o);
          g.proxies.delete(o);
          presentItem(o, false);
          p.item = it;
          if (p.batch) presentItem(it, true);
          g.proxies.set(it, p);
          continue;
        }
        const off = scatterOffset(rolls);
        const start = [g.pos[0], g.pos[1] + PI_SCATTER.up, g.pos[2]];
        const H = worldHeight(it, s);
        const at = constrainMove(start, [g.pos[0] + off[0], start[1], g.pos[2] + off[2]], H / 2, H, rayHit);
        const vel = proxyLaunch([at[0] - g.pos[0], 0, at[2] - g.pos[2]], fresh, s.impulse, rolls);
        const p = mint(it, at, vel, { kind: 'corpse', group: g });
        p.floorY = g.pos[1];
        g.proxies.set(it, p);
      }
      for (const o of orphans) { const p = g.proxies.get(o); g.proxies.delete(o); if (p) retire(p); }
    }
    for (const [entity, g] of groups) {
      if (seen.has(entity)) continue;
      for (const p of g.proxies.values()) retire(p);
      groups.delete(entity);
    }
  }
  function reconcilePiles(piles) {
    const live = new Set();
    for (const pile of piles ?? []) {
      const it = pile.items?.[0];
      if (!it || pile.dead || pile.inactive) continue;
      live.add(pile);
      let p = pileProxies.get(pile);
      if (p && p.item !== it) { if (itemLook(p.item) === itemLook(it)) { presentItem(p.item, false); p.item = it; if (p.batch) presentItem(it, true); } else { retire(p); p = undefined; } }
      if (!p) {
        p = mint(it, pile.pos, [0, 0, 0], { kind: 'pile', pile });
        p.floorY = pile.pos[1];
        if (pile.settled) settleBody(p.body);
        pileProxies.set(pile, p);
      }
    }
    for (const [pile, p] of pileProxies) if (!live.has(pile)) { retire(p); pileProxies.delete(pile); }
  }

  const DOWN = [0, -1, 0];
  function probes(p, col) {
    const ground = (x, top, z) => {
      const d = col?.raycast ? col.raycast([x, top, z], DOWN, 64) : Infinity;
      if (Number.isFinite(d)) return top - d;
      return top >= p.floorY ? p.floorY : null;
    };
    const wall = col?.raycast ? (from, dir, len) => { const d = col.raycast(from, dir, len); return Number.isFinite(d) ? d : null; } : null;
    return { ground, wall };
  }
  function fly(dt) {
    if (!(dt > 0)) return;
    let any = false;
    const col = colliderNow();
    for (const p of proxies.values()) {
      if (p.body.settled) continue;
      any = true;
      const { ground, wall } = probes(p, col);
      const what = flyBody(p.body, dt, ground, wall);
      if (what === 'rest' && p.backing.kind === 'pile') { const pile = p.backing.pile; pile.pos[0] = p.body.pos[0]; pile.pos[1] = p.body.pos[1]; pile.pos[2] = p.body.pos[2]; pile.settled = true; }
    }
    if (any) shoulder([...proxies.values()].map((p) => p.body), Math.min(dt, 0.25));
  }

  const proxyFor = (key) => {
    if (typeof key !== 'string' || !key.startsWith(PI_KEY_PREFIX)) return null;
    const p = proxies.get(Number(key.slice(PI_KEY_PREFIX.length)));
    return p && !p.dead ? p : null;
  };
  const listOf = (p) => (p.backing.kind === 'corpse' ? p.backing.group.entity.items : p.backing.pile.items);
  const backingOf = (p) => (p.backing.kind === 'corpse' ? { kind: 'corpse', key: p.backing.group.key, entity: p.backing.group.entity } : p.backing);

  const _targets = [];
  return {
    PI_KEY_PREFIX,
    attach(h = {}) { host = { ...host, ...h }; },
    on,
    owns: (key) => typeof key === 'string' && key.startsWith(PI_KEY_PREFIX),
    presents: (pile) => { const p = on() ? pileProxies.get(pile) : null; return !!p && p.batch != null; },
    placeDrops(items, anchor, forward, lying = []) {
      const s = settingsNow();
      const col = colliderNow();
      const fl = Math.hypot(forward?.[0] ?? 0, forward?.[2] ?? 0) || 1;
      const centre = [anchor[0] + ((forward?.[0] ?? 0) / fl) * PI_SPIRAL.ahead, anchor[1], anchor[2] + ((forward?.[2] ?? 1) / fl) * PI_SPIRAL.ahead];
      const floorAt = (pt) => {
        if (!col?.raycast) return anchor[1];
        const hits = [];
        let top = anchor[1] + PI_FLOOR_PROBE.up, left = PI_FLOOR_PROBE.len;
        for (let k = 0; k < 8 && left > 0; k++) {
          const h = col.raycastHit ? col.raycastHit([pt[0], top, pt[2]], DOWN, left) : { dist: col.raycast([pt[0], top, pt[2]], DOWN, left), normal: [0, 1, 0] };
          if (!Number.isFinite(h?.dist)) break;
          hits.push({ y: top - h.dist, ny: h.normal ? h.normal[1] : 1 });
          top -= h.dist + 0.001; left -= h.dist + 0.001;
        }
        return nearestFloor(hits, anchor[1]);
      };
      const clear = (a, b) => {
        if (!col?.raycast) return true;
        const from = [a[0], a[1] + PI_PATH.lift, a[2]], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dx, dy, dz);
        if (!(l > PI_PATH.skin)) return true;
        const d = col.raycast(from, [dx / l, dy / l, dz / l], l);
        return !(Number.isFinite(d) && d < l - PI_PATH.skin);
      };
      const placed = lying.map((pile) => ({ pos: pile.pos, r: dropRadius(worldHeight(pile.items?.[0], s)) }));
      const next = { i: 0 };
      return items.map((it) => {
        const r = dropRadius(worldHeight(it, s));
        const at = spiralDrop(anchor, centre, r, next, placed, floorAt, clear);
        placed.push({ pos: at, r });
        return [at[0], at[1] + PI_SPIRAL.lift, at[2]];
      });
    },
    frame(dt, piles = []) {
      if (!on()) { if (proxies.size) this.clear(); return; }
      let st = null;
      try { st = mw?.stamp?.() ?? null; } catch { st = null; }
      if (st !== _stamp) { _stamp = st; for (const p of proxies.values()) { p.tries = 0; askPicture(p); } }
      reconcileBodies();
      reconcilePiles(piles);
      let paused = false;
      try { paused = !!host.paused?.(); } catch { paused = false; }
      fly(paused ? 0 : dt);
      const t = now();
      settingsNow();
      const gen = settings ? 0 : _gen;
      const redress = _dressedGen !== null && gen !== _dressedGen;
      _dressedGen = gen;
      for (const p of proxies.values()) {
        if (redress && p.batch) dress(p);
        if (p.retryAt && t >= p.retryAt && !p.asking) askPicture(p);
        if (!p.batch) continue;
        p.batch.origin[0] = p.body.pos[0]; p.batch.origin[1] = p.body.pos[1]; p.batch.origin[2] = p.body.pos[2];
        setBatchGlint(p.batch, rarityRim(p.item));
      }
    },
    batches: () => { const out = []; for (const p of proxies.values()) if (p.batch) out.push(p.batch); return out; },
    targets() {
      _targets.length = 0;
      for (const p of proxies.values()) {
        if (!p.batch || !p.size) continue;
        const [x, y, z] = p.body.pos, hw = Math.max(PI_BOX_MIN_HALF, p.body.half[0], p.body.half[1]), h = Math.max(PI_BOX_MIN_H, p.size.h);
        _targets.push({ key: `${PI_KEY_PREFIX}${p.id}`, aabb: { min: [x - hw, y, z - hw], max: [x + hw, y + h, z + hw] }, distance: RAY_DISTANCE, reach: PI_REACH });
      }
      return _targets;
    },
    contents: (key) => { const p = proxyFor(key); return p && listOf(p)?.includes(p.item) ? [p.item] : null; },
    finds() { const out = []; for (const p of proxies.values()) if (p.batch && p.size) out.push({ root: lootCrown(p.body.pos, p.size), items: [p.item], own: true }); return out; },
    pick(key, playerEntity) {
      const p = proxyFor(key);
      if (!p) return false;
      try { quickLootSpend(); } catch { }
      const list = listOf(p);
      if (!Array.isArray(list) || !list.includes(p.item)) { retire(p); return true; }
      const say = (l) => { try { host.say?.(l); } catch { } };
      // The summoned refusal comes before the map branch, so a summoned map is refused aloud and never read.
      if (isSummoned(p.item)) { say(CANNOT_REMOVE_ITEM_TEXT); return true; }
      const stack = p.item.stackCount ?? 1;
      let moved = false;
      if (isMap(p.item)) {
        if (typeof host.revealMap === 'function') {
          list.splice(list.indexOf(p.item), 1);
          let name = null;
          try { name = host.revealMap(); } catch { name = null; }
          if (!name) say(USE_TEXT.readMapFail);
        } else {
          takeOneInto(playerEntity, list, p.item);
          let shown = false;
          try { shown = host.took?.([{ item: p.item, count: stack }], playerEntity) === true; } catch { shown = false; }
          if (!shown) say(tookItemText(p.item));
        }
        moved = true;
      } else {
        const got = takeOneItem(playerEntity, list, p.item, say, { getQuest: host.getQuest ?? null, took: host.took ?? null, wholeStack: true });
        moved = got != null && got !== QUICK_LOOT_REFUSED;
      }
      if (moved) {
        const g = p.backing.kind === 'corpse' ? p.backing.group : null;
        if (g && !g.silvered) { g.silvered = true; if (g.silver != null) silverFindAt('corpse', g.silver); }
        try { host.taken?.(backingOf(p)); } catch (e) { console.warn('[physical-items] the host\'s word on a take failed', /** @type {any} */ (e)?.message ?? e); }
      }
      if (!list.includes(p.item)) {
        retire(p);
        if (p.backing.kind === 'pile') host.emptied?.(p.backing);
      }
      return true;
    },
    offsetAll([dx, dy, dz]) {
      for (const p of proxies.values()) { p.body.pos[0] += dx; p.body.pos[1] += dy; p.body.pos[2] += dz; p.floorY += dy; }
      for (const g of groups.values()) { g.pos[0] += dx; g.pos[1] += dy; g.pos[2] += dz; }
    },
    groundMoved(x0, z0, x1, z1, dy) {
      const inBox = (x, z) => x >= x0 && x < x1 && z >= z0 && z < z1;
      for (const p of proxies.values()) {
        const [x, , z] = p.body.pos;
        if (!inBox(x, z)) continue;
        const d = dy(x, z);
        if (d) { p.body.pos[1] += d; p.floorY += d; }
      }
      for (const g of groups.values()) if (inBox(g.pos[0], g.pos[2])) { const d = dy(g.pos[0], g.pos[2]); if (d) g.pos[1] += d; }
    },
    clear() {
      for (const p of [...proxies.values()]) retire(p);
      groups.clear(); pileProxies.clear();
    },
    destroy() {
      this.clear();
      pictures.clear();
    },
    state: () => [...proxies.values()].map((p) => ({ id: p.id, kind: p.backing.kind, item: p.item, pos: [...p.body.pos], vel: [...p.body.vel], settled: p.body.settled, pic: typeof p.pic === 'object' && p.pic ? p.pic.record : p.pic, size: p.size, glint: p.batch?.glint ?? null, noShadow: p.batch?.noShadow ?? null })),
  };
}
