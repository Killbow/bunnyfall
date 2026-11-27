import { aabbOutside } from '../render/frustum.js';
import { clockFogColor, VIEW_RINGS } from '../render/realWindows.js';
import { arcOn, loadArc } from '../systems/offArcs.js';
import { farFlatVisibleAt } from './flatDistance.js';
import { fillLanternPool, nearestLights } from './cityLights.js';
import { getBazaarGothwayHost } from '../scenes/bazaarBetwixtRoom.js';
import { getFloat } from '../platform/settings.js';
import { identity, multiply, UP_Y } from './mat4.js';
import { SUN_RIG_COLOR, sunDirection, viewOutLight, windowStyleForTime } from './worldClock.js';
import { windowEmissionRGB } from '../render/windowEmission.js';
import { withMoonAmbient } from '../render/enhancedSky.js';

/** @param {any} shared */
export async function createOutsideViewWorld(shared) {
  const {
    _mode, built, cam, chatNotice, CITY_LIGHT_COLOR_F32, deepWaters, drawDeepWatersFloors, drawDeepWatersSurfaces,
    ecoDraw, lightsOnAt, minuteNow, onlineHomes, pipeline, player, renderer, saveSoon, sky, snowCover, state,
    townTalk, waterOn, weatherTerms, worldLightAnimator,
  } = shared;
  const outsideLanterns = (r) => {
    const pool = fillLanternPool(built.values(), (p) => state.pixelTranslation(p.px, p.py, shared._lightT), shared._sceneLights, shared._litRanges, worldLightAnimator.ranges, null);
    shared._litRanges = pool.ranges;
    return nearestLights(shared._sceneLights, cam.pos, r.maxPointLights, shared._litRanges, null, 0, pool.n);
  };
  const drawOutsideStreet = (r, planes) => {
    const ground = [], flats = [];
    for (const p of built.values()) {
      const ring = Math.max(Math.abs(p.px - state.current.x), Math.abs(p.py - state.current.y));
      if (ring > VIEW_RINGS) continue;
      const t = state.pixelTranslation(p.px, p.py, p._t || (p._t = [0, 0, 0]));
      let pixelMatrix = p._pixelMatrix;
      if (!pixelMatrix) pixelMatrix = p._pixelMatrix = identity();
      if (pixelMatrix[12] !== t[0] || pixelMatrix[13] !== t[1] || pixelMatrix[14] !== t[2]) {
        pixelMatrix[12] = t[0]; pixelMatrix[13] = t[1]; pixelMatrix[14] = t[2];
        p._worldGen = (p._worldGen | 0) + 1;
      }
      if (p._box && aabbOutside(planes, p._box, t[0], t[1], t[2])) continue;
      if (p.staticBatch) r.drawMesh(p.staticBatch, pixelMatrix, null);
      for (const m of p.models) {
        if (m._batched || aabbOutside(planes, m._box, t[0], t[1], t[2])) continue;
        if (m._worldGen !== p._worldGen || !m._world) { m._world = multiply(pixelMatrix, m.local, m._world || new Float32Array(16)); m._worldGen = p._worldGen | 0; }
        r.drawMesh(m.gpu, m._world, m.texRemap ?? p.texRemap);
      }
      ground.push(p);
      for (const fb of p.batches) {
        if (aabbOutside(planes, fb._box, t[0], t[1], t[2]) || !farFlatVisibleAt(ring, fb.farH ?? fb.size?.h ?? 0, fb.frame != null)) continue;
        fb.origin = t;
        fb.castOnly = false;
        flats.push(fb);
      }
    }
    for (const cell of ground) if (!cell.deepWaters?.hide) r.drawTerrain(cell.dwTerrain ?? cell.terrain, cell._pixelMatrix, snowCover.arrayOf(cell.groundArchive), cell.tilemapTex, 6.4, !!cell._dwBytes, ecoDraw(cell), snowCover.drawOf(cell));
    if (deepWaters) { drawDeepWatersFloors(ground); r.markForeignPass(); }
    if (waterOn && shared._waterU) {
      let n = 0;
      for (const p of ground) {
        if (!p.water || p.deepWaters?.hide) continue;
        const row = shared._waterRows[n++] ??= [null, null, null, null, null];
        row[0] = p.water; row[1] = p._pixelMatrix; row[2] = snowCover.arrayOf(p.groundArchive); row[3] = p.tilemapTex; row[4] = snowCover.drawOf(p);
      }
      r.drawWaterSurfaces(shared._waterRows, n, 6.4, shared._waterU);
      for (let i = 0; i < n; i++) shared._waterRows[i].fill(null);
    }
    if (flats.length) r.drawBillboards(flats, new Float32Array([Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)]), UP_Y);
    if (deepWaters) drawDeepWatersSurfaces(performance.now(), ground);
  };
  const outsideView = () => ({
    setup: (r) => {
      const clockMinute = minuteNow();
      const keptFog = r._fogColor, keptSun = r._sunScale;
      const light = viewOutLight(clockMinute, getFloat('Enhancements', 'NightAmbientLightScale', 0, 1), weatherTerms().sun, sky.sunFactor());
      r.setLighting(withMoonAmbient(light.ambient, sky.moonlight()), light.sun, SUN_RIG_COLOR);
      r.setFogColor(clockFogColor(keptFog, keptSun, r._sunScale));
      r.setWindowEmission(windowEmissionRGB(windowStyleForTime(clockMinute)));
      r.setPointLights(lightsOnAt(clockMinute) ? outsideLanterns(r) : new Float32Array(0), CITY_LIGHT_COLOR_F32);
      return sunDirection(clockMinute);
    },
    draw: ({ renderer: r, planes }) => drawOutsideStreet(r, planes),
  });
  shared.witches = arcOn('witchesFestival') ? (await loadArc('witchesFestival')).createWitchesHost({ built, renderer, pipeline, onlineHomes, townTalk, state, player, saveSoon, chatNotice, mode: _mode, get online() { return shared.online; } }) : null;
  getBazaarGothwayHost(shared);
  return { outsideView };
}
