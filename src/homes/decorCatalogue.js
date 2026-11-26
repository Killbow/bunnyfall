// @ts-check

import { PROP_MODEL_TYPE, DOOR_MODEL_BASE_ID, DOOR_MODEL_COUNT } from '../world/interiorLayout.js';
import { isDoorModel } from './decorDoorways.js';
import { EDITOR_FLATS_ARCHIVE, isNatureArchive } from '../world/rmbFlats.js';
import { LADDER_MODEL_ID } from '../player/enterExit.js';
import { BED_MODELS } from '../mods/rrRealism.js';
import { isHouseContainerModel } from '../items/containers.js';
import { isShopShelfModel } from '../trade/shopStock.js';
import { HOUSE_CONTAINER_NAMES } from '../ui/worldTooltips.js';
import { IIL_FIREPLACE_MODELS } from '../render/improvedInteriorLighting.js';
import { interiorLightProperties } from '../world/interiorLights.js';
import { decorPrice } from '../net/decorLaw.js';
import { localizedStrings } from '../ui/textManager.js';
import { BULLETIN_BOARD_MODEL_ID, WINDMILL_MODEL_ID, isCityGate } from '../world/rmbLayout.js';
import { CLIMATE_NATURE } from '../formats/mapsFile.js';
import { isTreeRecord } from '../world/terrainNature.js';
import { isNudeFlat, showNudity } from '../characters/nudeFlats.js';
import { rdbObjects, rdbModelActs, isActionDoor, isNpcFlat } from '../world/rdbLayout.js';
import { RDB_RESOURCE_TYPES } from '../formats/blocksFile.js';

export const DECOR_KINDS = Object.freeze({
  bed: 'Beds', storage: 'Storage', shelf: 'Shelves', furniture: 'Furniture', door: 'Doors',
  light: 'Lights', clothing: 'Clothing', boxes: 'Boxes and bottles', arms: 'Arms and armor',
  books: 'Books and scrolls', misc: 'Odds and ends', treasure: 'Treasure', decor: 'Decorations',
  people: 'Vendors',
  dungeon: 'Dungeon furniture',
  outdoor: 'Outdoors',
  nature: 'Trees and plants',
  mods: "Town mods' furnishings",
});
const KIND_ONE = Object.freeze({
  bed: 'Bed', storage: 'Cupboard', shelf: 'Shelves', furniture: 'Furniture', door: 'Door', light: 'Light', clothing: 'Clothing',
  boxes: 'Box', arms: 'Arms', books: 'Books', misc: 'Odds and ends', treasure: 'Treasure', decor: 'Decoration', people: 'Vendor',
  dungeon: 'Dungeon piece', outdoor: 'Outdoor piece', nature: 'Plant', mods: 'Furnishing',
});
const FLAT_ARCHIVE_KIND = Object.freeze({ 204: 'clothing', 205: 'boxes', 207: 'arms', 209: 'books', 210: 'light', 211: 'misc', 216: 'treasure' });
export const LIGHTS_ARCHIVE = 210;
const LIGHT_NAMES = Object.freeze({
  0: 'Bowl with fire', 1: 'Campfire', 2: 'Skull candle',
  3: 'Candle', 4: 'Candle with base', 5: 'Candleholder with three candles',
  6: 'Skull torch', 8: 'Turquoise lamp', 9: 'Chandelier with candles', 11: 'Candle in lamp', 13: 'Round lamp',
  17: 'Mounted torch', 20: 'Brazier torch', 21: 'Standing candle', 22: 'Round lantern', 24: 'Lantern with long chain',
  25: 'Lantern with medium chain', 26: 'Lantern with short chain', 27: 'Lantern',
});

export function modelKind(model) {
  if (isDoorModel(model)) return 'door';
  if (BED_MODELS.includes(model)) return 'bed';
  if (isShopShelfModel(model)) return 'shelf';
  if (isHouseContainerModel(model)) return 'storage';
  return 'furniture';
}
export const flatKind = (archive) => FLAT_ARCHIVE_KIND[archive] ?? 'decor';

export const decorKey = (what) => (what.model != null ? `m${what.model}` : `f${what.flat[0]}.${what.flat[1]}`);

export const DECOR_FROM = Object.freeze({ room: 0, dungeon: 1, street: 2, nature: 3, mod: 4, modstreet: 5 });
const OUTSIDE = new Set(['street', 'nature', 'modstreet']);
const MOD_FROM = new Set(['mod', 'modstreet']);
export const isDecorModEntry = (e) => MOD_FROM.has(e?.from);
// Dungeons have no prop type, so the 41000-43999 range separates furniture from architecture (50000-98999).
export const DECOR_FURNITURE_FIRST = 41000;
export const DECOR_FURNITURE_LAST = 43999;
export const DECOR_FREE_STANDING = Object.freeze([
  60512, 60520,
  62317,
  62318, 62319, 62321,
  62323, 62324, 62325, 62326, 62327, 62328, 62329, 62330,
  74009, 74201,
  74069,
  74071, 74072, 74073,
  74082, 74086, 74091, 74237,
  74094,
  74221, 74224, 74225, 74226, 74227, 74228,
  74229,
  74800, 74804, 74806, 75800,
  99800,
]);
const FREE_STANDING = new Set(DECOR_FREE_STANDING);
export const isDungeonFurnishing = (id) => Number.isSafeInteger(id) && id !== LADDER_MODEL_ID
  && ((id >= DECOR_FURNITURE_FIRST && id <= DECOR_FURNITURE_LAST) || FREE_STANDING.has(id));
export const isStreetPiece = (id) => Number.isSafeInteger(id) && id > 0 && id !== LADDER_MODEL_ID && id !== WINDMILL_MODEL_ID
  && id !== BULLETIN_BOARD_MODEL_ID && !isCityGate(id);
export const DECOR_NATURE_BASES = Object.freeze([...new Set(Object.values(CLIMATE_NATURE))].sort((a, b) => a - b));
export const DECOR_NATURE_RECORDS = 31;
export function addDecorNature(into = new Map()) {
  for (const base of DECOR_NATURE_BASES) {
    for (let r = 1; r <= DECOR_NATURE_RECORDS; r++) {
      const what = { model: null, flat: [base, r], nature: base };
      const key = decorKey(what);
      if (!into.has(key)) into.set(key, { ...what, count: 0, from: 'nature' });
    }
  }
  return into;
}

/**
 * @param {Iterable<any>} dfBlocks
 * @param {Map<string, {model: number|null, flat: number[]|null, count: number, person?: boolean, from?: string}>} [into]
 */
export function collectDecor(dfBlocks, into = new Map()) {
  const out = into;
  const add = (what, from = 'room') => {
    const key = decorKey(what);
    const had = out.get(key);
    if (!had) out.set(key, { ...what, count: 1, from });
    else if ((DECOR_FROM[from] ?? 0) < (DECOR_FROM[had.from] ?? 0)) out.set(key, { ...what, count: had.count + 1, from });
    else had.count++;
  };
  for (const b of dfBlocks ?? []) {
    for (const sub of b?.rmbBlock?.subRecords ?? []) {
      const interior = sub?.interior;
      for (const m of interior?.block3dObjectRecords ?? []) {
        if (m?.objectType !== PROP_MODEL_TYPE) continue;
        const id = m.modelIdNum;
        // A placed ladder could not be climbed, because climbing uses the ladders found when the room is built.
        if (!Number.isSafeInteger(id) || id <= 0 || id === LADDER_MODEL_ID) continue;
        add({ model: id, flat: null });
      }
      for (const d of interior?.blockDoorRecords ?? []) {
        const idx = d?.doorModelIndex;
        if (!Number.isSafeInteger(idx) || idx < 0) continue;
        add({ model: DOOR_MODEL_BASE_ID + (idx % DOOR_MODEL_COUNT), flat: null });
      }
      for (const f of interior?.blockFlatObjectRecords ?? []) {
        const a = f?.textureArchive;
        const r = f?.textureRecord;
        if (!Number.isSafeInteger(a) || !Number.isSafeInteger(r) || a === EDITOR_FLATS_ARCHIVE || r < 0) continue;
        add({ model: null, flat: [a, r] });
      }
      for (const f of interior?.blockPeopleRecords ?? []) {
        const a = f?.textureArchive;
        const r = f?.textureRecord;
        if (!Number.isSafeInteger(a) || !Number.isSafeInteger(r) || a === EDITOR_FLATS_ARCHIVE || r < 0) continue;
        add({ model: null, flat: [a, r], person: true });
      }
    }
    const rmb = b?.rmbBlock;
    for (const m of rmb?.misc3dObjectRecords ?? []) {
      if (isStreetPiece(m?.modelIdNum)) add({ model: m.modelIdNum, flat: null }, 'street');
    }
    const streetFlat = (f) => {
      const a = f?.textureArchive;
      const r = f?.textureRecord;
      if (!Number.isSafeInteger(a) || !Number.isSafeInteger(r) || r < 0 || a === EDITOR_FLATS_ARCHIVE || isNatureArchive(a)) return;
      add({ model: null, flat: [a, r], ...(isNpcFlat(a) ? { person: true } : {}) }, 'street');
    };
    for (const f of rmb?.miscFlatObjectRecords ?? []) streetFlat(f);
    for (const sub of rmb?.subRecords ?? []) for (const f of sub?.exterior?.blockFlatObjectRecords ?? []) streetFlat(f);
    const rdb = b?.rdbBlock;
    if (Array.isArray(rdb?.objectRootList) && Array.isArray(rdb.modelReferenceList)) {
      for (const obj of rdbObjects(rdb)) {
        if (obj?.type === RDB_RESOURCE_TYPES.Model) {
          const ref = obj.resources?.modelResource?.modelIndex;
          const id = rdb.modelReferenceList[ref]?.modelIdNum;
          if (!isDungeonFurnishing(id) || rdbModelActs(obj) || isActionDoor(rdb, ref)) continue;
          add({ model: id, flat: null }, 'dungeon');
        } else if (obj?.type === RDB_RESOURCE_TYPES.Flat) {
          const fr = obj.resources?.flatResource;
          const a = fr?.textureArchive;
          const r = fr?.textureRecord;
          if (!Number.isSafeInteger(a) || !Number.isSafeInteger(r) || r < 0 || a === EDITOR_FLATS_ARCHIVE || fr.action > 0 || isNatureArchive(a)) continue;
          add({ model: null, flat: [a, r], ...(isNpcFlat(a) ? { person: true } : {}) }, 'dungeon');
        }
      }
    }
  }
  return out;
}

export function decorFlatLight(flat) {
  if (!Array.isArray(flat) || flat[0] !== LIGHTS_ARCHIVE) return null;
  const p = interiorLightProperties(flat[1]);
  return {
    color: (p.color ?? [1, 0.95, 0.8]).map((v) => Math.min(1, Math.max(0, v))),
    range: Math.min(30, Math.max(1, p.range)),
    intensity: Math.min(4, Math.max(0.05, p.intensity)),
  };
}

export function decorCatalogue(collected) {
  const entries = [];
  for (const [key, c] of collected ?? []) {
    let kind = c.model != null ? modelKind(c.as ?? c.model) : c.person ? 'people' : flatKind(c.as ?? c.flat[0]);
    if (c.from === 'dungeon' && (kind === 'furniture' || kind === 'decor')) kind = 'dungeon';
    if ((c.from === 'street' || c.from === 'modstreet') && (kind === 'furniture' || kind === 'decor')) kind = 'outdoor';
    if (c.from === 'mod' && (kind === 'furniture' || kind === 'decor')) kind = 'mods';
    if (c.nature != null) kind = 'nature';
    const light = c.flat ? decorFlatLight(c.flat) : null;
    const own = c.base ?? (c.model != null
      ? (kind === 'storage' ? HOUSE_CONTAINER_NAMES[c.model] : kind === 'bed' ? 'Bed' : IIL_FIREPLACE_MODELS.has(c.model) ? 'Fireplace' : null)
      : (kind === 'light' ? LIGHT_NAMES[c.flat[1]] : kind === 'nature' && isTreeRecord(c.nature, c.flat[1]) ? 'Tree' : null));
    entries.push({ key, model: c.model, flat: c.flat, kind, base: own ?? KIND_ONE[kind], count: c.count, storage: kind === 'storage', light, radius: null, from: c.from ?? 'room',
      ...(c.nature != null ? { nature: c.nature } : {}) });
  }
  const byBase = new Map();
  for (const e of entries) {
    const group = e.nature != null ? `${e.base}|${e.nature}` : e.base;
    const list = byBase.get(group) ?? [];
    list.push(e);
    byBase.set(group, list);
  }
  const idOrder = (e) => (e.model != null ? e.model : e.flat[0] * 1000 + e.flat[1]);
  const fromOrder = (e) => DECOR_FROM[e.from] ?? 0;
  // Each place numbers its names after every earlier place's, so adding a later place never renames a piece.
  for (const list of byBase.values()) {
    list.sort((a, b) => fromOrder(a) - fromOrder(b) || idOrder(a) - idOrder(b));
    let taken = 0;
    for (let i = 0; i < list.length;) {
      let j = i;
      while (j < list.length && fromOrder(list[j]) === fromOrder(list[i])) j++;
      const lone = taken === 0 && j - i === 1;
      for (let k = i; k < j; k++) list[k].name = lone ? list[k].base : `${list[k].base} ${taken + k - i + 1}`;
      taken += j - i;
      i = j;
    }
  }
  const kindOrder = Object.keys(DECOR_KINDS);
  entries.sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || b.count - a.count || idOrder(a) - idOrder(b));
  return entries.map((e) => Object.freeze({
    key: e.key, model: e.model, flat: e.flat ? Object.freeze([...e.flat]) : null, kind: e.kind, name: e.name,
    count: e.count, storage: e.storage, light: e.light ? Object.freeze({ ...e.light, color: Object.freeze([...e.light.color]) }) : null,
    from: e.from,
    outside: OUTSIDE.has(e.from),
    nude: !!e.flat && isNudeFlat(e.flat[0], e.flat[1]),
    ...(e.nature != null ? { nature: e.nature } : {}),
  }));
}

export const HALL_BOARD_ENTRY = Object.freeze({
  key: `m${BULLETIN_BOARD_MODEL_ID}`, model: BULLETIN_BOARD_MODEL_ID, flat: null, kind: 'furniture', name: 'Notice Board',
  count: 0, storage: false, light: null, hall: true,
});
// Mod pieces are checked against the live mods each time the offer is made, so a mod toggle applies at once.
export function decorRoomEntries(entries, room, show = null, mods = null) {
  const nude = !(show ?? showNudity());
  return entries?.filter((e) => (!e.hall || (!!room?.hall && !room?.yard))
    && !(room?.yard && e.kind === 'door')
    && !(nude && e.nude)
    && (!e.outside || !!room?.yard || e.kind === 'outdoor')
    && (e.nature == null || e.nature === room?.natureBase)
    && (!MOD_FROM.has(e.from) || !!mods?.has(e.key))) ?? null;
}

export const DECOR_SIZES = localizedStrings({ small: 'Small', medium: 'Medium', large: 'Large' });
export function decorSize(radiusMetres) {
  if (!(radiusMetres > 0)) return null;
  if (radiusMetres < 0.5) return 'small';
  if (radiusMetres < 1.25) return 'medium';
  return 'large';
}

/**
 * @param {readonly any[]} entries
 * @param {{ kinds?: Iterable<string>|null, text?: string, size?: string|null, storage?: boolean|null,
 *   light?: boolean|null, favourite?: Set<string>|null, sort?: string, radiusOf?: (entry: any) => (number|null) }} [opts]
 */
export function filterDecor(entries, {
  kinds = null, text = '', size = null, storage = null, light = null, favourite = null, sort = 'common', radiusOf = () => null,
} = {}) {
  const want = kinds && [...kinds].length ? new Set(kinds) : null;
  const words = String(text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const out = (entries ?? []).filter((e) => {
    if (want && !want.has(e.kind)) return false;
    if (favourite && !favourite.has(e.key)) return false;
    if (storage !== null && e.storage !== storage) return false;
    if (light !== null && (e.light !== null) !== light) return false;
    if (size !== null && decorSize(radiusOf(e)) !== size) return false;
    if (words.length) {
      const hay = `${e.name} ${DECOR_KINDS[e.kind]}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'price') {
    const p = (e) => decorPrice(radiusOf(e) ?? 0) || Infinity;
    out.sort((a, b) => p(a) - p(b) || a.name.localeCompare(b.name));
  }
  return out;
}
