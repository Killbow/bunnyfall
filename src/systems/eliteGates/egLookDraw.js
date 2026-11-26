// @ts-check
// Callers draw `drawUnder`, `drawAir`, the fight's pass, `drawOver`, then `drawLights`, so the edge line lands over
// the fight and the lights add over the lines.
import { egCircleSpecs, egBandOfCircle } from '../../net/eliteGates/egLaw.js';
import { SD_REALM_ORIGIN } from '../../net/sdBrain.js';
import { egCircleEdges, egGustSections, egStreamersAt, egMistSheets, egMistSheetsAt, EG_MIST } from '../../world/eliteGates/egLook.js';
import { egCircleLights } from '../../world/eliteGates/egHall.js';
import { egAtmosOf } from '../../world/eliteGates/egAtmos.js';
import { EgLinePass, EG_LINE_PROGRAMS, EG_STREAMERS_MAX } from '../../render/eliteGates/egLinePass.js';
import { EgMistPass, EG_MIST_PROGRAMS } from '../../render/eliteGates/egMistPass.js';
import { EgSkyPass, EG_SKY_PROGRAMS, egSkyLift } from '../../render/eliteGates/egSkyPass.js';
import { EG_SKY_STEPS } from '../../render/eliteGates/egSkyMap.js';
import { EgMotesPass, EG_MOTES_PROGRAMS, egHalosInto, egRimMists, EG_RIM_MIST } from '../../render/eliteGates/egMotes.js';
import { SdHaloRenderer, SD_HALO_PROGRAMS, SD_HALO_GAIN } from '../../render/sdHalo.js';
import { skyGain } from '../../render/deadlands.js';
import { EgLightPass, EG_LIGHT_PROGRAMS } from '../../render/eliteGates/egLightPass.js';
import { isTouchDevice } from '../../ui/touchDevice.js';
import { compiledPass, parallelCompile, startPrograms } from '../../render/glProgram.js';

export const EG_LOOK_PROGRAMS = /** @type {ReadonlyArray<readonly [string, string]>} */ (Object.freeze([...EG_LINE_PROGRAMS, ...EG_SKY_PROGRAMS, ...EG_MIST_PROGRAMS, ...EG_MOTES_PROGRAMS, ...EG_LIGHT_PROGRAMS, ...SD_HALO_PROGRAMS]));
/**
 * Start the compiles as a hall loads so the driver compiles beside frames; building the passes in the first Spire
 * frame stalls that frame.
 * @param {any} gl
 */
export function startEgLookPrograms(gl) {
  if (!gl || !parallelCompile(gl)) return false;
  startPrograms(gl, EG_LOOK_PROGRAMS);
  return true;
}

/** @param {{ gl?: WebGL2RenderingContext | null, lite?: boolean }} deps */
export function createEgLookDraw({ gl = null, lite = isTouchDevice() } = {}) {
  /** @type {EgLinePass|null} */ let lines = null;
  /** @type {EgMistPass|null} */ let mist = null;
  /** @type {EgSkyPass|null} */ let sky = null;
  /** @type {EgLightPass|null} */ let lights = null;
  /** @type {EgMotesPass|null} */ let motes = null;
  /** @type {SdHaloRenderer|null} */ let halo = null;
  let key = '', band = 0, sections = [], sheets = [], edgeCount = 0, trackCount = 0;
  let made = /** @type {any[]} */ ([]);
  const streamers = new Float32Array(EG_STREAMERS_MAX * 6), alphas = new Float32Array(EG_STREAMERS_MAX), sheetsAt = [];
  let lamps = /** @type {any[]} */ ([]), order = new Int32Array(0), hallAt = -1, hallMotes = -1;
  const rims = /** @type {any} */ ({ length: 0 }), halos = /** @type {any} */ ({ length: 0 });
  let skyT = NaN, airT = NaN, skySteps = /** @type {number} */ (EG_SKY_STEPS.lane);
  // Only the lines pass is forced to build the frame it is wanted, since the edges show where a player falls; other
  // passes wait for their programs to compile.
  const fail = (name) => (e) => console.warn(`[eg] the ${name} would not build`, e?.message ?? e);
  const doorsOf = () => (gl ? {
    lines: compiledPass(gl, EG_LINE_PROGRAMS, () => new EgLinePass(gl), fail('lines')),
    sky: compiledPass(gl, EG_SKY_PROGRAMS, () => new EgSkyPass(gl, { lite }), fail('sky')),
    mist: compiledPass(gl, EG_MIST_PROGRAMS, () => new EgMistPass(gl), fail('mist')),
    motes: compiledPass(gl, EG_MOTES_PROGRAMS, () => new EgMotesPass(gl, { lite }), fail('motes')),
    lights: compiledPass(gl, EG_LIGHT_PROGRAMS, () => new EgLightPass(gl), fail('lights')),
    halo: compiledPass(gl, SD_HALO_PROGRAMS, () => new SdHaloRenderer(gl), fail('halo')),
  } : null);
  let doors = doorsOf();
  /**
   * @param {'lines'|'sky'|'mist'|'motes'|'lights'|'halo'} name
   * @returns {any}
   */
  const build = (name) => doors?.[name](name === 'lines') ?? null;
  const standAt = (eye) => {
    if (!made.length || !eye) return null;
    const ex = eye[0] - SD_REALM_ORIGIN[0];
    let h = 0;
    for (let j = 1; j < made.length; j++) if (Math.abs(made[j].x0 - ex) < Math.abs(made[h].x0 - ex)) h = j;
    if (h !== hallAt) { hallAt = h; egRimMists(made[h], band, rims); }
    return made[h];
  };
  return {
    // The circle rebuilds when its hall specs are no longer the same objects, which happens when the room gives
    // another law's halls after this client drew the circle.
    setCircle(seed, c, geo = 0) {
      const k = `${seed >>> 0}:${c}:${geo | 0}`, specs = egCircleSpecs(seed, c, geo);
      if (k === key && specs.every((s, j) => s === made[j])) return false;
      key = k; band = egBandOfCircle(c); made = specs;
      const edges = egCircleEdges(seed, c, geo);
      sections = egGustSections(specs); sheets = egMistSheets(specs);
      edgeCount = edges.edge.length / 6; trackCount = edges.track.length / 6;
      lines ??= build('lines');
      lines?.setCircle(edges);
      lamps = egCircleLights(seed, c, geo); order = new Int32Array(lamps.length);
      hallAt = -1; hallMotes = -1;
      return true;
    },
    drawSky(proj, view, seconds, fog = null, gain = 1) {
      if (!key) return false;
      sky ??= build('sky');
      skyT = seconds;
      return !!sky?.draw(proj, view, band, gain, fog?.color ?? egAtmosOf(band).fog.color, skySteps);
    },
    paintSky(vp = null, lane = true, ts = 0) {
      if (!key) return false;
      sky ??= build('sky');
      skySteps = lane ? EG_SKY_STEPS.lane : EG_SKY_STEPS.classic;
      return !!sky?.paint(band, Number.isFinite(skyT) ? skyT : ts, vp);
    },
    drawUnder(proj, view, eye, ts, fog = null) {
      if (!key) return false;
      standAt(eye);
      let drew = false;
      if (sheets.length) {
        const at = egMistSheetsAt(sheets, ts, sheetsAt);
        if (at.length) {
          mist ??= build('mist');
          drew = !!mist?.draw(proj, view, eye, at, EG_MIST.color, ts, fog);
        }
      }
      if (rims.length) {
        mist ??= build('mist');
        if (mist?.draw(proj, view, eye, rims, EG_RIM_MIST.color, Number.isFinite(airT) ? airT : ts, fog)) drew = true;
      }
      return drew;
    },
    drawAir(proj, view, eye, ts, fog = null, lane = true, still = false, list = null, viewH = 0) {
      if (!key || !eye) return false;
      const spec = standAt(eye);
      if (!still || !Number.isFinite(airT)) airT = ts;
      motes ??= build('motes');
      let drew = false;
      if (motes && spec) {
        motes.setBand(band);
        if (hallMotes !== hallAt) { motes.setHall(spec); hallMotes = hallAt; }
        drew = motes.draw(proj, view, eye, airT, fog, egSkyLift(skyGain(fog?.color, egAtmosOf(band).fog.color)), viewH);
      }
      egHalosInto(halos, lamps, list, eye, order);
      if (halos.length) {
        halo ??= build('halo');
        if (halo?.draw(proj, view, halos, fog, /** @type {any} */ (lane ? SD_HALO_GAIN.lane : SD_HALO_GAIN.classic))) drew = true;
      }
      return drew;
    },
    drawOver(proj, view, eye, ts, fog = null, pal = null, vp = null, trail = null, tn = 0) {
      if (!key || !lines) return false;
      lines.palette(pal);
      const n = sections.length ? egStreamersAt(sections, ts, streamers, alphas) : 0;
      return lines.draw(proj, view, eye, ts, fog, streamers, n, alphas, vp?.[2] ?? 0, vp?.[3] ?? 0, trail, tn);
    },
    drawLights(proj, view, eye, ts, fog = null, list = null, still = false) {
      if (!key || !list?.length) return false;
      lights ??= build('lights');
      return !!lights?.draw(proj, view, eye, ts, fog, list, still);
    },
    lightState: () => ({ pass: !!lights, drawn: lights?.drawn ?? 0 }),
    airState: () => ({ motes: !!motes, halo: !!halo, sky: !!sky, laid: motes?.count ?? 0, drawn: motes?.drawn ?? 0, halos: halos.length, rims: rims.length, hall: hallAt, lamps: lamps.length, map: sky ? { band: sky.map.band, painted: sky.map.painted } : null }),
    state: () => ({ key, band, edges: edgeCount, tracks: trackCount, gusts: sections.length, mists: sheets.length, passes: { lines: !!lines, mist: !!mist, sky: !!sky } }),
    release() {
      for (const p of [lines, mist, sky, lights, motes, halo]) { if (p) { try { p.destroy(); } catch { } } }
      lines = null; mist = null; sky = null; lights = null; motes = null; halo = null;
      // Each door builds its pass at most once, so the next breach needs fresh doors.
      doors = doorsOf();
      key = ''; sections = []; sheets = []; made = [];
      lamps = []; order = new Int32Array(0); hallAt = -1; hallMotes = -1; rims.length = 0; halos.length = 0; skyT = NaN; airT = NaN; skySteps = EG_SKY_STEPS.lane;
    },
  };
}
