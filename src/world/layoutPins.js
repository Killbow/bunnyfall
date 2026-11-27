import { setLayoutPinOracle, worldDataVendorCarries, locationReplacementFilename, blockReplacementFilename } from '../formats/worldDataReplacement.js';

export const LAYOUT_MODS = Object.freeze(['beautiful-villages', 'beautiful-cities']);

// Stamps compare layout mods and ignore versions, so updating a vendored pack that moves buildings needs a
// migration for records stamped with the old version.
export const LAYOUT_MOD_VERSIONS = Object.freeze({ 'beautiful-villages': '1.4.2', 'beautiful-cities': '0.5.0' });

export const PINS_DROPPED_LINE = 'Some of your places could not be shown as you left them. Switch on Replace Game Artwork, or check your connection, then reload.';

export const CLASSIC_LAYOUT = 'classic';

export const HOME_LAYOUTS_WAIT_MS = 6000;
export const HOME_LAYOUTS_RETRIES = 4;

let _vendorOn = () => false;
let _vendorVersion = () => '';
let _keyOfMapId = () => null;
let _keyOfPixel = () => null;
let _gridOf = () => null;
let _keyOfTown = () => null;
let _typeOf = () => null;
let _pins = new Map();
let _heldBack = new Set();
let _missingVendors = new Set();
let _displaced = () => false;

export function configureLayoutPins({ vendorOn = null, vendorVersion = null, locationKeyOfMapId = null, locationKeyOfPixel = null, gridOf = null, locationKeyOfTown = null, locationTypeOf = null, recordDisplaced = null } = {}) {
  if (typeof recordDisplaced === 'function') _displaced = recordDisplaced;
  if (typeof locationTypeOf === 'function') _typeOf = locationTypeOf;
  if (typeof locationKeyOfTown === 'function') _keyOfTown = locationKeyOfTown;
  if (typeof vendorOn === 'function') _vendorOn = vendorOn;
  if (typeof vendorVersion === 'function') _vendorVersion = vendorVersion;
  if (typeof locationKeyOfMapId === 'function') _keyOfMapId = locationKeyOfMapId;
  if (typeof locationKeyOfPixel === 'function') _keyOfPixel = locationKeyOfPixel;
  if (typeof gridOf === 'function') _gridOf = gridOf;
}

// A town whose grid the host cannot name counts as changed by every serving mod; a pin that changes nothing costs
// nothing.
export function layoutModTouches(vendor, locationKey) {
  if (locationKey == null || locationKey < 0) return true;
  const regionIndex = locationKey % 100, locationIndex = Math.floor(locationKey / 100);
  if (worldDataVendorCarries(vendor, locationReplacementFilename(regionIndex, locationIndex))) return true;
  const grid = _gridOf(locationKey);
  if (!Array.isArray(grid)) return true;
  return grid.some((name) => typeof name === 'string' && worldDataVendorCarries(vendor, blockReplacementFilename(name)));
}

export function layoutStampOf(vendors) {
  const list = [...vendors].filter((v) => LAYOUT_MODS.includes(v)).sort().map((v) => `${v}@${_vendorVersion(v) || '?'}`);
  return list.length ? list.join('+') : CLASSIC_LAYOUT;
}
// A record without a stamp predates layout pins and reads as the classic layout.
export function stampVendors(stamp) {
  if (typeof stamp !== 'string' || !stamp || stamp === CLASSIC_LAYOUT) return new Set();
  return new Set(stamp.split('+').map((s) => s.split('@')[0]).filter((v) => LAYOUT_MODS.includes(v)));
}

// The 34 temples are curated by location key, never by grid, because the host may hold the mod's or Daggerfall's
// grid depending on read order.
export const CURATED_CLASSIC = Object.freeze([
  Object.freeze({ vendor: 'beautiful-villages', locationType: 6, blocks: Object.freeze(['TVRNAS00.RMB', 'TVRNAS06.RMB']), why: 'a tavern with no tavern' }),
  Object.freeze({
    vendor: 'beautiful-villages', why: 'a temple with no house',
    locations: Object.freeze([4401, 4501, 6442, 6801, 7001, 7842, 10142, 10801, 17760, 19442, 20301, 20701, 22901, 26201, 27201, 28560, 29401,
      31360, 35801, 41901, 43660, 46060, 46101, 46801, 48201, 51501, 51901, 57801, 62601, 63001, 67301, 85801, 88701, 89701]),
  }),
]);
const CURATED_TOWNS = new Map();
for (const c of CURATED_CLASSIC) for (const k of c.locations ?? []) (CURATED_TOWNS.get(k) ?? CURATED_TOWNS.set(k, []).get(k)).push(c.vendor);
// Guards re-entry: a resolver that reads the location through the door asks this oracle again, which answers
// nothing meanwhile.
let _curating = false;
export function curatedOut(locationKey) {
  if (locationKey == null || locationKey < 0 || _curating) return null;
  _curating = true;
  try {
    let out = CURATED_TOWNS.has(locationKey) ? new Set(CURATED_TOWNS.get(locationKey)) : null;
    const type = _typeOf(locationKey);
    if (type == null) return out;
    for (const c of CURATED_CLASSIC) {
      if (!c.blocks || type !== c.locationType) continue;
      const grid = _gridOf(locationKey);
      if (Array.isArray(grid) && grid.some((n) => c.blocks.includes(n))) (out ??= new Set()).add(c.vendor);
    }
    return out;
  } finally { _curating = false; }
}
const curatedPin = (locationKey) => {
  const out = curatedOut(locationKey);
  return out ? { out, in: new Set(), stamp: CLASSIC_LAYOUT, why: 'curated' } : null;
};
const servesUnpinned = (v, locationKey) => !!_vendorOn(v) && !(curatedOut(locationKey)?.has(v));

export const pinAt = (locationKey) => _pins.get(locationKey) ?? curatedPin(locationKey);
setLayoutPinOracle(pinAt);

export function layoutStampAt(locationKey) {
  const p = locationKey == null ? null : pinAt(locationKey);
  const live = LAYOUT_MODS.filter((v) => (p?.in.has(v)) || (_vendorOn(v) && !p?.out.has(v)));
  return layoutStampOf(live.filter((v) => layoutModTouches(v, locationKey)));
}
export const layoutStampOfMapId = (mapId) => layoutStampAt(mapId ? _keyOfMapId(mapId) : null);
export const layoutStampOfPixel = (x, y) => layoutStampAt(Number.isFinite(x) && Number.isFinite(y) ? _keyOfPixel(x, y) : null);
export function layoutsMatch(a, b) {
  const va = stampVendors(a), vb = stampVendors(b);
  return va.size === vb.size && [...va].every((v) => vb.has(v));
}
export function recordStands(rec) {
  if (!rec?.mapId || layoutLocationKeyOfMapId(rec.mapId) == null) return true;
  if (_displaced(rec)) return false;
  return layoutsMatch(rec.layout, layoutStampOfMapId(rec.mapId));
}
export function layoutStampOfTown(locationId) {
  const m = /^(\d+):(.+)$/.exec(String(locationId ?? ''));
  const key = m ? _keyOfTown(Number(m[1]), m[2]) : null;
  return key == null ? null : layoutStampAt(key);
}
// The classic layout writes no field, which keeps saves from games without town mods identical to saves that
// predate stamps.
export function stampLayout(rec, stamp) {
  if (!rec || typeof rec !== 'object') return rec;
  if (typeof stamp === 'string' && stamp && stamp !== CLASSIC_LAYOUT) rec.layout = stamp;
  else delete rec.layout;
  return rec;
}
export function recordHeldBack(rec) {
  const key = layoutLocationKeyOfMapId(rec?.mapId ?? rec?.mapID ?? 0);
  if (key == null) return false;
  if (_heldBack.has(key)) return true;
  for (const v of stampVendors(rec?.layout)) if (_missingVendors.has(v)) return true;
  return false;
}
export const layoutLocationKeyOfMapId = (mapId) => (mapId ? _keyOfMapId(mapId) ?? null : null);

export const RECORD_WEIGHT = Object.freeze({ house: 5, room: 4, quest: 3, questor: 3, inside: 2, anchor: 2, repair: 1 });

/** @returns {Map<number, {out:Set<string>, in:Set<string>, stamp:string, why:string}>} */
export function pinsFrom(records) {
  const best = new Map();
  for (const r of records ?? []) {
    if (r?.locationKey == null || r.locationKey < 0) continue;
    const w = RECORD_WEIGHT[r.kind] ?? 0;
    const b = best.get(r.locationKey);
    if (!b || w > b.w) best.set(r.locationKey, { w, r });
  }
  const pins = new Map();
  for (const [key, { r }] of best) {
    const want = stampVendors(r.stamp);
    const out = new Set(), inn = new Set();
    for (const v of LAYOUT_MODS) {
      const on = servesUnpinned(v, key);
      if (on && !want.has(v) && layoutModTouches(v, key)) out.add(v);
      if (!on && want.has(v)) inn.add(v);
    }
    if (out.size || inn.size) pins.set(key, { out, in: inn, stamp: typeof r.stamp === 'string' && r.stamp ? r.stamp : CLASSIC_LAYOUT, why: r.kind });
  }
  return pins;
}

export function setLayoutPins(pins, { heldBack = null, missing = null } = {}) {
  _heldBack = new Set(heldBack ?? []);
  _missingVendors = new Set(missing ?? []);
  const next = pins instanceof Map ? pins : new Map();
  const changed = new Set();
  const same = (a, b) => !!a && !!b && a.out.size === b.out.size && a.in.size === b.in.size && [...a.out].every((v) => b.out.has(v)) && [...a.in].every((v) => b.in.has(v));
  for (const [k, p] of next) if (!same(p, _pins.get(k))) changed.add(k);
  for (const k of _pins.keys()) if (!next.has(k)) changed.add(k);
  _pins = next;
  return changed;
}

// Must run before the pins are installed: a pin into a pack that does not load is dropped, and the records in that
// town sleep.
export async function admitPinnedPacks(pins, ensure) {
  let dropped = 0;
  const heldBack = new Set();
  for (const [key, pin] of pins) {
    for (const v of [...pin.in]) if (!(await ensure(v))) { pin.in.delete(v); dropped++; heldBack.add(key); }
  }
  return { dropped, heldBack };
}

export function vendorsPinnedIn() {
  const out = new Set();
  for (const p of _pins.values()) for (const v of p.in) out.add(v);
  return out;
}

export const layoutPins = () => new Map(_pins);

export function layoutRecordsOf({ houses = [], rooms = [], sites = [], questors = [], repairs = [], anchor = null, inside = null } = {}, { locationKeyOfMapId = _keyOfMapId, locationKeyOfPixel = _keyOfPixel } = {}) {
  const out = [];
  for (const h of houses ?? []) if (h && h.buildingKey > 0 && h.mapId) out.push({ locationKey: locationKeyOfMapId(h.mapId), stamp: h.layout, kind: 'house' });
  for (const r of rooms ?? []) if (r && r.buildingKey > 0 && r.mapId) out.push({ locationKey: locationKeyOfMapId(r.mapId), stamp: r.layout, kind: 'room' });
  for (const site of sites ?? []) {
    // An unseated site still asks for the layout it was chosen in.
    const s = site?.unseated ? { ...site, ...site.unseated } : site;
    if (s && s.buildingKey > 0 && s.mapId) out.push({ locationKey: locationKeyOfMapId(s.mapId), stamp: s.layout, kind: 'quest' });
  }
  for (const q of questors ?? []) if (q && q.buildingKey > 0 && q.mapID) out.push({ locationKey: locationKeyOfMapId(q.mapID), stamp: q.layout, kind: 'questor' });
  for (const d of repairs ?? []) if (d && d.buildingKey > 0 && d.mapId) out.push({ locationKey: locationKeyOfMapId(d.mapId), stamp: d.layout, kind: 'repair' });
  if (anchor?.insideBuilding && anchor.pixel) out.push({ locationKey: locationKeyOfPixel(anchor.pixel.x, anchor.pixel.y), stamp: anchor.layout, kind: 'anchor' });
  if (inside?.pixel) out.push({ locationKey: locationKeyOfPixel(inside.pixel.x, inside.pixel.y), stamp: inside.layout, kind: 'inside' });
  return out;
}

export function _resetLayoutPins() {
  _pins = new Map();
  _heldBack = new Set();
  _missingVendors = new Set();
  _typeOf = () => null;
  _vendorOn = () => false;
  _vendorVersion = () => '';
  _keyOfMapId = () => null;
  _keyOfPixel = () => null;
  _gridOf = () => null;
  _keyOfTown = () => null;
  _displaced = () => false;
}
