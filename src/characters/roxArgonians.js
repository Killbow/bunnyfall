// @ts-check
// BUNNYFALL (2026-11-06, the owner: "rox's new argonian is gonna be an extra set of options for argonians and not
// replacing"): ROX'S NEW ARGONIANS (SynfulRoX, Nexus daggerfallunity mod 1206, "free to edit and/or redistribute, as long
// as credit to the original creator is included") - TEN MORE FACES FOR ARGONIANS, beside the classic ten.
//
// THE LAW: an Argonian's face 0..9 is Daggerfall's FACE?7I0.CIF record, as ever; 10..19 is Rox's face (index - 10),
// and a Rox face brings Rox's body (both paper-doll layers, unclothed and clothed) and, cursed, its own vampire face
// (the mod's Vampiric Options set). Anything that reads Daggerfall's own records (the 3D heads matched off a portrait,
// the dialogue portrait, the family tree) reads the classic face of the same number (classicFaceRecord). The art is in
// vendor/roxs-new-argonians/ and is drawn by ui/roxArgonianArt.js. A LEAF: imports nothing, so the wire can read it.

/** Classic faces in each race's FACE CIF. */
export const CLASSIC_FACES = 10;
/** Rox's faces, after the classic ones. */
export const ROX_FACES = 10;
/** The race the set is for. */
export const ROX_RACE = 'Argonian';
/** The highest face index any race may carry (the wire's bound). */
export const FACE_INDEX_MAX = CLASSIC_FACES + ROX_FACES - 1;

/** How many faces `race` offers at character creation. */
export const facesFor = (race) => (race === ROX_RACE ? CLASSIC_FACES + ROX_FACES : CLASSIC_FACES);
/** Is face `faceIndex` of `race` one of Rox's. */
export const isRoxFace = (race, faceIndex) => race === ROX_RACE && (faceIndex | 0) >= CLASSIC_FACES && (faceIndex | 0) < CLASSIC_FACES + ROX_FACES;
/** Does `entity` (race, faceIndex) wear a Rox face. */
export const wearsRox = (entity) => !!entity && isRoxFace(entity.race, entity.faceIndex);
/** The Daggerfall record a face index reads where only Daggerfall's own art can answer (0..9). */
export const classicFaceRecord = (faceIndex) => Math.max(0, (faceIndex | 0) % CLASSIC_FACES);
/** Rox's own index (0..9) of a Rox face. */
export const roxIndex = (faceIndex) => Math.max(0, Math.min(ROX_FACES - 1, (faceIndex | 0) - CLASSIC_FACES));
/** The head's box on the paper doll, from the mod's xml sidecars (<rect scale="8"> x 152 y -8 w 592 h 544, over 8). */
export const ROX_HEAD_RECT = Object.freeze({ x: 19, y: -1, width: 74, height: 68 });
