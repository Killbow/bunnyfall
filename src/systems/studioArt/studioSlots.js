// @ts-check
import { wagonArt, wagonLookArt, WAGON_ARCHIVE, TEX as WAGON_TEX, LOOK_RECORDS, lookRecord, isGlassRecord } from '../../world/wagonArt.js';
import { WAGON_OUTSIDE_LOOKS, CARAVAN_INSIDE_LOOKS, LOOK_NAMES } from '../../travel/wagonLooks.js';
import { GALLEON_ARCHIVE, TEX as GALLEON_TEX, GALLEON_NIGHT, galleonArt, galleonGlow, shipStandIns } from '../../world/galleonArt.js';
import { CARRACK_ARCHIVE, TEX as CARRACK_TEX, CARRACK_NIGHT, carrackArt, carrackGlow } from '../../world/carrackArt.js';
import { LARGE_BOAT_ARCHIVE, TEX as BOAT_TEX, largeBoatArt } from '../../world/largeBoatArt.js';
import { TOWN_PICTURE_ARCHIVE, TOWN_PICTURES } from '../../world/townPictures.js';
import { LEFAY_ARCHIVE, LEFAY_GRANITE, LEFAY_MARBLE, LEFAY_GILT, LEFAY_PLAQUE, LEFAY_BRONZE } from '../../world/lefayMonument.js';
import { lefayArt } from '../../world/lefayArt.js';
import { YARD_ARCHIVE, YARD_REC, yardArt } from '../../world/merchantYards/merchantYardArt.js';
import { PORT_ARCHIVE, PORT_REC, PORT_PAINTERS, PORT_HOW } from '../../world/portArt.js';
import { textureKey, textureName } from '../../render/textureReplacement.js';
import { STUDIO_LABEL } from './studioArt.js';

export const slotLabel = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const words = (k) => k.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();
const asRgba = (p) => (p ? { width: p.width, height: p.height, data: p.data ?? p.colors } : null);
const nameOf = (table, rec) => Object.keys(table).find((k) => table[k] === rec);

const WAGON_NAMES = Object.freeze({
  floor: 'floorboards', side: 'cart side boards', inner: 'inner boards', beam: 'running gear', bench: 'bench', tyre: 'iron tyre',
  wheel: 'wheel face', iron: 'ironwork', openSide: 'open wagon side', tilt: 'open wagon tilt', tiltInner: 'open wagon tilt inside',
  caravanSide: 'caravan side', caravanFront: 'caravan front', caravanRear: 'caravan rear door', caravanRoof: 'caravan roof',
  roomSide: 'caravan room wall', roomFront: 'caravan room front', roomRear: 'caravan room rear', roomCeiling: 'caravan room ceiling',
  roomFloor: 'caravan room floor', harness: 'harness straps',
});
const wagonName = (rec) => WAGON_NAMES[nameOf(WAGON_TEX, rec)];

function wagonSlots() {
  const built = new Map(wagonArt());
  const paintOf = new Map();
  for (const [list, recs] of Object.entries(LOOK_RECORDS)) for (const rec of recs) paintOf.set(rec, [list, WAGON_OUTSIDE_LOOKS[list] ?? CARAVAN_INSIDE_LOOKS[list]]);
  const out = [];
  for (const [rec, pic] of built) {
    const p = paintOf.get(rec);
    out.push({ record: rec, name: p ? `${wagonName(rec)} - ${LOOK_NAMES[p[1][0]]}` : wagonName(rec), cutout: isGlassRecord(rec), picture: () => pic });
  }
  for (const [list, recs] of Object.entries(LOOK_RECORDS)) {
    const choices = WAGON_OUTSIDE_LOOKS[list] ?? CARAVAN_INSIDE_LOOKS[list];
    for (let i = 1; i < choices.length; i++) {
      const painted = new Map(/** @type {Array<[number, any]>} */ (wagonLookArt(list, i, choices[i])));
      for (const rec of recs) out.push({ record: lookRecord(rec, i), name: `${wagonName(rec)} - ${LOOK_NAMES[choices[i]]}`, cutout: isGlassRecord(lookRecord(rec, i)), picture: () => painted.get(lookRecord(rec, i)) });
    }
  }
  return out.sort((a, b) => a.record - b.record);
}

function shipSlots(archive, tex, art, night, glow) {
  const made = new Map(art());
  const entries = shipStandIns({ archive, name: 'studio', records: Object.values(tex), art: (r) => made.get(r) ?? null, night, glow });
  const dayOf = new Map(Object.entries(night).map(([day, twin]) => [twin, Number(day)]));
  return entries.map((e) => ({
    record: e.record,
    name: dayOf.has(e.record) ? `${words(nameOf(tex, dayOf.get(e.record)))} · at night` : words(nameOf(tex, e.record)),
    cutout: Object.hasOwn(night, e.record),
    picture: () => e.build(),
  })).sort((a, b) => a.record - b.record);
}

const LEFAY_NAMES = Object.freeze({ [LEFAY_GRANITE]: 'granite steps', [LEFAY_MARBLE]: 'marble', [LEFAY_GILT]: 'gilt point', [LEFAY_PLAQUE]: 'plaque', [LEFAY_BRONZE]: 'bronze edge' });

// `vendor`: a studio picture outranks the painted stand-in on the texture door. `painted`: the host paints and
// uploads its pictures, asking paintedReplacement first.
export const STUDIO_SETS = Object.freeze([
  { id: 'wagons', title: 'Wagons, carts and the caravan', archive: WAGON_ARCHIVE, door: 'painted', slots: wagonSlots },
  { id: 'galleon', title: 'The galleon', archive: GALLEON_ARCHIVE, door: 'vendor', slots: () => shipSlots(GALLEON_ARCHIVE, GALLEON_TEX, galleonArt, GALLEON_NIGHT, galleonGlow) },
  { id: 'carrack', title: 'The carrack', archive: CARRACK_ARCHIVE, door: 'vendor', slots: () => shipSlots(CARRACK_ARCHIVE, CARRACK_TEX, carrackArt, CARRACK_NIGHT, carrackGlow) },
  { id: 'largeboat', title: 'The large boat', archive: LARGE_BOAT_ARCHIVE, door: 'vendor', slots: () => shipSlots(LARGE_BOAT_ARCHIVE, BOAT_TEX, largeBoatArt, {}, () => null) },
  { id: 'hangings', title: "Towns' tapestries, banners and rugs", archive: TOWN_PICTURE_ARCHIVE, door: 'vendor', slots: () => TOWN_PICTURES.map((p, record) => ({ record, name: p.name, picture: () => p.draw() })) },
  { id: 'yards', title: 'The stable, wagon yard and joinery', archive: YARD_ARCHIVE, door: 'painted', slots: () => yardArt().map(([record, pic]) => ({ record, name: words(nameOf(YARD_REC, record)), picture: () => pic })) },
  { id: 'port', title: 'The shipyard and the lighthouse', archive: PORT_ARCHIVE, door: 'painted', slots: () => PORT_PAINTERS.map(([record, paint]) => ({ record, name: words(nameOf(PORT_REC, record)), cutout: PORT_HOW[record]?.cutout === true, picture: paint })) },
  { id: 'lefay', title: 'The LeFay monument', archive: LEFAY_ARCHIVE, door: 'painted', slots: () => lefayArt().map(([record, pic]) => ({ record, name: LEFAY_NAMES[record], picture: () => pic })) },
]);

/** @param {typeof STUDIO_SETS[number]} set */
export function studioSlots(set) {
  return set.slots().map((s) => {
    const key = textureKey(set.archive, s.record, 0);
    return {
      set: set.id, archive: set.archive, record: s.record, key, name: s.name,
      // A cut-out slot's door treats a texel under half opaque as a hole.
      cutout: s.cutout === true,
      fileName: `${textureName(set.archive, s.record, 0)}${STUDIO_LABEL}${slotLabel(s.name)}.png`,
      picture: async () => asRgba(await s.picture()),
    };
  });
}
