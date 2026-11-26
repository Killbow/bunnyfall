// @ts-check
// The renderer clears the jungle haze at any beginFrame that no `setJungleHaze` call armed, so only the streamed
// world host, which calls `haze` every exterior frame, shows it.
import { jungleFieldOf, jungleNine, jungleDepthAt, jungleAirShare, jungleShare, jungleFloorDraw } from './jungleRegion.js';
import { TERRAIN_SIZE as PIXEL_M } from '../terrainSampler.js';
import { createJungleTrees } from './jungleTreesAssets.js';
import { setAirBiome, CLIMATE_AIR } from '../../weather/airTemperature.js';
import { CLIMATES } from '../../formats/mapsFile.js';
import {
  JUNGLE_HAZE, hazeShare, hazeDayFactor, hazeWeatherFactor, hazeDrift, createHazeState, stepHaze, hazeUniforms, fogColorWith,
  hazeSkyUniform, hazeHides,
} from './jungleHaze.js';

/**
 * `stateOf` and `builtOf` are read at each call, never held, because the world host creates this before its stream.
 * @param {{ renderer: any, maps: any, mapWidth: number, mapHeight: number, stateOf: () => any, builtOf: () => Map<string, any>, heightAt: (x: number, z: number) => number, breathe?: () => Promise<void>, haze?: boolean, trees?: any, insideAt?: (x: number, y: number) => boolean }} deps
 */
export function createJungleHost({ renderer, maps, mapWidth, mapHeight, stateOf, builtOf, heightAt, breathe, haze = true, trees = null, insideAt = undefined }) {
  const door = trees ?? createJungleTrees({ renderer, breathe });
  let field = null;
  const fieldNow = () => (field ??= jungleFieldOf(maps, mapWidth, mapHeight, insideAt));
  const _airNine = new Array(9);
  setAirBiome('jungle', (fx, fz) => {
    const px = Math.floor(fx / PIXEL_M), py = mapHeight - 1 - Math.floor(fz / PIXEL_M);
    const nine = jungleNine(fieldNow(), px, py, _airNine);
    return nine ? jungleAirShare(jungleDepthAt(px, py, nine, fx - px * PIXEL_M, fz - (mapHeight - 1 - py) * PIXEL_M)) : 0;
  }, CLIMATE_AIR[CLIMATES.Rainforest]);
  const hs = createHazeState();
  const u = new Float32Array(8), skyU = new Float32Array(4), colour = new Float32Array(3);
  const _t = [0, 0, 0], _eye = [0, 0, 0], _abs = [0, 0, 0], _nine = new Array(9), _floorNine = new Array(9);
  const _floor = { px: NaN, py: NaN, nine: /** @type {any[]|null} */ (null) };
  const _w = { px: 0, py: 0, lx: 0, lz: 0 };
  let clock = 0;
  // Returns one shared scratch object, so read it before the next call.
  const where = (x, z) => {
    const state = stateOf(), c = state.compensation, S = PIXEL_M;
    const px = state.mapOrigin.x + Math.floor((x - c[0]) / S), py = state.mapOrigin.y - Math.floor((z - c[2]) / S);
    const t = state.pixelTranslation(px, py, _t);
    _w.px = px; _w.py = py; _w.lx = x - t[0]; _w.lz = z - t[2];
    return _w;
  };
  const _keys = new Array(9);
  let _kx = NaN, _ky = NaN;
  const keysAbout = (px, py) => {
    if (px !== _kx || py !== _ky) {
      _kx = px; _ky = py;
      for (let i = 0; i < 9; i++) _keys[i] = `${px + (i % 3) - 1},${py + Math.floor(i / 3) - 1}`;
    }
    return _keys;
  };
  const groundUnder = (x, z, px, py) => {
    const here = heightAt(x, z), state = stateOf(), built = builtOf(), keys = keysAbout(px, py);
    let sum = 0, n = 0;
    for (let i = 0; i < 9; i++) {
      const p = built.get(keys[i]);
      if (!p || !Number.isFinite(p.centerHeight)) continue;
      sum += p.centerHeight + state.pixelTranslation(p.px, p.py, _t)[1];
      n++;
    }
    return Number.isFinite(here) ? (n ? Math.min(here, sum / n) : here) : (n ? sum / n : 0);
  };
  // Zeroes the uniforms too, because `hides` reads them and would otherwise keep culling with the last eased frame.
  const off = (fogColor, sky) => {
    hs.share = 0; hs.primed = false; u.fill(0);
    renderer.setJungleHaze(null); sky?.setHazeSky?.(null);
    return fogColor;
  };
  return {
    door,
    job(px, py, hidden = false) {
      const nine = jungleNine(fieldNow(), px, py);
      return nine ? { nine, hidden: !!hidden } : null;
    },
    depthAt(x, z) {
      const w = where(x, z);
      const nine = jungleNine(fieldNow(), w.px, w.py);
      return nine ? jungleDepthAt(w.px, w.py, nine, w.lx, w.lz) : -Infinity;
    },
    floorClaims(x, z) {
      const w = where(x, z);
      if (w.px !== _floor.px || w.py !== _floor.py) { _floor.px = w.px; _floor.py = w.py; _floor.nine = jungleNine(fieldNow(), w.px, w.py, _floorNine); }
      const nine = _floor.nine;
      if (!nine) return false;
      const share = jungleShare(jungleDepthAt(w.px, w.py, nine, w.lx, w.lz));
      return share > 0 && jungleFloorDraw(w.px * PIXEL_M + w.lx, -w.py * PIXEL_M + w.lz) < share;
    },
    /** @param {{ fogColor: Float32Array, fogRow: any, eye: ArrayLike<number>, dt: number, minute: number, weather: string, wind?: ArrayLike<number>|null, sky?: any }} f */
    haze({ fogColor, fogRow, eye, dt, minute, weather, wind = null, sky = null }) {
      const focus = renderer._focus?.[3] > 0.5 ? renderer._focus : eye;
      _eye[0] = focus[0]; _eye[1] = focus[1]; _eye[2] = focus[2];
      if (!haze) return off(fogColor, sky);
      clock += Math.max(0, Math.min(dt, 1));
      const w = where(_eye[0], _eye[2]);
      const nine = jungleNine(fieldNow(), w.px, w.py, _nine);
      const share = nine ? hazeShare(jungleDepthAt(w.px, w.py, nine, w.lx, w.lz)) : 0;
      if (share <= 0 && hs.share < 1e-4) return off(fogColor, sky);
      const density = JUNGLE_HAZE.density * hazeDayFactor(minute / 60) * hazeWeatherFactor(weather)
        * hazeDrift(w.px * PIXEL_M + w.lx, -w.py * PIXEL_M + w.lz, clock, wind);
      // The haze state uses world coordinates minus the vertical stream compensation, so a recenter is never seen
      // as a jump. The floor height returns to scene space as it is sent.
      const cy = stateOf().compensation[1];
      _abs[0] = w.px * PIXEL_M + w.lx; _abs[1] = _eye[1] - cy; _abs[2] = -w.py * PIXEL_M + w.lz;
      stepHaze(hs, { dt, eye: _abs, share, density, floor: groundUnder(_eye[0], _eye[2], w.px, w.py) + JUNGLE_HAZE.layer - cy });
      hazeUniforms(hs, u);
      u[1] += cy;
      renderer.setJungleHaze(u[4] ? u : null);
      fogColorWith(fogColor, fogRow, u, _eye[1], colour);
      sky?.setHazeSky?.(u[4] ? hazeSkyUniform(colour, u, _eye[1], skyU) : null);
      return u[4] ? colour : fogColor;
    },
    under(sky = null) { off(null, sky); },
    hides(box, t) {
      if (!(u[4] >= 0.5) || !box) return false;
      return hazeHides(u, _eye, box, t);
    },
    get uniforms() { return u; },
    get eye() { return _eye; },
    get _state() { return hs; },
  };
}
