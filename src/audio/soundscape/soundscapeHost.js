// @ts-check
import { enhancedSoundsOn } from '../enhancedSounds.js';
import { createSeaAir } from './seaAir.js';
import { createWorldAir } from './worldAir.js';
import { installSoundscapeSounds } from './soundscapeSfx.js';
import { createSeaScore, seaScoreSongs, SEA_SCORE_SILENCE } from './seaScore.js';
import { isNight } from '../../world/worldClock.js';
import { CLIMATES } from '../../formats/mapsTables.js';
import { BUILDING_TYPES } from '../../world/buildingNames.js';
import { doorSpotsNear } from '../../characters/foeSpacing.js';

export const GULL_RING = 2;
export const SHORE_RADII = Object.freeze([6, 14, 28, 50, 85, 130, 200]);
export const SHORE_BEARINGS = 12;
export const SHORE_DEPTH = 0.3;
export const SHORE_FAR_M = 150;
export const ASK_EVERY_S = 0.5;
export const ASK_MOVED_M = 15;
export const DOORS_REACH_M = 70;
export const DOOR_OUT_M = 1.2;
const SMITHIES = new Set([BUILDING_TYPES.Armorer, BUILDING_TYPES.WeaponSmith]);
const NOT_SAILING = Object.freeze({ sailing: false, fight: false, weather: 'sunny', night: false, nearPort: false, way: 0 });
const TAVERNS = new Set([BUILDING_TYPES.Tavern]);
export const WAY_TAU_S = 0.6;
export const WAY_JUMP_MPS = 40;

/**
 * @param {number[]} ear
 * @param {(x: number, z: number) => ({ depth?: number, oceanY?: number } | null)} columnAt
 */
export function shoreEdge(ear, columnAt) {
  let surface = NaN;
  const deep = (x, z) => {
    const c = columnAt(x, z), d = Number(c?.depth);
    if (Number.isFinite(c?.oceanY)) surface = /** @type {number} */ (c?.oceanY);
    return Number.isFinite(d) && d > SHORE_DEPTH;
  };
  const here = deep(ear[0], ear[2]);
  let inner = 0;
  for (const r of SHORE_RADII) {
    /** @type {{ dist: number, dir: number[] } | null} */
    let best = null;
    for (let b = 0; b < SHORE_BEARINGS; b++) {
      const a = (2 * Math.PI * b) / SHORE_BEARINGS, dir = [Math.sin(a), Math.cos(a)];
      if (deep(ear[0] + dir[0] * r, ear[2] + dir[1] * r) === here) continue;
      let lo = inner, hi = r;
      for (let k = 0; k < 5; k++) { const m = (lo + hi) / 2; if (deep(ear[0] + dir[0] * m, ear[2] + dir[1] * m) === here) lo = m; else hi = m; }
      if (!best || hi < best.dist) best = { dist: hi, dir };
    }
    if (best) {
      const { dist, dir } = best;
      return { dist, dir, at: [ear[0] + dir[0] * dist, Number.isFinite(surface) ? surface : ear[1] - 1, ear[2] + dir[1] * dist] };
    }
    inner = r;
  }
  return null;
}

/** @param {number} px @param {number} py @param {(x: number, y: number) => boolean} isSea */
export function landNear(px, py, isSea) {
  for (let dy = -GULL_RING; dy <= GULL_RING; dy++) for (let dx = -GULL_RING; dx <= GULL_RING; dx++) if (!isSea(px + dx, py + dy)) return true;
  return false;
}
/** @param {number} px @param {number} py @param {(x: number, y: number) => boolean} isSea */
export function seaBeside(px, py, isSea) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isSea(px + dx, py + dy)) return true;
  return false;
}

/** @param {any} entry */
export const doorBuildingType = (entry) => entry?.dfBlock?.rmbBlock?.fldHeader?.buildingDataList?.[entry?.recordIndex]?.buildingType ?? -1;

export const winterIn = (climate, winter) => !!winter && climate !== CLIMATES.Desert && climate !== CLIMATES.Desert2 && climate !== CLIMATES.Rainforest && climate !== CLIMATES.Subtropical;

/**
 * @param {{ audio: any, music: any, boat: () => any, aboard?: () => boolean, bow?: (boat: any, yaw: number) => number[], csa: any, fight: () => boolean, pixel: () => ({ x: number, y: number } | null),
 *   seaPixel: (x: number, y: number) => boolean, dw: any, inTown: () => boolean, towns: () => Map<number, { blocks?: number }>,
 *   doors: any[], doorAt: (entry: any) => any, rand?: () => number }} deps
 */
export function createSoundscapeHost(deps) {
  const columnAt = deps.dw?.rawColumnAt ? (/** @type {number} */ x, /** @type {number} */ z) => deps.dw.rawColumnAt(x, z) : null;
  const sea = createSeaAir({ engine: deps.audio, rand: deps.rand });
  const world = createWorldAir({ engine: deps.audio, rand: deps.rand });
  const score = createSeaScore();
  let songsMade = false, held = false;
  let rode = null, rodeAt = [0, 0, 0], rodeWay = 0;
  const wayOf = (/** @type {any} */ boat, /** @type {number} */ dt) => {
    const p = boat?.GameObject?.position;
    if (!p || boat !== rode || !(dt > 0)) { rode = p ? boat : null; rodeWay = 0; }
    else {
      const v = Math.hypot(p[0] - rodeAt[0], p[2] - rodeAt[2]) / dt;
      // A step faster than WAY_JUMP_MPS is a scene recenter or a snap, not the boat's speed.
      if (v <= WAY_JUMP_MPS) rodeWay += (v - rodeWay) * Math.min(1, dt / WAY_TAU_S);
    }
    if (p) { rodeAt[0] = p[0]; rodeAt[1] = p[1]; rodeAt[2] = p[2]; }
    return rodeWay;
  };
  let sailing = null;
  let askIn = 0, askedAt = null, pixKey = '', land = false, port = false, coast = false, blocks = 1;
  /** @type {{ dist: number, dir: number[] | null, at?: number[] } | null} */ let shore = null;
  /** @type {number[][]} */ let smithies = [];
  /** @type {number[][]} */ let taverns = [];
  const ask = (ear) => {
    const p = deps.pixel?.() ?? null;
    const key = p ? `${p.x},${p.y}` : '';
    if (key !== pixKey) {
      pixKey = key;
      land = !!p && landNear(p.x, p.y, deps.seaPixel);
      coast = !!p && seaBeside(p.x, p.y, deps.seaPixel);
      try { port = !!deps.csa?.IsNearPort?.(3); } catch { port = false; }
      try { blocks = p ? deps.towns?.()?.get(p.y * 1000 + p.x)?.blocks ?? 1 : 1; } catch { blocks = 1; }
    }
    shore = columnAt ? shoreEdge(ear, columnAt) : coast ? { dist: SHORE_FAR_M, dir: null } : null;
    smithies = []; taverns = [];
    for (const e of deps.doors ?? []) {
      const type = doorBuildingType(e);
      const list = SMITHIES.has(type) ? smithies : TAVERNS.has(type) ? taverns : null;
      if (!list) continue;
      const spot = doorSpotsNear([e], ear, DOORS_REACH_M, deps.doorAt)[0];
      if (!spot) continue;
      const [nx, , nz] = spot.normal, l = Math.hypot(nx, nz) || 1;
      list.push([spot.pos[0] + (nx / l) * DOOR_OUT_M, spot.pos[1], spot.pos[2] + (nz / l) * DOOR_OUT_M]);
    }
  };
  const stopAll = () => { sea.stop(); world.stop(); sailing = null; };
  return {
    // Runs once per exterior frame after the host's setListener, because it reads the listener pose.
    /**
     * @param {number} dt
     * @param {{ ear?: number[], fwd?: number[], wd: any, weather: string, minute: number, climate: number, winter: boolean, paused: boolean, desolate?: boolean }} f
     */
    frame(dt, f) {
      const pose = f?.ear ? null : deps.audio?.listenerPose?.() ?? null;
      const ear = f?.ear ?? pose?.pos, fwd = f?.fwd ?? pose?.fwd ?? [0, 0, 1];
      if (!enhancedSoundsOn() || !Array.isArray(ear) || !ear.every(Number.isFinite)) { stopAll(); return; }
      installSoundscapeSounds(deps.audio);
      if ((askIn -= Math.max(0, dt)) <= 0 || !askedAt || Math.hypot(ear[0] - askedAt[0], ear[2] - askedAt[2]) > ASK_MOVED_M) {
        askIn = ASK_EVERY_S; askedAt = [...ear];
        ask(ear);
      }
      const minute = Number(f.minute) || 0, night = isNight(minute), wind = f.wd?.on ? f.wd.strength01 : 0.35, gust = f.wd?.gust ?? 0.7;
      const boat = deps.boat?.() ?? null;
      let aboard = !!boat;
      if (!aboard) { try { aboard = !!deps.aboard?.(); } catch { aboard = false; } }
      if (aboard) {
        world.stop();
        let helm = null;
        if (boat) { try { helm = deps.csa?.helmPanelState?.() ?? null; } catch { helm = null; } }
        const way = helm ? Number(helm.way) || 0 : boat && !f.paused ? wayOf(boat, dt) : boat ? rodeWay : 0;
        const bow = boat?.GameObject?.rotation && deps.bow ? deps.bow(boat, 0) : null;
        sea.frame(dt, { ear, fwd, bow, way, wind, gust, weather: f.weather, night, nearLand: land, minute, paused: f.paused });
        sailing = { sailing: !!helm, aboard: true, fight: !!deps.fight?.(), weather: f.weather, night, nearPort: port, way };
        return;
      }
      sea.stop();
      sailing = null;
      let inTown = false;
      try { inTown = !!deps.inTown?.(); } catch { inTown = false; }
      world.frame(dt, {
        ear, climate: f.climate, night, hour: minute / 60, weather: f.weather, wind, winter: winterIn(f.climate, f.winter),
        inTown: inTown && !f.desolate, townBlocks: blocks, shore, smithies: f.desolate ? [] : smithies, taverns: f.desolate ? [] : taverns, paused: f.paused, desolate: !!f.desolate,
      });
    },
    stop: stopAll,
    scoreFrame(now = Date.now()) {
      const want = score.want(sailing && enhancedSoundsOn() ? sailing : NOT_SAILING, now);
      if (want == null) {
        if (held) { held = false; deps.music?.fadeOut?.(); }
        return false;
      }
      if (!songsMade) { songsMade = true; for (const song of Object.values(seaScoreSongs())) deps.music?.registerSong?.(song.name, song); }
      held = true;
      if (want === SEA_SCORE_SILENCE) { if (deps.music?.current !== null) deps.music?.fadeOut?.(); } else deps.music?.playSong?.(want);
      return true;
    },
  };
}
