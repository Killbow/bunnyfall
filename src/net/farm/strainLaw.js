// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 2c (docs/FARM-EXPANSION.md section 4.2): STRAINS. Harvesting a ripe bed while another
// ripe bed of the same crop stands as its partner may drop a CROSS SEED - the better both were tended, the likelier. The
// farm names the strain and it gets a sack of its own on the seed shelf. A strain is its crop with one or two traits:
//   quick  - ripens in QUICK_SHARE of the time;   hardy - half the seasons' slowing;   heavy - one more crop a harvest;
//   showy  - counts at the market's contests (Phase 7);   sweet - a kitchen trait for the pot (Phase 4).
// A cross of strains inherits their traits first. At most STRAINS_MAX a farm; an officer burns one to free its place.
// A planted bed carries its strain's id and traits, so its growth needs nothing else. Pure; the roll is the bed's own
// hash of the farm, the bed and the moment, so the service decides it once.

export const STRAINS_MAX = 12;
export const STRAIN_TRAITS = Object.freeze(['quick', 'hardy', 'heavy', 'showy', 'sweet']);
export const QUICK_SHARE = .85;
/** The chance a harvest with a partner drops a cross seed, by both beds' care (0..6 each). */
export const crossChance = (careA, careB) => Math.min(.3, .05 + .02 * ((careA | 0) + (careB | 0)));

const NAMES = Object.freeze({
  first: Object.freeze(['Golden', 'Red', 'Hollow', 'Iliac', 'Sun', 'Old', 'Morrow', 'Silver', 'Wayrest', 'Dusk', 'Bright', 'Long', 'Stout', 'Gentle', 'Bay', 'High']),
  last: Object.freeze({ grain: ['Ear', 'Sheaf', 'Wheat', 'Awn'], mushroom: ['Cap', 'Button', 'Hood', 'Bell'], herbs: ['Leaf', 'Sprig', 'Bloom', 'Wort'],
    corn: ['Cob', 'Tassel', 'Maize'], cabbage: ['Head', 'Heart', 'Leaf'], tomato: ['Apple', 'Globe', 'Cherry'], sunflower: ['Face', 'Crown', 'Wheel'],
    berries: ['Berry', 'Bramble', 'Drop'], root: ['Root', 'Tuber', 'Knob'], flax: ['Flax', 'Thread', 'Blue'], gourd: ['Gourd', 'Belly', 'Drum'],
    grapes: ['Grape', 'Vine', 'Cluster'] }),
});
function hash(...xs) {
  let h = 0x811c9dc5;
  for (const x of xs) { h = Math.imul(h ^ (x | 0), 0x01000193) >>> 0; h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0; }
  return (h ^ (h >>> 15)) >>> 0;
}
/** A strain's name, from its crop and its id - the same on every client. */
export function strainName(crop, id) {
  const last = NAMES.last[crop] ?? ['Seed'];
  return `${NAMES.first[hash(id, 7) % NAMES.first.length]} ${last[hash(id, 13) % last.length]}`;
}
/** Whether the cross rolls true for this harvest (`roll` 0..1 against the chance). */
export const crossRoll = (mapId, bed, nowS) => hash(mapId >>> 0, bed, Math.floor(nowS)) / 4294967296;

/** A new strain's traits: the parents' first (one or two of them), else one or two drawn on its id. */
export function strainTraits(id, parentTraits) {
  const out = [...new Set(parentTraits ?? [])].filter((t) => STRAIN_TRAITS.includes(t)).slice(0, 2);
  const n = hash(id, 3) % 3 === 0 ? 2 : 1;
  for (let k = 0; out.length < n && k < 10; k++) { const t = STRAIN_TRAITS[hash(id, 31 + k) % STRAIN_TRAITS.length]; if (!out.includes(t)) out.push(t); }
  return out;
}
export const strainOf = (garden, id) => (garden?.strains ?? []).find((s) => s.id === id) ?? null;

/** Whether a garden's strains and a bed's strain marks are well formed (absent is fine). */
export function validStrains(garden, seedIds) {
  const int = (n, max) => Number.isSafeInteger(n) && n >= 1 && n <= max;
  if (garden.nextStrain !== undefined && !int(garden.nextStrain, 2147483647)) return false;
  return garden.strains === undefined || (Array.isArray(garden.strains) && garden.strains.length <= STRAINS_MAX && garden.strains.every((s) =>
    s && int(s.id, 2147483647) && seedIds.includes(s.crop) && typeof s.name === 'string' && s.name.length <= 40
    && Array.isArray(s.traits) && s.traits.length <= 2 && s.traits.every((t) => STRAIN_TRAITS.includes(t))));
}
export const validBedStrain = (b) => (b.strain === undefined || (Number.isSafeInteger(b.strain) && b.strain >= 1))
  && (b.traits === undefined || (Array.isArray(b.traits) && b.traits.length <= 2 && b.traits.every((t) => STRAIN_TRAITS.includes(t))));

/** A cross seed added to `next` (mutated) for `crop`, its parents' traits carried: the new strain, or null when full. */
export function addStrain(next, crop, parentTraits) {
  const strains = next.strains ?? [];
  if (strains.length >= STRAINS_MAX) return null;
  const id = next.nextStrain ?? 1;
  const strain = { id, crop, name: strainName(crop, id), traits: strainTraits(id, parentTraits) };
  next.strains = [...strains, strain]; next.nextStrain = id + 1;
  return strain;
}
