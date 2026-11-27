// Shared interior room state: action records plus opened shelves and containers. Shelves sync as whole lists with
// their stocked day `d`, and containers sync as claims through `interiorRoomLoot.js`. Dropped and treasure piles
// never go on the wire, and home cupboards stay off it because they are owner storage in the save.
import { sharedRecord, validActionRecord } from './actionSystem.js';
import { validLootList, LOOT_LIST_MAX, LOOT_NEWER_TEXT } from '../items/loot.js';
import { peerHanded } from '../net/peerWord.js';
import { clearStolen } from '../justice/stolenGoods.js';
import { mintSharedStamp } from '../net/wire.js';
import { createInteriorRoomLoot } from './interiorRoomLoot.js';

// Must match the `roomKeyFor` spelling (unsigned map id and building key) so the memory's `locationKey` and the
// relay room agree.
export function interiorLocationKey(mapId, buildingKey, layout = null) {
  const id = Number.isFinite(mapId) ? mapId >>> 0 : 0;
  const key = Number.isFinite(buildingKey) ? buildingKey >>> 0 : 0;
  return id > 0 && key > 0 ? `interior:m${id}.${layoutRoomKey(key, layout)}` : null;
}

// Layout mods serving the town go in the key's high bits so two layouts never share one room. Building keys are
// under 2^19, and the classic layout keeps the plain key so its room memories still match.
export const LAYOUT_ROOM_MODS = Object.freeze(['beautiful-villages', 'beautiful-cities']);
export function layoutRoomKey(buildingKey, layout = null) {
  let tag = 0;
  if (typeof layout === 'string') LAYOUT_ROOM_MODS.forEach((m, i) => { if (layout.split('+').some((p) => p.split('@')[0] === m)) tag |= 1 << i; });
  return buildingKey + tag * 0x1000000;
}

// An owned house or any ship interior keeps no room: no key, memory, or presence. DFU does not distinguish ships,
// so two players in one hull would disagree about whether the room exists.
export function mintInteriorShared(locationKey, { owned = false, home = false, net = null } = {}) {
  const bag = { locationKey: owned ? null : (locationKey ?? null), owned: !!owned, home: !!home, stamp: mintSharedStamp(), seen: new Set(), tooBig: new Set(), unreadable: new Set(), applied: false, openKey: null, openWin: null, net, room: null };
  if (net && !bag.owned && !bag.home && bag.locationKey) bag.room = createInteriorRoomLoot(net, bag);
  return bag;
}

const LOOT_KEY_RE = /^(shelf|container):(0|[1-9][0-9]{0,4})$/;
export function interiorLootKeyOf(key) {
  if (typeof key !== 'string') return null;
  const m = LOOT_KEY_RE.exec(key);
  return m ? `${m[1]}:${Number(m[2])}` : null;
}

export function interiorLootTarget(ctx, key) {
  const canon = interiorLootKeyOf(key);
  if (!canon || !ctx) return null;
  const [kind, iStr] = canon.split(':');
  const list = kind === 'shelf' ? ctx.shelves : ctx.containers;
  return (Array.isArray(list) && list[Number(iStr)]) || null;
}

export function interiorLootRecords(ctx, keys, tooBig = new Set(), bag = null) {
  const out = [];
  for (const key of keys ?? []) {
    const canon = interiorLootKeyOf(key);
    if (canon && canon.startsWith('container:') && bag?.room?.live()) { out.push(...bag.room.records(ctx, canon)); continue; }
    const t = canon && interiorLootTarget(ctx, canon);
    if (!t || !Array.isArray(t.items)) continue;
    if (t.items.length > LOOT_LIST_MAX) {
      if (!tooBig.has(canon)) {
        tooBig.add(canon);
        console.warn(`[loot] ${canon} holds ${t.items.length} items, more than the room can carry (${LOOT_LIST_MAX}); it stays yours alone`);
      }
      continue;
    }
    tooBig.delete(canon);
    // Bound pieces, letters of credit, and theft marks never go on the wire, because an older build on the same
    // room would land them.
    out.push({ k: canon, r: peerHanded(t.items).map((it) => clearStolen({ ...it })), d: Number.isFinite(t.stockedDate) ? t.stockedDate : 0 });
  }
  return out;
}

// Stowed keys apply only to shelves, because a container may be the stowage itself. The key rule comes in through
// `carried.keyOf` so this module never imports the item law.
export function withoutCarried(items, carried = null, { stowed = false } = {}) {
  if (typeof carried?.keyOf !== 'function') return items;
  const keys = new Set([...(carried.keys ?? []), ...(stowed ? carried.stowed ?? [] : [])]);
  return items.filter((it) => {
    const k = carried.keyOf(it);
    if (!k) return true;
    if (keys.has(k)) return false;
    keys.add(k);
    return true;
  });
}

// Lands in place so a bound window keeps its rows, but never on the container this player has open. A piece the
// reader already carries never lands back, and a repeated piece lands once.
export function applyInteriorLoot(ctx, list, { seen = new Set(), openKey = null, today = null, unreadable = null, carried = null, room = null, from = null } = {}) {
  let n = 0;
  for (const rec of Array.isArray(list) ? list : []) {
    const canon = interiorLootKeyOf(rec?.k);
    if (!canon) continue;
    if (room?.live() && canon.startsWith('container:')) { n += room.land(ctx, { ...rec, k: canon }, { from, today }) ? 1 : 0; continue; }
    // A record whose day is not finite, is negative, or is past tomorrow is refused whole, because `d` drives the
    // restock and is saved. The stocked day only moves forward.
    if (!Number.isFinite(rec.d) || rec.d < 0 || (today != null && rec.d > today + 1)) continue;
    const items = peerHanded(validLootList(rec.r));
    if (!items) { if (unreadable && interiorLootTarget(ctx, canon)) { seen.add(canon); unreadable.add(canon); } continue; }
    const t = interiorLootTarget(ctx, canon);
    if (!t) continue;
    for (const it of items) clearStolen(it);
    seen.add(canon);
    unreadable?.delete(canon);
    if (canon === openKey) { n++; continue; }
    const lands = withoutCarried(items, carried, { stowed: canon.startsWith('shelf:') });
    if (Array.isArray(t.items)) { t.items.length = 0; for (const it of lands) t.items.push(it); } else t.items = lands;
    t.stockedDate = Math.max(Number.isFinite(t.stockedDate) ? t.stockedDate : 0, Math.floor(rec.d));
    n++;
  }
  return n;
}

export function composeInteriorShared(ctx, { locationKey, stamp, seen = new Set(), tooBig = new Set(), home = false, room = null } = {}) {
  if (!ctx || !locationKey) return null;
  return {
    locationKey, stamp,
    world: {
      loot: home ? [] : interiorLootRecords(ctx, [...seen], tooBig, { room }),
      actions: (ctx.actions?.collectSaveData?.() ?? []).map(sharedRecord),
    },
  };
}

export function applyInteriorShared(ctx, shared, { locationKey, stamp, seen = new Set(), openKey = null, today = null, home = false, carried = null, room = null } = {}) {
  if (!ctx || !shared || !locationKey || shared.locationKey !== locationKey || !shared.world || typeof shared.world !== 'object') return false;
  if (shared.stamp === stamp) return false;
  const acts = Array.isArray(shared.world.actions) ? shared.world.actions.map(validActionRecord).filter(Boolean) : [];
  // `remote: true` keeps a lock above the door's own ceiling, which only a Lock spell sets, from landing from a
  // peer.
  if (acts.length) ctx.actions?.restoreSaveData?.(acts, { remote: true });
  if (!home) applyInteriorLoot(ctx, shared.world.loot, { seen, openKey, today, carried, room, from: null });
  return true;
}

export function interiorActionRecords(ctx, keys, { locationKey, tooBig = new Set(), home = false, room = null } = {}) {
  if (!ctx || !locationKey || !Array.isArray(keys) || !keys.length) return null;
  const want = new Set(keys);
  const a = (ctx.actions?.collectSaveData?.() ?? []).filter((r) => want.has(r.key)).map(sharedRecord);
  const l = home ? [] : interiorLootRecords(ctx, keys, tooBig, { room });
  return a.length || l.length ? { k: locationKey, ...(a.length ? { a } : {}), ...(l.length ? { l } : {}) } : null;
}

function publishWhole(ctx, canon, bag, { claim = false } = {}) {
  if (!bag?.locationKey || !canon || !ctx || bag.home) return false;
  if (bag.unreadable?.has(canon)) return false;
  if (claim && bag.seen.has(canon)) return false;
  const l = interiorLootRecords(ctx, [canon], bag.tooBig);
  if (!l.length) return false;
  const first = !bag.seen.has(canon);
  bag.seen.add(canon);
  if (first) bag.net?.claimed?.();
  return !!bag.net?.send?.({ k: bag.locationKey, l });
}

// A restock is published here at the window mount, not where the roll is made, so a player who declines the
// private-property prompt never publishes the cupboard contents.
export function interiorLootOpen(ctx, key, win, bag, { fresh = false, keeping = null } = {}) {
  const canon = interiorLootKeyOf(key);
  if (!bag?.locationKey || !canon || !win) return;
  if (canon.startsWith('container:') && bag.room?.live()) { bag.room.open(canon, win, keeping); return; }
  if (bag.unreadable?.has(canon)) bag.net?.say?.(LOOT_NEWER_TEXT);
  bag.openKey = canon; bag.openWin = win;
  publishWhole(ctx, canon, bag, { claim: !fresh });
}

// A window counts as closed only when `open(win)` finds it gone from the window stack. A window pushed on top
// replaces the overlay slot while this one is still bound to its rows.
export function interiorLootFrame(ctx, bag, { now = 0, open = () => true } = {}) {
  if (!bag?.locationKey) return;
  const win = bag.openWin;
  if (win && !(String(bag.openKey).startsWith('container:') && bag.room?.live()) && !(open(win) && !win.done)) {
    const k = bag.openKey;
    bag.openKey = null; bag.openWin = null;
    publishWhole(ctx, k, bag);
  }
  bag.room?.frame(ctx, now, open);
}

export function interiorLootUnborn(ctx, key, bag) {
  const canon = interiorLootKeyOf(key);
  if (!canon || !canon.startsWith('container:') || !bag?.room?.live()) return false;
  return bag.unreadable.has(canon) || (bag.room.unborn(canon) && !Array.isArray(interiorLootTarget(ctx, canon)?.items));
}

// The room holds a stranger's cupboard roll until the player confirms; offline this returns false and the caller
// writes it.
export function interiorLootRoll(ctx, key, items, bag, today) {
  const canon = interiorLootKeyOf(key);
  return !!(canon && canon.startsWith('container:') && bag?.room?.roll(ctx, canon, items, today));
}

// Call before the window theft keeping is taken, or the theft marks of a first opener read an empty keeping.
export function interiorLootBirth(ctx, key, bag) {
  const canon = interiorLootKeyOf(key);
  return !!(canon && canon.startsWith('container:') && bag?.room?.birth(ctx, canon));
}

export function interiorLootAside(ctx, bag) { bag?.room?.aside(ctx); }

// Call before the bag is dropped, so every unlapsed claim in flight goes with its claimer.
export function interiorLootLeave(ctx, bag) { bag?.room?.leave(ctx); }
