// @ts-check
import { SD_HANG_ISLANDS, SD_HANG_STAGES, sdHangIslandsOf, buildHangModel, buildChainModel, buildFarIslandsModel, chainSwing, chainMatrix, farIslandsMatrix } from '../world/sdIslandModel.js';
import { SD_WORKS, SD_HANG_NOW, buildWorksGear, worksMatrix } from '../world/sdWorksModel.js';
import { sdTick } from '../world/sdLook.js';
import { sdSkyClock, SD_SKY_PERIOD } from '../render/sdSky.js';
import { isTouchDevice } from '../ui/touchDevice.js';
import { identity } from '../world/mat4.js';
import { SD_COURSE } from '../world/sdSteps.js';

// Must be a whole number, so the far set does not jump when the sky clock wraps.
export const SD_FAR_TURNS = -1;

/** @param {{ renderer?: any, clock?: () => number, lite?: boolean, course?: any }} deps */
export function createSdHang({ renderer = null, clock = () => performance.now() / 1000, lite = isTouchDevice(), course = SD_COURSE } = {}) {
  const islands = course === SD_COURSE ? SD_HANG_ISLANDS : sdHangIslandsOf(course);
  const draws = [], chains = [], works = [];
  let far = null, stood = false;
  const meshes = [], now = new Float64Array(3);
  const make = (model) => {
    if (!renderer?.createMesh) return null;
    try { const m = renderer.createMesh(model); meshes.push(m); return m; } catch (e) { console.warn('[sd] the hang would not build', e?.message ?? e); return null; }
  };
  const drawOf = (gpu, stage) => ({ gpu, object: { matrix: identity() }, noShadow: true, stage, texRemap: null });
  return {
    stand({ dynamicDraws }) {
      if (stood) return;
      stood = true;
      for (const stage of SD_HANG_STAGES) {
        const gpu = make(buildHangModel(stage, { lite, islands }));
        if (gpu) draws.push(drawOf(gpu, stage));
      }
      for (const isl of islands) {
        const { model, axle } = buildChainModel(isl, { lite });
        const gpu = make(model);
        if (!gpu) continue;
        const d = drawOf(gpu, isl.stage);
        draws.push(d);
        if (!lite) chains.push({ d, axle });
      }
      if (!lite) {
        const gpu = make(buildFarIslandsModel());
        if (gpu) { far = drawOf(gpu, 'sky'); draws.push(far); }
      }
      for (const g of SD_WORKS) {
        if (lite && !g.lite) continue;
        const gpu = make(buildWorksGear(g));
        if (!gpu) continue;
        const d = drawOf(gpu, 'works');
        draws.push(d);
        works.push({ d, g });
      }
      for (const d of draws) dynamicDraws.push(d);
      this.frame();
    },
    frame() {
      if (!stood) return;
      const t = clock();
      now[SD_HANG_NOW.ticks] = sdTick(t);
      now[SD_HANG_NOW.swing] = chainSwing(now[SD_HANG_NOW.ticks]);
      now[SD_HANG_NOW.far] = (SD_FAR_TURNS * 2 * Math.PI * sdSkyClock(t)) / SD_SKY_PERIOD;
      for (let k = 0; k < chains.length; k++) chainMatrix(chains[k].axle, now, chains[k].d.object.matrix);
      for (let k = 0; k < works.length; k++) worksMatrix(works[k].g, now, works[k].d.object.matrix);
      if (far) farIslandsMatrix(now, far.object.matrix);
    },
    draws: () => draws,
    clear() {
      for (const m of meshes) { try { renderer?.destroyMesh?.(m); } catch { } }
      meshes.length = 0; draws.length = 0; chains.length = 0; works.length = 0; far = null; stood = false;
    },
  };
}
