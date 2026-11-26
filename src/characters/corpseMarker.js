// Lootable corpse markers: the mint, ground placement, activation, loot targets, and hover keys,
// shared by the exterior enemy pools and the dungeon host.

import { capFoeLoot } from '../items/foeLootCap.js';
import { championName, properName } from './champions.js';
import { getBool } from '../platform/settings.js';
import { floorLanding } from '../player/enterExit.js';
import { billboardSize } from '../world/rmbFlats.js';
import { addItem, takeOneInto } from '../items/inventory.js';
import { SOUND } from '../audio/soundClips.js';
import { lootRarityOn, bestRarity, RARITIES } from '../items/lootRarity.js';
import { CORPSE_ACTIVATION_DISTANCE, RAY_DISTANCE } from '../player/activate.js';
import { enemyDisplayName, ENEMY_BASICS } from './enemyBasics.js';
import { FlatAnim, isAnimatedFlat } from '../render/flatAnimation.js';
import { localizedText, getLocalizedEnemyName } from '../ui/textManager.js';
import { silverFindAt } from '../items/silverFinds.js';

export const ARROW_TEMPLATE_INDEX = 131;

export function corpseTextureOf(f) {
  const row = f?.mobile?.basics ?? ENEMY_BASICS[f?.mobileType];
  return ((f?.mobile?.gender ?? f?.gender) === 'female' && row?.femaleCorpseTexture) || row?.corpseTexture;
}

export async function mintCorpseMarker({
  renderer, getTexture, uploadRecordFrame, collider = null,
  corpseTexture, feet, fallbackSize = null, stillDead = () => true, sizeScale = 1,
  centre = null,
}) {
  if (!corpseTexture) return null;
  const { archive, record } = corpseTexture;
  const t = await getTexture(archive);
  if (!t) return null;
  if (t.recordCount != null && record >= t.recordCount) return null;
  if (!stillDead()) return null;
  // Cast from just above the feet so a corpse resting on the floor is not missed; with no collider the position stays.
  // Read the live feet array after the warm: a floating-origin recenter during the read shifts it in place.
  const pos = collider
    ? floorLanding(collider, [feet[0], feet[1] + 0.1, feet[2]])
    : [feet[0], feet[1], feet[2]];
  uploadRecordFrame(archive, record, 0);
  const size0 = billboardSize(t, record) ?? fallbackSize;
  const size = sizeScale !== 1 && size0 ? { ...size0, w: size0.w * sizeScale, h: size0.h * sizeScale } : size0;
  if (centre != null && size) pos[1] += centre - size.h / 2;
  const batch = renderer.createBillboardBatch(archive, record, size, [[pos[0], pos[1], pos[2]]]);
  // The record is bare; the draw builds `record#frame`, so it must not carry a frame already.
  batch.frame = 0;
  const frames = t.getFrameCount?.(record) ?? 1;
  let anim = null;
  if (isAnimatedFlat(frames)) {
    for (let i = 1; i < frames; i++) uploadRecordFrame(archive, record, i);
    anim = new FlatAnim(archive, frames);
    batch.frame = anim.frame;
  }
  // The creation params travel with the record because a floating-origin recenter rebuilds the batch.
  return { batch, archive, record, size, pos, anim };
}

export function tickCorpseMarkers(markers, dt) {
  for (const c of markers) if (c.anim) c.batch.frame = c.anim.tick(dt);
}

const _deathHandlers = new Map();
export function registerEnemyDeathHandler(name, fn) { if (fn) _deathHandlers.set(name, fn); else _deathHandlers.delete(name); }
export function raiseEnemyDeath(entity, opts = {}) {
  for (const fn of _deathHandlers.values()) {
    try { fn(entity, opts); } catch (e) { console.warn('[enemyDeath] a handler threw', e); }
  }
  capFoeLoot(entity);
}

const _corpsePrefabs = new Map();
export function registerCorpsePrefab(archive, record, make) {
  if (!Number.isInteger(archive) || !Number.isInteger(record) || typeof make !== 'function') throw new Error('registerCorpsePrefab(archive, record, make(f, host))');
  _corpsePrefabs.set(`${archive}_${record}`, make);
}
export function _resetCorpsePrefabs() { _corpsePrefabs.clear(); }
export function createCorpsePrefabs(host) {
  let alive = true;
  const reach = Object.freeze({ ...host, alive: () => alive });
  const minted = new Set();
  const release = (f) => { const c = f.corpsePrefab; f.corpsePrefab = null; minted.delete(f); c?.release?.(); };
  return {
    mint(f, corpseTexture) {
      release(f);
      const make = corpseTexture && !f.executed ? _corpsePrefabs.get(`${corpseTexture.archive}_${corpseTexture.record}`) : null;
      f.corpsePrefab = make ? make(f, reach) ?? null : null;
      if (f.corpsePrefab) minted.add(f);
      return f.corpsePrefab;
    },
    frame(foes, dt) { for (const f of foes) if (f.corpsePrefab && f.dead && f.corpse) f.corpsePrefab.frame?.(dt); },
    told(f, kind) {
      if (!f?.dead || f.corpseDestroyed || (kind !== 1 && kind !== 2)) return;
      if (f.corpsePrefab?.gone) f.corpsePrefab.gone(kind);
      else reach.vanish(f);
    },
    forget(f) { release(f); f.corpseDestroyed = 0; },
    settle(f, kind) {
      if (kind !== 1 && kind !== 2) return;
      release(f);
      if (f.corpse) reach.vanish(f);
      f.corpseDestroyed = kind;
    },
    destroy() { alive = false; for (const f of [...minted]) release(f); },
  };
}
export function corpsePrefabStruck(pos, foes, reach) {
  for (const f of foes) {
    const s = f?.dead && f.corpse ? f.corpsePrefab?.sphere?.() : null;
    if (s && Math.hypot(pos[0] - s.center[0], pos[1] - s.center[1], pos[2] - s.center[2]) <= s.radius + reach) return f;
  }
  return null;
}

export function sayEnemyDied(say, mobileType, entity = null) {
  if (getBool('GUI', 'DisableEnemyDeathAlert')) return null;
  const name = properName(entity) ?? championName(entity, enemyDisplayName(mobileType));
  if (!name) return null;
  const line = localizedText('thingJustDied', '%s just died.').replaceAll('%s', getLocalizedEnemyName(mobileType, name));
  say?.(line);
  return line;
}

export function playBodyFall(audio, pos) {
  audio?.play3d?.(SOUND.BodyFall, [pos[0], pos[1], pos[2]], 1, { maxDistance: 16 });
}

export function playRareDrop(audio, pos, items) {
  if (!lootRarityOn() || !pos) return null;
  const best = bestRarity(items);
  if (!best || RARITIES[best].rank < RARITIES.rare.rank) return null;
  audio?.play3d?.(SOUND.MakeItem, [pos[0], pos[1], pos[2]], 1, { maxDistance: 20 });
  return best;
}

export function corpseLootTargets(entries, keyPrefix, { isCorpse, feetOf, idOf = null }) {
  const targets = [];
  entries.forEach((e, i) => {
    if (!isCorpse(e) || e.corpseDisabled) return;
    const p = feetOf(e);
    if (!p) return;
    // A pool that prunes its list passes `idOf` for a stable key; an index would name a different body after a splice.
    const id = idOf ? idOf(e) : i;
    // Corpses reach 150 * GlobalScale, not the 128-unit default.
    targets.push({
      key: `${keyPrefix}:${id}`,
      aabb: { min: [p[0] - 0.5, p[1], p[2] - 0.5], max: [p[0] + 0.5, p[1] + 0.6, p[2] + 0.5] },
      distance: RAY_DISTANCE,
      reach: CORPSE_ACTIVATION_DISTANCE,
      body: true,
    });
  });
  return targets;
}

export function physicalCorpseSources(entries, keyPrefix, { isCorpse, feetOf, idOf = null }) {
  const out = [];
  (entries ?? []).forEach((e, i) => {
    if (!isCorpse(e) || e.corpseDisabled || e.puppet || !e.corpseMarker) return;
    const pos = feetOf(e);
    if (pos) out.push({ entity: e.entity, pos, key: `${keyPrefix}:${idOf ? idOf(e) : i}` });
  });
  return out;
}

export function corpseEntryFor(entries, key, keyPrefix, { isCorpse, idOf = null }) {
  let i = -1;
  for (const e of entries ?? []) {
    i += 1;
    if (!isCorpse(e)) continue;
    const id = idOf ? idOf(e) : i;
    if (`${keyPrefix}:${id}` === key) return e;
  }
  return null;
}

export function corpseContents(entry) {
  if (!entry || entry.corpseDisabled) return null;
  return entry.entity?.items ?? null;
}

export const corpseLootHooks = (entry) => ({
  items: () => entry.entity?.items ?? [],
  playerOwned: false,
  textureArchive: entry.corpseMarker?.archive ?? 0,
  textureRecord: entry.corpseMarker?.record ?? 0,
  pos: [...(entry.corpseMarker?.pos ?? entry.ai?.feet ?? [0, 0, 0])],
});

export const arrowsOnly = (items) => Array.isArray(items) && items.length === 1 && items[0]?.templateIndex === ARROW_TEMPLATE_INDEX;

function corpsePrelude(entry, playerEntity, say) {
  if (!entry || entry.corpseDisabled) return 0;
  const items = entry.entity?.items;
  if (!items?.length) {
    entry.corpseDisabled = true;
    say(localizedText('theBodyHasNoTreasure', 'The body has no treasure.'));
    return 0;
  }
  if (arrowsOnly(items)) {
    playerEntity.items = playerEntity.items || [];
    addItem(playerEntity.items, items[0]);
    items.length = 0;
    say('You collect the arrows.');
    return 1;
  }
  return null;
}

export function openCorpseLoot(entry, { playerEntity, say = () => {}, openWindow = null } = {}) {
  const answered = corpsePrelude(entry, playerEntity, say);
  if (answered !== null) return answered;
  const items = entry.entity.items;
  if (typeof openWindow !== 'function') {
    console.warn('[corpse] no inventory door - the body stays shut rather than emptying itself');
    return items.length;
  }
  if (openWindow(corpseLootHooks(entry)) === true) silverFindAt('corpse', entry);
  return items.length;
}

export const corpseEntityName = (mobileType) => getLocalizedEnemyName(mobileType, enemyDisplayName(mobileType));

export function pileBody(entry) {
  if (!entry || entry.corpseDisabled || entry.puppet) return null;
  const count = entry.entity?.items?.length ?? 0;
  return count > 0 ? { name: corpseEntityName(entry.mobileType) ?? 'Body', count } : null;
}

export function takeCorpseLoot(entry, playerEntity, say = () => {}) {
  const answered = corpsePrelude(entry, playerEntity, say);
  if (answered !== null) return answered;
  const items = entry.entity.items;
  playerEntity.items = playerEntity.items || [];
  let n = 0;
  // A gold pile bound for the player is spent into the counter and never added to the collection.
  // Iterate a copy: the door splices the source, so a live loop would skip every second entry.
  for (const item of [...items]) { if (takeOneInto(playerEntity, items, item)) n++; }
  say(n === 1 ? 'You take 1 item.' : `You take ${n} items.`);
  return n;
}
