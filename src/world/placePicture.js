// @ts-check
import { getWorldClimateSettings } from '../formats/mapsFile.js';
import { getTerrainGroundArchive, SEASON } from './climateSwaps.js';
import { toColor32 } from '../formats/color32Order.js';
import { dfmodGroundLayers } from '../mods/dfmodTextures.js';
import { hasTextureReplacement, decodedTextureTopDown, preloadTextureArchive } from '../render/textureReplacement.js';

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
    if (d?.rgba) return toColor32({ width: d.width, height: d.height, data: /** @type {any} */ (d.rgba) });
  }
  const bm = tex?.getDFBitmap?.(src.record, 0);
  return bm?.data ? tex.getColor32(bm) : null;
}
