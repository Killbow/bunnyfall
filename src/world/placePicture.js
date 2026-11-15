// @ts-check
// Picks the picture for a mesh a spell makes at a place. Outdoors it is the terrain's dirt (record 1). Underground it
// is the dungeon's wall picture, or the climate's cave rock (climateType + 47, record 0) where there is none. A texture
// mod's picture is used where one is active.
import { getWorldClimateSettings } from '../formats/mapsFile.js';
import { getTerrainGroundArchive, SEASON } from './climateSwaps.js';
import { toColor32 } from '../formats/color32Order.js';
import { dfmodGroundLayers } from '../systems/dfmodTextures.js';
import { hasTextureReplacement, decodedTextureTopDown, preloadTextureArchive } from '../systems/textureReplacement.js';

export const GROUND_TILE_M = 6.4, ROCK_TILE_M = 3.2;

export function placePictureSource(place) {
  const settings = Number.isInteger(place.climateIndex) ? getWorldClimateSettings(place.climateIndex) : { climateType: 300, groundArchive: 302 };
  if (!place.underground) return { kind: 'ground', archive: getTerrainGroundArchive(settings, place.season ?? SEASON.Summer), record: 1, tile: GROUND_TILE_M };
  const own = place.dungeonWall;
  if (Number.isInteger(own?.archive) && Number.isInteger(own.record)) {
    const tile = own.tile > 0 ? own.tile : ROCK_TILE_M;
    return { kind: 'dungeon', archive: own.archive, record: own.record, tile, tileV: own.tileV > 0 ? own.tileV : tile };
  }
  return { kind: 'rock', archive: settings.climateType + 47, record: 0, tile: ROCK_TILE_M };
}

export function rockPictureSource(place) {
  const settings = Number.isInteger(place.climateIndex) ? getWorldClimateSettings(place.climateIndex) : { climateType: 300 };
  return { kind: 'rock', archive: settings.climateType + 47, record: 0, tile: ROCK_TILE_M };
}

export async function placePicture(src, getTexture) {
  const tex = await getTexture(src.archive);
  if (src.kind === 'ground') {
    const layer = (await dfmodGroundLayers(src.archive, tex))?.[src.record];
    if (layer?.colors) return layer;
  } else if (hasTextureReplacement(src.archive, src.record)) {
    await preloadTextureArchive(src.archive);
    const d = decodedTextureTopDown(src.archive, src.record);
    if (d?.rgba) return toColor32({ width: d.width, height: d.height, data: d.rgba });
  }
  const bm = tex?.getDFBitmap?.(src.record, 0);
  return bm?.data ? tex.getColor32(bm) : null;
}
