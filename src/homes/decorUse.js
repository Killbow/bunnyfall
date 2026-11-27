// @ts-check
import { isBedModel } from '../mods/rrRealism.js';
import { classicModelIdOf } from '../world/customModels.js';
import { isHearthFlat } from '../systems/survival/hearth.js';
import { IIL_FIREPLACE_MODELS } from '../render/improvedInteriorLighting.js';

export const COOKING_STATION = 'cooking';

// A placed bed is slept in whenever pressed, unlike the room's own beds, which need Roleplay Realism bed sleeping.
export function decorBed(piece) {
  if (!piece || piece.storage || piece.station || piece.model == null) return false;
  return isBedModel(classicModelIdOf(piece.model));
}

export function decorHearth(piece) {
  if (!piece || piece.storage) return false;
  if (piece.station) return piece.station === COOKING_STATION;
  if (piece.model != null) return IIL_FIREPLACE_MODELS.has(classicModelIdOf(piece.model));
  return Array.isArray(piece.flat) && isHearthFlat(piece.flat[0], piece.flat[1]);
}

export function useDecorPiece(piece, camps, mode, bed, stores = () => false) {
  if (piece?.station === COOKING_STATION && !piece.storage && stores()) return true;
  // A placed fire answers only where the room's own braziers do (`camps.usable`).
  if (decorHearth(piece)) { if (camps.usable?.() !== false) camps.activate('hearth:', mode()); }
  else if (decorBed(piece)) bed();
  else return false;
  return true;
}
