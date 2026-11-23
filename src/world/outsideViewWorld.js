// The world's view out of a window: the street the last street frame drew, lit by the current
// clock, with the town's lanterns lit as the street frame lights them. It also creates the witches
// host.
import { aabbOutside } from '../render/frustum.js';
import { clockFogColor, VIEW_RINGS } from '../render/realWindows.js';
import { createWitchesHost } from '../homes/witchesHost.js';
import { farFlatVisibleAt } from './flatDistance.js';
import { fillLanternPool, nearestLights } from './cityLights.js';
import { getFloat } from '../platform/settings.js';
import { identity, multiply, UP_Y } from './mat4.js';
import { SUN_RIG_COLOR, sunDirection, viewOutLight, windowStyleForTime } from './worldClock.js';
import { windowEmissionRGB } from '../render/windowEmission.js';
import { withMoonAmbient } from '../render/enhancedSky.js';

/** @param {any} shared */
export function createOutsideViewWorld(shared) {
  const {
    _mode, built, cam, chatNotice, CITY_LIGHT_COLOR_F32, deepWaters, drawDeepWatersFloors, drawDeepWatersSurfaces,
    ecoDraw, lightsOnAt, minuteNow, onlineHomes, pipeline, player, renderer, saveSoon, sky, snowCover, state,
    townTalk, waterOn, weatherTerms, worldLightAnimator,
  } = shared;
  /** RW1 (AUDIT): the town's lanterns as the street frame lights them - its pool refilled, the nearest the installed set
   *  takes - for a street looked out on after dark (the kept frame's were the hour the player went in). */
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
      ground.push(p);   // FINAL AUDIT: a pure-ocean pixel too - its ground hidden, its seafloor and its sea drawn (below), as the street frame does
      for (const fb of p.batches) {
        if (aabbOutside(planes, fb._box, t[0], t[1], t[2]) || !farFlatVisibleAt(ring, fb.farH ?? fb.size?.h ?? 0, fb.frame != null)) continue;
        fb.origin = t;
        // MWNPC8b x RW1: no Morrowind body stands in the view out, so a standing person's flat is drawn here, never left
        // cast-only by the street frame's last mark (it was, for the people nearest the house); the street marks it anew
        fb.castOnly = false;
        flats.push(fb);
      }
    }
    for (const cell of ground) if (!cell.deepWaters?.hide) r.drawTerrain(cell.dwTerrain ?? cell.terrain, cell._pixelMatrix, snowCover.arrayOf(cell.groundArchive), cell.tilemapTex, 6.4, !!cell._dwBytes, ecoDraw(cell), snowCover.drawOf(cell));   // DW-C: a pure-ocean pixel's ground is not drawn
    // RW1 (AUDIT): AND THE WATER, as the street frame draws it - the seafloor under a carved cell's holes (a pure-ocean
    // pixel's whole floor - FINAL AUDIT: it was left out, the sea the sky), then the surfaces over the bed on the frame's
    // last uniforms (a waterfront looked out on showed the dry bed)
    if (deepWaters) { drawDeepWatersFloors(ground); r.markForeignPass(); }   // FINAL AUDIT: the mod's floors ran their own programs - the renderer's bookkeeping told, as the street frame's sky span tells it
    if (waterOn && shared._waterU) {
      let n = 0;
      for (const p of ground) {
        if (!p.water || p.deepWaters?.hide) continue;   // DW-C: a hidden cap takes its water with it
        const row = shared._waterRows[n++] ??= [null, null, null, null, null];
        row[0] = p.water; row[1] = p._pixelMatrix; row[2] = snowCover.arrayOf(p.groundArchive); row[3] = p.tilemapTex; row[4] = snowCover.drawOf(p);
      }
      r.drawWaterSurfaces(shared._waterRows, n, 6.4, shared._waterU);
      for (let i = 0; i < n; i++) shared._waterRows[i].fill(null);
    }
    if (flats.length) r.drawBillboards(flats, new Float32Array([Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)]), UP_Y);
    // FINAL AUDIT: and the carved sea's top - Deep Waters' (on by default), the street frame's transparent queue after
    // every cut-out flat: the view out drew the bed under it dry
    if (deepWaters) drawDeepWatersSurfaces(performance.now(), ground);
  };
  const outsideView = () => ({
    setup: (r) => {   // the clock's light: an hour spent indoors is an hour later outside
      const clockMinute = minuteNow();
      const keptFog = r._fogColor, keptSun = r._sunScale;   // RW1 (AUDIT): the air the street was kept in, at the light it was kept at
      // WAGONS2 (FINAL AUDIT): and the weather's - the street frame's own terms (world/worldClock.js viewOutLight), so the clock's
      // air below compares a dimmed sun with a dimmed sun
      const light = viewOutLight(clockMinute, getFloat('Enhancements', 'NightAmbientLightScale', 0, 1), weatherTerms().sun, sky.sunFactor());
      r.setLighting(withMoonAmbient(light.ambient, sky.moonlight()), light.sun, SUN_RIG_COLOR);
      r.setFogColor(clockFogColor(keptFog, keptSun, r._sunScale));   // RW1 (AUDIT): ...re-lit by the clock - the sky behind the glass with it
      r.setWindowEmission(windowEmissionRGB(windowStyleForTime(clockMinute)));
      r.setPointLights(lightsOnAt(clockMinute) ? outsideLanterns(r) : new Float32Array(0), CITY_LIGHT_COLOR_F32);   // RW1 (AUDIT): the town's lanterns by the clock - never the player's own light, which stays indoors with them
      return sunDirection(clockMinute);
    },
    draw: ({ renderer: r, planes }) => drawOutsideStreet(r, planes),
  });
  // ONLINE-PUBLIC: the instance door is retired for dungeons and buildings. Every way in opens the public room; a quest's
  // own people, items and foes still stand there for the player whose quest names it (dungeonContext.js's private stands).
  // WITCH1 (bible/06-Systems/Witches-Festival.md): THE WITCHES' FESTIVAL IN THE STREETS (scenes/witchesHost.js) - the town
  // underfoot's Hearth Offerings stood at their doors, taken from and filled; the Wyrd Sisters' window; the finds' doors.
  // The dressing and the Sisters themselves are the build's (scenes/pixelBuild.js, world/witchesDecor.js)
  shared.witches = createWitchesHost({ built, renderer, pipeline, onlineHomes, townTalk, state, player, saveSoon, chatNotice, mode: _mode, get online() { return shared.online; } });
  return { outsideView };
}
