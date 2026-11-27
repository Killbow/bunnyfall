// @ts-check
import { LabGrassRenderer, createGrassField, grassStagesOf, LAB_GRASS, GRASS_CELL } from '../../render/labGrass.js';
import { MEADOW_BLADES_PER_TUFT } from '../../render/grassMeadow.js';
import { jungleFloorArt, JUNGLE_FLOOR_ARCHIVE, JUNGLE_FLOOR_PLANTS, JUNGLE_FLOOR_PLANTS_M2 } from '../../render/jungleFloorArt.js';
import { JUNGLE_EDGE } from './jungleRegion.js';
import { classicRecordRgba } from '../../formats/derivedTexture.js';
import { hasTextureReplacement, decodedTextureTopDown } from '../../render/textureReplacement.js';

// `seed` must differ from the meadow seed, because a field with the same seed at a lower density places its plants
// on a prefix of the meadow spots.
export const JUNGLE_FLOOR = Object.freeze({
  plants: JUNGLE_FLOOR_PLANTS_M2,
  seed: 0x4a464c52,
  near: LAB_GRASS.range + JUNGLE_EDGE.out + 400,
});
export const floorDensity = (scale = 1) => JUNGLE_FLOOR.plants * MEADOW_BLADES_PER_TUFT * (2 * LAB_GRASS.densitySpan) ** 2 * scale;

/** @param {{ getTexture: (archive: number) => Promise<any>, palette: any }} o */
export const floorPictures = ({ getTexture, palette }) => async (archive, records) => {
  const t = await getTexture(archive);
  const out = new Map();
  for (const r of records) {
    const pack = hasTextureReplacement(archive, r) ? decodedTextureTopDown(archive, r) : null;
    if (pack) { out.set(r, { width: pack.width, height: pack.height, data: pack.rgba }); continue; }
    if (!t || t.vendor || !(r < t.recordCount)) continue;
    const bm = t.getDFBitmap(r, 0);
    if (bm?.width) out.set(r, classicRecordRgba(bm, palette));
  }
  return out;
};

/** @param {{ gl: WebGL2RenderingContext, jungle: { depthAt: (x: number, z: number) => number, floorClaims: (x: number, z: number) => boolean }, pictures: (archive: number, records: number[]) => Promise<Map<number, any>>, density?: number, provoke?: boolean, onArrive?: () => void }} deps */
export function createJungleFloorHost({ gl, jungle, pictures, density = 1, provoke = true, onArrive = () => {} }) {
  let renderer = null, field = null, loading = null, failed = false;
  const records = JUNGLE_FLOOR_PLANTS.map((p) => p.record).filter((r) => r != null);
  const make = () => {
    loading = pictures(JUNGLE_FLOOR_ARCHIVE, records).then((pics) => {
      const art = jungleFloorArt((r) => pics.get(r) ?? null);
      if (!art) { failed = true; return; }
      renderer = new LabGrassRenderer(gl, { art, stages: grassStagesOf(art), provoke });
      onArrive();
    }).catch((e) => { failed = true; console.warn('[jungle] the floor stands no plants:', e?.message ?? e); });
  };
  return {
    get on() { return !!field; },
    claims(x, z) { return !!field && jungle.floorClaims(x, z); },
    update(ex, ez, keep, ground, slope) {
      if (!renderer) {
        if (!loading && !failed && jungle.depthAt(ex, ez) > -JUNGLE_FLOOR.near) make();
        return;
      }
      if (!field) return;
      field.update(ex, ez, (x, z) => (jungle.floorClaims(x, z) ? keep(x, z) : null), ground, slope);
    },
    drawBeside(meadow) {
      if (field && meadow?.frame) renderer.draw(...meadow.frame, 'meadow');
    },
    /**
     * Host calls that invalidate or shift the meadow field must go through this handle so the floor field stays in
     * step. A new meadow field, as after a teleport re-anchor, needs a new pairing.
     * @param {ReturnType<typeof createGrassField>} meadow
     */
    pair(meadow) {
      if (renderer) field = createGrassField(renderer, { keep: () => null, density: floorDensity(density), seed: JUNGLE_FLOOR.seed, cell: GRASS_CELL });
      return Object.assign(Object.create(meadow), {
        invalidate(x0, z0, x1, z1) { meadow.invalidate(x0, z0, x1, z1); field?.invalidate(x0, z0, x1, z1); },
        shiftOrigin(offset) { meadow.shiftOrigin(offset); field?.shiftOrigin(offset); },
      });
    },
    destroy() { renderer?.destroy(); renderer = null; field = null; },
    get renderer() { return renderer; },
    get field() { return field; },
    get loading() { return loading; },
  };
}
