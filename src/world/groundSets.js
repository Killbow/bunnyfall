// @ts-check
import { dfmodGroundLayers } from '../mods/dfmodTextures.js';
import { grassRecordsOf, floorRecordsOf, tileMeanColour } from '../render/labGrass.js';
import { markPuddleWaterSteps, carryPuddleMaskSteps, stepsBreathing } from './puddleMask.js';
import { twinKey, twinLayers } from '../weather/snowCoverHost.js';

/** @param {{ renderer: any, getTexture: (archive: number) => Promise<any>, labGrass: any, breathe: () => Promise<void>, grassRecords: Map<number, any>, floorRecords: Map<number, any>, groundPuddles: Map<number, any>, groundMeanColour: Map<number, any>, groundDrawnMeans: Map<number, any> }} deps */
export function createGroundSets({ renderer, getTexture, labGrass, breathe, grassRecords, floorRecords, groundPuddles, groundMeanColour, groundDrawnMeans }) {
  const groundLayersOf = async (archive, tex) => {
    const modLayers = await dfmodGroundLayers(archive, tex), classic = [];
    for (let r = 0; r < tex.recordCount; r++) classic.push(tex.getColor32(tex.getDFBitmap(r, 0), 0));
    const marked = await stepsBreathing(markPuddleWaterSteps(classic), breathe);
    if (!groundPuddles.has(archive)) groundPuddles.set(archive, marked);
    return { modLayers, layers: modLayers ? await stepsBreathing(carryPuddleMaskSteps(modLayers, marked), breathe) : marked };
  };
  const _loading = new Map();
  const makeSet = async (key, groundArchive, groundTex, winter) => {
    const twin = winter == null ? null : getTexture(winter).then((tex) => groundLayersOf(winter, tex));
    twin?.catch(() => {});
    const own = await groundLayersOf(groundArchive, groundTex);
    const layers = twin == null ? own.layers : twinLayers(own.layers, (await twin).layers);
    await stepsBreathing(renderer.uploadTileArraySteps(key, layers), breathe);
    // Take the means from these drawn layers; a second mod lookup can decode different tiles when a mod is indexed
    // mid-session.
    if (labGrass) groundDrawnMeans.set(groundArchive, own.modLayers ? own.modLayers.map(tileMeanColour) : null);
  };
  const loadGroundSet = async (groundArchive, hold, winter = null) => {
    // On the snow lane the twin is one array, summer records then winter ones (`twinLayers`), held and uploaded
    // once under `twinKey`.
    const key = winter == null ? groundArchive : twinKey(groundArchive);
    // Hold the tile array before awaiting the texture, so no cache sweep during the await frees what this pixel
    // will draw.
    hold.tileArray(key); const groundTex = await getTexture(groundArchive);
    if (!renderer.tileArrays.has(key)) {
      let loading = _loading.get(key);
      if (!loading) {
        loading = makeSet(key, groundArchive, groundTex, winter).finally(() => _loading.delete(key));
        _loading.set(key, loading);
      }
      await loading;
    }
    renderer.applyGroundSharpness();
    // Learned whenever missing, even on a tile-cache hit: the renderer keeps tile arrays across scenes.
    const drawnMeans = grassRecords.has(groundArchive) ? null
      : groundDrawnMeans.has(groundArchive) ? groundDrawnMeans.get(groundArchive)
      : (await dfmodGroundLayers(groundArchive, groundTex))?.map(tileMeanColour) ?? null;
    if (!grassRecords.has(groundArchive) && !groundPuddles.has(groundArchive)) {
      const classic = [];
      for (let r = 0; r < groundTex.recordCount; r++) classic.push(groundTex.getColor32(groundTex.getDFBitmap(r, 0), 0));
      const marked = await stepsBreathing(markPuddleWaterSteps(classic), breathe);
      if (!groundPuddles.has(groundArchive)) groundPuddles.set(groundArchive, marked);
    }
    if (!grassRecords.has(groundArchive)) {
      const layers = [];
      for (let r = 0; r < groundTex.recordCount; r++) layers.push(groundTex.getColor32(groundTex.getDFBitmap(r, 0), 0));
      grassRecords.set(groundArchive, grassRecordsOf(layers)); floorRecords.set(groundArchive, floorRecordsOf(layers));
      // Means come from the drawn tiles when a texture mod dresses the archive; which records are grass still comes
      // from the classic texels.
      groundMeanColour.set(groundArchive, drawnMeans ?? layers.map(tileMeanColour));
    }
  };
  return { groundLayersOf, loadGroundSet, get loading() { return _loading.size; } };
}
