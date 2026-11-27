// @ts-check
// Rox's Argonian faces: ten more faces for Argonians, beside the classic ten.

export const CLASSIC_FACES = 10;
export const ROX_FACES = 10;
export const ROX_RACE = 'Argonian';
export const FACE_INDEX_MAX = CLASSIC_FACES + ROX_FACES - 1;

export const facesFor = (race) => (race === ROX_RACE ? CLASSIC_FACES + ROX_FACES : CLASSIC_FACES);
export const isRoxFace = (race, faceIndex) => race === ROX_RACE && (faceIndex | 0) >= CLASSIC_FACES && (faceIndex | 0) < CLASSIC_FACES + ROX_FACES;
export const wearsRox = (entity) => !!entity && isRoxFace(entity.race, entity.faceIndex);
export const classicFaceRecord = (faceIndex) => Math.max(0, (faceIndex | 0) % CLASSIC_FACES);
export const roxIndex = (faceIndex) => Math.max(0, Math.min(ROX_FACES - 1, (faceIndex | 0) - CLASSIC_FACES));
export const ROX_HEAD_RECT = Object.freeze({ x: 19, y: -1, width: 74, height: 68 });
