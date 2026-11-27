export const CLOAK_NAMES = Object.freeze(['Casual Cloak', 'Formal Cloak']);

export const CLOAK_PAINTINGS = Object.freeze(['blue', 'grey', 'red', 'dark_brown', 'purple', 'light_brown', 'white', 'green']);

export const CLOAK_DYE_PAINTING = Object.freeze(['blue', 'grey', 'red', 'dark_brown', 'purple', 'light_brown', 'white', 'blue', 'light_brown', 'green']);

export const cloakModel = (painting) => `cloak_${painting}.nif`;

export function ownCloakFor(piece) {
  if (!piece || piece.kind !== 'clothing' || !CLOAK_NAMES.includes(piece.name)) return null;
  const painting = CLOAK_DYE_PAINTING[piece.dye | 0] ?? CLOAK_DYE_PAINTING[0];
  return Object.freeze({ id: 'daggerfall_cloak', model: cloakModel(painting), painting });
}

export const ownCloakModelPaths = () => CLOAK_PAINTINGS.map((p) => `meshes/${cloakModel(p)}`);

export const isCloakSlot = (slot) => String(slot ?? '').startsWith('cloak (');

const outfit = (archive, hides, covers = []) => Object.freeze({
  id: `townsfolk_${archive}`, archive, model: `townsfolk_${archive}.nif`, hides: Object.freeze(hides), covers: Object.freeze(covers),
});
const PAIR = (...parts) => parts.flatMap((p) => [`right ${p}`, `left ${p}`]);

export const TOWNSFOLK_OUTFITS = Object.freeze(Object.fromEntries([
  outfit(381, ['groin']),
  outfit(382, ['groin']),
  outfit(383, ['groin']),
  outfit(384, ['groin', ...PAIR('ankle', 'foot')]),
  outfit(385, ['cuirass', 'groin', ...PAIR('upper arm', 'forearm', 'upper leg', 'knee', 'ankle', 'foot')]),
  outfit(386, ['cuirass', 'groin', ...PAIR('wrist', 'upper leg', 'knee', 'ankle', 'foot')]),
  outfit(387, ['groin', ...PAIR('wrist', 'ankle', 'foot')]),
  outfit(388, ['cuirass', 'groin', 'hair', ...PAIR('upper leg', 'knee', 'ankle', 'foot')]),
  outfit(389, ['cuirass', 'groin', 'hair', ...PAIR('upper leg', 'knee', 'ankle', 'foot')]),
  outfit(390, ['cuirass', 'groin', ...PAIR('wrist', 'upper leg', 'knee', 'ankle', 'foot')]),
  outfit(398, ['groin', 'hair', ...PAIR('upper leg', 'foot')], ['chest']),
].map((o) => [o.archive, o])));

export const townsfolkOutfitOf = (archive) => TOWNSFOLK_OUTFITS[archive] ?? null;

export function ownOutfitFor(id) {
  for (const o of Object.values(TOWNSFOLK_OUTFITS)) if (o.id === id) return o;
  return null;
}

export const ownOutfitModelPaths = () => Object.values(TOWNSFOLK_OUTFITS).map((o) => `meshes/${o.model}`);

export const isOutfitSlot = (slot) => String(slot ?? '').startsWith('outfit (');
