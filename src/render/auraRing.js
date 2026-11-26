// @ts-check
// Every look is added onto the frame or drawn premultiplied, depth-tested and never written. Every rate is a whole
// number of cycles over AURA_CLOCK_PERIOD, so the wrapped clock never jumps.
import { FOG_FACTOR_GLSL } from './labGrass.js';
import { buildProgram, compiledPass } from './glProgram.js';
import { wrapAngle } from '../world/mat4.js';
import { GLYPH_PATH, GLYPH_DETAIL, CRYSTAL_PURPLE, HOUR_BRASS, HOUR_GOLD, HOUR_LIGHT, HOUR_DAWN, HOUR_PEARL, HOUR_SUN, COIL_SEA, COIL_TIDE, COIL_FOAM, SPIRE_BEACON, SPIRE_BEACON_WHITE, SPIRE_EMBER, SPIRE_COAL, SPIRE_DAWN, SPIRE_DAWN_GOLD, SPIRE_DAWN_ROSE, WARREN_AMETHYST, WARREN_LILAC, WARREN_BLUSH, WARREN_FRILL, WARREN_PLUM, WITCH_MOSS, WITCH_FIRE, WITCH_GLOW, WITCH_VIOLET, HEARTH_TALLOW, NIRN_LEAF, NIRN_GLOW, NIRN_HAZE, NIRN_DEEP, NIRN_SMOKE } from '../ui/playerBadge.js';

export const AURA_RING_R = 0.85;
export const AURA_GROUND_R = 1.35;
export const AURA_FLAME_H = 0.62;
export const AURA_LIFT_M = 0.05;
export const AURA_STEPS = 48;
export const AURA_DRAW_MAX = 32;
export const AURA_RANGE_M = 90;
export const AURA_CLOCK_PERIOD = 120;
export const HALO_R = 0.17;
export const HALO_W = 0.05;
export const HALO_UP = 0.3;
export const HALO_BOB_M = 0.015;
export const HALO_HZ = Object.freeze({ glint: 0.25, breath: 0.5, bob: 0.5 });
export const AURA_TURN_HZ = 1 / 8;
export const AURA_KINDLE_S = 0.8;
export const AURA_FORGET_S = 2;

export const WARD_RING_R = 0.95;
export const WARD_RUNE_R = 0.78;
export const WARD_WALL_H = 0.42;
export const WARD_RUNES = 12;
export const WARD_SIGILS = 4;
export const WARD_TICKS = 48;
export const WARD_MOTES = 14;
export const WARD_GLYPHS = 9;
export const WARD_GLYPH_LIFE = Object.freeze([3, 4, 5]);
export const WARD_GLYPH_RISE = 1.3;
export const WARD_GLYPH_W = 0.16;
export const WARD_GLYPH_H = 0.26;
export const WARD_HZ = Object.freeze({ runes: 1 / 40, bezel: 1 / 60, scribe: 1 / 8, pulse: 1 / 4, write: 1 / 6, mote: 1 / 4 });
export const WARD_FLOW = Object.freeze({ mist: 0.5, veil: 0.75 });
export const wardRatesWhole = () => [...Object.values(WARD_HZ), ...Object.values(WARD_FLOW)]
  .every((r) => Number.isInteger(Math.round(r * AURA_CLOCK_PERIOD * 1e6) / 1e6));
export const WARD_SCRIPT = Object.freeze([25, 38, 51, 12, 19, 40, 61, 18, 33, 15, 52, 10]);
export const WARD_RGB = Object.freeze({ violet: Object.freeze([0.698, 0.302, 1]), heart: Object.freeze([0.925, 0.863, 1]), abyss: Object.freeze([0.302, 0.102, 0.58]) });
export const RADIANCE_R = 0.6;
export const RADIANCE_H = 2.2;
export const RADIANCE_POOL_R = 1.15;
export const RADIANCE_RAYS = 12;
export const RADIANCE_MOTES = 18;
export const RADIANCE_ROUND = 24;
export const RADIANCE_HZ = Object.freeze({ pulse: 1 / 4, rays: 1 / 30, mote: 1 / 6 });
export const RADIANCE_FLOW = Object.freeze({ shafts: 0.5 });
export const radianceRatesWhole = () => [...Object.values(RADIANCE_HZ), ...Object.values(RADIANCE_FLOW)]
  .every((r) => Number.isInteger(Math.round(r * AURA_CLOCK_PERIOD * 1e6) / 1e6));
export const RADIANCE_RGB = Object.freeze({ gold: Object.freeze([1, 0.741, 0.278]), heart: Object.freeze([0.847, 0.812, 0.682]) });
export const CLOAK_H = 1.88;
export const CLOAK_HOOD_Y = 1.68;
export const CLOAK_NECK_Y = 1.53;
export const CLOAK_CLASP_Y = 1.43;
export const CLOAK_SHOULDER_Y = 1.42;
export const CLOAK_SHOULDER_R = 0.27;
export const CLOAK_HEM_R = 0.4;
export const CLOAK_NECK_R = 0.15;
export const CLOAK_HOOD_R = 0.165;
export const CLOAK_BACK_M = 0.14;
export const CLOAK_HOOD_BACK_M = 0.035;
export const CLOAK_PEAK_BACK_M = 0.05;
export const CLOAK_HEM_Y = Object.freeze({ back: 0.1, edge: 0.26 });
export const CLOAK_SQUASH = Object.freeze({ shoulder: 0.32, hem: 0.1, hood: 0.1 });
export const CLOAK_FOLD_M = 0.022;
export const CLOAK_ROUND = 48;
export const CLOAK_ROWS = 48;
export const CLOAK_OPEN = Object.freeze({ hem: 0.2, chest: 0.13, face: 0.12 });
export const CLOAK_FACE = Object.freeze({ y: 1.665, h: 0.135 });
export const CLOAK_FOLDS = 14;
export const CLOAK_SCALLOPS = 16;
export const CLOAK_MANTLE_Y = 1.2;
export const CLOAK_TRIM = Object.freeze({ band: 0.034, tooth: 0.045 });
export const CLOAK_POOL_R = 0.85;
export const CLOAK_GLYPH = GLYPH_PATH.shadowfang;
export const CLOAK_GLYPH_EYE = GLYPH_DETAIL.shadowfang.path;
export const CLOAK_SIGIL_Y = 0.98;
export const CLOAK_SIGIL_R = 0.15;
export const CLOAK_CLASP_R = 0.04;
export const CLOAK_EMBLEMS = 5;
export const CLOAK_EMBLEM_LIFE = Object.freeze([5, 6, 8]);
export const CLOAK_EMBLEM_RISE = 0.75;
export const CLOAK_EMBLEM_M = 0.22;
export const CLOAK_RIP_S = 1.2;
export const CLOAK_SHREDS = 14;
export const CLOAK_SHRED_M = 0.17;
export const CLOAK_SHRED_AT = Object.freeze({ r: Object.freeze([0.7, 1.15]), y: Object.freeze([0.3, 2.1]) });
export const CLOAK_SHRED_HZ = Object.freeze({ orbit: 1 / 60, spin: 1 / 10, tumble: 1 / 6, bob: 1 / 5 });
export const CLOAK_HZ = Object.freeze({ billow: 1 / 5, wave: 1 / 3, pulse: 1 / 4 });
export const CLOAK_FLOW = Object.freeze({ smoke: 0.25, hem: 0.5, mist: 0.25, swirl: 0.1 });
export const cloakRatesWhole = () => [...Object.values(CLOAK_HZ), ...Object.values(CLOAK_FLOW), ...Object.values(CLOAK_SHRED_HZ)]
  .every((r) => Number.isInteger(Math.round(r * AURA_CLOCK_PERIOD * 1e6) / 1e6));
export const CLOAK_RGB = Object.freeze({ crimson: Object.freeze([0.827, 0.098, 0.235]), ember: Object.freeze([1, 0.36, 0.28]), shadow: Object.freeze([0.051, 0.027, 0.035]), lining: Object.freeze([0.32, 0.02, 0.06]) });

export const CLOAK_INSIDE_M = 0.3;

export const WING_PLUMES = 8;
export const WING_COVERTS = 4;
export const WING_STRANDS = 3;
export const WING_SEGS = 32;
export const WING_ROOT = Object.freeze({ back: 0.12, below: 0.04, apart: 0.07 });
export const WING_SPRITE_BACK = 0.25;
export const WING_SPREAD = Object.freeze([-0.7, 1.25]);
export const WING_REACH = Object.freeze([0.6, 1.3]);
export const WING_COVERT = Object.freeze({ spread: Object.freeze([-0.35, 1.0]), reach: Object.freeze([0.28, 0.5]) });
export const WING_W = Object.freeze({ broad: 0.12, fine: 0.035 });
export const WING_HZ = Object.freeze({ flow: 1 / 3, wave: 1 / 4, breathe: 1 / 6, flutter: 1 / 2, beat: 1 / 8, rays: 1 / 30 });
export const WING_BEAT = Object.freeze({ down: 0.32, forward: 0.35 });
export const WING_FLOW = Object.freeze({ cells: 8, rate: 0.5, fray: 1.5 });
export const WING_MOTES = 24;
export const WING_MOTE_M = 0.04;
export const WING_MOTE_LEN = 0.18;
export const WING_MOTE_LIFE = Object.freeze([3, 4, 5]);
export const WING_HALO_M = 1.2;
export const WING_HALO_NEAR = Object.freeze([0.9, 1.6]);
export const WING_POOL_R = 1.0;
export const WING_RGB = Object.freeze({ core: Object.freeze([1, 0.96, 0.84]), gold: Object.freeze([1, 0.76, 0.32]), amber: Object.freeze([0.95, 0.5, 0.14]) });
export const WING_PER_SIDE = (WING_PLUMES + WING_COVERTS) * WING_STRANDS;
export const WING_STRAND_COUNT = 2 * WING_PER_SIDE;
export const WING_VERTS = WING_STRAND_COUNT * WING_SEGS * 6;
export const WING_CARDS = WING_MOTES + 1;
export const RESONANCE_R = 0.8;
export const RESONANCE_COLUMNS = AURA_STEPS;
export const RESONANCE_CELLS = 10;
export const RESONANCE_PITCH_M = 0.06;
export const RESONANCE_SQUARE_M = 0.042;
export const RESONANCE_H = RESONANCE_CELLS * RESONANCE_PITCH_M;
export const RESONANCE_HZ = Object.freeze({ wave: 61 / 120, counter: 41 / 120, bounce: 59 / 120, beat: 1 });
export const RESONANCE_CRESTS = Object.freeze({ wave: 3, counter: 2 });
export const resonanceRatesWhole = () => Object.values(RESONANCE_HZ).every((r) => r > 0 && Number.isInteger(Math.round(r * AURA_CLOCK_PERIOD * 1e6) / 1e6));
export const RESONANCE_RGB = Object.freeze({ purple: Object.freeze(CRYSTAL_PURPLE.slice(0, 3)) });
const resHash = (k, a, b) => { const x = Math.sin(k * a + b) * 43758.5453; return x - Math.floor(x); };
export function resonanceLevel(k, t) {
  const TAU = Math.PI * 2, N = RESONANCE_COLUMNS;
  const h1 = resHash(k, 12.9898, 4.1), h2 = resHash(k, 78.233, 1.7);
  const wave = 0.5 + 0.5 * Math.sin(TAU * (t * RESONANCE_HZ.wave - k * RESONANCE_CRESTS.wave / N));
  const counter = 0.5 + 0.5 * Math.sin(TAU * (t * RESONANCE_HZ.counter + k * RESONANCE_CRESTS.counter / N) + 1.3);
  const bounce = Math.abs(Math.sin(TAU * (t * RESONANCE_HZ.bounce + h1)));
  const beat = (0.5 + 0.5 * Math.cos(TAU * t * RESONANCE_HZ.beat)) ** 4;
  return Math.max(0, Math.min(1, 0.08 + 0.34 * wave + 0.28 * counter * bounce + 0.3 * beat * (0.4 + 0.6 * h2)));
}
export const resonanceLit = (k, t, kindle = 1) => (kindle > 0 ? Math.ceil(resonanceLevel(k, t) * Math.min(1, kindle) * RESONANCE_CELLS) : 0);
export const resonanceClock = (seconds, seed) => auraClock(seconds) + (Number.isFinite(seed) ? seed : 0) * AURA_CLOCK_PERIOD;
// The shader gets counts computed here, because float32 sin differs across GPUs and would light other squares.
export function resonanceLitInto(out, t, kindle = 1) {
  for (let k = 0; k < RESONANCE_COLUMNS; k++) out[k] = resonanceLit(k, t, kindle);
  return out;
}

export const wingRatesWhole = () => [...Object.values(WING_HZ), WING_FLOW.rate, WING_FLOW.fray].every((hz) => Number.isInteger(Math.round(hz * AURA_CLOCK_PERIOD * 1e6) / 1e6))
  && WING_MOTE_LIFE.every((l) => Number.isInteger(AURA_CLOCK_PERIOD / l));

export const TURNING_R = 0.7;
export const TURNING_RIM_M = 0.06;
export const TURNING_TEETH = 24;
export const TURNING_TOOTH_M = 0.07;
export const TURNING_SPOKES = 6;
export const TURNING_SPOKE_M = 0.035;
export const TURNING_HUB_R = 0.2;
export const TURNING_DIAL_R = 1.0;
export const TURNING_MARKS = 12;
export const TURNING_MARK_M = 0.07;
export const TURNING_H = 0.62;
export const TURNING_EDGE_M = 0.05;
export const TURNING_MOTES = 14;
export const TURNING_HZ = Object.freeze({ wheel: 1 / 60, dial: 1 / 120, pulse: 1 / 4, mote: 1 / 6 });
export const TURNING_STEP_S = 0.25;
export const turningRatesWhole = () => Object.values(TURNING_HZ).every((r) => r > 0 && Number.isInteger(Math.round(r * AURA_CLOCK_PERIOD * 1e6) / 1e6));
export const TURNING_RGB = Object.freeze({ brass: Object.freeze(HOUR_BRASS.slice(0, 3)), gold: Object.freeze(HOUR_GOLD.slice(0, 3)), light: Object.freeze(HOUR_LIGHT.slice(0, 3)) });
export const FIRST_SHADE = 0.72;
const shaded = (/** @type {readonly number[]} */ c) => Object.freeze(c.slice(0, 3).map((x) => Math.round(x * FIRST_SHADE * 1000) / 1000));
const between = (/** @type {readonly number[]} */ a, /** @type {readonly number[]} */ b) => [0, 1, 2].map((i) => (a[i] + b[i]) / 2);
export const FIRST_RGB = Object.freeze({ brass: shaded(HOUR_DAWN), gold: shaded(between(HOUR_DAWN, HOUR_PEARL)), light: shaded(HOUR_PEARL) });
export const FIRST_BLAZE = 1.8;
export const FIRST_RAY = 0.55;
export const firstDialAngle = (t) => -turningDialAngle(t);
export function turningWheelAngle(t) {
  const s = Math.floor(t), e = Math.min(1, (t - s) / TURNING_STEP_S);
  return -Math.PI * 2 * TURNING_HZ.wheel * (s + e * e * (3 - 2 * e));
}
export const turningDialAngle = (t) => Math.PI * 2 * TURNING_HZ.dial * t;

export const MAELSTROM_R = 0.9;
export const MAELSTROM_EYE_R = 0.14;
export const MAELSTROM_ARMS = 3;
export const MAELSTROM_TWIST = 4;
export const MAELSTROM_SHARP = 6;
export const MAELSTROM_H = 0.55;
export const MAELSTROM_CURL_H = 0.12;
export const MAELSTROM_DROPS = 16;
export const MAELSTROM_HZ = Object.freeze({ spin: 1 / 12, pulse: 1 / 4, surf: 1 / 3, drop: 1 / 6 });
export const maelstromRatesWhole = () => Object.values(MAELSTROM_HZ).every((r) => r > 0 && Number.isInteger(Math.round(r * AURA_CLOCK_PERIOD * MAELSTROM_ARMS * 1e6) / 1e6) && Number.isInteger(Math.round(r * AURA_CLOCK_PERIOD * 1e6) / 1e6));
export const MAELSTROM_SHADE = 0.72;
const coilShaded = (/** @type {readonly number[]} */ c) => Object.freeze(c.slice(0, 3).map((x) => Math.round(x * MAELSTROM_SHADE * 1000) / 1000));
export const MAELSTROM_RGB = Object.freeze({ sea: coilShaded(COIL_SEA), tide: coilShaded(COIL_TIDE), foam: coilShaded(COIL_FOAM) });
export const MAELSTROM_DROP_TOP = 0.9;
export const maelstromSpin = (t) => -Math.PI * 2 * MAELSTROM_HZ.spin * t;
export function maelstromArmAngle(r, t, k = 0) {
  return maelstromSpin(t) - (MAELSTROM_TWIST / MAELSTROM_ARMS) * Math.log(r / MAELSTROM_R) + (Math.PI * 2 * k) / MAELSTROM_ARMS;
}
export const maelstromCrest = (u, t) => MAELSTROM_CURL_H * (0.7 + 0.3 * Math.cos(MAELSTROM_ARMS * (u * Math.PI * 2 - maelstromSpin(t))));
export function maelstromDropAt(m, t) {
  const hash = (a, b, c) => { const x = Math.sin(m * a + b) * c; return x - Math.floor(x); };
  const h1 = hash(41.37, 1.7, 43758.5453), h2 = hash(17.93, 3.1, 24634.6345);
  const f = (x) => x - Math.floor(x);
  return { u: f(h1 + maelstromSpin(t) / (Math.PI * 2)), life: f((t / Math.round(1 / MAELSTROM_HZ.drop)) * (1 + (m % 3)) + h2) };
}
export const BEACONLIGHT_R = 0.8;
export const BEACON_LIGHTS = 8;
export const BEACON_H = 1.7;
export const BEACON_MOTES = 22;
export const BEACON_HZ = Object.freeze({ kindle: 1 / 8, pulse: 1 / 4, mote: 1 / 5 });
export const STAIR_R = 0.75;
export const STAIR_W = 0.22;
export const STAIR_STEPS = 12;
export const STAIR_H = 1.9;
export const STAIR_EMBERS = 20;
export const STAIR_HZ = Object.freeze({ descend: 1 / 12, flare: 1 / 2, ember: 1 / 4 });
export const DAWN_R = 0.9;
export const DAWN_RING_M = 0.024;
export const DAWN_INNER_M = 0.14;
export const DAWN_REDOUBTS = 10;
export const DAWN_START = 0.25;
export const DAWN_MARK_M = Object.freeze([0.04, 0.068]);
export const DAWN_CROWN = 1.5;
export const DAWN_SPIRE_H = Object.freeze([0.16, 0.74]);
export const DAWN_SPIRE_W = 0.024;
export const DAWN_RAYS = 20;
export const DAWN_RAY_M = Object.freeze([0.42, 0.24]);
export const DAWN_RAY_W = 0.035;
export const DAWN_VEIL_H = 0.35;
export const DAWN_H = 1.9;
export const DAWN_MOTES = 12;
export const DAWN_HZ = Object.freeze({ sweep: 1 / 24, breath: 1 / 6, climb: 1 / 12, rays: 1 / 60, mote: 1 / 8 });
export const DAWN_FLOW = Object.freeze({ veil: 0.5 });
export const DAWN_CLIMB = Object.freeze({ at: 0.04, step: 0.05, rise: 0.035, hold: 0.86, down: 0.97, flare: 30, wave: 9 });
export const dawnMarkAngle = (k) => ((k + 0.5) / DAWN_REDOUBTS - DAWN_START) * Math.PI * 2;
export function dawnClimb(k, t) {
  const c = (((t * DAWN_HZ.climb) % 1) + 1) % 1, at = DAWN_CLIMB.at + k * DAWN_CLIMB.step;
  const ss = (a, b, x) => { const e = Math.max(0, Math.min(1, (x - a) / (b - a))); return e * e * (3 - 2 * e); };
  const down = 1 - ss(DAWN_CLIMB.hold, DAWN_CLIMB.down, c);
  return { c, taken: ss(at, at + DAWN_CLIMB.rise, c) * down, flare: c >= at ? Math.exp(-(c - at) * DAWN_CLIMB.flare) * down : 0 };
}
export const dawnSpireH = (k, t) => (DAWN_SPIRE_H[0] + (DAWN_SPIRE_H[1] - DAWN_SPIRE_H[0]) * k / (DAWN_REDOUBTS - 1)) * (0.3 + 0.7 * dawnClimb(k, t).taken);
export const spireRatesWhole = () => [...Object.values(BEACON_HZ), ...Object.values(STAIR_HZ), ...Object.values(DAWN_HZ), ...Object.values(DAWN_FLOW)]
  .every((r) => r > 0 && Number.isInteger(Math.round(r * AURA_CLOCK_PERIOD * 1e6) / 1e6));
export const SPIRE_RGB = Object.freeze({
  beacon: Object.freeze(SPIRE_BEACON.slice(0, 3)), white: Object.freeze(SPIRE_BEACON_WHITE.slice(0, 3)),
  ember: Object.freeze(SPIRE_EMBER.slice(0, 3)), coal: Object.freeze(SPIRE_COAL.slice(0, 3)),
  flame: Object.freeze([0, 1, 2].map((i) => Math.round((SPIRE_EMBER[i] + SPIRE_BEACON[i]) / 2 * 1000) / 1000)),
  dawn: Object.freeze(SPIRE_DAWN.slice(0, 3)), dawnGold: Object.freeze(SPIRE_DAWN_GOLD.slice(0, 3)), dawnRose: Object.freeze(SPIRE_DAWN_ROSE.slice(0, 3)),
});
export function beaconLit(a, t) {
  const k = Math.floor((((a / (Math.PI * 2)) % 1) + 1) % 1 * BEACON_LIGHTS + 0.5) % BEACON_LIGHTS;
  const age = (((t * BEACON_HZ.kindle - k / BEACON_LIGHTS) % 1) + 1) % 1;
  return { k, age };
}

export const WITCHFIRE_R = 0.78;
export const WITCH_CANDLES = 7;
export const WITCHFIRE_H = 1.6;
export const WITCH_MOTES = 18;
export const WITCH_HZ = Object.freeze({ turn: 1 / 20, flicker: 1 / 2, mote: 1 / 6, breath: 1 / 5 });
export const WITCH_FLOW = Object.freeze({ rise: 1.5, ground: 1.25 });
export const witchfireRatesWhole = () => [...Object.values(WITCH_HZ), ...Object.values(WITCH_FLOW)].every((r) => r > 0 && Number.isInteger(Math.round(r * AURA_CLOCK_PERIOD * 1e6) / 1e6));
export const WITCH_RGB = Object.freeze({
  moss: Object.freeze(WITCH_MOSS.slice(0, 3)), fire: Object.freeze(WITCH_FIRE.slice(0, 3)), glow: Object.freeze(WITCH_GLOW.slice(0, 3)),
  violet: Object.freeze(WITCH_VIOLET.slice(0, 3)), tallow: Object.freeze(HEARTH_TALLOW.slice(0, 3)),
});
export const witchCandleAt = (a) => Math.floor((((a / (Math.PI * 2)) % 1) + 1) % 1 * WITCH_CANDLES + 0.5) % WITCH_CANDLES;

export const WARREN_R = 0.8;
export const WARREN_RING_M = 0.022;
export const WARREN_RING_IN = 0.1;
export const WARREN_H = 0.9;
export const WARREN_BUNNIES = 6;
export const WARREN_BUNNY_M = 0.28;
export const WARREN_LEAN = 0.5;
export const WARREN_BUNNY = Object.freeze({
  path: 'M2.6 10.2Q3.4 6.6 7.2 6.4Q8.8 6.3 9.4 5.6Q7.4 3.2 7.6 1Q7.9 0.2 8.6 0.8Q9.6 2.6 10.3 4.6Q10.2 2.4 10.9 0.7Q11.5 0.2 11.9 0.9Q12.2 3 11.6 5Q13 5.2 13.8 6.4Q14.8 7.4 14.5 8.3Q14 9.2 12.6 9.3Q12 10.6 12.4 12.6L13.4 13.6Q13.6 14.4 12.6 14.4L11.4 14.4Q10.6 12.8 9.6 13.4L10.2 14Q10.4 14.6 9.6 14.6L5 14.6Q2.6 14.4 2.2 12.2Q2 11 2.6 10.2Z',
  ground: 14.6,
  tail: Object.freeze([2.3, 10.6, 1.1]),
  eye: Object.freeze([12.6, 7.05, 0.5]),
  glint: Object.freeze([12.78, 6.85, 0.17]),
  nose: Object.freeze([14.45, 7.95, 0.32]),
  ear: Object.freeze([11.15, 1.7, 11.3, 4.3, 0.35]),
  lace: Object.freeze([11.3, 5.05, 13.2, 5.5, 0.42]),
  frills: Object.freeze([Object.freeze([11.67, 4.75, 0.3]), Object.freeze([12.34, 4.91, 0.3]), Object.freeze([13.0, 5.06, 0.3])]),
  band: Object.freeze([11.45, 5.7, 13.35, 6.1, 0.2]),
});
export const WARREN_FOOT = (16 - WARREN_BUNNY.ground) / 16;
export const WARREN_GAIT_S = 3;
export const WARREN_HOPS = 3;
export const WARREN_HOP_S = 0.45;
export const WARREN_CROUCH = 0.15;
export const WARREN_HOP_H = 0.14;
export const WARREN_LAPS = 6;
export const WARREN_BINKY_EVERY = 4;
export const WARREN_BINKY_H = 0.24;
export const WARREN_BINKY_S = 0.6;
export const WARREN_BINKY_AT = 0.4;
export const WARREN_BINKY_TURN = Object.freeze([0.3, 0.7]);
export const WARREN_OFFSET_S = WARREN_GAIT_S / WARREN_BUNNIES;
export const WARREN_HOP_RAD = (Math.PI * 2 * WARREN_LAPS) / ((AURA_CLOCK_PERIOD / WARREN_GAIT_S) * WARREN_HOPS);
export const WARREN_EMERGE = 0.4;
export const WARREN_EMERGE_STEP = 0.08;
export const WARREN_PRINTS = 3;
export const WARREN_PRINT_S = 2.4;
export const WARREN_SPARKLES = 18;
export const WARREN_TWINKLES = 12;
export const WARREN_HZ = Object.freeze({ breath: 1 / 4, sparkle: 1 / 5, twinkle: 1 / 2 });
export const warrenRatesWhole = () => [...Object.values(WARREN_HZ), ...Object.values(WARREN_HZ).map((r) => r * 3), 1 / WARREN_GAIT_S].every((r) => r > 0 && Number.isInteger(Math.round(r * AURA_CLOCK_PERIOD * 1e6) / 1e6))
  && Number.isInteger(WARREN_LAPS) && Number.isInteger(AURA_CLOCK_PERIOD / WARREN_GAIT_S / WARREN_BINKY_EVERY)
  && WARREN_HOPS * WARREN_HOP_S < WARREN_GAIT_S && WARREN_BINKY_AT + WARREN_BINKY_S <= WARREN_GAIT_S - WARREN_HOPS * WARREN_HOP_S;
export const WARREN_RGB = Object.freeze({
  amethyst: Object.freeze(WARREN_AMETHYST.slice(0, 3)), lilac: Object.freeze(WARREN_LILAC.slice(0, 3)),
  blush: Object.freeze(WARREN_BLUSH.slice(0, 3)), frill: Object.freeze(WARREN_FRILL.slice(0, 3)), plum: Object.freeze(WARREN_PLUM.slice(0, 3)),
});
const WARREN_PACE = (WARREN_HOP_RAD * WARREN_HOPS) / WARREN_GAIT_S;
export function warrenStride(tau) {
  const c = Math.floor(tau / WARREN_GAIT_S), f = tau - c * WARREN_GAIT_S;
  const j = Math.min(WARREN_HOPS, Math.floor(f / WARREN_HOP_S));
  const s = j < WARREN_HOPS ? (f - j * WARREN_HOP_S) / WARREN_HOP_S : 0;
  const air = s > WARREN_CROUCH ? (s - WARREN_CROUCH) / (1 - WARREN_CROUCH) : 0;
  return WARREN_HOP_RAD * (j + air) - WARREN_PACE * f;
}
export function warrenBunny(k, t, kindle = 1) {
  const tau = t + k * WARREN_OFFSET_S;
  const c = Math.floor(tau / WARREN_GAIT_S), f = tau - c * WARREN_GAIT_S;
  const a = (k / WARREN_BUNNIES) * Math.PI * 2 + WARREN_PACE * t + warrenStride(tau);
  let y = 0, sq = 1, face = 1;
  if (f < WARREN_HOPS * WARREN_HOP_S) {
    const s = (f % WARREN_HOP_S) / WARREN_HOP_S;
    if (s < WARREN_CROUCH) sq = 1 - 0.12 * Math.sin((Math.PI * s) / WARREN_CROUCH);
    else { const u = (s - WARREN_CROUCH) / (1 - WARREN_CROUCH); y = WARREN_HOP_H * 4 * u * (1 - u); sq = 1 + 0.1 * Math.sin(Math.PI * u); }
  } else {
    const since = f - WARREN_HOPS * WARREN_HOP_S, b = (since - WARREN_BINKY_AT) / WARREN_BINKY_S;
    if (since < 0.12) sq = 1 - 0.1 * (1 - since / 0.12);
    else if ((((c + k) % WARREN_BINKY_EVERY) + WARREN_BINKY_EVERY) % WARREN_BINKY_EVERY === 0 && b >= 0 && b < 1) {
      y = WARREN_BINKY_H * 4 * b * (1 - b); sq = 1 + 0.08 * Math.sin(Math.PI * b);
      if (b > WARREN_BINKY_TURN[0] && b < WARREN_BINKY_TURN[1]) face = -1;
    }
  }
  const up = Math.max(0, Math.min(1, (kindle - k * WARREN_EMERGE_STEP) / WARREN_EMERGE));
  return { a, y: y - (1 - up) * WARREN_BUNNY_M * 0.5, sq, face, up };
}
export const warrenClock = (seconds, seed) => resonanceClock(seconds, seed);
export function warrenBunniesInto(out, t, kindle = 1) {
  for (let k = 0; k < WARREN_BUNNIES; k++) {
    const b = warrenBunny(k, t, kindle);
    out[k * 4] = b.a; out[k * 4 + 1] = b.y; out[k * 4 + 2] = b.sq; out[k * 4 + 3] = b.face * b.up;
  }
  return out;
}
// Farthest first, so the third draw lays a near rabbit over a far one; none writes the depth.
export function warrenDepthOrder(out, at, eye) {
  const rows = [];
  for (let k = 0; k < WARREN_BUNNIES; k++) {
    const a = out[k * 4], dx = at[0] + Math.cos(a) * WARREN_R - eye[0], dz = at[2] + Math.sin(a) * WARREN_R - eye[2];
    rows.push([dx * dx + dz * dz, out[k * 4], out[k * 4 + 1], out[k * 4 + 2], out[k * 4 + 3]]);
  }
  rows.sort((p, q) => q[0] - p[0]);
  rows.forEach((r, k) => { out[k * 4] = r[1]; out[k * 4 + 1] = r[2]; out[k * 4 + 2] = r[3]; out[k * 4 + 3] = r[4]; });
  return out;
}
export function warrenPrintsInto(out, t) {
  for (let k = 0; k < WARREN_BUNNIES; k++) {
    const tau = t + k * WARREN_OFFSET_S;
    let c = Math.floor(tau / WARREN_GAIT_S), j = Math.min(WARREN_HOPS, Math.floor((tau - c * WARREN_GAIT_S) / WARREN_HOP_S)) - 1;
    for (let n = 0; n < WARREN_PRINTS; n++) {
      if (j < 0) { c--; j = WARREN_HOPS - 1; }
      const land = c * WARREN_GAIT_S + (j + 1) * WARREN_HOP_S;
      out[(k * WARREN_PRINTS + n) * 2] = warrenBunny(k, land - k * WARREN_OFFSET_S).a;
      out[(k * WARREN_PRINTS + n) * 2 + 1] = tau - land;
      j--;
    }
  }
  return out;
}

export const SAGE_RUNE_R = 0.6;
export const SAGE_RUNES = 10;
export const SAGE_RUNE_SCALE = 0.65;
export const SAGE_BAND_M = 0.1;
export const SAGE_WALL_H = 0.5;
export const SAGE_SCRIPT = Object.freeze([37, 22, 49, 14, 58, 27, 41, 9, 54, 30]);
export const SAGE_ROOTS = 5;
export const SAGE_ROOT_R = 0.55;
export const SAGE_ROOT_Y = 1.0;
export const SAGE_ROOT_M = 0.3;
export const SAGE_ROOT_PAD = 1.25;
export const SAGE_ROOT_BOB = 0.06;
export const SAGE_ROOT_SWAY = 0.6;
export const SAGE_ROOT_TILT = 0.15;
export const SAGE_EMERGE = 0.5;
export const SAGE_EMERGE_STEP = 0.1;
export const SAGE_PUFFS = 16;
export const SAGE_PUFF_LIFE = Object.freeze([4, 5, 6]);
export const SAGE_PUFF_M = Object.freeze([0.3, 1.05]);
export const SAGE_SMOKE_H = 2.1;
export const SAGE_PUFF_R = Object.freeze([0.2, 0.5]);
export const SAGE_PUFF_DRIFT = 0.35;
export const SAGE_PUFF_CURL = 0.8;
export const SAGE_PUFF_A = 0.62;
export const SAGE_NEAR = Object.freeze([0.6, 1.6]);
export const SAGE_CARDS = SAGE_PUFFS + SAGE_ROOTS;
export const SAGE_HZ = Object.freeze({ orbit: 1 / 10, bob: 1 / 4, sway: 1 / 6, runes: 1 / 40, pulse: 1 / 3, breath: 1 / 5 });
export const SAGE_FLOW = Object.freeze({ ground: 0.25, rise: 0.5 });
export const sageRatesWhole = () => [...Object.values(SAGE_HZ), ...Object.values(SAGE_FLOW), ...SAGE_PUFF_LIFE.map((l) => 1 / l)]
  .every((r) => r > 0 && Number.isInteger(Math.round(r * AURA_CLOCK_PERIOD * 1e6) / 1e6));
export const SAGE_RGB = Object.freeze({
  leaf: Object.freeze(NIRN_LEAF.slice(0, 3)), glow: Object.freeze(NIRN_GLOW.slice(0, 3)), haze: Object.freeze(NIRN_HAZE.slice(0, 3)),
  deep: Object.freeze(NIRN_DEEP.slice(0, 3)), smoke: Object.freeze(NIRN_SMOKE.slice(0, 3)),
});
const sageHash = (a, b) => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); };
export function sagePuff(m, t) {
  const life = SAGE_PUFF_LIFE[m % SAGE_PUFF_LIFE.length], flights = AURA_CLOCK_PERIOD / life;
  const u = t / life + sageHash(m, 0.5), n = Math.floor(u), age = u - n;
  const flight = ((n % flights) + flights) % flights;
  const a = sageHash(m, flight + 1) * Math.PI * 2 + SAGE_PUFF_CURL * age * (sageHash(m + 31, flight) < 0.5 ? 1 : -1);
  const r = SAGE_PUFF_R[0] + (SAGE_PUFF_R[1] - SAGE_PUFF_R[0]) * sageHash(m + 17, flight) + SAGE_PUFF_DRIFT * age;
  const y = 0.05 + SAGE_SMOKE_H * age * (1.4 - 0.4 * age);
  const size = SAGE_PUFF_M[0] + (SAGE_PUFF_M[1] - SAGE_PUFF_M[0]) * Math.pow(age, 0.7);
  return { x: Math.cos(a) * r, y, z: Math.sin(a) * r, size, age, seed: sageHash(m + 53, flight) };
}
export function sageRoot(k, t, kindle = 1) {
  const a = (k / SAGE_ROOTS) * Math.PI * 2 + Math.PI * 2 * SAGE_HZ.orbit * t;
  const bob = Math.PI * 2 * (SAGE_HZ.bob * t + k / SAGE_ROOTS);
  const up = Math.max(0, Math.min(1, (kindle - k * SAGE_EMERGE_STEP) / SAGE_EMERGE));
  return {
    x: Math.cos(a) * SAGE_ROOT_R, y: SAGE_ROOT_Y + SAGE_ROOT_BOB * Math.sin(bob), z: Math.sin(a) * SAGE_ROOT_R,
    size: SAGE_ROOT_M * up, turn: Math.cos(SAGE_ROOT_SWAY * Math.sin(Math.PI * 2 * SAGE_HZ.sway * t + k * 1.3)), tilt: SAGE_ROOT_TILT * Math.cos(bob),
  };
}
export const sageClock = (seconds, seed) => resonanceClock(seconds, seed);
// Cards come farthest first, so the third draw lays a near card over a far one; none writes the depth.
export function sageCardsInto(cards, looks, t, kindle, at, eye) {
  const rows = [];
  const k1 = Math.max(0, Math.min(1, kindle));
  for (let m = 0; m < SAGE_PUFFS; m++) {
    const p = sagePuff(m, t), d = Math.hypot(at[0] + p.x - eye[0], at[1] + p.y - eye[1], at[2] + p.z - eye[2]);
    const near = Math.max(0, Math.min(1, (d - SAGE_NEAR[0]) / (SAGE_NEAR[1] - SAGE_NEAR[0])));
    rows.push([d, p.x, p.y, p.z, p.size, 0, p.age, k1 * near * near * (3 - 2 * near), p.seed]);
  }
  for (let k = 0; k < SAGE_ROOTS; k++) {
    const r = sageRoot(k, t, k1);
    rows.push([Math.hypot(at[0] + r.x - eye[0], at[1] + r.y - eye[1], at[2] + r.z - eye[2]), r.x, r.y, r.z, r.size, 1, r.turn, r.tilt, 0]);
  }
  rows.sort((a, b) => b[0] - a[0]);
  rows.forEach((r, i) => { for (let j = 0; j < 4; j++) { cards[i * 4 + j] = r[1 + j]; looks[i * 4 + j] = r[5 + j]; } });
  return cards;
}

export const NYX_VEIL_R = 0.6;
export const NYX_VEIL_H = 2.1;
export const AURA_LOOK = Object.freeze({
  dagonfire: Object.freeze({ kind: 0, ringR: AURA_RING_R, flameH: AURA_FLAME_H, glyphs: 0 }),
  oblivionward: Object.freeze({ kind: 1, ringR: WARD_RING_R, flameH: WARD_WALL_H, glyphs: WARD_GLYPHS }),
  radiance: Object.freeze({ kind: 2, ringR: RADIANCE_R, flameH: RADIANCE_H, glyphs: 0 }),
  shadowcloak: Object.freeze({ kind: 3, ringR: CLOAK_HEM_R, flameH: CLOAK_H, glyphs: CLOAK_EMBLEMS, shreds: CLOAK_SHREDS, mesh: 'cloak', shade: true }),
  // The seraphwings key keeps its name on the wire and in the token, but draws as the halo.
  seraphwings: Object.freeze({ kind: 15, ringR: HALO_R, flameH: HALO_W, glyphs: 0, mesh: 'halo' }),
  resonance: Object.freeze({ kind: 5, ringR: RESONANCE_R, flameH: RESONANCE_H, glyphs: 0, shade: true }),
  turninghour: Object.freeze({ kind: 6, ringR: TURNING_R + TURNING_TOOTH_M, flameH: TURNING_H, glyphs: 0 }),
  firsthour: Object.freeze({ kind: 7, ringR: TURNING_R + TURNING_TOOTH_M, flameH: TURNING_H, glyphs: 0 }),
  maelstrom: Object.freeze({ kind: 8, ringR: MAELSTROM_R, flameH: MAELSTROM_H, glyphs: 0 }),
  beaconlight: Object.freeze({ kind: 9, ringR: BEACONLIGHT_R, flameH: BEACON_H, glyphs: 0 }),
  burningstair: Object.freeze({ kind: 10, ringR: STAIR_R, flameH: STAIR_H, glyphs: 0 }),
  firstlight: Object.freeze({ kind: 11, ringR: DAWN_R, flameH: DAWN_H, glyphs: 0 }),
  lilacwarren: Object.freeze({ kind: 12, ringR: WARREN_R, flameH: WARREN_H, glyphs: WARREN_BUNNIES, shade: true }),
  witchfire: Object.freeze({ kind: 13, ringR: WITCHFIRE_R, flameH: WITCHFIRE_H, glyphs: 0 }),
  nyxveil: Object.freeze({ kind: 16, ringR: NYX_VEIL_R, flameH: NYX_VEIL_H, glyphs: 0 }),
  sagesmoke: Object.freeze({ kind: 14, ringR: SAGE_RUNE_R, flameH: SAGE_WALL_H, glyphs: SAGE_CARDS, shade: true }),
});
export const SERAPH_WINGS_LOOK = Object.freeze({ kind: 4, ringR: WING_POOL_R, flameH: WING_REACH[1], glyphs: WING_CARDS, mesh: 'wings' });
export const auraLookOf = (aura) => (typeof aura === 'string' && Object.hasOwn(AURA_LOOK, aura) ? AURA_LOOK[aura] : AURA_LOOK.dagonfire);

export const auraClock = (seconds) => ((seconds % AURA_CLOCK_PERIOD) + AURA_CLOCK_PERIOD) % AURA_CLOCK_PERIOD;

/** @param {Array<{ id?: any, at: number[], aura: string|null, _d2?: number }>} wearers @param {number[]} eye @param {any[]} out */
export function auraWearers(wearers, eye, out) {
  out.length = 0;
  if (!Array.isArray(wearers) || !eye) return out;
  const r2 = AURA_RANGE_M * AURA_RANGE_M;
  for (const w of wearers) {
    if (!w || !w.aura || !Array.isArray(w.at)) continue;
    const dx = w.at[0] - eye[0], dy = w.at[1] - eye[1], dz = w.at[2] - eye[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (!(d2 <= r2)) continue;
    w._d2 = d2;
    out.push(w);
  }
  out.sort((a, b) => a._d2 - b._d2);
  if (out.length > AURA_DRAW_MAX) out.length = AURA_DRAW_MAX;
  return out;
}

const HEAD = `#version 300 es
precision highp float;
precision highp int;
`;
const NOISE_GLSL = `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoiseP(vec2 p, vec2 per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 i0 = mod(i, per), i1 = mod(i + 1.0, per);
  return mix(mix(h21(i0), h21(vec2(i1.x, i0.y)), u.x), mix(h21(vec2(i0.x, i1.y)), h21(i1), u.x), u.y);
}
float fbmP(vec2 p, vec2 per) { float s = 0.0, a = 0.5; for (int k = 0; k < 4; k++) { s += a * vnoiseP(p, per); p *= 2.0; per *= 2.0; a *= 0.5; } return s; }
// Dagon's fire, by heat (0 cold .. 1 white): the coal's crimson, the fire's orange, the ember's gold, white at the heart
vec3 fireRamp(float v) {
  vec3 c = mix(vec3(0.30, 0.015, 0.01), vec3(0.95, 0.20, 0.03), smoothstep(0.10, 0.45, v));
  c = mix(c, vec3(1.0, 0.62, 0.12), smoothstep(0.45, 0.75, v));
  return mix(c, vec3(1.0, 0.95, 0.78), smoothstep(0.82, 1.0, v));
}
`;
export const AURA_FLOW = Object.freeze({ ground: 1.75, rise: 2.4, flicker: 4.8 });
export const AURA_ROUND = Object.freeze({ ground: 18, flames: 26, flicker: 60 });
export const auraFlowsWhole = () => Object.values(AURA_FLOW).every((r) => Number.isInteger(Math.round(r * AURA_CLOCK_PERIOD * 1e6) / 1e6));
const v3 = (c) => `vec3(${c.map((x) => x.toFixed(3)).join(', ')})`;
const g1 = (x) => x.toFixed(1), g3 = (x) => x.toFixed(3);
// Rates are written exactly (over a whole period where there is one), because a rounded rate steps at the wrap.
const hzGlsl = (hz) => { const per = Math.round(1 / hz); return Math.abs(per * hz - 1) < 1e-12 ? `/ ${per.toFixed(1)}` : `* ${hz}`; };
const WARD_FLIGHT_GLSL = `
float wardFlightOf(float k, float t) {
  float life = ${WARD_GLYPH_LIFE[0].toFixed(1)} + mod(k, 3.0);
  return mod(floor(t / life + fract(k * 0.618034)), ${AURA_CLOCK_PERIOD.toFixed(1)} / life);
}
vec4 wardFlight(float k, float t) {
  float life = ${WARD_GLYPH_LIFE[0].toFixed(1)} + mod(k, 3.0);
  float age = fract(t / life + fract(k * 0.618034));
  float h = fract(sin((k * 17.0 + wardFlightOf(k, t)) * 12.9898 + 4.1) * 43758.5453);
  float a = h * 6.283185307179586 + 0.35 * sin(age * 3.0 + k);
  float r = uRingR * (0.9 + 0.3 * age);
  float y = uLift + 0.06 + (1.0 - (1.0 - age) * (1.0 - age)) * ${WARD_GLYPH_RISE.toFixed(2)};
  return vec4(cos(a) * r, y, sin(a) * r, age);
}
`;
const WARD_GLSL = `
const vec3 WARD_VIOLET = ${v3(WARD_RGB.violet)};
const vec3 WARD_HEART = ${v3(WARD_RGB.heart)};
const vec3 WARD_ABYSS = ${v3(WARD_RGB.abyss)};
const int WARD_SCRIPT[${WARD_RUNES}] = int[${WARD_RUNES}](${WARD_SCRIPT.join(', ')});
float segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
vec3 inked(float d, float w) {
  float heart = 1.0 - smoothstep(w * 0.35, w * 0.7, d);
  float body = 1.0 - smoothstep(w * 0.5, w * 1.15, d);
  float glow = exp(-d * d / (w * w * 9.0));
  return WARD_HEART * heart * 0.9 + WARD_VIOLET * (body * 0.95 + glow * 0.55);
}
// a rune of the script about q (m: along the ring, out from it): its baseline, its two ends, its beads, outward a comb or
// a chevron, inward a cross - by its bits
float runeD(vec2 q, int bits) {
  const float L = 0.13, B = 0.016;
  vec2 le = vec2(-L, 0.0), re = vec2(L, 0.0);
  float d = segD(q, le, re);
  d = min(d, (bits & 1) != 0 ? abs(length(q - le + vec2(B, 0.0)) - B) : segD(q, le - vec2(0.0, 0.03), le + vec2(0.0, 0.03)));
  d = min(d, (bits & 2) != 0 ? abs(length(q - re - vec2(B, 0.0)) - B) : segD(q, re - vec2(0.0, 0.03), re + vec2(0.0, 0.03)));
  if ((bits & 4) != 0) d = min(d, abs(length(q - vec2(-0.06, 0.0)) - 0.015));
  if ((bits & 8) != 0) d = min(d, abs(length(q - vec2(0.06, 0.0)) - 0.015));
  if ((bits & 16) != 0) { for (int i = -1; i <= 1; i++) d = min(d, segD(q, vec2(float(i) * 0.028, 0.012), vec2(float(i) * 0.028, 0.05))); }
  else d = min(d, min(segD(q, vec2(-0.026, 0.014), vec2(0.0, 0.046)), segD(q, vec2(0.0, 0.046), vec2(0.026, 0.014))));
  if ((bits & 32) != 0) d = min(d, min(segD(q, vec2(-0.02, -0.012), vec2(0.02, -0.048)), segD(q, vec2(0.02, -0.012), vec2(-0.02, -0.048))));
  return d;
}
// a claw hung inward from the ring (s: along it, in from it): a stem, and a crescent whose horns curve back to the ring -
// 0.088 m deep at most, clear of the runes' outward strokes (WARD_RUNE_R + 0.05) as they turn beneath it
float sigilD(vec2 s) {
  vec2 c = s - vec2(0.0, 0.05);
  float horns = c.y > 0.0 ? abs(length(c) - 0.038) : length(vec2(abs(c.x) - 0.038, c.y));
  return min(segD(s, vec2(0.0), vec2(0.0, 0.05)), horns);
}
// how much of the ward is drawn yet: round from behind the wearer (the angle's -x) as it kindles, whole once it has
float wardDrawn(float share) { return clamp((uKindle * 1.1 - share) / 0.1, 0.0, 1.0); }
vec3 wardGround(vec2 p) {
  float r = length(p), a = atan(p.y, p.x);
  if (r > uGroundR) discard;
  float R = uRingR;
  float breath = 0.85 + 0.15 * sin(uTime * TAU ${hzGlsl(WARD_HZ.pulse)});
  // THE RING, whole: one line of light, two scribes of brighter light running round it, a halo in the stone about it
  float dr = abs(r - R);
  float scribe = pow(max(0.0, cos(2.0 * a - uTime * TAU ${hzGlsl(2 * WARD_HZ.scribe)})), 24.0);
  vec3 col = inked(dr, 0.016) * (breath + 0.8 * scribe) + WARD_VIOLET * exp(-dr * dr / 0.012) * 0.14;
  // THE BEZEL: ${WARD_TICKS} fine ticks outside it, a longer one every fourth, turning the other way
  float tu = (a + uTime * TAU ${hzGlsl(WARD_HZ.bezel)}) / TAU * ${WARD_TICKS.toFixed(1)};
  float ti = floor(tu + 0.5);
  float rOut = R + 0.07 + (mod(ti, 4.0) < 0.5 ? 0.035 : 0.0);
  float dTick = length(vec2(abs(tu - ti) * TAU / ${WARD_TICKS.toFixed(1)} * r, max(0.0, max(R + 0.035 - r, r - rOut))));
  col += inked(dTick, 0.009) * 0.35;
  // THE RUNES: the script round a ring within it, turning against it, each lit in turn as the writing passes
  float cu = (a - uTime * TAU ${hzGlsl(WARD_HZ.runes)}) / TAU * ${WARD_RUNES.toFixed(1)};
  float k = mod(floor(cu), ${WARD_RUNES.toFixed(1)});
  vec2 q = vec2((fract(cu) - 0.5) * TAU / ${WARD_RUNES.toFixed(1)} * r, r - ${WARD_RUNE_R.toFixed(3)});
  float written = 0.45 + 0.55 * pow(max(0.5 + 0.5 * cos(uTime * TAU ${hzGlsl(WARD_HZ.write)} - k / ${WARD_RUNES.toFixed(1)} * TAU), 0.0), 3.0);
  col += inked(runeD(q, WARD_SCRIPT[int(k)]), 0.011) * written;
  // THE CLAWS at the diagonals, hung from the ring
  float su = a / TAU * ${WARD_SIGILS.toFixed(1)};   // a claw at each cell's middle: the diagonals
  col += inked(sigilD(vec2((fract(su) - 0.5) * TAU / ${WARD_SIGILS.toFixed(1)} * r, R - r)), 0.012) * (0.6 + 0.4 * breath);
  // THE ABYSS within: the void's violet mist turning inside the runes, gone under the feet (where the angle's lattice
  // pinches to a point and would draw it as spokes)
  float u = fract(a / TAU);
  float mist = fbmP(vec2(u * 10.0 - uTime * ${WARD_FLOW.mist.toFixed(3)}, r * 3.0), vec2(10.0, 64.0));
  col += WARD_ABYSS * mist * 0.55 * smoothstep(0.08, 0.38, r) * (1.0 - smoothstep(${(WARD_RUNE_R - 0.15).toFixed(3)}, ${(WARD_RUNE_R + 0.02).toFixed(3)}, r));
  return col * wardDrawn(fract(a / TAU + 0.5)) * (1.0 - smoothstep(uGroundR - 0.2, uGroundR, r));
}
// A FLOATING SYMBOL (uv the card's 0..1, s its age, its rune's place in the script, its number): the script's rune stood
// on end, its strokes blurring as it climbs and eaten by its dust from the edges of the noise in, faded in as it lifts off
// and out as it goes
vec3 wardSymbol(vec2 uv, vec3 s) {
  float age = s.x;
  vec2 q = (uv - 0.5) * vec2(${WARD_GLYPH_W.toFixed(2)}, ${WARD_GLYPH_H.toFixed(2)});
  float d = runeD(vec2(q.y, q.x) / 0.75, WARD_SCRIPT[int(s.y + 0.5)]) * 0.75;
  float n = vnoiseP(uv * vec2(7.0, 11.0) + s.z * 3.7, vec2(64.0));
  float whole = smoothstep(age * 1.25 - 0.3, age * 1.25 - 0.1, n);
  float fade = smoothstep(0.0, 0.1, age) * (1.0 - age * age);
  float edge = smoothstep(0.0, 0.12, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
  return inked(d, 0.009 + 0.012 * age) * whole * fade * edge;
}
vec3 wardWall(vec2 q) {
  float u = q.x, v = q.y;
  // THE VEIL: streaks of light standing up off the ring and climbing, gone by the shins
  float n = vnoiseP(vec2(u * 72.0, v * 1.6 - uTime * ${WARD_FLOW.veil.toFixed(3)}), vec2(72.0, ${(WARD_FLOW.veil * AURA_CLOCK_PERIOD).toFixed(1)}));
  vec3 col = WARD_VIOLET * (n * n * n * pow(1.0 - v, 2.2) * 0.55 + exp(-v * 7.0) * 0.18);
  // THE MOTES, rising off the ring each at its own place and pace, dimming as they rise
  float circ = TAU * uRingR;
  for (int m = 0; m < ${WARD_MOTES}; m++) {
    float fm = float(m);
    float h1 = fract(sin(fm * 78.233 + 1.7) * 43758.5453), h2 = fract(sin(fm * 39.425 + 3.1) * 24634.6345);
    float mv = fract(uTime ${hzGlsl(WARD_HZ.mote)} * (1.0 + mod(fm, 3.0)) + h2);
    vec2 dm = vec2((fract(u - h1 + 0.5) - 0.5) * circ, (v - mv) * uFlameH);
    col += (WARD_HEART + WARD_VIOLET) * 0.6 * exp(-dot(dm, dm) / 0.0003) * (1.0 - mv);
  }
  return col * wardDrawn(fract(u + 0.5));
}
`;
const RADIANCE_GLSL = `
const vec3 RAD_GOLD = ${v3(RADIANCE_RGB.gold)};
const vec3 RAD_HEART = ${v3(RADIANCE_RGB.heart)};
float radianceBreath() { return 0.85 + 0.15 * sin(uTime * TAU ${hzGlsl(RADIANCE_HZ.pulse)}); }
vec3 radianceGround(vec2 p) {
  float r = length(p), a = atan(p.y, p.x);
  if (r > uGroundR) discard;
  float R = uRingR, breath = radianceBreath();
  // THE POOL: the light the column throws, brightest at the feet and gone before the quad's edge
  vec3 col = RAD_GOLD * exp(-r * r / 0.30) * 0.42 * breath;
  // THE RING at the column's foot: a white-gold line in a golden glow
  float dr = r - R;
  col += RAD_GOLD * exp(-dr * dr / 0.0016) * 0.55 * breath + RAD_HEART * exp(-dr * dr / 0.00018) * 0.7;
  // THE RAYS out from the ring across the pool, turning slowly - a whole number round, so no seam behind the wearer
  float ray = pow(max(0.5 + 0.5 * cos(${RADIANCE_RAYS.toFixed(1)} * (a - uTime * TAU ${hzGlsl(RADIANCE_HZ.rays)})), 0.0), 8.0);
  col += RAD_GOLD * ray * 0.3 * breath * smoothstep(R * 0.9, R + 0.08, r) * (1.0 - smoothstep(R + 0.15, ${RADIANCE_POOL_R.toFixed(3)}, r));
  return col * (1.0 - smoothstep(uGroundR - 0.2, uGroundR, r));
}
vec3 radianceWall(vec2 q) {
  float u = q.x, v = q.y;
  // A GLOWING SHELL: faint where the eye looks through it (across the body), brightest where it looks along it (the
  // silhouette's two edges) - the horizontal facing of the column's surface to the eye
  float an = u * TAU;
  vec2 e = uCamPos.xz - vWorld.xz;
  float facing = dot(e, e) > 1e-8 ? abs(dot(vec2(cos(an), sin(an)), normalize(e))) : 1.0;
  float rim = 0.14 + 0.86 * pow(max(1.0 - facing, 0.0), 2.0);
  // the shafts climbing it, and the column fading toward its top
  float shaft = vnoiseP(vec2(u * ${RADIANCE_ROUND.toFixed(1)}, v * 2.5 - uTime * ${RADIANCE_FLOW.shafts.toFixed(3)}), vec2(${RADIANCE_ROUND.toFixed(1)}, ${(RADIANCE_FLOW.shafts * AURA_CLOCK_PERIOD).toFixed(1)}));
  float rise = (1.0 - smoothstep(0.4, 1.0, v)) * (0.7 + 0.3 * (1.0 - v));   // whole to the chest, gone past the crown
  // never from inside it: the wearer's own first person sees no gold veil, only the motes, dimmer
  float outside = smoothstep(uRingR + 0.1, uRingR + 0.6, length(vec2(length(uCamPos.xz - uAt.xz), max(max(uAt.y - uCamPos.y, uCamPos.y - uAt.y - uFlameH), 0.0))));   // AUDIT 3: out of the column, over or under it too
  vec3 col = RAD_GOLD * rim * rise * (0.35 + 0.65 * shaft * shaft) * 0.75 * radianceBreath() * outside;
  // THE MOTES, rising the column's height each at its own place and pace, kindling off the ground and dimming as they go
  float circ = TAU * uRingR, sparks = 0.0;
  for (int m = 0; m < ${RADIANCE_MOTES}; m++) {
    float fm = float(m);
    float h1 = fract(sin(fm * 63.71 + 2.3) * 43758.5453), h2 = fract(sin(fm * 27.13 + 5.9) * 24634.6345);
    float mv = fract(uTime ${hzGlsl(RADIANCE_HZ.mote)} * (1.0 + mod(fm, 3.0)) + h2);
    vec2 dm = vec2((fract(u - h1 + 0.5) - 0.5) * circ, (v - mv) * uFlameH);
    sparks += exp(-dot(dm, dm) / 0.0005) * (1.0 - mv) * smoothstep(0.0, 0.08, mv);
  }
  col += (RAD_HEART + RAD_GOLD) * 0.55 * sparks * mix(0.35, 1.0, outside);
  // kindled UP: the light rising from the feet
  return col * clamp((uKindle * 1.25 - v) / 0.15, 0.0, 1.0);
}
`;
const RESONANCE_GLSL = `
const vec3 RES_PURPLE = ${v3(RESONANCE_RGB.purple)};
const float RES_N = ${RESONANCE_COLUMNS.toFixed(1)};
const float RES_SQ = ${RESONANCE_SQUARE_M.toFixed(3)};
const float RES_PITCH = ${RESONANCE_PITCH_M.toFixed(3)};
// the metres a pixel spans here, never under a few millimetres
float resPixel() { return max(max(length(dFdx(vWorld)), length(dFdy(vWorld))), 0.002); }
// the cover of a square of side RES_SQ at (x, y) from its middle (m), in a cell pitchX by pitchY: its edge a pixel wide,
// and, once the cell is a couple of pixels or less, the cell's average cover instead - so the rows do not moire far off
float resCover(vec2 q, float pitchX, float pitchY) {
  float px = resPixel();
  vec2 e = clamp((vec2(RES_SQ * 0.5) - abs(q)) / px + 0.5, 0.0, 1.0);
  float avg = RES_SQ * RES_SQ / (pitchX * pitchY);
  return mix(e.x * e.y, avg, smoothstep(0.35, 0.7, px / min(pitchX, pitchY)));
}
vec4 resonanceWall(vec2 q) {
  float u = fract(q.x), v = q.y;
  float cu = u * RES_N, k = floor(cu);
  float pitch = TAU * uRingR / RES_N;
  float y = v * uFlameH, j = floor(y / RES_PITCH);
  float lit = uResLit[int(clamp(k, 0.0, RES_N - 1.0))];   // node's count for this column (resonanceLitInto)
  if (j >= lit) return vec4(0.0);
  float c = resCover(vec2((fract(cu) - 0.5) * pitch, y - (j + 0.5) * RES_PITCH), pitch, RES_PITCH);
  return vec4(RES_PURPLE * c, c);
}
vec4 resonanceGround(vec2 p) {
  float r = length(p);
  if (r > uGroundR) discard;
  // nothing but the feet, on the ring - and never the angle at the middle, where atan(0, 0) is no number and a NaN under
  // the premultiplied blend paints the floor white (AUDIT)
  if (abs(r - uRingR) > RES_SQ) return vec4(0.0);
  float cu = fract(atan(p.y, p.x) / TAU) * RES_N;
  // each column's foot, a square lying on the ring under it
  float pitch = TAU * r / RES_N;
  float c = resCover(vec2((fract(cu) - 0.5) * pitch, r - uRingR), pitch, RES_PITCH) * uKindle;
  return vec4(RES_PURPLE * c, c);
}
`;
const TURNING_HELPERS = `
// the metres a pixel spans here, never under a few millimetres
float turnPixel() { return max(max(length(dFdx(vWorld)), length(dFdy(vWorld))), 0.002); }
// a band between two radii (or heights), its edges a pixel wide
float turnBand(float x, float lo, float hi, float px) { return clamp((x - lo) / px + 0.5, 0.0, 1.0) * clamp((hi - x) / px + 0.5, 0.0, 1.0); }
// the wheel's turn: a step on the second, eased over its first quarter, held the rest - forward, clockwise on the screen (turningWheelAngle)
float turningWheel() { float s = floor(uTime), e = clamp((uTime - s) / ${TURNING_STEP_S.toFixed(3)}, 0.0, 1.0); return -TAU * (s + e * e * (3.0 - 2.0 * e)) ${hzGlsl(TURNING_HZ.wheel)}; }   // AUDIT SD II (SD11f): falling - clockwise as the eye sees it
float turningBreath() { return 0.85 + 0.15 * sin(uTime * TAU ${hzGlsl(TURNING_HZ.pulse)}); }
// a tooth's face across its pitch (0..1 round from its leading edge): solid over its middle half, its flanks a pixel wide
float turningTooth(float w, float r, float px) {
  float pitch = TAU * r / ${TURNING_TEETH.toFixed(1)}, x = fract(w / TAU * ${TURNING_TEETH.toFixed(1)}) * pitch;
  return clamp((x - 0.2 * pitch) / px + 0.5, 0.0, 1.0) * clamp((0.7 * pitch - x) / px + 0.5, 0.0, 1.0);
}
`;
const turningLook = (fn, P, rgb, { forward = false, blaze = 0, rays = 0 } = {}) => `
const vec3 ${P}_BRASS = ${v3(rgb.brass)};
const vec3 ${P}_GOLD = ${v3(rgb.gold)};
const vec3 ${P}_LIGHT = ${v3(rgb.light)};
vec3 ${fn}Ground(vec2 p) {
  float r = length(p);
  if (r > uGroundR) discard;
  float px = turnPixel(), breath = turningBreath();
  // THE GOLD LIGHT the wheel stands in, brightest at the feet
  vec3 col = ${P}_GOLD * exp(-r * r / 0.22) * 0.3 * breath;
  // never the angle at the middle, where atan(0, 0) is no number (the resonance's AUDIT)
  if (r > 0.05) {
    float a = atan(p.y, p.x), w = a - turningWheel();
    // THE WHEEL: its rim, its teeth out of it, its hub and its spokes - all turning with it
    float rim = turnBand(r, ${(TURNING_R - TURNING_RIM_M).toFixed(3)}, ${TURNING_R.toFixed(3)}, px);
    float tooth = turnBand(r, ${TURNING_R.toFixed(3)} - px, ${(TURNING_R + TURNING_TOOTH_M).toFixed(3)}, px) * turningTooth(w, r, px);
    float hub = turnBand(r, ${(TURNING_HUB_R - 0.03).toFixed(3)}, ${TURNING_HUB_R.toFixed(3)}, px);
    float across = abs(fract(w / TAU * ${TURNING_SPOKES.toFixed(1)} + 0.5) - 0.5) * TAU * r / ${TURNING_SPOKES.toFixed(1)};
    float spoke = clamp((${(TURNING_SPOKE_M / 2).toFixed(4)} - across) / px + 0.5, 0.0, 1.0) * turnBand(r, ${TURNING_HUB_R.toFixed(3)} - px, ${(TURNING_R - TURNING_RIM_M).toFixed(3)} + px, px);
    float brass = max(max(rim, tooth), max(hub, spoke));
    // its gleam - a light that does not turn, the teeth catching it as they pass under it
    float gleam = pow(max(0.5 + 0.5 * cos(a - 0.6), 0.0), 6.0);   // AUDIT SD II (L2 F12): never a pow of a negative (a cos a hair under -1)
    col += brass * (${P}_BRASS * 0.8 + ${P}_LIGHT * 0.45 * gleam);
    // THE DIAL outside it, turning ${forward ? 'ON' : 'BACK'}: a line of gold and the Hour's twelve marks, the Hour's own the longer
    float d = a ${forward ? '+' : '-'} uTime * TAU ${hzGlsl(TURNING_HZ.dial)};   // the dial's own angle ${forward ? '(firstDialAngle: it turns on - clockwise as the eye sees it)' : '(turningDialAngle: it turns back - AUDIT SD II, L2 F13: as the eye sees it)'}
    float hr = fract(d / TAU * ${TURNING_MARKS.toFixed(1)} + 0.5) - 0.5;   // across the nearest hour's mark, in hours
    float first = 1.0 - step(0.5, mod(floor(fract(d / TAU) * ${TURNING_MARKS.toFixed(1)} + 0.5), ${TURNING_MARKS.toFixed(1)}));   // the Hour's own
    float markLen = ${TURNING_MARK_M.toFixed(3)} * (1.0 + first);
    float mark = clamp((0.009 - abs(hr) * TAU * r / ${TURNING_MARKS.toFixed(1)}) / px + 0.5, 0.0, 1.0) * turnBand(r, ${TURNING_DIAL_R.toFixed(3)} - markLen, ${TURNING_DIAL_R.toFixed(3)}, px);
    float line = turnBand(r, ${(TURNING_DIAL_R - 0.006).toFixed(3)}, ${(TURNING_DIAL_R + 0.006).toFixed(3)}, px);
    col += ${P}_GOLD * max(mark, line * 0.7) * (0.75 + 0.25 * breath);
${blaze ? `    col += ${P}_LIGHT * first * mark * ${blaze.toFixed(2)} * breath;   // HOURS-FIRST: the Hour's own mark ablaze\n` : ''}${rays ? `    // HOURS-FIRST: THE FIRST LIGHT - a ray of dawn from the wheel's teeth out to each hour's mark, turning on with the dial
    float ray = pow(max(cos(d * ${TURNING_MARKS.toFixed(1)}), 0.0), 40.0) * turnBand(r, ${(TURNING_R + TURNING_TOOTH_M + 0.04).toFixed(3)}, ${(TURNING_DIAL_R - 0.03).toFixed(3)}, 0.05);
    col += ${P}_LIGHT * ray * ${rays.toFixed(2)} * breath;\n` : ''}  }
  return col * uKindle * (1.0 - smoothstep(uGroundR - 0.2, uGroundR, r));
}
vec3 ${fn}Wall(vec2 q) {
  float u = q.x, v = q.y, y = v * uFlameH, px = turnPixel(), breath = turningBreath();
  // THE WHEEL'S EDGE, seen from the side: its teeth's faces passing round with it, a line of gold along their top
  float w = u * TAU - turningWheel();
  float edge = clamp((${TURNING_EDGE_M.toFixed(3)} - y) / px + 0.5, 0.0, 1.0) * turningTooth(w, uRingR, px);
  vec3 col = ${P}_BRASS * 0.8 * edge + ${P}_GOLD * 0.6 * edge * turnBand(y, ${(TURNING_EDGE_M - 0.012).toFixed(3)}, ${TURNING_EDGE_M.toFixed(3)}, px);
  // THE GOLD LIGHT rising off it, gone by the knee
  col += ${P}_GOLD * 0.16 * (1.0 - smoothstep(0.0, 0.3, y)) * breath;
  // THE MOTES, rising the wall's height each at its own place and pace
  float circ = TAU * uRingR, sparks = 0.0;
  for (int m = 0; m < ${TURNING_MOTES}; m++) {
    float fm = float(m);
    float h1 = fract(sin(fm * 41.37 + 1.7) * 43758.5453), h2 = fract(sin(fm * 17.93 + 3.1) * 24634.6345);
    float mv = fract(uTime ${hzGlsl(TURNING_HZ.mote)} * (1.0 + mod(fm, 3.0)) + h2);
    vec2 dm = vec2((fract(u - h1 + 0.5) - 0.5) * circ, (v - mv) * uFlameH);
    sparks += exp(-dot(dm, dm) / 0.0004) * (1.0 - mv) * smoothstep(0.0, 0.08, mv);
  }
  col += (${P}_LIGHT + ${P}_GOLD) * 0.5 * sparks;
  // kindled UP, as the radiance is: the light rising from the feet
  return clamp((uKindle * 1.25 - v) / 0.15, 0.0, 1.0) * col;
}
`;
const TURNING_GLSL = TURNING_HELPERS + turningLook('turning', 'TH', TURNING_RGB) + turningLook('first', 'FH', FIRST_RGB, { forward: true, blaze: FIRST_BLAZE, rays: FIRST_RAY });
const MAELSTROM_GLSL = `
const vec3 MS_SEA = ${v3(MAELSTROM_RGB.sea)};
const vec3 MS_TIDE = ${v3(MAELSTROM_RGB.tide)};
const vec3 MS_FOAM = ${v3(MAELSTROM_RGB.foam)};
// the pool's turn - clockwise as the eye sees it (maelstromSpin)
float maelstromSpin() { return -TAU * uTime ${hzGlsl(MAELSTROM_HZ.spin)}; }
float maelstromBreath() { return 0.85 + 0.15 * sin(uTime * TAU ${hzGlsl(MAELSTROM_HZ.pulse)}); }
// an arm's crest at (r, a): one on it, falling away between (maelstromArmAngle's spiral)
float maelstromArm(float r, float a) {
  float ph = ${MAELSTROM_ARMS.toFixed(1)} * (a - maelstromSpin()) + ${MAELSTROM_TWIST.toFixed(1)} * log(max(r, 0.02) / ${MAELSTROM_R.toFixed(3)});
  return pow(max(0.5 + 0.5 * cos(ph), 0.0), ${MAELSTROM_SHARP.toFixed(1)});   // AUDIT WORLD-REWARDS D2: never a pow of a negative (a cos a hair under -1 - AUDIT SD II L2 F12's law)
}
vec3 maelstromGround(vec2 p) {
  float r = length(p);
  if (r > uGroundR) discard;
  float breath = maelstromBreath();
  // THE WATER the pool turns in: the sea's light, dark in the eye, gone past the lip
  vec3 col = MS_SEA * 0.22 * smoothstep(${MAELSTROM_EYE_R.toFixed(3)}, ${MAELSTROM_R.toFixed(3)}, r) * (1.0 - smoothstep(${MAELSTROM_R.toFixed(3)}, uGroundR, r));
  // never the angle at the middle, where atan(0, 0) is no number (the resonance's AUDIT)
  if (r > 0.05) {
    float a = atan(p.y, p.x);
    // THE ARMS of foam, wound in to the eye and turning with the pool
    float arm = maelstromArm(r, a) * smoothstep(${MAELSTROM_EYE_R.toFixed(3)}, ${(MAELSTROM_EYE_R + 0.12).toFixed(3)}, r) * (1.0 - smoothstep(${(MAELSTROM_R - 0.04).toFixed(3)}, ${(MAELSTROM_R + 0.04).toFixed(3)}, r));
    col += mix(MS_TIDE, MS_FOAM, arm) * arm * 0.7 * breath;
    // THE LIP: a ring of foam breaking round the pool, the surf running round it
    float ld = (r - ${MAELSTROM_R.toFixed(3)}) / 0.035;
    col += MS_FOAM * exp(-ld * ld) * (0.55 + 0.45 * sin(a * 7.0 + uTime * TAU ${hzGlsl(MAELSTROM_HZ.surf)})) * 0.45;
  }
  return col * uKindle * (1.0 - smoothstep(uGroundR - 0.2, uGroundR, r));
}
vec3 maelstromWall(vec2 q) {
  float u = q.x, v = q.y, y = v * uFlameH, breath = maelstromBreath();
  // THE CURL at the lip, its crest riding the arms round
  float crest = ${MAELSTROM_CURL_H.toFixed(3)} * (0.7 + 0.3 * cos(${MAELSTROM_ARMS.toFixed(1)} * (u * TAU - maelstromSpin())));
  vec3 col = MS_TIDE * 0.3 * (1.0 - smoothstep(crest - 0.02, crest, y)) * clamp(y / crest, 0.0, 1.0);
  float cd = (y - crest) / 0.012;
  col += MS_FOAM * 0.6 * exp(-cd * cd);
  // THE SPRAY: drops thrown up off the crest, each on its own arc and back down, carried round with the pool
  float circ = TAU * uRingR, spray = 0.0;
  for (int m = 0; m < ${MAELSTROM_DROPS}; m++) {
    float fm = float(m);
    float h1 = fract(sin(fm * 41.37 + 1.7) * 43758.5453), h2 = fract(sin(fm * 17.93 + 3.1) * 24634.6345);
    float life = fract(uTime ${hzGlsl(MAELSTROM_HZ.drop)} * (1.0 + mod(fm, 3.0)) + h2);
    float hy = crest + (uFlameH * ${MAELSTROM_DROP_TOP.toFixed(2)} - crest) * 4.0 * life * (1.0 - life);   // AUDIT WORLD-REWARDS D4: the arc's top inside the strip
    vec2 dm = vec2((fract(u - h1 - maelstromSpin() / TAU + 0.5) - 0.5) * circ, y - hy);   // AUDIT WORLD-REWARDS E5: carried round WITH the pool (maelstromDropAt)
    spray += exp(-dot(dm, dm) / 0.0003) * (1.0 - smoothstep(0.7, 1.0, life));
  }
  col += mix(MS_TIDE, MS_FOAM, 0.7) * 0.55 * spray * breath;
  // kindled UP, as the wheel's light is: the spray rising from the feet
  float kindled = clamp((uKindle * 1.25 - v) / 0.15, 0.0, 1.0);
  return kindled * col;
}
`;

const SPIRE_GLSL = `
const vec3 SP_BEACON = ${v3(SPIRE_RGB.beacon)};
const vec3 SP_WHITE = ${v3(SPIRE_RGB.white)};
const vec3 SP_EMBER = ${v3(SPIRE_RGB.ember)};
const vec3 SP_COAL = ${v3(SPIRE_RGB.coal)};
const vec3 SP_FLAME = ${v3(SPIRE_RGB.flame)};
const vec3 SP_DAWN = ${v3(SPIRE_RGB.dawn)};
const vec3 SP_DAWN_GOLD = ${v3(SPIRE_RGB.dawnGold)};
float spireFade(float r) { return 1.0 - smoothstep(uGroundR - 0.2, uGroundR, r); }
// BEACONLIGHT
float beaconBreath() { return 0.85 + 0.15 * sin(uTime * TAU ${hzGlsl(BEACON_HZ.pulse)}); }
vec3 beaconGround(vec2 p) {
  float r = length(p);
  if (r > uGroundR) discard;
  float breath = beaconBreath();
  // THE POOL of gold-white light about the feet, and THE RING the beacons stand on, a thin line of gold
  float dr = r - uRingR;
  vec3 col = SP_BEACON * exp(-r * r / 0.35) * 0.22 * breath + SP_BEACON * exp(-dr * dr / 0.0009) * 0.35 * breath;
  // never the angle at the middle, where atan(0, 0) is no number (the resonance's AUDIT)
  if (r > 0.05) {
    // THE BEACONS: white fire on the ring, lit one after another round it (beaconLit) and fading after
    float a = atan(p.y, p.x);
    float k = floor(fract(a / TAU) * ${BEACON_LIGHTS.toFixed(1)} + 0.5);
    float ak = k / ${BEACON_LIGHTS.toFixed(1)} * TAU;
    vec2 d = p - vec2(cos(ak), sin(ak)) * uRingR;
    float age = fract(uTime ${hzGlsl(BEACON_HZ.kindle)} - k / ${BEACON_LIGHTS.toFixed(1)});
    col += (SP_WHITE * 0.9 + SP_BEACON * 0.4) * exp(-dot(d, d) / 0.0025) * (0.3 + 0.7 * exp(-age * 4.0));
  }
  return col * uKindle * spireFade(r);
}
vec3 beaconWall(vec2 q) {
  float u = q.x, v = q.y;
  // a faint rise of gold off the ring, gone by the knee
  vec3 col = SP_BEACON * 0.1 * (1.0 - smoothstep(0.0, 0.25, v)) * beaconBreath();
  // THE MOTES: gold-white, rising off the ring past the chest, each at its own place and pace, swaying as they climb
  float circ = TAU * uRingR, motes = 0.0;
  for (int m = 0; m < ${BEACON_MOTES}; m++) {
    float fm = float(m);
    float h1 = fract(sin(fm * 91.17 + 0.7) * 43758.5453), h2 = fract(sin(fm * 33.71 + 2.9) * 24634.6345);
    float mv = fract(uTime ${hzGlsl(BEACON_HZ.mote)} * (1.0 + mod(fm, 3.0)) + h2);
    vec2 dm = vec2((fract(u - h1 + 0.5) - 0.5) * circ + 0.04 * sin(TAU * (mv * 2.0 + h1)), (v - mv) * uFlameH);
    motes += exp(-dot(dm, dm) / 0.0003) * (1.0 - mv) * smoothstep(0.0, 0.06, mv);
  }
  col += (SP_WHITE * 0.7 + SP_BEACON * 0.5) * motes;
  // kindled UP: the light rising from the feet
  return col * clamp(uKindle * 1.25 - v, 0.0, 0.15) / 0.15;
}
// THE BURNING STAIR
float stairFlare() { return 0.8 + 0.2 * sin(uTime * TAU ${hzGlsl(STAIR_HZ.flare)}); }
vec3 stairGround(vec2 p) {
  float r = length(p);
  if (r > uGroundR) discard;
  float px = turnPixel(), flare = stairFlare();
  // THE COAL's glow under the feet
  vec3 col = SP_COAL * exp(-r * r / 0.3) * 0.3 * flare;
  if (r > 0.05) {
    // THE STAIR: its steps round the feet, each a little hotter than the one above it, the whole of it turning DOWN
    float a = atan(p.y, p.x);
    float s = fract(a / TAU - uTime ${hzGlsl(STAIR_HZ.descend)}) * ${STAIR_STEPS.toFixed(1)};
    float k = floor(s), f = fract(s), heat = (k + 1.0) / ${STAIR_STEPS.toFixed(1)};
    float tread = turnBand(r, uRingR - ${STAIR_W.toFixed(3)}, uRingR, px);
    float riser = 1.0 - smoothstep(0.0, 0.07, f);   // the step's lip, lit, along its leading edge
    float gap = smoothstep(0.0, 0.03, f) * (1.0 - smoothstep(0.97, 1.0, f));   // and a dark line between two steps
    col += mix(SP_COAL, SP_EMBER, heat) * (0.3 + 0.6 * heat) * tread * gap * flare + SP_FLAME * tread * riser * 0.7 * heat;
  }
  return col * uKindle * spireFade(r);
}
vec3 stairWall(vec2 q) {
  float u = q.x, v = q.y, flare = stairFlare();
  // the stair's heat rising off it, gone by the knee
  vec3 col = SP_EMBER * 0.1 * (1.0 - smoothstep(0.0, 0.2, v)) * flare;
  // THE EMBERS, FALLING from over the head, each at its own place and pace, drifting - a streak longer than it is wide,
  // cooling as it falls
  float circ = TAU * uRingR, embers = 0.0;
  for (int m = 0; m < ${STAIR_EMBERS}; m++) {
    float fm = float(m);
    float h1 = fract(sin(fm * 57.31 + 1.3) * 43758.5453), h2 = fract(sin(fm * 21.77 + 4.1) * 24634.6345);
    float mv = 1.0 - fract(uTime ${hzGlsl(STAIR_HZ.ember)} * (1.0 + mod(fm, 3.0)) + h2);
    vec2 dm = vec2((fract(u - h1 + 0.5) - 0.5) * circ + 0.05 * sin(TAU * (mv + h1)), (v - mv) * uFlameH * 0.35);
    embers += exp(-dot(dm, dm) / 0.0004) * (0.25 + 0.75 * mv) * smoothstep(0.0, 0.08, mv) * (1.0 - smoothstep(0.9, 1.0, mv));
  }
  col += (SP_FLAME * 0.6 + SP_EMBER * 0.6) * embers;
  // kindled DOWN: the embers' first fall, from over the head to the stair
  return col * clamp(uKindle * 1.25 - (1.0 - v), 0.0, 0.15) / 0.15;
}
// FIRSTLIGHT - SPIRE-FIRST: the climb (dawnClimb, node's law): Redoubt k taken, its spire up, and down again with the rest
const vec3 SP_DAWN_ROSE = ${v3(SPIRE_RGB.dawnRose)};
float dawnBreath() { return 0.85 + 0.15 * sin(uTime * TAU ${hzGlsl(DAWN_HZ.breath)}); }
float dawnNow() { return fract(uTime ${hzGlsl(DAWN_HZ.climb)}); }
float dawnDown(float c) { return 1.0 - smoothstep(${g3(DAWN_CLIMB.hold)}, ${g3(DAWN_CLIMB.down)}, c); }
float dawnAt(float k) { return ${g3(DAWN_CLIMB.at)} + k * ${g3(DAWN_CLIMB.step)}; }
float dawnTaken(float k, float c) { float at = dawnAt(k); return smoothstep(at, at + ${g3(DAWN_CLIMB.rise)}, c) * dawnDown(c); }
float dawnFlare(float k, float c) { float at = dawnAt(k); return c >= at ? exp(-(c - at) * ${g1(DAWN_CLIMB.flare)}) * dawnDown(c) : 0.0; }
// round the ring from the climb's start (0 .. 1): I's lozenge at a twentieth, X's at nineteen twentieths
float dawnRound(float turn) { return fract(turn + ${g3(DAWN_START)}); }
vec3 dawnGround(vec2 p) {
  float r = length(p);
  if (r > uGroundR) discard;
  float px = turnPixel(), breath = dawnBreath(), c = dawnNow(), dawn = dawnTaken(${g1(DAWN_REDOUBTS - 1)}, c);
  float dr = r - uRingR, ri = uRingR - ${g3(DAWN_INNER_M)};
  // THE POOL: pale dawn-gold about the feet, warmer once the dawn has broken
  vec3 col = SP_DAWN_GOLD * exp(-r * r / 0.3) * (0.08 + 0.06 * dawn) * breath;
  // THE DIAL: the ring, one crisp line of the dawn's white, its edge a pixel wide, in a dawn-gold glow; its inner line a
  // thinner one of gold
  float ring = turnBand(r, uRingR - ${(DAWN_RING_M / 2).toFixed(3)}, uRingR + ${(DAWN_RING_M / 2).toFixed(3)}, px);
  float inner = turnBand(r, ri - ${(DAWN_RING_M / 4).toFixed(3)}, ri + ${(DAWN_RING_M / 4).toFixed(3)}, px);
  col += SP_DAWN * ring * 0.85 + SP_DAWN_GOLD * exp(-dr * dr / 0.004) * 0.25 * breath + SP_DAWN_GOLD * inner * 0.45;
  // never the angle at the middle, where atan(0, 0) is no number (the resonance's AUDIT)
  if (r > 0.05) {
    float a = atan(p.y, p.x), s = dawnRound(a / TAU);
    // THE SUNRISE: a light circling the ring slowly, as the sun climbs round the edge of the world
    float sweep = pow(max(0.5 + 0.5 * cos(a - uTime * TAU ${hzGlsl(DAWN_HZ.sweep)}), 0.0), 10.0);
    col += SP_DAWN * sweep * exp(-dr * dr / 0.002) * 0.6;
    // THE CLIMB'S LANE, between the lines: lit round from I to where the climb has come - it reaches each Redoubt as it
    // is taken and rests on X - its head bright while it climbs, faded in off the start so the start is no hard edge
    float lane = turnBand(r, ri + ${(DAWN_RING_M / 4).toFixed(3)}, uRingR - ${(DAWN_RING_M / 2).toFixed(3)}, px);
    float reach = min(${g3(0.5 / DAWN_REDOUBTS)} + (c - ${g3(DAWN_CLIMB.at)}) / ${g3(DAWN_CLIMB.step * DAWN_REDOUBTS)}, ${g3(1 - 0.5 / DAWN_REDOUBTS)});
    float behind = (reach - s) * TAU * r;
    float head = exp(-behind * behind / 0.0016) * (1.0 - smoothstep(${g3(1 - 0.7 / DAWN_REDOUBTS)}, ${g3(1 - 0.5 / DAWN_REDOUBTS)}, reach));
    col += (SP_DAWN_GOLD * 0.26 * smoothstep(-0.006, 0.006, behind) + SP_DAWN * 0.9 * head) * lane * smoothstep(0.0, 0.012, s) * dawnDown(c);
    // THE TEN REDOUBTS on the ring: each a lozenge, its outline standing until it is taken, then filled with the dawn
    // and flaring as it is; X the larger, and when the dawn breaks a star of four points
    float sk = s * ${g1(DAWN_REDOUBTS)}, k = floor(sk), crown = k > ${g1(DAWN_REDOUBTS - 1.5)} ? ${g3(DAWN_CROWN)} : 1.0;
    vec2 m = vec2((fract(sk) - 0.5) / ${g1(DAWN_REDOUBTS)} * TAU * r, dr) / (vec2(${g3(DAWN_MARK_M[0])}, ${g3(DAWN_MARK_M[1])}) * crown);
    float dd = abs(m.x) + abs(m.y), mpx = px / (${g3(DAWN_MARK_M[0])} * crown);
    float face = clamp((1.0 - dd) / mpx + 0.5, 0.0, 1.0), outline = turnBand(dd, 0.7, 1.0, mpx);
    float tk = dawnTaken(k, c), fk = dawnFlare(k, c);
    col += SP_DAWN_GOLD * outline * 0.55 * breath + mix(SP_DAWN_GOLD, SP_DAWN, 0.6) * face * tk * 0.9 + SP_WHITE * exp(-dot(m, m) * 1.5) * fk * 1.2;
    float star = exp(-abs(m.x) * 0.35) * exp(-m.y * m.y * 60.0) + exp(-abs(m.y) * 0.35) * exp(-m.x * m.x * 60.0);
    col += SP_WHITE * star * dawn * step(${g1(DAWN_REDOUBTS - 1.5)}, k) * 0.55 * breath;
    // THE SUNBURST past the ring, turning slowly: rays long and short by turns, gold at the ring and rose at their tips,
    // faint until the dawn breaks; and as X is taken the dawn's light runs out along them across the ground
    float past = r - uRingR - ${g3(DAWN_RING_M)};
    if (past > 0.0) {
      float sr = fract(a / TAU + uTime ${hzGlsl(DAWN_HZ.rays)}) * ${g1(DAWN_RAYS)}, j = floor(sr);
      float ur = past / mix(${g3(DAWN_RAY_M[1])}, ${g3(DAWN_RAY_M[0])}, 1.0 - mod(j, 2.0));
      float across = (fract(sr) - 0.5) / ${g1(DAWN_RAYS)} * TAU * r, w = ${g3(DAWN_RAY_W)} * max(1.0 - ur, 0.0) + px * 0.5;
      float ray = exp(-across * across / (w * w)) * pow(max(1.0 - ur, 0.0), 1.5);
      float since = c - dawnAt(${g1(DAWN_REDOUBTS - 1)}), front = uRingR + since * ${g1(DAWN_CLIMB.wave)};
      float wave = since >= 0.0 ? exp(-(r - front) * (r - front) / 0.0036) * exp(-since * 25.0) * dawnDown(c) : 0.0;
      col += mix(SP_DAWN_GOLD, SP_DAWN_ROSE, smoothstep(0.2, 1.0, ur)) * ray * ((0.12 + 0.3 * dawn) * breath + wave * 1.2) + SP_DAWN * wave * 0.2;
    }
  }
  return col * uKindle * spireFade(r);
}
vec3 dawnWall(vec2 q) {
  float u = q.x, v = q.y, y = v * uFlameH, px = turnPixel(), c = dawnNow(), breath = dawnBreath();
  float dawn = dawnTaken(${g1(DAWN_REDOUBTS - 1)}, c), circ = TAU * uRingR;
  // THE VEIL: pale light rising off the ring in streaks, gone by the shin
  float yv = y / ${g3(DAWN_VEIL_H)}, fv = max(1.0 - yv, 0.0);
  float n = vnoiseP(vec2(u * 48.0, yv * 1.2 - uTime * ${DAWN_FLOW.veil.toFixed(3)}), vec2(48.0, ${(DAWN_FLOW.veil * AURA_CLOCK_PERIOD).toFixed(1)}));
  vec3 col = (SP_DAWN * 0.5 + SP_DAWN_GOLD * 0.5) * (n * n * fv * fv * 0.45 + exp(-yv * 6.0) * 0.15) * breath;
  // THE TEN SPIRES, one off each Redoubt, I the lowest and X the tallest: each a third of itself until its Redoubt is
  // taken, then standing whole (dawnSpireH) - rose at its foot, the dawn's gold up it and white at its point, a sunrise up
  // its height; a star at its point, and X's crowned when the dawn breaks
  float sk = dawnRound(u) * ${g1(DAWN_REDOUBTS)}, k = floor(sk), crown = k > ${g1(DAWN_REDOUBTS - 1.5)} ? ${g3(DAWN_CROWN)} : 1.0;
  float x = (fract(sk) - 0.5) / ${g1(DAWN_REDOUBTS)} * circ, tk = dawnTaken(k, c), fk = dawnFlare(k, c);
  float h = (${g3(DAWN_SPIRE_H[0])} + ${g3(DAWN_SPIRE_H[1] - DAWN_SPIRE_H[0])} * k / ${g1(DAWN_REDOUBTS - 1)}) * (0.3 + 0.7 * tk), yt = y / h;
  float w = ${g3(DAWN_SPIRE_W)} * crown * max(1.0 - yt, 0.0);
  float spire = clamp((w - abs(x)) / px + 0.5, 0.0, 1.0) * (1.0 - step(1.0, yt));
  float glow = exp(-x * x / (w * w * 9.0 + 0.0004)) * max(1.0 - yt, 0.0);
  vec3 tint = mix(mix(SP_DAWN_ROSE, SP_DAWN_GOLD, smoothstep(0.0, 0.5, yt)), SP_DAWN, smoothstep(0.5, 1.0, yt));
  col += tint * (spire * 0.9 + glow * 0.25) * (0.22 + 0.78 * tk + 0.8 * fk);
  vec2 d = vec2(x, y - h);
  float tip = exp(-dot(d, d) / 0.0006) * (0.15 + 0.85 * tk) + exp(-dot(d, d) / 0.004) * fk;
  float star = (exp(-abs(d.x) / 0.06) * exp(-d.y * d.y / 0.00006) + exp(-abs(d.y) / 0.09) * exp(-d.x * d.x / 0.00006)) * dawn * step(${g1(DAWN_REDOUBTS - 1.5)}, k);
  col += SP_WHITE * (tip + star * 0.6 * breath);
  // FIRST LIGHT: as X is taken a shaft shoots up off its point past the head, and stands faint while the dawn holds; and
  // the motes, dawn-white, rising off the ring, more once it has broken. Neither from inside the ring - the wearer's own
  // first person is never veiled by them
  float outside = smoothstep(0.5 * uRingR, 0.8 * uRingR, length(uCamPos.xz - uAt.xz));
  float since = c - dawnAt(${g1(DAWN_REDOUBTS - 1)});
  float top = mix(h, uFlameH, clamp(since * 30.0, 0.0, 1.0));
  float shaft = since >= 0.0 && k > ${g1(DAWN_REDOUBTS - 1.5)} ? exp(-x * x / 0.0003) * smoothstep(h, h + 0.05, y) * (1.0 - smoothstep(top - 0.1, top, y)) * (1.0 - 0.6 * v) * (0.25 * dawn + 0.9 * exp(-since * 25.0) * dawnDown(c)) : 0.0;
  float motes = 0.0;
  for (int mt = 0; mt < ${DAWN_MOTES}; mt++) {
    float fm = float(mt);
    float h1 = fract(sin(fm * 63.17 + 2.3) * 43758.5453), h2 = fract(sin(fm * 19.91 + 0.9) * 24634.6345);
    float mv = fract(uTime ${hzGlsl(DAWN_HZ.mote)} * (1.0 + mod(fm, 2.0)) + h2);
    vec2 dm = vec2((fract(u - h1 + 0.5) - 0.5) * circ + 0.05 * sin(TAU * (mv + h1)), (v - mv) * uFlameH);
    motes += exp(-dot(dm, dm) / 0.00025) * (1.0 - mv) * smoothstep(0.0, 0.06, mv);
  }
  col += (mix(SP_DAWN_GOLD, SP_WHITE, 0.5) * shaft + mix(SP_DAWN, SP_WHITE, 0.5) * motes * (0.35 + 0.65 * dawn)) * outside;
  // kindled UP: the light rising from the feet
  return col * clamp(uKindle * 1.25 - v, 0.0, 0.15) / 0.15;
}
`;
export function glyphEdges(path, steps = 4) {
  const tok = String(path).match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const out = [];
  let i = 0, cmd = null, at = null, start = null;
  const num = () => { const v = Number(tok[i++]); if (!Number.isFinite(v)) throw new Error(`glyphEdges: a number wanted in ${path}`); return v; };
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const edge = (b) => { if (!at) throw new Error(`glyphEdges: a figure must begin with M in ${path}`); if (r3(at[0]) !== r3(b[0]) || r3(at[1]) !== r3(b[1])) out.push([at[0], at[1], b[0], b[1]]); at = b; };
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    if (cmd === 'M') { if (start) edge(start); at = [num(), num()]; start = at; cmd = 'L'; }
    else if (cmd === 'L') edge([num(), num()]);
    else if (cmd === 'Q') {
      if (!at) throw new Error(`glyphEdges: a figure must begin with M in ${path}`);
      const a = at, c = [num(), num()], b = [num(), num()];
      for (let k = 1; k <= steps; k++) { const t = k / steps, r = 1 - t; edge([r * r * a[0] + 2 * r * t * c[0] + t * t * b[0], r * r * a[1] + 2 * r * t * c[1] + t * t * b[1]]); }
    } else if (cmd === 'Z') { if (start) edge(start); cmd = null; }
    else throw new Error(`glyphEdges: '${cmd}' is not drawn here`);
  }
  if (start) edge(start);
  return out;
}
const CLOAK_GLYPH_EDGES = glyphEdges(CLOAK_GLYPH), CLOAK_EYE_EDGES = glyphEdges(CLOAK_GLYPH_EYE);
const glyphEdgesGlsl = (name, edges) => `const vec4 ${name}[${edges.length}] = vec4[${edges.length}](${edges.map((e) => `vec4(${e.map((x) => x.toFixed(3)).join(', ')})`).join(', ')});`;
const CLOAK_SHAPE_GLSL = `
const float CLOAK_TAU = 6.283185307179586;
// x squared - never pow(x, 2.0), which GLSL leaves undefined for a negative x (AUDIT: a driver's exp2/log2 answers NaN)
float cloakSq(float x) { return x * x; }
float cloakHash(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
// the wearer's facing: forward is (sin, cos) in x and z (player/motor.js), the right a quarter turn from it
vec2 cloakFwd() { return vec2(sin(uYaw), cos(uYaw)); }
vec2 cloakBearing(float u) { float th = u * CLOAK_TAU; return cloakFwd() * cos(th) + vec2(cos(uYaw), -sin(uYaw)) * sin(th); }
// 0 at the front's middle, 1 down the back
float cloakBackOf(float u) { return 0.5 - 0.5 * cos(u * CLOAK_TAU); }
// where in its folds the cloth is round the body - uneven, so they read as cloth and not as fluting - and the fold
// itself: -1 in a crease .. 1 on a ridge
float cloakFoldPhase(float u) { return u * CLOAK_TAU * ${g1(CLOAK_FOLDS)} + 0.8 * sin(u * CLOAK_TAU * 3.0); }
float cloakFoldOf(float u) { return cos(cloakFoldPhase(u)); }
// how much the cape hangs free at y: none over the shoulders, all of it toward the hem - the folds' depth and the billow
float cloakDrapeOf(float y) { return smoothstep(0.05, 0.9, 1.0 - y / ${g3(CLOAK_SHOULDER_Y)}); }
// the radius about its axis at y (m up) on bearing u: the cape from the shoulders - narrower front to back than across,
// as a body is - falling and flaring to the hem, its back hanging further out; over the shoulders in to the neck; the
// hood round the head, narrower across than deep, closing over the crown
float cloakRadius(float u, float y) {
  float c2 = cloakSq(cos(u * CLOAK_TAU));
  if (y < ${g3(CLOAK_SHOULDER_Y)}) {
    float s = 1.0 - y / ${g3(CLOAK_SHOULDER_Y)};
    float squash = mix(${g3(CLOAK_SQUASH.shoulder)}, ${g3(CLOAK_SQUASH.hem)}, smoothstep(0.0, 0.8, s));
    return mix(${g3(CLOAK_SHOULDER_R)}, ${g3(CLOAK_HEM_R)}, pow(s, 1.3)) * (1.0 - squash * c2) + ${g3(CLOAK_BACK_M)} * cloakBackOf(u) * pow(s, 1.2);
  }
  float across = 1.0 - ${g3(CLOAK_SQUASH.hood)} * (1.0 - c2);
  if (y < ${g3(CLOAK_NECK_Y)}) return mix(${g3(CLOAK_SHOULDER_R)} * (1.0 - ${g3(CLOAK_SQUASH.shoulder)} * c2), ${g3(CLOAK_NECK_R)} * across, smoothstep(${g3(CLOAK_SHOULDER_Y)}, ${g3(CLOAK_NECK_Y)}, y));
  if (y < ${g3(CLOAK_HOOD_Y)}) return mix(${g3(CLOAK_NECK_R)}, ${g3(CLOAK_HOOD_R)}, smoothstep(${g3(CLOAK_NECK_Y)}, ${g3(CLOAK_HOOD_Y)}, y)) * across;
  float s = (y - ${g3(CLOAK_HOOD_Y)}) / ${g3(CLOAK_H - CLOAK_HOOD_Y)};
  return ${g3(CLOAK_HOOD_R)} * across * sqrt(max(0.0, 1.0 - s * s));
}
// how far behind the body's middle its axis stands at y (m): the cape's on the body; the hood's behind the face, its
// peak fallen back a little further
float cloakAxisBack(float y) { return ${g3(CLOAK_HOOD_BACK_M)} * smoothstep(${g3(CLOAK_SHOULDER_Y)}, ${g3(CLOAK_NECK_Y)}, y) + ${g3(CLOAK_PEAK_BACK_M)} * smoothstep(${g3(CLOAK_HOOD_Y)}, ${g3(CLOAK_H)}, y); }
// the opening at the front, half its width in turns: wide at the hem, narrowing up the chest and closed at the clasp
// where its edges meet; the collar whole round the throat; the hood's face open
float cloakOpenHalf(float y) {
  float body = mix(${g3(CLOAK_OPEN.hem)}, ${g3(CLOAK_OPEN.chest)}, smoothstep(0.0, ${g3(CLOAK_CLASP_Y - 0.2)}, y)) * (1.0 - smoothstep(${g3(CLOAK_CLASP_Y - 0.2)}, ${g3(CLOAK_CLASP_Y)}, y));
  float fy = (y - ${g3(CLOAK_FACE.y)}) / ${g3(CLOAK_FACE.h)};
  return max(body, ${g3(CLOAK_OPEN.face)} * sqrt(max(0.0, 1.0 - fy * fy)));
}
// a body-frame offset (x the wearer's right, y their forward, m) in the world's x and z
vec2 cloakWorldXZ(vec2 b) { return vec2(cos(uYaw), -sin(uYaw)) * b.x + cloakFwd() * b.y; }
// how far down its hang a height is: 0 at the shoulders and over them, 1 at the feet
float cloakHangOf(float y) { return clamp(1.0 - y / ${g3(CLOAK_SHOULDER_Y)}, 0.0, 1.0); }
// THE SWING's lag on a turn at y (\`uSwing\` w, rad): the turns its bearing has fallen behind, the more the lower
float cloakTwistAt(float y) { return uSwing.w / CLOAK_TAU * pow(cloakHangOf(y), 1.2); }
// THE TEAR: how far the cloak has torn apart (0 whole .. 1 gone) - \`uTorn\` the seconds since its wearer turned beast,
// negative while they have not
float cloakRipOf() { return uTorn < 0.0 ? 0.0 : clamp(uTorn / ${g3(CLOAK_RIP_S)}, 0.0, 1.0); }
`;
const CLOAK_FS_GLSL = `
const vec3 CLOAK_CRIMSON = ${v3(CLOAK_RGB.crimson)};
const vec3 CLOAK_EMBER = ${v3(CLOAK_RGB.ember)};
const vec3 CLOAK_SHADOW = ${v3(CLOAK_RGB.shadow)};
const vec3 CLOAK_LINING = ${v3(CLOAK_RGB.lining)};
float cloakBreath() { return 0.85 + 0.15 * sin(uTime * CLOAK_TAU ${hzGlsl(CLOAK_HZ.pulse)}); }
// THE WEARER'S GLYPH (ui/playerBadge.js GLYPH_PATH.shadowfang, SirMcMobdon's wolf's head, and its eye - GLYPH_DETAIL),
// cut into straight edges (glyphEdges) in its own 16-unit box, y down as its path is: the distance to its outline,
// negative inside (even-odd - the badge fills nonzero, the same for a path that never crosses itself, which a pin checks)
${glyphEdgesGlsl('CLOAK_GLYPH_EDGES', CLOAK_GLYPH_EDGES)}
${glyphEdgesGlsl('CLOAK_EYE_EDGES', CLOAK_EYE_EDGES)}
float cloakSeg2(vec2 p, vec4 e) { vec2 ab = e.zw - e.xy, w = p - e.xy; vec2 q = w - ab * clamp(dot(w, ab) / dot(ab, ab), 0.0, 1.0); return dot(q, q); }
float cloakCross(vec2 p, vec4 e) { float c = step(e.y, p.y) - step(e.w, p.y); return c != 0.0 && p.x < e.x + (p.y - e.y) * (e.z - e.x) / (e.w - e.y) ? 1.0 : 0.0; }
float cloakGlyphD(vec2 p) {
  float d = 1e9, n = 0.0;
  for (int i = 0; i < ${CLOAK_GLYPH_EDGES.length}; i++) { d = min(d, cloakSeg2(p, CLOAK_GLYPH_EDGES[i])); n += cloakCross(p, CLOAK_GLYPH_EDGES[i]); }
  return (mod(n, 2.0) > 0.5 ? -1.0 : 1.0) * sqrt(d);
}
float cloakEyeD(vec2 p) {
  float d = 1e9, n = 0.0;
  for (int i = 0; i < ${CLOAK_EYE_EDGES.length}; i++) { d = min(d, cloakSeg2(p, CLOAK_EYE_EDGES[i])); n += cloakCross(p, CLOAK_EYE_EDGES[i]); }
  return (mod(n, 2.0) > 0.5 ? -1.0 : 1.0) * sqrt(d);
}
// THE EMBLEM at p in its own measure (its disc's edge at 1.4, x across to the eye's right, y up; w a pixel's width in
// it): the wearer's glyph filled in crimson deepening down to the mane, its outline lit, its eye an ember; a ring about
// it and a fine ring outside that, on a disc of shadow - the light it gives (rgb) and its disc (a)
vec4 cloakEmblemAt(vec2 p, float w) {
  float l = length(p);
  if (l > 1.45) return vec4(0.0);   // past its disc, no glyph to measure
  vec2 g = vec2(8.0 + p.x * 7.0, 8.0 - p.y * 7.0);   // into the glyph's box: seven of its units to one
  float gd = cloakGlyphD(g) / 7.0;
  float fill = 1.0 - smoothstep(-w, 0.0, gd);
  float ring = 1.0 - smoothstep(0.0, w, abs(l - 1.2) - 0.035);
  float fine = 1.0 - smoothstep(0.0, w, abs(l - 1.33) - 0.014);
  vec3 col = CLOAK_CRIMSON * (fill * mix(0.2, 0.62, smoothstep(-0.9, 0.9, p.y)) + 0.5 * exp(-gd * gd / (w * w * 2.0)) + 0.1 * exp(-max(gd, 0.0) * 14.0) + ring * 0.62 + fine * 0.32);
  col = mix(col, CLOAK_EMBER, (1.0 - smoothstep(-w, 0.0, cloakEyeD(g) / 7.0)) * 0.9);
  return vec4(col * cloakBreath(), 1.0 - smoothstep(1.37, 1.42, l));
}
// THE EMBROIDERY m metres in from an edge, \`along\` it: a line at the edge, a band of wolf's teeth inside it, a fine line
// at the band's inner side
float cloakTrim(float m, float along) {
  if (m < 0.0 || m > ${g3(CLOAK_TRIM.band + 0.012)}) return 0.0;
  float tooth = abs(fract(along / ${g3(CLOAK_TRIM.tooth)}) - 0.5) * 2.0;
  float line = 0.009 + tooth * ${g3(CLOAK_TRIM.band - 0.018)};
  return exp(-cloakSq(m - 0.004) / 0.00001) + 0.7 * exp(-cloakSq(m - line) / 0.00001) + 0.45 * exp(-cloakSq(m - ${g3(CLOAK_TRIM.band)}) / 0.000006);
}
vec4 cloakWall(vec2 q) {
  float u = q.x, v = q.y, y = v * uFlameH, t = uTime;
  // KINDLED: drawn in out of smoke from the hem up - nothing past the line the kindling has reached, embers along it
  float grown = uKindle * 1.25 - 0.1 - v - (vnoiseP(vec2(u * 16.0, y * 5.0), vec2(16.0, 64.0)) - 0.5) * 0.2;
  if (grown < 0.0) discard;
  float r = max(cloakRadius(u, y), 0.04), circ = CLOAK_TAU * r;
  float su = u > 0.5 ? u - 1.0 : u;   // signed round from the front: the wearer's right positive
  // THE CLASP at the throat, where the opening's edges meet - whole over them (seen from the front: its x the eye's right)
  vec2 cp = vec2(-su * circ, y - ${g3(CLOAK_CLASP_Y - 0.012)}) * ${g3(1.4 / CLOAK_CLASP_R)};
  float brooch = 1.0 - smoothstep(1.37, 1.42, length(cp));
  // THE OPENING at the front: metres into the cloth from its edge
  float edgeM = (abs(su) - cloakOpenHalf(y)) * circ;
  if (edgeM < 0.0 && brooch <= 0.0) discard;
  // TORN, when its wearer turns beast: seams opening across it, its pieces gone one after another, embers along every
  // tear - the cells of a warped grid round and up it, twelve round so it closes on itself
  float rip = cloakRipOf(), torn = 0.0;
  if (rip > 0.0) {
    vec2 c = vec2(u * 12.0, y * 6.0) + (vec2(vnoiseP(vec2(u * 24.0, y * 9.0), vec2(24.0, 64.0)), vnoiseP(vec2(u * 24.0 + 7.0, y * 9.0), vec2(24.0, 64.0))) - 0.5) * 0.7;
    vec2 f = fract(c);
    float seam = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) - rip * 0.3;
    if (seam < 0.0 || cloakHash(vec2(mod(floor(c.x), 12.0), floor(c.y)) + 0.5) < rip * 1.3 - 0.2) discard;
    torn = exp(-seam * seam / 0.0015);
  }
  // the cloth's facing - round the body, bent by its folds, and tilted by its lean in and out as it rises (the hood's
  // top, the shoulders) - against the eye, for its light. ITS TWO SIDES ARE TWO DRAWS (\`uSide\`): its lining (0, the
  // faces turned from the eye, culled to them) laid first and its outside (1) over it, so one row's far cloth never lies
  // over the next row's near - the side the BENT mesh's own winding says (AUDIT: the rest pose's normal misnamed up to a
  // quarter of it posed), so this facing only lights it
  float drape = cloakDrapeOf(y);
  float phase = cloakFoldPhase(u), fold = cos(phase) * drape;
  vec2 bn = cloakBearing(u + 0.02 * sin(phase) * drape + cloakTwistAt(y));
  float lean = (cloakRadius(u, y + 0.01) - cloakRadius(u, y - 0.01)) * 50.0 - (cloakAxisBack(y + 0.01) - cloakAxisBack(y - 0.01)) * 50.0 * dot(cloakFwd(), bn);
  vec3 e = uCamPos - vWorld;
  float toward = dot(normalize(vec3(bn.x, -lean, bn.y)), dot(e, e) > 1e-8 ? normalize(e) : vec3(bn.x, 0.0, bn.y));
  // never from inside it: the wearer's own first person sees no shadow over the view
  vec2 hx = cloakWorldXZ(uCapeH.xz); float outside = smoothstep(${g3(CLOAK_INSIDE_M)}, ${g3(CLOAK_INSIDE_M + 0.15)}, distance(uCamPos, uAt + vec3(hx.x, uCapeH.y, hx.y)));   // by the hood's middle (AUDIT 2)
  float breath = cloakBreath();
  // THE HEM, longest down the back and ragged, its last hand's breadth coming apart into smoke that falls from it
  float hemM = y - mix(${g3(CLOAK_HEM_Y.edge)}, ${g3(CLOAK_HEM_Y.back)}, cloakBackOf(u)) - 0.035 * vnoiseP(vec2(u * 24.0, 0.5), vec2(24.0, 8.0)) - 0.05 * pow(vnoiseP(vec2(u * 9.0, 2.5), vec2(9.0, 8.0)), 3.0);
  float smoke = fbmP(vec2(u * 16.0, y * 3.0 + t * ${g3(CLOAK_FLOW.hem)}), vec2(16.0, ${g1(CLOAK_FLOW.hem * AURA_CLOCK_PERIOD)}));
  float fray = 1.0 - smoothstep(0.0, 0.1, hemM);
  float tear = smoke - fray * 0.8;
  if (edgeM >= 0.0 && (tear < 0.0 || hemM < 0.0)) {
    // what has come apart: smoke trailing off the hem, a hand below it at most, a crimson glow in it
    float trail = smoothstep(0.25, 0.65, smoke) * (1.0 - smoothstep(0.0, 0.12, -hemM)) * 0.55;
    if (trail <= 0.002) discard;
    return vec4(CLOAK_CRIMSON * trail * 0.05 * breath * outside, trail * outside);
  }
  float rim = pow(max(0.0, 1.0 - abs(toward)), 3.0);
  float stir = fbmP(vec2(u * 10.0, y * 2.0 - t * ${g3(CLOAK_FLOW.smoke)}), vec2(10.0, ${g1(CLOAK_FLOW.smoke * AURA_CLOCK_PERIOD)}));
  vec3 col;
  float shade;
  float lit = abs(toward);
  if (uSide == 1) {
    // ITS OUTSIDE: shadow, dense and dark and stirring, the folds' ridges catching a crimson sheen, a crimson rim
    // where it turns away
    shade = 0.86 + 0.08 * rim - 0.1 * stir;
    col = CLOAK_SHADOW * (0.5 + 0.5 * lit) * (0.8 + 0.2 * fold) + CLOAK_CRIMSON * (0.25 * rim + 0.06 * pow(max(fold, 0.0), 3.0) * lit) * breath;
    // THE MANTLE over the shoulders: its scalloped edge stitched in crimson, its shadow on the cape under it
    float me = y - ${g3(CLOAK_MANTLE_Y)} + 0.03 * sin(3.14159265 * fract(u * ${g1(CLOAK_SCALLOPS)}));
    shade += 0.06 * step(0.0, me);
    col *= 1.0 - 0.6 * exp(-cloakSq(me + 0.012) / 0.0001);
    col += CLOAK_CRIMSON * exp(-cloakSq(me - 0.005) / 0.00001) * 0.4 * breath;
    // THE EMBLEM on its back, on a disc of deeper shadow and burning through it (seen from behind: its x the eye's right)
    vec2 sp = vec2((0.5 - u) * circ, y - ${g3(CLOAK_SIGIL_Y)}) * ${g3(1.4 / CLOAK_SIGIL_R)};
    if (length(sp) < 1.45) {
      vec4 em = cloakEmblemAt(sp, 0.04);
      col = col * (1.0 - 0.5 * em.a) + em.rgb * (0.6 + 0.4 * lit);
      shade += 0.08 * em.a;
    }
  } else {
    // ITS LINING, seen through the opening and inside the hood: a deep red, brightest where it faces the eye
    shade = 0.86;
    col = CLOAK_LINING * (0.35 + 0.45 * lit + 0.2 * fold) + CLOAK_CRIMSON * 0.1 * rim * breath;
  }
  // THE EMBROIDERY down its front edges and round the hood's face, where it is open (the hem has none: its last hand's
  // breadth is fraying into smoke, smouldering where it tears - AUDIT: a band there was never seen)
  float trim = cloakTrim(edgeM, y) * step(0.001, cloakOpenHalf(y));
  col += CLOAK_CRIMSON * trim * 0.75 * breath * (uSide == 1 ? 1.0 : 0.6);
  // the hem's tear smouldering where it comes apart
  col += mix(CLOAK_CRIMSON, CLOAK_EMBER, 0.3) * exp(-tear * tear / 0.0008) * fray * 0.4 * breath;
  // THE CLASP: a brooch of the emblem over the meeting edges
  if (brooch > 0.0) {
    vec3 b = CLOAK_SHADOW * 0.5 + cloakEmblemAt(cp, 0.12).rgb * 1.3;
    col = edgeM < 0.0 ? b * brooch : mix(col, b, brooch);
    shade = edgeM < 0.0 ? 0.9 * brooch : mix(shade, 0.9, brooch);
  }
  // the tear's embers
  col += mix(CLOAK_CRIMSON, CLOAK_EMBER, 0.4) * torn * 0.9;
  // kindling, embers along the line it has reached
  col += (CLOAK_EMBER * 0.5 + CLOAK_CRIMSON) * exp(-grown * grown / 0.0006) * (1.0 - smoothstep(0.9, 1.0, uKindle));
  return vec4(col * outside, clamp(shade, 0.0, 0.94) * outside);
}
vec4 cloakGround(vec2 p) {
  float r = length(p);
  if (r > ${g3(CLOAK_POOL_R)}) discard;   // nothing of it past its pool (AUDIT: the quad's outer ring paid for nothing)
  float a = r > 1e-6 ? atan(p.y, p.x) : 0.0;
  float u = fract(a / CLOAK_TAU), t = uTime;
  // THE SHADOW it pools under it, mist turning in it and drawn in toward the feet
  float mist = fbmP(vec2(u * 12.0 + t * ${g3(CLOAK_FLOW.swirl)}, r * 3.0 + t * ${g3(CLOAK_FLOW.mist)}), vec2(12.0, ${g1(CLOAK_FLOW.mist * AURA_CLOCK_PERIOD)}));
  float pool = 1.0 - smoothstep(0.25, ${g3(CLOAK_POOL_R)}, r);
  float shade = pool * (0.5 + 0.35 * mist);
  // a dull crimson in the mist under the hem - the light of its embers on the ground
  float under = exp(-cloakSq(r - ${g3(CLOAK_HEM_R * 0.95)}) / 0.02) * smoothstep(0.5, 0.8, mist) * pool;
  vec3 col = CLOAK_CRIMSON * (pool * pool * 0.05 + under * 0.14) * cloakBreath();
  // KINDLED out from the feet; the quad's edge soft
  float vis = (1.0 - smoothstep(uKindle * 1.4 - 0.1, uKindle * 1.4, r)) * (1.0 - smoothstep(uGroundR - 0.2, uGroundR, r));
  return vec4(col * vis, clamp(shade, 0.0, 0.9) * vis);
}
// AN EMBLEM (uv its card's 0..1, s its age and its number): the wearer's emblem on its disc of shadow, drawn in out of
// smoke as it rises off the back and falling back to smoke at its end, embers where it forms and where it breaks; none
// while the cloak is still forming, and fading as it tears
vec4 cloakEmblem(vec2 uv, vec3 s) {
  vec2 p = (uv - 0.5) * 3.0;   // its measure: the disc's edge at 1.4, the card's at 1.5
  float gate = (1.0 - smoothstep(1.4, 1.5, max(abs(p.x), abs(p.y)))) * smoothstep(0.8, 1.0, uKindle) * (1.0 - cloakRipOf());
  if (gate <= 0.0) return vec4(0.0);   // a card that shows nothing works nothing out
  float life = clamp(min(s.x / 0.2, (1.0 - s.x) / 0.35), 0.0, 1.0);
  float held = life * 1.1 - 0.05 - vnoiseP(p * 2.2 + vec2(s.z * 7.1, s.z * 3.7), vec2(64.0));
  if (held < 0.0) return vec4(0.0);
  float form = smoothstep(0.0, 0.03, held);
  vec4 em = cloakEmblemAt(p, 0.05);
  float ember = exp(-held * held / 0.002) * (1.0 - smoothstep(0.85, 1.0, life)) * em.a;
  return vec4((em.rgb * form * 0.85 + mix(CLOAK_CRIMSON, CLOAK_EMBER, 0.4) * ember * 0.6) * gate, em.a * 0.82 * form * gate);
}
// A SHRED (uv its card's 0..1, s its number): a scrap torn off the cloak - shadow with a ragged edge smouldering crimson,
// some with a strip of the opening's wolf's teeth along them; dimmer from inside their ring (the beast's own eye)
vec4 cloakShred(vec2 uv, vec3 s) {
  vec2 p = (uv - 0.5) * 2.0;
  float h = cloakHash(vec2(s.z, 6.1));
  float shape = 0.74 - max(abs(p.x) * (0.75 + 0.5 * h), abs(p.y)) - (vnoiseP(p * 2.2 + s.z * 5.3, vec2(64.0)) - 0.5) * 0.55 - (vnoiseP(p * 6.0 + s.z * 3.1, vec2(64.0)) - 0.5) * 0.18;
  if (shape < -0.04) return vec4(0.0);
  float inside = smoothstep(-0.02, 0.02, shape);
  float burn = exp(-shape * shape / 0.002);
  float teeth = step(0.5, cloakHash(vec2(s.z, 3.3))) * exp(-cloakSq(p.y + 0.42 - abs(fract(p.x * 2.5) - 0.5) * 0.36) / 0.002) * inside;
  float gate = mix(0.35, 1.0, smoothstep(0.55, 1.0, length(uCamPos.xz - uAt.xz)));
  vec3 col = CLOAK_SHADOW * 0.4 * inside + (mix(CLOAK_CRIMSON, CLOAK_EMBER, 0.35) * burn * 0.7 + CLOAK_CRIMSON * teeth * 0.6) * cloakBreath();
  return vec4(col * gate, inside * 0.85 * gate);
}
`;
const CLOAK_VS_GLSL = `
// the cape's billow and a wave running down it - most at the hem and down the back, none at the shoulders
float cloakBillow(float u, float y, float t) {
  float th = u * CLOAK_TAU;
  float w = 0.035 * sin(2.0 * th + y * 2.0 + t * CLOAK_TAU ${hzGlsl(CLOAK_HZ.billow)}) + 0.016 * sin(5.0 * th + y * 6.0 + t * CLOAK_TAU ${hzGlsl(CLOAK_HZ.wave)});
  return w * pow(cloakDrapeOf(y), 1.5) * (0.3 + 0.7 * cloakBackOf(u));
}
// A KNEE (k, the body's frame: x right, y up, z forward, m about the feet) pressing the cloth out where a stride carries
// it past - at bearing u, radius r and height y: how far the cloth is pushed out round it
float cloakKneePush(vec3 k, float u, float r, float y) {
  float kr = length(k.xz);
  if (kr < 1e-4) return 0.0;
  return min(0.2, max(0.0, kr + 0.07 - r)) * smoothstep(0.75, 0.97, dot(vec2(sin(u * CLOAK_TAU), cos(u * CLOAK_TAU)), k.xz / kr)) * exp(-cloakSq(y - k.y) / 0.04);   // never more than a hand's tent
}
vec3 cloakPoint(vec2 q, float t) {
  float u = q.x, y = q.y * uFlameH, rip = cloakRipOf(), h = cloakHangOf(y);
  float ut = u + cloakTwistAt(y);   // lagging a turn
  // THE BODY'S POSE: hung from its shoulders where they are (\`uCapeS\`, the body's frame) - scaled between the feet and
  // them, so a crouch or a shorter or taller body carries it, and gathering out as it is pressed down; the collar
  // with the shoulders, and the hood with the head (\`uCapeH\`), turned as the head turns
  float ky = uCapeS.y / ${g3(CLOAK_SHOULDER_Y)};
  float r = cloakRadius(u, y) * mix(uCapeS.w, 1.0, smoothstep(${g3(CLOAK_SHOULDER_Y)}, ${g3(CLOAK_NECK_Y)}, y)) + ${g3(CLOAK_FOLD_M)} * cloakFoldOf(u) * cloakDrapeOf(y) + cloakBillow(u, y, t) + rip * (0.15 + 0.35 * cloakBackOf(u)) + max(0.0, 1.0 - ky) * h * 0.3;   // as broad as the body's shoulders; bursting out as it tears; gathering as it is pressed down
  vec2 d = cloakBearing(ut) * r - cloakFwd() * cloakAxisBack(y);
  float py;
  if (y < ${g3(CLOAK_SHOULDER_Y)}) {
    d += cloakWorldXZ(uCapeS.xz) * (1.0 - 0.5 * h);
    py = y * ky;
  } else {
    float wh = smoothstep(${g3(CLOAK_SHOULDER_Y)}, ${g3(CLOAK_HOOD_Y)}, y), a = uCapeH.w * wh;
    d = vec2(d.x * cos(a) + d.y * sin(a), -d.x * sin(a) + d.y * cos(a));
    vec3 off = mix(vec3(uCapeS.x, uCapeS.y - ${g3(CLOAK_SHOULDER_Y)}, uCapeS.z), vec3(uCapeH.x, uCapeH.y - ${g3(CLOAK_HOOD_Y)}, uCapeH.z), wh);
    d += cloakWorldXZ(off.xz);
    py = y + off.y;
  }
  // THE SWING (\`uSwing\`, auraMotionStep): trailing its wearer's motion, the more the lower, rising as a pendulum does;
  // lifting and filling as they fall
  float hang = ${g3(CLOAK_SHOULDER_Y)} * max(ky, 0.0) * h;   // never negative (AUDIT 2: a pose at the feet)
  vec2 trail = uSwing.xy * pow(h, 1.6) * min(ky, 1.0);   // a crouched hang swings shorter
  float tl = length(trail);
  if (tl > 0.7 * hang) trail *= 0.7 * hang / tl;   // never so far the pendulum folds the hem over itself (AUDIT)
  d += cloakWorldXZ(trail) + cloakBearing(ut) * uSwing.z * h * 0.6;
  py += hang - sqrt(max(hang * hang - dot(trail, trail), 0.0)) + max(uSwing.z, 0.0) * h * h;   // a rise never drops it below the feet
  // never through the legs: below the shoulders the cloth keeps a hand off the body's axis (AUDIT - a strafe's trail)
  float keep = y < ${g3(CLOAK_SHOULDER_Y)} ? mix(0.15, 0.22, h) : 0.0, along = dot(d, cloakBearing(ut));   // out along its own bearing, so neighbours never part across the axis (AUDIT 2)
  if (along < keep) d += cloakBearing(ut) * (keep - along);
  // the knees, where a stride carries one past the cloth
  d += cloakBearing(ut) * (cloakKneePush(uKneeL, ut, r, py) + cloakKneePush(uKneeR, ut, r, py));
  return uAt + vec3(d.x, py + rip * 0.2 * q.y, d.y);
}
// emblem k's life (s): CLOAK_EMBLEM_LIFE[k mod 3]
float cloakEmblemLife(float k) { float m = mod(k, 3.0); return m < 0.5 ? ${g1(CLOAK_EMBLEM_LIFE[0])} : m < 1.5 ? ${g1(CLOAK_EMBLEM_LIFE[1])} : ${g1(CLOAK_EMBLEM_LIFE[2])}; }
// which of emblem k's flights the clock t is in - wrapping with the clock (the lives divide its period)
float cloakEmblemOf(float k, float t) { float life = cloakEmblemLife(k); return mod(floor(t / life + fract(k * 0.618034)), ${g1(AURA_CLOCK_PERIOD)} / life); }
// emblem k at the clock t: where it is about the feet (xyz, m) and its age (w, 0 rising off the back .. 1 gone); each
// flight rises off the back somewhere else between the shoulder blades and the shoulders, drifting out behind
vec4 cloakEmblemFlight(float k, float t) {
  float life = cloakEmblemLife(k);
  float age = fract(t / life + fract(k * 0.618034));
  float n = cloakEmblemOf(k, t);
  float u = 0.5 + (cloakHash(vec2(k * 17.0 + n, 4.1)) - 0.5) * 0.45;
  float y0 = 1.05 + cloakHash(vec2(k * 5.0 + n, 8.3)) * 0.35;
  vec2 d = cloakBearing(u) * (cloakRadius(u, y0) + 0.08 + 0.3 * age) + cloakWorldXZ(uCapeS.xz);   // off the back where the pose has it
  return vec4(d.x, y0 * uCapeS.y / ${g3(CLOAK_SHOULDER_Y)} + (1.0 - (1.0 - age) * (1.0 - age)) * ${g3(CLOAK_EMBLEM_RISE)}, d.y, age);
}
// shred j, \`since\` seconds after the cloak tore: where it is about the feet (xyz, m) - torn off the cape at its own place
// and flung out, then floating round the beast at its own height and pace, either way round, bobbing - and its turn in
// its own plane (w, radians). Every rate whole over the clock, which \`since\` wraps with past the tear (auraBeastStep)
vec4 cloakShredFlight(float j, float since) {
  float u0 = 0.12 + cloakHash(vec2(j, 2.7)) * 0.76;
  float y0 = 0.35 + cloakHash(vec2(j, 5.3)) * 1.0;
  float burst = 1.0 - pow(1.0 - clamp(since / ${g3(CLOAK_RIP_S)}, 0.0, 1.0), 3.0);
  float pace = (1.0 + floor(cloakHash(vec2(j, 9.1)) * 3.0)) * (mod(j, 2.0) < 0.5 ? 1.0 : -1.0);
  float r = mix(cloakRadius(u0, y0), ${g3(CLOAK_SHRED_AT.r[0])} + cloakHash(vec2(j, 7.7)) * ${g3(CLOAK_SHRED_AT.r[1] - CLOAK_SHRED_AT.r[0])}, burst);
  float y = mix(y0, ${g3(CLOAK_SHRED_AT.y[0])} + cloakHash(vec2(j, 1.3)) * ${g3(CLOAK_SHRED_AT.y[1] - CLOAK_SHRED_AT.y[0])}, burst) + 0.07 * burst * sin(since * CLOAK_TAU ${hzGlsl(CLOAK_SHRED_HZ.bob)} + j * 1.7);
  vec2 d = cloakBearing(u0 + since * pace ${hzGlsl(CLOAK_SHRED_HZ.orbit)}) * r;
  return vec4(d.x, y, d.y, since * CLOAK_TAU * (1.0 + floor(cloakHash(vec2(j, 4.4)) * 2.0)) ${hzGlsl(CLOAK_SHRED_HZ.spin)} + j);
}
`;
const WING_SHARED_GLSL = `
float wingBeat(float t, float time) {
  float bp = fract(time ${hzGlsl(WING_HZ.beat)} - 0.06 * t);
  return smoothstep(0.0, 0.18, bp) * (1.0 - smoothstep(0.18, 0.75, bp));
}
`;
const WING_VS_GLSL = `
float wingHash(float n) { return fract(sin(n * 78.233 + 1.7) * 43758.5453); }
// strand k: its side (-1 the wearer's left, +1 their right), its plume's place up its fan (0 the lowest .. 1 the
// highest), which of the plume's strands (0 the broad, 1 .. 4 the fine about it) and whether a covert (1) or a primary
vec4 wingStrandOf(float k) {
  float p = floor((k + 0.5) / ${g1(WING_STRANDS)}), q = p - ${g1(WING_PLUMES + WING_COVERTS)} * floor((p + 0.5) / ${g1(WING_PLUMES + WING_COVERTS)});   // AUDIT 4: whole numbers kept whole (a GPU dividing by a reciprocal comes out a hair short)
  float covert = q < ${g1(WING_PLUMES)} ? 0.0 : 1.0;
  float place = covert > 0.5 ? (q - ${g1(WING_PLUMES)}) / ${g1(WING_COVERTS - 1)} : q / ${g1(WING_PLUMES - 1)};
  return vec4(p < ${g1(WING_PLUMES + WING_COVERTS)} ? -1.0 : 1.0, place, k - ${g1(WING_STRANDS)} * p, covert);
}
// a point given along the torso (x its right, y up its spine, z out of its chest), about the shoulders' middle, in the
// body's frame
vec3 wingBack(vec3 l) { return uCapeS.xyz + cross(uTorsoU, uTorsoF) * l.x + uTorsoU * l.y + uTorsoF * l.z; }
vec3 wingPoint(float k, float t, float time) {
  vec4 s = wingStrandOf(k);
  float ph = wingHash(k) * 6.283185307179586;
  float breathe = sin(time * 6.283185307179586 ${hzGlsl(WING_HZ.breathe)});
  float beat = wingBeat(t, time);
  float m = s.z, off = m < 0.5 ? 0.0 : (mod(m, 2.0) > 0.5 ? 1.0 : -1.0) * ceil(m * 0.5) * 0.022;   // the fine strands either side of the broad, bundled with it as a feather
  float th = (s.w > 0.5 ? mix(${g3(WING_COVERT.spread[0])}, ${g3(WING_COVERT.spread[1])}, s.y) : mix(${g3(WING_SPREAD[0])}, ${g3(WING_SPREAD[1])}, s.y))
    + 0.07 * breathe - ${g3(WING_BEAT.down)} * beat * (0.5 + 0.5 * s.y) + off;
  float reach = (s.w > 0.5 ? mix(${g3(WING_COVERT.reach[0])}, ${g3(WING_COVERT.reach[1])}, s.y) : mix(${g3(WING_REACH[0])}, ${g3(WING_REACH[1])}, smoothstep(0.0, 0.8, s.y)))
    * (m > 0.5 ? 0.82 + 0.16 * wingHash(k + 3.1) : 1.0);
  vec3 root = vec3(s.x * ${g3(WING_ROOT.apart)} * uCapeS.w, -${g3(WING_ROOT.below)}, -${g3(WING_ROOT.back)} - uWingBack);   // WINGS-FIT: a sprite's further back (uWingBack)
  float back = s.w > 0.5 ? -0.3 : -0.2;
  vec3 ctrl = root + vec3(s.x * 0.18, 0.3 + 0.25 * max(sin(th), 0.0), back) * reach;   // rising first, then out
  vec3 tip = root + vec3(s.x * cos(th), sin(th), back - 0.02 + ${g3(WING_BEAT.forward)} * beat) * reach;
  float u = 1.0 - t;
  vec3 l = u * u * root + 2.0 * u * t * ctrl + t * t * tip;
  l.y -= 0.16 * reach * t * t * t * (0.4 + 0.6 * s.y);   // the tips drooping as a long feather's do
  // THE FLOW: waves running out along it - up and down, back and forth, and a little in and out
  float amp = (s.w > 0.5 ? 0.04 : 0.08 + 0.01 * m) * pow(t, 1.4);
  l.y += amp * sin(6.283185307179586 * 1.3 * t - time * 6.283185307179586 ${hzGlsl(WING_HZ.wave)} + ph);
  l.z += amp * 0.8 * cos(6.283185307179586 * 1.0 * t - time * 6.283185307179586 ${hzGlsl(WING_HZ.flutter)} + ph * 1.3);
  l.x += s.x * amp * 0.4 * sin(6.283185307179586 * 0.8 * t - time * 6.283185307179586 ${hzGlsl(WING_HZ.wave)} + ph * 0.7);
  vec3 b = wingBack(l);
  // THE SWING (auraMotionStep): trailing the wearer's motion the further out, lifting in a fall
  float tt = pow(t, 1.5);
  b.x += uSwing.x * 1.3 * tt;
  b.z += uSwing.y * 1.3 * tt;
  b.y += uSwing.z * 1.2 * t;
  return b;
}
vec3 wingWorld(vec3 b) { vec2 d = cloakWorldXZ(b.xz); return uAt + vec3(d.x, b.y, d.y); }
vec3 wingWorldDir(vec3 b) { vec2 d = cloakWorldXZ(b.xz); return vec3(d.x, b.y, d.y); }
// a spark's flight: spark k at the clock - which strand it rides (a new one each flight), how far out along it (past
// its tip at the last), its way along it (dir, the body's frame) and its age (w, 0 .. 1); each life divides the clock
vec4 wingMoteFlight(float k, float time, out vec3 dir) {
  float m = mod(k, 3.0), life = m < 0.5 ? ${g1(WING_MOTE_LIFE[0])} : m < 1.5 ? ${g1(WING_MOTE_LIFE[1])} : ${g1(WING_MOTE_LIFE[2])};
  float age = fract(time / life + fract(k * 0.618034));
  float which = mod(floor(time / life + fract(k * 0.618034)), ${g1(AURA_CLOCK_PERIOD)} / life);
  float strand = floor(wingHash(k * 7.0 + which * 1.31) * ${g1(WING_STRAND_COUNT)});
  float t = mix(0.25, 1.1, age), ta = min(t, 0.97);
  vec3 b = wingPoint(strand, ta, time);
  dir = wingPoint(strand, ta + 0.03, time) - b;
  b += dir * max(t - 0.97, 0.0) / 0.03 + vec3(0.0, 0.08 * age, 0.0);
  return vec4(b, age);
}
`;
const WING_FS_GLSL = `
const vec3 WING_CORE = ${v3(WING_RGB.core)};
const vec3 WING_GOLD = ${v3(WING_RGB.gold)};
const vec3 WING_AMBER = ${v3(WING_RGB.amber)};
float wingBreath() { return 0.85 + 0.15 * sin(uTime * TAU ${hzGlsl(WING_HZ.breathe)}); }
// nothing laid over an eye standing among them (the wearer's own first person)
float wingNear() { return smoothstep(0.25, 0.9, distance(uCamPos, vWorld)); }
vec3 wingStrand(vec2 p, vec3 s) {
  float a = p.x * 2.0 - 1.0, t = p.y, k = s.x, fine = s.y;
  float n = fine > 0.5 ? vnoiseP(vec2(t * ${g1(WING_FLOW.cells)} - uTime * ${g3(WING_FLOW.rate)}, k * 3.7), vec2(${g1(WING_FLOW.rate * AURA_CLOCK_PERIOD)}, 512.0))
    : fbmP(vec2(t * ${g1(WING_FLOW.cells)} - uTime * ${g3(WING_FLOW.rate)}, k * 3.7), vec2(${g1(WING_FLOW.rate * AURA_CLOCK_PERIOD)}, 512.0));
  float n2 = vnoiseP(vec2(t * ${g1(WING_FLOW.cells * 2.5)} - uTime * ${g3(WING_FLOW.fray)}, k * 5.3 + a * 1.5), vec2(${g1(WING_FLOW.fray * AURA_CLOCK_PERIOD)}, 1024.0));
  float edge = 1.0 - smoothstep(0.45 - 0.3 * n2, 1.0, abs(a));   // the edge fraying into wisps
  float core = exp(-a * a * (fine > 0.5 ? 22.0 : 30.0));
  float glow = exp(-a * a * (fine > 0.5 ? 4.0 : 6.0));
  float sheath = exp(-a * a * 1.8) * (1.0 - fine);   // the broad strand's soft glow about it
  float along = smoothstep(0.04, 0.22, t) * (1.0 - smoothstep(0.6 + 0.25 * n, 1.0, t));   // out of the back, and the tip frayed away
  float grown = 1.0 - smoothstep(uKindle * 1.15 - 0.15, uKindle * 1.15, t);   // unfurling from the root as it kindles
  float pulse = 0.55 + 0.45 * sin(TAU * 3.0 * t - uTime * TAU ${hzGlsl(WING_HZ.flow)} + k * 1.7);   // light running out along it
  float lit = (0.5 + 0.8 * n) * (0.7 + 0.3 * pulse) * along * edge * grown * wingBreath() * wingNear() * (1.0 + 0.25 * wingBeat(t, uTime));
  // WINGS-FIT: about half the light it had (0.22, 0.55, 0.6 + 0.6, 0.5; the beat's flare 0.4) - a pale gold thread with a
  // soft glow about it, not a white blaze
  vec3 col = WING_GOLD * sheath * 0.1 + mix(WING_AMBER, WING_GOLD, smoothstep(0.1, 0.7, glow)) * glow * 0.32 + WING_CORE * core * (0.42 + 0.28 * pulse) * smoothstep(0.0, 0.3, t);
  col += WING_AMBER * smoothstep(0.7, 0.95, t) * n2 * glow * 0.25;   // the tips burning as they fray
  return col * lit * (fine > 0.5 ? 0.7 : 1.0) * (s.z > 0.5 ? 0.45 : 1.0);   // the coverts beneath the primaries, softer
}
vec3 wingsGround(vec2 p) {
  float r = length(p);
  if (r > ${g3(WING_POOL_R)}) discard;
  return WING_GOLD * exp(-r * r / 0.45) * 0.07 * wingBreath() * uKindle * (1.0 - smoothstep(${g3(WING_POOL_R - 0.3)}, ${g3(WING_POOL_R)}, r));
}
vec3 wingMote(vec2 p, vec3 s) {
  vec2 q = p * 2.0 - 1.0;   // x across the streak, y along it - its head at +1
  float d = length(q);
  if (d > 1.0) discard;
  float life = smoothstep(0.0, 0.15, s.x) * (1.0 - smoothstep(0.6, 1.0, s.x));
  float streak = exp(-q.x * q.x * 20.0) * exp(-q.y * q.y * 1.6) * smoothstep(-1.0, 0.5, q.y);   // brightest at its head, a tail behind
  return (WING_CORE * streak * 0.65 + WING_GOLD * exp(-d * d * 3.5) * 0.15) * life * smoothstep(0.75, 1.0, uKindle) * wingNear();   // none till the wings have unfurled
}
// THE BACKLIGHT: a radiance behind the upper back - a soft gold glow, white at its heart, rays turning slowly in it
vec3 wingHalo(vec2 p, float away) {
  vec2 q = p * 2.0 - 1.0;
  float r = length(q);
  if (r > 1.0) discard;
  float a = r > 1e-4 ? atan(q.y, q.x) : 0.0;
  float rays = pow(max(0.5 + 0.5 * cos(14.0 * a + uTime * TAU ${hzGlsl(WING_HZ.rays)}), 0.0), 6.0) * 0.6 + pow(max(0.5 + 0.5 * cos(9.0 * a - uTime * TAU ${hzGlsl(2 * WING_HZ.rays)} + 1.3), 0.0), 10.0) * 0.4;   // AUDIT 4: never a pow of a negative (a cos a hair under -1)
  float glow = exp(-r * r * 7.0) * 0.16 + exp(-r * r * 2.2) * 0.05;   // WINGS-FIT: faint (0.55, 0.16; its heart 0.25, its rays 0.32)
  vec3 col = WING_CORE * exp(-r * r * 16.0) * 0.07 + WING_GOLD * (glow + rays * exp(-r * 2.6) * 0.1);
  return col * (1.0 - smoothstep(0.55, 1.0, r)) * wingBreath() * (1.0 + 0.25 * wingBeat(0.0, uTime)) * smoothstep(0.5, 1.0, uKindle) * wingNear() * away;
}
`;
const WARREN_EDGES = glyphEdges(WARREN_BUNNY.path);
const wv2 = (a, i = 0) => `vec2(${g3(a[i])}, ${g3(a[i + 1])})`;
const WITCH_GLSL = `
const vec3 WF_MOSS = ${v3(WITCH_RGB.moss)};
const vec3 WF_FIRE = ${v3(WITCH_RGB.fire)};
const vec3 WF_GLOW = ${v3(WITCH_RGB.glow)};
const vec3 WF_VIOLET = ${v3(WITCH_RGB.violet)};
const vec3 WF_TALLOW = ${v3(WITCH_RGB.tallow)};
vec3 witchRamp(float v) { vec3 c = mix(WF_MOSS * 0.4, WF_FIRE, smoothstep(0.15, 0.6, v)); return mix(c, WF_GLOW, smoothstep(0.7, 1.0, v)); }
float witchBreath() { return 0.85 + 0.15 * sin(uTime * TAU ${hzGlsl(WITCH_HZ.breath)}); }
vec3 witchGround(vec2 p) {
  float r = length(p);
  if (r > uGroundR) discard;
  float breath = witchBreath();
  // THE POOL: the moss's dark green under the feet
  vec3 col = WF_MOSS * exp(-r * r / 0.4) * 0.35 * breath;
  if (r > 0.05) {
    float a = atan(p.y, p.x);
    float u = fract(a / TAU + uTime ${hzGlsl(WITCH_HZ.turn)});
    // THE FIRE: a band of green flame on the ring, its noise flowing round and out
    float flow = fbmP(vec2(u * ${AURA_ROUND.ground.toFixed(1)} + floor(uSeed * 7.0), r * 3.0 - uTime * ${WITCH_FLOW.ground.toFixed(3)}), vec2(${AURA_ROUND.ground.toFixed(1)}, ${(WITCH_FLOW.ground * AURA_CLOCK_PERIOD).toFixed(1)}));
    float band = 1.0 - smoothstep(0.0, 0.22, abs(r - uRingR - (flow - 0.5) * 0.14));
    float heat = band * (0.35 + 0.65 * flow);
    col += witchRamp(clamp(heat, 0.0, 1.0)) * heat * 0.9 * breath;
    // THE CANDLES: tallow flames standing in the ring, each guttering on its own beat (witchCandleAt)
    float k = mod(floor(fract(a / TAU) * ${WITCH_CANDLES.toFixed(1)} + 0.5), ${WITCH_CANDLES.toFixed(1)});   // AUDIT WITCH1 E5: the first candle one candle, never two halves out of step (witchCandleAt's wrap)
    float ak = k / ${WITCH_CANDLES.toFixed(1)} * TAU;
    vec2 d = p - vec2(cos(ak), sin(ak)) * uRingR;
    float flick = 0.75 + 0.25 * sin(uTime * TAU ${hzGlsl(WITCH_HZ.flicker)} * (1.0 + mod(k, 3.0)) + k * 2.3);
    col += WF_TALLOW * exp(-dot(d, d) / 0.0016) * 1.1 * flick;
  }
  return col * uKindle * (1.0 - smoothstep(uGroundR - 0.25, uGroundR, r));
}
vec3 witchWall(vec2 q) {
  float u = fract(q.x + uTime ${hzGlsl(WITCH_HZ.turn)}), v = q.y;
  // THE TONGUES: green flame, low - gone by the knee
  float n = fbmP(vec2(u * ${AURA_ROUND.flames.toFixed(1)} + floor(uSeed * 5.0), v * 1.6 - uTime * ${WITCH_FLOW.rise.toFixed(3)}), vec2(${AURA_ROUND.flames.toFixed(1)}, ${(WITCH_FLOW.rise * AURA_CLOCK_PERIOD).toFixed(1)}));
  float th = 0.3 + v * 2.2;
  float body = smoothstep(th - 0.06, th + 0.1, n), core = smoothstep(th + 0.06, th + 0.22, n);
  vec3 col = (witchRamp(0.35 + 0.5 * core) * body * 0.7 + WF_GLOW * core * 0.25) * pow(max(0.0, 1.0 - v * 2.5), 1.2);
  // THE MOTES: violet, rising off the ring past the chest, each at its own place and pace, swaying as they climb
  float circ = TAU * uRingR, motes = 0.0;
  for (int m = 0; m < ${WITCH_MOTES}; m++) {
    float fm = float(m);
    float h1 = fract(sin(fm * 73.31 + 1.3) * 43758.5453), h2 = fract(sin(fm * 29.17 + 4.1) * 24634.6345);
    float mv = fract(uTime ${hzGlsl(WITCH_HZ.mote)} * (1.0 + mod(fm, 3.0)) + h2);
    vec2 dm = vec2((fract(q.x - h1 + 0.5) - 0.5) * circ + 0.05 * sin(TAU * (mv * 2.0 + h1)), (v - mv) * uFlameH);
    motes += exp(-dot(dm, dm) / 0.00035) * (1.0 - mv) * smoothstep(0.0, 0.06, mv);
  }
  col += (WF_VIOLET * 0.8 + WF_GLOW * 0.15) * motes;
  // kindled UP: the fire rising from the feet
  return col * clamp(uKindle * 1.25 - v, 0.0, 0.15) / 0.15;
}
`;

const SAGE_EDGES = glyphEdges(GLYPH_PATH.nirnrootsage), SAGE_VEIN_EDGES = glyphEdges(GLYPH_DETAIL.nirnrootsage[0].path), SAGE_BUD_EDGES = glyphEdges(GLYPH_DETAIL.nirnrootsage[1].path);
const edgeDGlsl = (fn, name, edges) => `${glyphEdgesGlsl(name, edges)}
float ${fn}(vec2 g) {
  float d = 1e9, n = 0.0;
  for (int i = 0; i < ${edges.length}; i++) { d = min(d, cloakSeg2(g, ${name}[i])); n += cloakCross(g, ${name}[i]); }
  return (mod(n, 2.0) > 0.5 ? -1.0 : 1.0) * sqrt(d);
}`;
const SAGE_GLSL = `
const vec3 SG_LEAF = ${v3(SAGE_RGB.leaf)};
const vec3 SG_GLOW = ${v3(SAGE_RGB.glow)};
const vec3 SG_HAZE = ${v3(SAGE_RGB.haze)};
const vec3 SG_DEEP = ${v3(SAGE_RGB.deep)};
const vec3 SG_SMOKE = ${v3(SAGE_RGB.smoke)};
const int SAGE_SCRIPT[${SAGE_RUNES}] = int[${SAGE_RUNES}](${SAGE_SCRIPT.join(', ')});
${edgeDGlsl('sageRootD', 'SAGE_EDGES', SAGE_EDGES)}
${edgeDGlsl('sageVeinD', 'SAGE_VEIN_EDGES', SAGE_VEIN_EDGES)}
${edgeDGlsl('sageBudD', 'SAGE_BUD_EDGES', SAGE_BUD_EDGES)}
float sageBreath() { return 0.85 + 0.15 * sin(uTime * TAU ${hzGlsl(SAGE_HZ.breath)}); }
// a rune's stroke lit - the ward's inked, in the nirnroot's greens: a pale heart, the glow's body, a leaf-green halo
vec3 sageInked(float d, float w) {
  float heart = 1.0 - smoothstep(w * 0.35, w * 0.7, d);
  float body = 1.0 - smoothstep(w * 0.5, w * 1.15, d);
  float glow = exp(-d * d / (w * w * 9.0));
  return SG_HAZE * heart * 0.85 + SG_GLOW * body * 0.9 + SG_LEAF * glow * 0.6;
}
vec4 sageGround(vec2 p) {
  float r = length(p);
  if (r > uGroundR) discard;
  float breath = sageBreath();
  // THE SHADE the smoke lays at the feet, covering - the deep green, rolling across the ground, thickest at the feet and
  // thinning out past the runes (the lattice in metres, never the angle's, which would pinch to spokes at the middle)
  float roll = fbmP(vec2(p.x * 3.0 + uTime * ${g3(SAGE_FLOW.ground)}, p.y * 3.0), vec2(${g1(SAGE_FLOW.ground * AURA_CLOCK_PERIOD)}, 64.0));
  float shade = exp(-r * r / 0.35) * (0.35 + 0.65 * roll) * 0.5 * uKindle;
  vec4 c = vec4(SG_DEEP * 0.6 * shade, shade);
  // THE GLOW the runes throw on the ground about them, added
  float dr = r - uRingR;
  vec3 light = SG_GLOW * exp(-dr * dr / 0.012) * 0.16 * breath;
  // never the angle at the middle, where atan(0, 0) is no number - nothing below reaches it
  if (r > 0.05) {
    float a = atan(p.y, p.x), px = turnPixel();
    // THE BAND: a fine line of the glow out from the runes and one in from them
    float lines = max(turnBand(r, uRingR + ${g3(SAGE_BAND_M - 0.006)}, uRingR + ${g3(SAGE_BAND_M + 0.006)}, px), turnBand(r, uRingR - ${g3(SAGE_BAND_M + 0.006)}, uRingR - ${g3(SAGE_BAND_M - 0.006)}, px));
    light += SG_GLOW * lines * 0.55 * breath;
    // THE RUNES: small, the ward's script in the Sage's words, round the feet and turning slowly; the light passing round
    // them lights each in turn
    float cu = (a - uTime * TAU ${hzGlsl(SAGE_HZ.runes)}) / TAU * ${g1(SAGE_RUNES)};
    float k = mod(floor(cu), ${g1(SAGE_RUNES)});
    vec2 q = vec2((fract(cu) - 0.5) * TAU / ${g1(SAGE_RUNES)} * r, r - uRingR);
    float d = runeD(q / ${g3(SAGE_RUNE_SCALE)}, SAGE_SCRIPT[int(k)]) * ${g3(SAGE_RUNE_SCALE)};
    float lit = 0.45 + 0.55 * pow(max(0.5 + 0.5 * cos(uTime * TAU ${hzGlsl(SAGE_HZ.pulse)} - k / ${g1(SAGE_RUNES)} * TAU), 0.0), 3.0);
    light += sageInked(d, 0.009) * lit * breath;
    // drawn round from behind the wearer as it kindles, as the ward is
    light *= wardDrawn(fract(a / TAU + 0.5));
  }
  c.rgb += light;
  return c * (1.0 - smoothstep(uGroundR - 0.2, uGroundR, r));
}
vec4 sageWall(vec2 q) {
  float u = q.x, v = q.y;
  // faint where the eye looks through the strip (across the boots), thickest where it looks along it - the radiance's shell
  float an = u * TAU;
  vec2 e = uCamPos.xz - vWorld.xz;
  float facing = dot(e, e) > 1e-8 ? abs(dot(vec2(cos(an), sin(an)), normalize(e))) : 1.0;
  float rim = 0.3 + 0.7 * pow(max(1.0 - facing, 0.0), 2.0);
  // THE LOW SMOKE rolling round the feet and up off the runes, covering - the runes' green on its foot, the smoke's grey
  // above, gone by the knee
  float n = fbmP(vec2(u * 24.0, v * 2.0 - uTime * ${g3(SAGE_FLOW.rise)}), vec2(24.0, ${g1(SAGE_FLOW.rise * AURA_CLOCK_PERIOD)}));
  float smoke = smoothstep(0.3, 0.8, n + 0.35 * (1.0 - v)) * pow(1.0 - v, 1.6) * 0.38 * rim;
  vec3 col = mix(SG_GLOW * 0.45, SG_SMOKE * 0.8, smoothstep(0.0, 0.5, v));
  vec4 c = vec4(col * smoke, smoke);
  // THE RUNES' LIGHT rising off the ring, added: a veil gone by the shin
  c.rgb += SG_GLOW * exp(-v * 7.0) * 0.16 * sageBreath();
  // kindled UP, from the feet
  return c * clamp((uKindle * 1.25 - v) / 0.15, 0.0, 1.0);
}
// A CARD (s: a puff's seed's half, its age and its cover - or 1 for a nirnroot)
vec4 sageCard(vec2 uv, vec3 s) {
  if (s.x < 0.75) {
    // A PUFF: a round billow of smoke, lumpy at its edge, lit from above - the haze on its crown, the smoke's grey under it;
    // young, the runes' green on its belly; thinning away as it climbs
    float seed = s.x * 2.0, age = s.y;
    float d = length(uv - 0.5) * 2.0;
    if (d >= 1.0) return vec4(0.0);
    float n = fbmP(uv * 3.0 + vec2(seed * 17.0, seed * 29.0 - age * 1.5), vec2(64.0));
    float body = (1.0 - smoothstep(0.3, 1.0, d + (n - 0.5) * 0.7)) * (1.0 - smoothstep(0.7, 1.0, d));   // and gone at its card's round, never cut there
    float thin = smoothstep(0.0, 0.12, age) * pow(1.0 - age, 1.3);
    float a = clamp(body * (0.5 + 0.7 * n), 0.0, 1.0) * thin * ${g3(SAGE_PUFF_A)} * s.z;
    vec3 col = mix(SG_SMOKE * 0.85, SG_HAZE, smoothstep(0.15, 0.85, uv.y + (n - 0.5) * 0.35));
    col = mix(col, SG_GLOW * 0.75, (1.0 - age) * (1.0 - age) * (1.0 - uv.y) * 0.5);
    return vec4(col * a, a);
  }
  // A NIRNROOT: the badge's own sprig (GLYPH_PATH.nirnrootsage, in its box with room about it, SAGE_ROOT_PAD) - leaf green at
  // its foot into its glow at the bulb, its veins the deep green, the bulb's heart the haze; its glow about it, added
  vec2 g = (vec2(uv.x, 1.0 - uv.y) - 0.5) * ${g3(16 * SAGE_ROOT_PAD)} + 8.0;
  float px = turnPixel() * ${g3((16 * SAGE_ROOT_PAD) / SAGE_ROOT_M)};   // a pixel, in the box's units
  float d = sageRootD(g);
  float body = clamp(0.5 - d / px, 0.0, 1.0);
  float out1 = max(d, 0.0);
  float edge = smoothstep(0.0, 0.08, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
  vec3 halo = SG_GLOW * exp(-out1 * out1 / 2.5) * 0.35 * sageBreath() * edge;
  if (body <= 0.0) return vec4(halo, 0.0);
  vec3 col = mix(SG_LEAF, SG_GLOW, 1.0 - smoothstep(4.0, 15.0, g.y));
  col = mix(col, SG_DEEP, clamp(0.5 - sageVeinD(g) / px, 0.0, 1.0));
  col = mix(col, SG_HAZE, clamp(0.5 - sageBudD(g) / px, 0.0, 1.0));
  return vec4(col * body + halo * (1.0 - body), body);
}
`;

const WARREN_GLSL = `
const vec3 WR_AMETHYST = ${v3(WARREN_RGB.amethyst)};
const vec3 WR_LILAC = ${v3(WARREN_RGB.lilac)};
const vec3 WR_BLUSH = ${v3(WARREN_RGB.blush)};
const vec3 WR_FRILL = ${v3(WARREN_RGB.frill)};
const vec3 WR_PLUM = ${v3(WARREN_RGB.plum)};
${glyphEdgesGlsl('WARREN_EDGES', WARREN_EDGES)}
float warrenBreath() { return 0.85 + 0.15 * sin(uTime * TAU ${hzGlsl(WARREN_HZ.breath)}); }
// premultiplied: \`top\` laid over \`under\`
vec4 warrenOver(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
// the turn from b to a the short way round, -PI..PI
float warrenTurn(float a, float b) { return mod(a - b + TAU * 0.5, TAU) - TAU * 0.5; }
// A TWINKLE at q (m from its middle), s its reach: a four-pointed star - a soft core and two thin arms
float warrenStar(vec2 q, float s) {
  vec2 a = abs(q);
  return exp(-dot(q, q) / (0.08 * s * s)) + 0.8 * (exp(-a.x / (0.06 * s)) * exp(-a.y / s) + exp(-a.y / (0.06 * s)) * exp(-a.x / s));
}
// an oval's cover at q from its middle (radii rr), its edge a pixel (px) wide
float warrenOval(vec2 q, vec2 rr, float px) { return clamp(0.5 - (length(q / rr) - 1.0) * min(rr.x, rr.y) / px, 0.0, 1.0); }
vec4 warrenGround(vec2 p) {
  float r = length(p);
  if (r > uGroundR) discard;
  float px = turnPixel(), breath = warrenBreath(), ringR = uRingR - ${g3(WARREN_RING_IN)}, dr = r - ringR;
  // THE LIGHT, added (no cover): amethyst pooled within the ring, and its glow about the ring - the ring of light just
  // inside the rabbits' lane (uRingR)
  vec4 c = vec4(WR_AMETHYST * (exp(-r * r / 0.35) * 0.1 + exp(-dr * dr / 0.006) * 0.2) * breath, 0.0);
  // never the angle at the middle, where atan(0, 0) is no number (the resonance's AUDIT) - nothing below reaches it
  if (r > 0.05) {
    float a = atan(p.y, p.x);
    // THE TWINKLES round the ring, inside the ring of light and outside the lane by turns, each in its own time
    for (int m = 0; m < ${WARREN_TWINKLES}; m++) {
      float fm = float(m);
      vec2 tq = vec2(warrenTurn(a, (fm + 0.5) / ${WARREN_TWINKLES.toFixed(1)} * TAU) * r, r - (mod(fm, 2.0) < 0.5 ? uRingR + 0.14 : ringR - 0.1));
      float tw = pow(max(0.5 + 0.5 * sin(TAU * (uTime ${hzGlsl(WARREN_HZ.twinkle)} + fm * 0.37)), 0.0), 6.0);
      c.rgb += mix(WR_BLUSH, WR_FRILL, 0.5) * warrenStar(tq, 0.05) * tw * 0.45;
    }
    // THE RING: a crisp line of the lilac, covering
    float ring = turnBand(r, ringR - ${g3(WARREN_RING_M / 2)}, ringR + ${g3(WARREN_RING_M / 2)}, px);
    c = warrenOver(vec4(WR_LILAC * ring, ring), c);
    // THE TRACKS: each landing's prints, fading - two long hind feet side by side ahead, two small fore feet behind them,
    // one after the other, as a rabbit's are; it hops the angle's way
    float across = r - uRingR, prints = 0.0;
    if (abs(across) < 0.08) {
      for (int i = 0; i < ${WARREN_BUNNIES * WARREN_PRINTS}; i++) {
        vec2 pr = uWarrenPrint[i];
        float fade = 1.0 - clamp(pr.y / ${g3(WARREN_PRINT_S)}, 0.0, 1.0);
        float along = warrenTurn(a, pr.x) * r;
        if (fade <= 0.0 || abs(along) > 0.12) continue;
        float hind = max(warrenOval(vec2(along - 0.03, across - 0.022), vec2(0.03, 0.011), px), warrenOval(vec2(along - 0.03, across + 0.022), vec2(0.03, 0.011), px));
        float fore = max(warrenOval(vec2(along + 0.03, across), vec2(0.011), px), warrenOval(vec2(along + 0.065, across), vec2(0.011), px));
        prints = max(prints, max(hind, fore) * fade);
      }
    }
    c = warrenOver(vec4(WR_LILAC * 0.8 * prints, 0.8 * prints), c);
  }
  // THE SHADOWS under the rabbits - softer as each leaps, and none of one not yet up
  float shadow = 0.0;
  for (int k = 0; k < ${WARREN_BUNNIES}; k++) {
    vec4 b = uWarren[k];
    vec2 d = p - vec2(cos(b.x), sin(b.x)) * uRingR;
    float along = dot(d, vec2(-sin(b.x), cos(b.x))), side = dot(d, vec2(cos(b.x), sin(b.x)));
    shadow = max(shadow, exp(-(along * along / 0.0036 + side * side / 0.0012)) * clamp(1.0 - max(b.y, 0.0) / 0.35, 0.0, 1.0) * abs(b.w));
  }
  c = warrenOver(vec4(0.0, 0.0, 0.0, 0.35 * shadow), c);
  return c * uKindle * (1.0 - smoothstep(uGroundR - 0.2, uGroundR, r));
}
vec4 warrenWall(vec2 q) {
  float u = q.x, v = q.y;
  // THE VEIL, low and amethyst, gone by the shin
  vec3 col = WR_AMETHYST * exp(-v * 7.0) * 0.12 * warrenBreath();
  // THE SPARKLES: lilac, blush and white by turns, rising off the ring to the waist, each at its own place and pace,
  // swaying and twinkling as they climb
  float circ = TAU * uRingR;
  for (int m = 0; m < ${WARREN_SPARKLES}; m++) {
    float fm = float(m);
    float h1 = fract(sin(fm * 47.13 + 0.9) * 43758.5453), h2 = fract(sin(fm * 13.97 + 2.3) * 24634.6345);
    float mv = fract(uTime ${hzGlsl(WARREN_HZ.sparkle)} * (1.0 + mod(fm, 3.0)) + h2);
    vec2 dm = vec2((fract(u - h1 + 0.5) - 0.5) * circ + 0.03 * sin(TAU * (mv * 2.0 + h1)), (v - mv) * uFlameH);
    vec3 hue = mod(fm, 3.0) < 0.5 ? WR_LILAC : mod(fm, 3.0) < 1.5 ? WR_BLUSH : WR_FRILL;
    col += hue * warrenStar(dm, 0.04 * (0.6 + 0.4 * sin(TAU * (mv * 3.0 + h1)))) * smoothstep(0.0, 0.08, mv) * (1.0 - mv) * 0.8;
  }
  // added - no cover; kindled UP, from the feet
  return vec4(col * clamp((uKindle * 1.25 - v) / 0.15, 0.0, 1.0), 0.0);
}
// THE RABBIT'S OUTLINE (WARREN_BUNNY.path, cut into edges) at g in its box: the distance, negative inside (even-odd)
float warrenD(vec2 g) {
  float d = 1e9, n = 0.0;
  for (int i = 0; i < ${WARREN_EDGES.length}; i++) { d = min(d, cloakSeg2(g, WARREN_EDGES[i])); n += cloakCross(g, WARREN_EDGES[i]); }
  return (mod(n, 2.0) > 0.5 ? -1.0 : 1.0) * sqrt(d);
}
float warrenDisc(vec2 g, vec3 c, float px) { return clamp(0.5 - (length(g - c.xy) - c.z) / px, 0.0, 1.0); }
float warrenCapsule(vec2 g, vec2 a, vec2 b, float r, float px) { return clamp(0.5 - (segD(g, a, b) - r) / px, 0.0, 1.0); }
// A RABBIT (uv its card's 0..1, s.x its facing: +1 its box's way, -1 turned, 0 not yet up): the lilac coat lit from above
// and an amethyst line round it, its ear's inside, the maid's headdress - its plum band, its white lace - its eye and its
// glint, its nose, and its cotton tail
vec4 warrenBunny(vec2 uv, vec3 s) {
  if (abs(s.x) < 0.5) discard;
  vec2 g = vec2(s.x > 0.0 ? uv.x : 1.0 - uv.x, 1.0 - uv.y) * 16.0;
  float px = turnPixel() * ${g3(16 / WARREN_BUNNY_M)};   // a pixel, in the box's units
  float d = warrenD(g);
  float body = clamp(0.5 - d / px, 0.0, 1.0);
  float tail = warrenDisc(g, ${v3(WARREN_BUNNY.tail)}, px);
  float lace = warrenCapsule(g, ${wv2(WARREN_BUNNY.lace)}, ${wv2(WARREN_BUNNY.lace, 2)}, ${g3(WARREN_BUNNY.lace[4])}, px);
  ${WARREN_BUNNY.frills.map((f) => `lace = max(lace, warrenDisc(g, ${v3(f)}, px));`).join(' ')}   // its scallops
  float cover = max(max(body, tail), lace);
  if (cover <= 0.0) return vec4(0.0);
  vec3 col = WR_LILAC * mix(0.8, 1.06, 1.0 - smoothstep(3.0, 14.0, g.y));   // lit from above - never a reversed smoothstep, which GLSL leaves undefined (SD20c V14)
  col = mix(col, WR_AMETHYST * 0.85, clamp(0.5 + (d + 0.75) / px, 0.0, 1.0) * (1.0 - smoothstep(0.75, 1.75, px)));   // the line, gone once a pixel is wider than it
  col = mix(col, WR_BLUSH, warrenCapsule(g, ${wv2(WARREN_BUNNY.ear)}, ${wv2(WARREN_BUNNY.ear, 2)}, ${g3(WARREN_BUNNY.ear[4])}, px));
  col = mix(col, WR_PLUM, warrenCapsule(g, ${wv2(WARREN_BUNNY.band)}, ${wv2(WARREN_BUNNY.band, 2)}, ${g3(WARREN_BUNNY.band[4])}, px));
  col = mix(col, WR_FRILL, lace);
  col = mix(col, WR_PLUM, warrenDisc(g, ${v3(WARREN_BUNNY.eye)}, px));
  col = mix(col, WR_FRILL, warrenDisc(g, ${v3(WARREN_BUNNY.glint)}, px));
  col = mix(col, WR_BLUSH, warrenDisc(g, ${v3(WARREN_BUNNY.nose)}, px));
  col = mix(col, WR_FRILL, tail);
  return vec4(col * cover, cover);
}
`;
export const AURA_VS = HEAD + `layout(location = 0) in vec2 aP;   // the ground: a corner -1..1; the flames: x the step round 0..1, y up 0..1; a symbol: x its number * 2 + the corner's u, y its v
uniform mat4 uVP;
uniform int uKind;      // 0 the ground, 1 the flames, 2 the ward's floating symbols (AEGIS)
uniform int uAura;      // SHADOW-CLOAK: the cloak's wall is its own mesh, and its third draw its emblems
uniform vec3 uAt;       // the feet
uniform float uGroundR, uRingR, uFlameH, uLift;
uniform float uTime;    // AEGIS: a symbol's flight
uniform float uYaw;     // SHADOW-CLOAK: the wearer's facing
uniform float uTorn;    // SHADOW-CLOAK: the seconds since the wearer turned beast (negative while not) - the tear, the shreds
uniform vec4 uSwing;    // SHADOW-CLOAK: the swing (auraMotionStep) - its trail along the body's right and forward (m), its lift (m), its lag on a turn (rad)
uniform vec4 uCapeS;    // SHADOW-CLOAK: the shoulders' middle in the body's frame (x right, y up, z forward, m about the feet) - the pose it hangs from - and (w) its scale across them
uniform vec4 uCapeH;    // SHADOW-CLOAK: the head's middle in the same frame, and (w) its turn from the body's (rad)
uniform vec3 uKneeL, uKneeR;   // SHADOW-CLOAK: the knees, in the same frame
uniform vec3 uTorsoU, uTorsoF;   // SERAPH-WINGS: the torso's up (along its spine) and forward (out of its chest) in the same frame (auraCapePose) - the back the wings grow from
uniform float uWingBack;   // WINGS-FIT: how much further back the wings root (m) - a sprite's flat card (WING_SPRITE_BACK), else 0
uniform vec4 uWarren[${WARREN_BUNNIES}];   // WIKIMAID: each rabbit - its angle, its feet's height, its stretch, its facing times how far it has come up (warrenBunniesInto, farthest first)
uniform vec4 uSage[${SAGE_CARDS}];   // NIRNROOT-SAGE: each card - its place about the feet and its size (sageCardsInto, farthest first)
uniform vec4 uSageLook[${SAGE_CARDS}];   // NIRNROOT-SAGE: what each is - a puff (0, its age, its cover, its seed) or a nirnroot (1, its turn, its tilt, 0)
uniform vec3 uCamPos;   // AEGIS: the eye a symbol faces
out vec2 vP;            // the ground: metres about the feet; the flames: (the angle's share, the height's); a symbol: its card's uv
out vec3 vWorld;
out vec3 vS;            // AEGIS: a symbol's age, its rune's place in the script and its number
${WARD_FLIGHT_GLSL}${CLOAK_SHAPE_GLSL}${CLOAK_VS_GLSL}${WING_SHARED_GLSL}${WING_VS_GLSL}
void main() {
  vec3 w;
  vS = vec3(0.0);
  if (uKind == 0) {
    vP = aP * uGroundR;
    w = uAt + vec3(vP.x, uLift, vP.y);
  } else if (uKind == 1 && uAura == 3) {
    // SHADOW-CLOAK: the cloak's cloth, (u round from the front, v up) on its own mesh
    vP = aP;
    w = cloakPoint(aP, uTime);
  } else if (uKind == 1 && uAura == 4) {
    // SERAPH-WINGS: A STRAND, (its number * 2 + across 0..1, along 0..1) - laid along its curve, turned to the eye along
    // its length, its width growing out of the back and narrowing to the tip
    float k = floor(aP.x * 0.5), across = aP.x - k * 2.0, t = aP.y;
    vec4 st = wingStrandOf(k);
    float fine = st.z > 0.5 ? 1.0 : 0.0;
    vec3 c = wingWorld(wingPoint(k, t, uTime));
    vec3 along = t < 0.99 ? wingWorld(wingPoint(k, t + 0.01, uTime)) - c : c - wingWorld(wingPoint(k, t - 0.01, uTime));   // AUDIT 4: forward at the tip too (backward, the last segment twisted into a bowtie)
    vec3 side = cross(along, uCamPos - c);
    float sl = length(side);
    side = sl > 1e-6 ? side / sl : vec3(0.0, 1.0, 0.0);
    float width = mix(${g3(WING_W.broad)} * (st.w > 0.5 ? 0.6 : 1.0), ${g3(WING_W.fine)}, fine) * (0.3 + 0.7 * smoothstep(0.0, 0.25, t)) * (1.0 - 0.55 * t * t);
    w = c + side * (across - 0.5) * width;
    vP = vec2(across, t);
    vS = vec3(k, fine, st.w);
  } else if (uKind == 1 && uAura == 15) {
    // BUNNYFALL: THE HALO - the strip laid round over the head (the pose's head, \`uCapeH\`), a ribbon of uFlameH turned to
    // the eye all round, bobbing a little
    float a = aP.x * 6.283185307179586;
    vec3 c = uAt + vec3(cos(a) * uRingR, uCapeH.y + ${HALO_UP.toFixed(3)} + ${HALO_BOB_M.toFixed(3)} * sin(6.283185307179586 * ${HALO_HZ.bob.toFixed(3)} * uTime), sin(a) * uRingR);
    vec3 tng = vec3(-sin(a), 0.0, cos(a));
    vec3 side = cross(tng, uCamPos - c);
    float sl = length(side);
    side = sl > 1e-6 ? side / sl : vec3(0.0, 1.0, 0.0);
    w = c + side * (aP.y - 0.5) * uFlameH;
    vP = aP;
  } else if (uKind == 1) {
    float a = aP.x * 6.283185307179586;
    vP = aP;
    w = uAt + vec3(cos(a) * uRingR, uLift + aP.y * uFlameH, sin(a) * uRingR);
  } else if (uAura == 3) {
    // SHADOW-CLOAK: AN EMBLEM - its card at its flight's place, upright, turned round the vertical to the eye and
    // turning a little either way of it as it climbs, as a medal hung on a thread does; past the emblems, A SHRED of the
    // torn cloak - turning in its own plane and tumbling
    float k = floor(aP.x * 0.5);
    vP = vec2(aP.x - k * 2.0, aP.y);
    vec4 f;
    vec2 o;
    if (k < ${g1(CLOAK_EMBLEMS)}) {
      f = cloakEmblemFlight(k, uTime);
      o = (vP - 0.5) * ${g3(CLOAK_EMBLEM_M)} * (0.85 + 0.3 * f.w);
      o.x *= cos(0.55 * sin(f.w * CLOAK_TAU + k * 1.3));
      vS = vec3(f.w, 0.0, k);
    } else {
      float j = k - ${g1(CLOAK_EMBLEMS)}, since = max(uTorn, 0.0);
      f = cloakShredFlight(j, since);
      o = (vP - 0.5) * ${g3(CLOAK_SHRED_M)};
      o = vec2(o.x * cos(f.w) - o.y * sin(f.w), o.x * sin(f.w) + o.y * cos(f.w));
      o.x *= cos(since * CLOAK_TAU ${hzGlsl(CLOAK_SHRED_HZ.tumble)} + j);
      vS = vec3(0.0, 1.0, j);
    }
    vec3 c = uAt + f.xyz;
    vec2 toEye = uCamPos.xz - c.xz;
    toEye = dot(toEye, toEye) > 1e-8 ? normalize(toEye) : vec2(0.0, 1.0);
    // the card's x the eye's own right as the frame shows it (world/mat4.js HANDEDNESS: world +x on screen right), so
    // the glyph faces the way the badge's does
    w = c + vec3(-toEye.y, 0.0, toEye.x) * o.x + vec3(0.0, o.y, 0.0);
  } else if (uAura == 4) {
    // SERAPH-WINGS: A SPARK - a streak of light riding a strand out, its length along its way as the eye sees it; past
    // the sparks, THE BACKLIGHT - one card of radiance behind the upper back, square to the eye
    float k = floor(aP.x * 0.5);
    vP = vec2(aP.x - k * 2.0, aP.y);
    if (k < ${g1(WING_MOTES)}) {
      vec3 way;
      vec4 f = wingMoteFlight(k, uTime, way);
      vec3 c = wingWorld(f.xyz);
      vec3 e = uCamPos - c;
      float el = length(e);
      e = el > 1e-6 ? e / el : vec3(0.0, 0.0, 1.0);
      vec3 dw = wingWorldDir(way);
      vec3 along = dw - e * dot(dw, e);
      float al = length(along);
      along = al > 1e-6 ? along / al : vec3(0.0, 1.0, 0.0);
      vec3 across = cross(e, along);
      vec2 o = (vP - 0.5) * vec2(${g3(WING_MOTE_M)}, ${g3(WING_MOTE_LEN)}) * (1.0 - 0.4 * f.w);
      w = c + across * o.x + along * o.y;
      vS = vec3(f.w, 0.0, k);
    } else {
      vec3 c = wingWorld(wingBack(vec3(0.0, 0.12, -0.32 - uWingBack)));   // WINGS-FIT: behind the roots, wherever they are
      vec3 e = uCamPos - c;
      float el = length(e);
      e = el > 1e-6 ? e / el : vec3(0.0, 0.0, 1.0);
      vec3 r = cross(vec3(0.0, 1.0, 0.0), e);
      float rl = length(r);
      r = rl > 1e-6 ? r / rl : vec3(1.0, 0.0, 0.0);
      vec2 o = (vP - 0.5) * ${g3(WING_HALO_M)};
      w = c + r * o.x + cross(e, r) * o.y;
      vS = vec3(smoothstep(${g3(WING_HALO_NEAR[0])}, ${g3(WING_HALO_NEAR[1])}, el), 2.0, k);   // AUDIT 4: gone with the eye near its middle (the wearer's own first person, looking down: it washed the floor gold)
    }
  } else if (uAura == 12) {
    // WIKIMAID: A RABBIT - its card where node's law has it (uWarren), its feet on the ground at its hop's height,
    // stretched up as it flies and squashed as it lands (its width the inverse root, so it keeps its bulk), half its size
    // while it comes up out of the ground; upright and square to the eye about the vertical, and facing the way it hops
    // round as the eye sees it - the card's x the eye's own right, as the cloak's emblem's is - turned about in a binky
    float k = floor(aP.x * 0.5);
    vP = vec2(aP.x - k * 2.0, aP.y);
    vec4 b = uWarren[int(k)];
    vec3 c = uAt + vec3(cos(b.x) * uRingR, uLift + b.y, sin(b.x) * uRingR);
    vec2 toEye = uCamPos.xz - c.xz;
    toEye = dot(toEye, toEye) > 1e-8 ? normalize(toEye) : vec2(0.0, 1.0);
    vec2 right = vec2(-toEye.y, toEye.x);
    vec2 o = (vP - vec2(0.5, ${WARREN_FOOT.toFixed(4)})) * ${g3(WARREN_BUNNY_M)} * mix(0.5, 1.0, abs(b.w)) * vec2(inversesqrt(max(b.z, 0.05)), b.z);
    // leaned back toward the eye about its feet by a share of the eye's height over it (WARREN_LEAN)
    float lean = ${g3(WARREN_LEAN)} * atan(max(uCamPos.y - c.y, 0.0), max(length(uCamPos.xz - c.xz), 1e-4));
    w = c + vec3(right.x, 0.0, right.y) * o.x + (vec3(0.0, cos(lean), 0.0) + vec3(toEye.x, 0.0, toEye.y) * sin(lean)) * o.y;
    vS = vec3(sign(b.w) * (dot(vec2(-sin(b.x), cos(b.x)), right) >= 0.0 ? 1.0 : -1.0), k, 0.0);
  } else if (uAura == 14) {
    // NIRNROOT-SAGE: A PUFF of the smoke or A NIRNROOT - its card where node's law has it (uSage, farthest first), about its
    // middle
    float k = floor(aP.x * 0.5);
    vP = vec2(aP.x - k * 2.0, aP.y);
    vec4 c = uSage[int(k)], l = uSageLook[int(k)];
    vec3 at = uAt + c.xyz;
    vec2 o = (vP - 0.5) * c.w;
    if (l.x < 0.5) {
      // a puff: square to the eye, turned in its own plane as it billows - one way or the other by its seed
      vec3 e = uCamPos - at;
      float el = length(e);
      e = el > 1e-6 ? e / el : vec3(0.0, 0.0, 1.0);
      vec3 r = cross(vec3(0.0, 1.0, 0.0), e);
      float rl = length(r);
      r = rl > 1e-6 ? r / rl : vec3(1.0, 0.0, 0.0);
      float turn = l.w * 6.283185307179586 + l.y * (l.w > 0.5 ? 1.2 : -1.2);
      o = vec2(o.x * cos(turn) - o.y * sin(turn), o.x * sin(turn) + o.y * cos(turn));
      w = at + r * o.x + cross(e, r) * o.y;
      vS = vec3(l.w * 0.5, l.y, l.z);
    } else {
      // a nirnroot: upright and square to the eye about the vertical - its x the eye's own right, as the warren's rabbits'
      // - swaying about its stem (its width its turn) and tilting as it bobs
      vec2 toEye = uCamPos.xz - at.xz;
      toEye = dot(toEye, toEye) > 1e-8 ? normalize(toEye) : vec2(0.0, 1.0);
      o.x *= l.y;
      o = vec2(o.x * cos(l.z) - o.y * sin(l.z), o.x * sin(l.z) + o.y * cos(l.z));
      w = at + vec3(-toEye.y, 0.0, toEye.x) * o.x + vec3(0.0, o.y, 0.0);
      vS = vec3(1.0, 0.0, 0.0);
    }
  } else {
    // AEGIS: A FLOATING SYMBOL - its card at its flight's place, upright and turned round the vertical to face the eye,
    // tilting a little as it climbs and growing as it fades
    float k = floor(aP.x * 0.5);
    vP = vec2(aP.x - k * 2.0, aP.y);
    vec4 f = wardFlight(k, uTime);
    vec3 c = uAt + f.xyz;
    vec2 d = uCamPos.xz - c.xz;
    d = dot(d, d) > 1e-8 ? normalize(d) : vec2(0.0, 1.0);
    float tilt = 0.22 * sin(f.w * 5.0 + k * 1.7);
    vec2 o = (vP - 0.5) * vec2(${WARD_GLYPH_W.toFixed(2)}, ${WARD_GLYPH_H.toFixed(2)}) * (1.0 + 0.35 * f.w);
    o = vec2(o.x * cos(tilt) - o.y * sin(tilt), o.x * sin(tilt) + o.y * cos(tilt));
    w = c + vec3(d.y, 0.0, -d.x) * o.x + vec3(0.0, o.y, 0.0);
    vS = vec3(f.w, mod(k * 5.0 + wardFlightOf(k, uTime), ${WARD_RUNES.toFixed(1)}), k);
  }
  vWorld = w;
  gl_Position = uVP * vec4(w, 1.0);
}`;
export const AURA_FS = HEAD + `in vec2 vP;
in vec3 vWorld;
in vec3 vS;             // AEGIS: a floating symbol's age, rune and number
uniform int uKind;
uniform int uAura;      // AEGIS: 0 Dagon's Fire, 1 the Oblivion Ward, 2 the Golden Radiance (AURA_LOOK - PRIMARCH), 3 the Holo Shadow Cloak (SHADOW-CLOAK), 4 the Seraph Wings (SERAPH-WINGS), 5 the Crystal Resonance (CRYSTAL-FIST), 6 The Turning Hour (SD9c), 7 The First Hour (HOURS-FIRST), 8 The Maelstrom (SERPENT5), 9 Beaconlight, 10 The Burning Stair, 11 Firstlight (EG-E2), 12 the Lilac Warren (WIKIMAID), 13 Witchfire (WITCH1), 14 Sage's Smoke (NIRNROOT-SAGE)
uniform vec3 uAt;       // PRIMARCH: the feet - the axis the radiance's column stands on
uniform float uYaw;     // SHADOW-CLOAK: the wearer's facing - the cloak's opening is at their front
uniform int uSide;      // SHADOW-CLOAK: which side of the cloth this draw lays - 0 its lining (front faces culled), 1 its outside (back faces culled)
uniform float uTorn;    // SHADOW-CLOAK: the seconds since the wearer turned beast (negative while not)
uniform vec4 uSwing, uCapeH;   // SHADOW-CLOAK: the swing - its lag on a turn (w) turns the cloth's facing too; the head's middle (uCapeH) - the hood an eye can stand inside
uniform float uTime, uSeed, uKindle, uRingR, uGroundR, uFlameH;
uniform float uResLit[${RESONANCE_COLUMNS}];   // CRYSTAL-FIST AUDIT: each column's lit squares, node's count (resonanceLitInto)
uniform vec4 uWarren[${WARREN_BUNNIES}];   // WIKIMAID: the rabbits (warrenBunniesInto) - their shadows on the ground
uniform vec2 uWarrenPrint[${WARREN_BUNNIES * WARREN_PRINTS}];   // WIKIMAID: their tracks - each landing's angle and its age (warrenPrintsInto)
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform vec3 uCamPos;
out vec4 o;
${FOG_FACTOR_GLSL}${NOISE_GLSL}
const float TAU = 6.283185307179586;
${WARD_GLSL}${RADIANCE_GLSL}${RESONANCE_GLSL}${TURNING_GLSL}${MAELSTROM_GLSL}${SPIRE_GLSL}${CLOAK_SHAPE_GLSL}${CLOAK_FS_GLSL}${WING_SHARED_GLSL}${WING_FS_GLSL}${WARREN_GLSL}${WITCH_GLSL}${SAGE_GLSL}
// BUNNYFALL: THE HALO's light - a bright gold core along the ribbon's middle, a soft glow either side, a glint running
// round it and a slow breath; nothing on the ground
vec3 haloRing(vec2 q) {
  float x = q.y - 0.5;
  float core = exp(-x * x / 0.012), glow = exp(-x * x / 0.09) * 0.45;
  float glint = pow(max(0.5 + 0.5 * sin(6.283185307179586 * (q.x * 2.0 - uTime * ${HALO_HZ.glint.toFixed(3)})), 0.0), 10.0);
  float breath = 0.85 + 0.15 * sin(6.283185307179586 * ${HALO_HZ.breath.toFixed(3)} * uTime);
  return (vec3(1.0, 0.8, 0.38) * (core * 1.5 + glow) * breath + vec3(1.0, 0.97, 0.85) * glint * core * 0.8) * uKindle;
}
// BUNNYFALL: NYX'S VEIL - the haze's purple. The ground: a pool swirling slowly about the feet, stars glinting in it.
// The wall: mist drifting up and round the body in two layers of noise, thinning toward the crown, and stars rising
// through it and twinkling. Kindled within (the pool fades in, the mist rises).
const vec3 NYX_DEEP = vec3(0.42, 0.12, 0.82), NYX_LILAC = vec3(0.76, 0.52, 1.0), NYX_STAR = vec3(1.0, 0.9, 1.0);
float nyxHash(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233)) + uSeed * 17.0) * 43758.5453); }
vec3 nyxGround(vec2 q) {
  float r = length(q), a = atan(q.y, q.x) / TAU + 0.5;
  float swirl = vnoiseP(vec2(a * 8.0 + r * 1.5 - uTime * 0.12, r * 3.0 - uTime * 0.2), vec2(8.0, 64.0));
  float pool = exp(-r * r / 0.9) * (0.4 + 0.6 * swirl);
  vec2 g = q * 9.0, f = fract(g) - 0.5;
  float h = nyxHash(floor(g));
  float star = step(0.93, h) * exp(-dot(f, f) / 0.01) * (0.5 + 0.5 * sin(uTime * 3.0 + h * 40.0));
  return (NYX_DEEP * pool * 0.35 + NYX_LILAC * star * 0.8) * uKindle * (1.0 - smoothstep(uGroundR - 0.25, uGroundR, r));
}
vec3 nyxWall(vec2 q) {
  float u = q.x, v = q.y;
  float n1 = vnoiseP(vec2(u * 10.0 + uTime * 0.05, v * 3.0 - uTime * 0.35), vec2(10.0, 64.0));
  float n2 = vnoiseP(vec2(u * 6.0 - uTime * 0.08, v * 5.0 - uTime * 0.6 + 3.0), vec2(6.0, 64.0));
  float mist = smoothstep(0.35, 0.85, n1 * 0.6 + n2 * 0.5);
  float body = smoothstep(0.0, 0.12, v) * (1.0 - smoothstep(0.4, 1.0, v));
  vec2 g = vec2(u * 40.0, v * 14.0 - uTime * 0.4), f = fract(g) - 0.5;
  float h = nyxHash(vec2(mod(floor(g.x), 40.0), floor(g.y)));
  float star = step(0.95, h) * exp(-dot(f, f) / 0.02) * (0.5 + 0.5 * sin(uTime * 4.0 + h * 50.0)) * (1.0 - v);
  vec3 col = mix(NYX_DEEP, NYX_LILAC, n2) * mist * body * 0.5 + NYX_STAR * star * 0.9;
  return col * clamp((uKindle * 1.25 - v) / 0.15, 0.0, 1.0);
}
void main() {
  if (uAura == 16) { vec3 c = uKind == 0 ? nyxGround(vP) : nyxWall(vP); o = vec4(c * fogFactorAt(vWorld), 1.0); return; }   // BUNNYFALL: Nyx's Veil, added whole
  if (uAura == 15) { vec3 c = uKind == 0 ? vec3(0.0) : haloRing(vP); o = vec4(c * fogFactorAt(vWorld), 1.0); return; }   // BUNNYFALL: the halo, added whole
  if (uAura == 14) { vec4 c = uKind == 0 ? sageGround(vP) : uKind == 1 ? sageWall(vP) : sageCard(vP, vS); float f = fogFactorAt(vWorld); o = vec4(c.rgb * f, c.a * f); return; }   // NIRNROOT-SAGE: premultiplied (AURA_LOOK shade), fogged to nothing; kindled within (the shade and the runes fade in, the low smoke rises, the puffs and the nirnroots by node's law)
  if (uAura == 13) { vec3 c = uKind == 0 ? witchGround(vP) : witchWall(vP); o = vec4(c * fogFactorAt(vWorld), 1.0); return; }   // WITCH1: Witchfire, added whole, kindled within
  if (uAura == 12) { vec4 c = uKind == 0 ? warrenGround(vP) : uKind == 1 ? warrenWall(vP) : warrenBunny(vP, vS); float f = fogFactorAt(vWorld); o = vec4(c.rgb * f, c.a * f); return; }   // WIKIMAID: premultiplied (AURA_LOOK shade), fogged to nothing; kindled within (the ground fades in, the sparkles rise, the rabbits come up - node's law)
  if (uAura == 4) { vec3 wl = uKind == 0 ? wingsGround(vP) : uKind == 1 ? wingStrand(vP, vS) : vS.y > 1.5 ? wingHalo(vP, vS.x) : wingMote(vP, vS); o = vec4(wl * fogFactorAt(vWorld), 1.0); return; }   // SERAPH-WINGS: added whole; kindled within (the strands unfurl)
  if (uAura == 3) {   // SHADOW-CLOAK: premultiplied - the light it adds, and how much the shadow covers; both fogged
    vec4 c = uKind == 0 ? cloakGround(vP) : uKind == 1 ? cloakWall(vP) : vS.y > 0.5 ? cloakShred(vP, vS) : cloakEmblem(vP, vS);
    float f = fogFactorAt(vWorld) * uKindle;
    o = vec4(c.rgb * f, c.a * f);
    return;
  }
  if (uAura == 5) { vec4 c = uKind == 0 ? resonanceGround(vP) : resonanceWall(vP); float f = fogFactorAt(vWorld); o = vec4(c.rgb * f, c.a * f); return; }   // CRYSTAL-FIST: premultiplied (AURA_LOOK shade), fogged to nothing; AUDIT: the columns rise as it kindles by node's counts (uResLit), the feet by uKindle
  if (uAura == 6) { vec3 c = uKind == 0 ? turningGround(vP) : turningWall(vP); o = vec4(c * fogFactorAt(vWorld), 1.0); return; }   // SD9c: added whole, kindled within (the ground fades in, the strip rises)
  if (uAura == 7) { vec3 c = uKind == 0 ? firstGround(vP) : firstWall(vP); o = vec4(c * fogFactorAt(vWorld), 1.0); return; }   // HOURS-FIRST: The First Hour, as The Turning Hour is drawn
  if (uAura == 8) { vec3 c = uKind == 0 ? maelstromGround(vP) : maelstromWall(vP); o = vec4(c * fogFactorAt(vWorld), 1.0); return; }   // SERPENT5: added whole, kindled within (the pool fades in, the spray rises)
  if (uAura == 9) { vec3 c = uKind == 0 ? beaconGround(vP) : beaconWall(vP); o = vec4(c * fogFactorAt(vWorld), 1.0); return; }   // EG-E2: Beaconlight, added whole, kindled within
  if (uAura == 10) { vec3 c = uKind == 0 ? stairGround(vP) : stairWall(vP); o = vec4(c * fogFactorAt(vWorld), 1.0); return; }   // EG-E2: The Burning Stair
  if (uAura == 11) { vec3 c = uKind == 0 ? dawnGround(vP) : dawnWall(vP); o = vec4(c * fogFactorAt(vWorld), 1.0); return; }   // EG-E2: Firstlight
  if (uAura == 2) { vec3 rad = uKind == 0 ? radianceGround(vP) : radianceWall(vP); o = vec4(rad * uKindle * fogFactorAt(vWorld), 1.0); return; }   // PRIMARCH
  if (uAura == 1) { vec3 ward = uKind == 0 ? wardGround(vP) : uKind == 1 ? wardWall(vP) : wardSymbol(vP, vS); o = vec4(ward * uKindle * fogFactorAt(vWorld), 1.0); return; }   // AEGIS
  // every rate a whole number of cycles over the clock, in turns a second times TAU - never a rounded radian rate, which
  // drifts off whole by its rounding times the period and steps the picture at the wrap
  float turn = uTime * TAU * ${AURA_TURN_HZ.toFixed(3)};   // the ring's own turn
  vec3 col;
  if (uKind == 0) {
    float r = length(vP), a = atan(vP.y, vP.x);
    if (r > uGroundR) discard;
    float u = fract((a + turn) / TAU);            // the angle, carried round with the turn
    // the fire in the band: noise flowing round the ring and outward, broken into tongues
    float flow = fbmP(vec2(u * ${AURA_ROUND.ground.toFixed(1)} + floor(uSeed * 7.0), r * 3.2 - uTime * ${AURA_FLOW.ground.toFixed(3)}), vec2(${AURA_ROUND.ground.toFixed(1)}, ${(AURA_FLOW.ground * AURA_CLOCK_PERIOD).toFixed(1)}));
    float band = 1.0 - smoothstep(0.0, 0.26, abs(r - uRingR - (flow - 0.5) * 0.16));   // edges in order: GLSL leaves smoothstep's reversed edges undefined
    float crest = 0.55 + 0.45 * sin(u * TAU * 7.0 - uTime * TAU * 1.5);   // bright crests chasing about it
    float heat = band * (0.35 + 0.65 * flow) * (0.7 + 0.3 * crest);
    // the embers: ten sparks circling in the band, each at a whole multiple of the turn and its own wander
    float ember = 0.0;
    for (int k = 0; k < 10; k++) {
      float fk = float(k), s = fract(sin(fk * 91.7 + uSeed * 13.1) * 43758.5);
      float ea = fk / 10.0 * TAU + turn * (1.0 + floor(s * 3.0)) + s * TAU;
      float er = uRingR + 0.12 * sin(uTime * TAU * 0.25 * (1.0 + fk * 0.5) + fk);
      vec2 ep = vec2(cos(ea), sin(ea)) * er;
      float d = length(vP - ep);
      ember += exp(-d * d * 900.0) * (0.6 + 0.4 * sin(uTime * TAU * 1.5 + fk * 3.0));
    }
    // the glow in the stone within, and the ring's edge soft
    float inner = 0.22 * (1.0 - smoothstep(0.0, uRingR, r)) * (0.8 + 0.2 * sin(uTime * TAU / 3.0 + uSeed));
    float edge = 1.0 - smoothstep(uGroundR - 0.35, uGroundR, r);
    col = fireRamp(clamp(heat * 1.05, 0.0, 1.0)) * heat * 0.95 + vec3(1.0, 0.72, 0.30) * ember * 1.2 + vec3(0.55, 0.08, 0.02) * inner;
    col *= edge;
  } else {
    float u = fract(vP.x + turn / TAU), v = vP.y;
    // TONGUES: noise stretched up the wall and scrolled up and round, swaying; a flame stands where the noise clears a
    // threshold rising with the height, so the tongues thin and part toward their tips, a hot heart where it clears most
    float sway = 0.012 * sin(v * 9.0 + uTime * TAU * 1.5 + u * TAU * 5.0);
    float n = fbmP(vec2((u + sway) * ${AURA_ROUND.flames.toFixed(1)} + floor(uSeed * 5.0), v * 1.3 - uTime * ${AURA_FLOW.rise.toFixed(3)}), vec2(${AURA_ROUND.flames.toFixed(1)}, ${(AURA_FLOW.rise * AURA_CLOCK_PERIOD).toFixed(1)}));
    float n2 = vnoiseP(vec2(u * ${AURA_ROUND.flicker.toFixed(1)}, v * 3.0 - uTime * ${AURA_FLOW.flicker.toFixed(3)}), vec2(${AURA_ROUND.flicker.toFixed(1)}, ${(AURA_FLOW.flicker * AURA_CLOCK_PERIOD).toFixed(1)}));
    float f = n * 0.8 + n2 * 0.25;
    float th = 0.28 + v * 0.62;
    float body = smoothstep(th - 0.06, th + 0.10, f);
    float core = smoothstep(th + 0.06, th + 0.25, f);
    float fade = pow(1.0 - v, 1.3);
    col = (fireRamp(0.3 + 0.45 * core) * body * 0.8 + vec3(1.0, 0.8, 0.45) * core * 0.3) * fade;
  }
  o = vec4(col * uKindle * fogFactorAt(vWorld), 1.0);
}`;

const NO_FOG_RANGE = new Float32Array([0, 1]);
const NO_FOCUS = new Float32Array(4);
const NO_HAZE = new Float32Array(8);
function mat4Multiply(out, a, b) {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return out;
}

export function auraFlameStrip() {
  const out = [];
  for (let i = 0; i < AURA_STEPS; i++) {
    const a = i / AURA_STEPS, b = (i + 1) / AURA_STEPS;
    out.push(a, 0, b, 0, b, 1, a, 0, b, 1, a, 1);
  }
  return new Float32Array(out);
}

export function auraGlyphCards(n) {
  const out = [];
  for (let k = 0; k < n; k++) for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) out.push(k * 2 + u, v);
  return new Float32Array(out);
}

export function auraCloakGrid() {
  const out = [];
  for (let j = 0; j < CLOAK_ROWS; j++) {
    const v0 = j / CLOAK_ROWS, v1 = (j + 1) / CLOAK_ROWS;
    for (let i = 0; i < CLOAK_ROUND; i++) {
      const u0 = i / CLOAK_ROUND, u1 = (i + 1) / CLOAK_ROUND;
      out.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    }
  }
  return new Float32Array(out);
}
export function auraWingsGrid() {
  const out = [];
  for (let k = 0; k < WING_STRAND_COUNT; k++) {
    const a = k * 2, b = k * 2 + 1;
    for (let j = 0; j < WING_SEGS; j++) {
      const t0 = j / WING_SEGS, t1 = (j + 1) / WING_SEGS;
      out.push(a, t0, b, t0, b, t1, a, t0, b, t1, a, t1);
    }
  }
  return new Float32Array(out);
}
export const AURA_CARDS = Math.max(...Object.values(AURA_LOOK).map((l) => l.glyphs + ('shreds' in l ? l.shreds : 0)));

export const CLOAK_REST_POSE = Object.freeze({ shoulders: Float32Array.of(0, CLOAK_SHOULDER_Y, 0, 1), head: Float32Array.of(0, CLOAK_HOOD_Y, 0, 0), kneeL: new Float32Array(3), kneeR: new Float32Array(3), torso: Float32Array.of(0, 1, 0, 0, 0, 1), wingBack: 0 });
export const CLOAK_BONES = Object.freeze(['bip01 l upperarm', 'bip01 r upperarm', 'bip01 neck', 'bip01 head', 'bip01 l calf', 'bip01 r calf', 'bip01 spine2']);
export const CLOAK_SHOULDER_HALF = 0.2;
export const CLOAK_ACROSS = Object.freeze([0.8, 1.25]);
export const CLOAK_HEAD_ABOVE = 0.09;

export function auraCapePose(bones, out = null) {
  const L = bones?.['bip01 l upperarm'], R = bones?.['bip01 r upperarm'], N = bones?.['bip01 neck'], H = bones?.['bip01 head'];
  if (!L || !R || !H) return null;
  const o = out ?? { shoulders: new Float32Array(4), head: new Float32Array(4), kneeL: new Float32Array(3), kneeR: new Float32Array(3), torso: new Float32Array(6) };
  const half = Math.hypot(L[0] - R[0], L[1] - R[1], L[2] - R[2]) / 2;
  const S = o.shoulders, Hd = o.head;
  S[0] = (L[0] + R[0]) / 2; S[1] = Math.max((L[1] + R[1]) / 2, CLOAK_SHOULDER_Y * 0.4); S[2] = (L[2] + R[2]) / 2; S[3] = Math.max(CLOAK_ACROSS[0], Math.min(CLOAK_ACROSS[1], half / CLOAK_SHOULDER_HALF));
  const ux = N ? H[0] - N[0] : 0, uy = N ? H[1] - N[1] : 1, uz = N ? H[2] - N[2] : 0, ul = Math.hypot(ux, uy, uz) || 1;
  Hd[0] = H[0] + (ux / ul) * CLOAK_HEAD_ABOVE; Hd[1] = Math.max(H[1] + (uy / ul) * CLOAK_HEAD_ABOVE, S[1] + 0.18); Hd[2] = H[2] + (uz / ul) * CLOAK_HEAD_ABOVE; Hd[3] = 0;
  o.kneeL.set(bones['bip01 l calf'] ?? [0, 0, 0]);
  o.kneeR.set(bones['bip01 r calf'] ?? [0, 0, 0]);
  auraTorso(L, R, bones['bip01 spine2'] ?? null, N ?? null, H, o.torso ?? (o.torso = new Float32Array(6)));
  o.sunk = bones.sunk === true;
  o.wingBack = Number.isFinite(bones.wingBack) ? bones.wingBack : 0;
  return o;
}
export function auraTorso(L, R, spine, neck, head, out) {
  const lo = spine && neck ? spine : neck, hi = spine && neck ? neck : head;
  let ux = lo ? hi[0] - lo[0] : 0, uy = lo ? hi[1] - lo[1] : 1, uz = lo ? hi[2] - lo[2] : 0;
  let rx = R[0] - L[0], ry = R[1] - L[1], rz = R[2] - L[2];
  let fx = ry * uz - rz * uy, fy = rz * ux - rx * uz, fz = rx * uy - ry * ux;
  const fl = Math.hypot(fx, fy, fz);
  if (!(fl > 1e-6) || !(Math.hypot(ux, uy, uz) > 1e-6)) { out.set(CLOAK_REST_POSE.torso); return out; }
  fx /= fl; fy /= fl; fz /= fl;
  ux = fy * rz - fz * ry; uy = fz * rx - fx * rz; uz = fx * ry - fy * rx;
  const ul = Math.hypot(ux, uy, uz);
  if (!(ul > 1e-6) || uy / ul < 0.2) { out.set(CLOAK_REST_POSE.torso); return out; }
  out[0] = ux / ul; out[1] = uy / ul; out[2] = uz / ul; out[3] = fx; out[4] = fy; out[5] = fz;
  return out;
}

export const EOTB_FIGURE = Object.freeze({ mpp: 0.019, shoulder: 86, neck: 91, head: 96, spine: 75, beast: 0.68 });
export function auraSpriteBones(fig) {
  if (!fig || !Number.isFinite(fig.base) || !(fig.mpp > 0)) return null;
  const m = fig.mpp * (fig.beast === true ? EOTB_FIGURE.beast : 1), at = (px) => fig.base + px * m, half = CLOAK_SHOULDER_HALF * m / EOTB_FIGURE.mpp;
  return {
    'bip01 l upperarm': [-half, at(EOTB_FIGURE.shoulder), 0], 'bip01 r upperarm': [half, at(EOTB_FIGURE.shoulder), 0],
    'bip01 neck': [0, at(EOTB_FIGURE.neck), 0], 'bip01 head': [0, at(EOTB_FIGURE.head), 0], 'bip01 spine2': [0, at(EOTB_FIGURE.spine), 0],
    'bip01 l calf': null, 'bip01 r calf': null, sunk: at(EOTB_FIGURE.shoulder) < CLOAK_SHOULDER_Y * 0.4, wingBack: WING_SPRITE_BACK * m / EOTB_FIGURE.mpp,
  };
}
export const auraSpritePosed = (w, fig, face = null) => (fig || face
  ? { feet: w.at, yaw: face ? face.yaw : w.yaw, turn: face ? face.turn : null, bones: fig ? auraSpriteBones(fig) : null }
  : null);
export const WING_LIGHT = Object.freeze({ range: 4.5, rgb: Object.freeze([0.7, 0.53, 0.24]), lift: 0.15, back: 0.35, max: 3, reach: 40 });
/** @param {any[]} wearers @param {number[]|Float32Array|null} eye @param {any[]} out */
export function auraWingLights(wearers, eye, out) {
  out.length = 0;
  if (!Array.isArray(wearers) || !eye) return out;
  const L = WING_LIGHT;
  for (const w of wearers) {
    if (!w || auraLookOf(w.aura).mesh !== 'wings' || !Array.isArray(w.at) || w.cape?.sunk === true) continue;
    const k = Number.isFinite(w.kindle) ? Math.max(0, Math.min(1, w.kindle)) : 1;
    if (!(k > 0)) continue;
    const yaw = Number.isFinite(w.yaw) ? w.yaw : 0, c = Math.cos(yaw), sn = Math.sin(yaw), pose = w.cape ?? CLOAK_REST_POSE, sh = pose.shoulders;
    const back = L.back + (Number.isFinite(pose.wingBack) ? pose.wingBack : 0);
    const x = w.at[0] + c * sh[0] + sn * (sh[2] - back), y = w.at[1] + sh[1] + L.lift, z = w.at[2] - sn * sh[0] + c * (sh[2] - back);
    const d = Math.hypot(x - eye[0], y - eye[1], z - eye[2]);
    if (!(d <= L.reach)) continue;
    out.push({ x, y, z, range: L.range * (0.5 + 0.5 * k), color: [L.rgb[0] * k, L.rgb[1] * k, L.rgb[2] * k], carried: true, aura: true, _d: d });
  }
  out.sort((a, b) => a._d - b._d);
  if (out.length > L.max) out.length = L.max;
  return out;
}
export const AURA_SADDLE_M = 0.81;

export function auraCapeStep(w, posed, crouch = 1) {
  if (posed?.feet && Number.isFinite(posed.yaw)) { w.at[0] = posed.feet[0]; w.at[1] = posed.feet[1]; w.at[2] = posed.feet[2]; w.yaw = posed.yaw; }
  w.turnYaw = Number.isFinite(posed?.turn) ? posed.turn : null;
  const o = posed?.bones ? auraCapePose(posed.bones, w.cape && w.cape !== CLOAK_REST_POSE ? w.cape : null) : null;
  if (o) { w.cape = o; return w; }
  const k = Number.isFinite(crouch) ? Math.max(0.4, Math.min(1, crouch)) : 1, lift = w.mounted === true ? AURA_SADDLE_M : 0;
  if (k >= 1 && !lift) { w.cape = CLOAK_REST_POSE; return w; }
  const c = w.cape && w.cape !== CLOAK_REST_POSE ? w.cape : { shoulders: new Float32Array(4), head: new Float32Array(4), kneeL: new Float32Array(3), kneeR: new Float32Array(3), torso: new Float32Array(6) };
  c.shoulders.fill(0); c.shoulders[1] = CLOAK_SHOULDER_Y * k + lift; c.shoulders[3] = 1; c.head.fill(0); c.head[1] = CLOAK_HOOD_Y * k + lift; c.kneeL.fill(0); c.kneeR.fill(0); c.sunk = false; c.wingBack = 0;
  (c.torso ?? (c.torso = new Float32Array(6))).set(CLOAK_REST_POSE.torso);
  w.cape = c;
  return w;
}

export const CLOAK_SWING = Object.freeze({ trail: 0.05, trailMax: 0.42, lift: 0.04, liftMax: 0.25, twist: 0.12, twistMax: 0.6, hz: 1.2, damp: 0.45, smooth: 0.1, snap: 0.5, snapV: 30 });

const clampTo = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export function auraMotionStep(w, t) {
  const S = CLOAK_SWING;
  const m = w.motion ?? (w.motion = { t: null, at: [0, 0, 0], yaw: 0, v: [0, 0, 0], yr: 0, p: [0, 0, 0, 0], q: [0, 0, 0, 0], goal: [0, 0, 0, 0] });
  const yaw = Number.isFinite(w.turnYaw) ? w.turnYaw : Number.isFinite(w.yaw) ? w.yaw : 0, at = w.at;
  const dt = m.t === null ? 0 : t - m.t;
  const jump = Math.hypot(at[0] - m.at[0], at[1] - m.at[1], at[2] - m.at[2]);
  if (m.t !== null && dt === 0) return w;
  if (m.t === null || !(dt > 0) || dt > 0.5) { m.v.fill(0); m.yr = 0; m.p.fill(0); m.q.fill(0); }
  else {
    const a = 1 - Math.exp(-dt / S.smooth);
    if (jump <= Math.max(S.snap, S.snapV * dt)) { for (let i = 0; i < 3; i++) m.v[i] += ((at[i] - m.at[i]) / dt - m.v[i]) * a; m.yr += (wrapAngle(yaw - m.yaw) / dt - m.yr) * a; }
    const fwd = m.v[0] * Math.sin(yaw) + m.v[2] * Math.cos(yaw), right = m.v[0] * Math.cos(yaw) - m.v[2] * Math.sin(yaw);
    const g = m.goal;
    g[0] = clampTo(-right * S.trail, -S.trailMax, S.trailMax); g[1] = clampTo(-fwd * S.trail, -S.trailMax, S.trailMax);
    g[2] = clampTo(-m.v[1] * S.lift, -0.05, S.liftMax); g[3] = clampTo(-m.yr * S.twist, -S.twistMax, S.twistMax);
    const k = (2 * Math.PI * S.hz) ** 2, c = 2 * S.damp * 2 * Math.PI * S.hz;
    for (let n = Math.ceil(dt / (1 / 60)), h = dt / n; n > 0; n--) for (let i = 0; i < 4; i++) { m.q[i] += (k * (g[i] - m.p[i]) - c * m.q[i]) * h; m.p[i] += m.q[i] * h; }
  }
  m.t = t; m.at[0] = at[0]; m.at[1] = at[1]; m.at[2] = at[2]; m.yaw = yaw;
  const sw = w.swing ?? (w.swing = { x: 0, z: 0, lift: 0, twist: 0 });
  sw.x = m.p[0]; sw.z = m.p[1]; sw.lift = m.p[2]; sw.twist = m.p[3];
  return w;
}

export function auraBeastStep(w, beast, t) {
  if (w.beastAt === undefined) w.beastAt = beast ? t - CLOAK_RIP_S : null;
  if (beast) {
    if (w.beastAt === null) w.beastAt = t;
    const s = Math.max(0, t - w.beastAt);
    w.torn = s <= CLOAK_RIP_S ? s : CLOAK_RIP_S + ((s - CLOAK_RIP_S) % AURA_CLOCK_PERIOD);
  } else {
    if (w.beastAt !== null) { w.beastAt = null; w.since = t; }
    w.torn = -1;
  }
  return w;
}

export const AURA_KINDS = Object.freeze([...new Set(Object.values(AURA_LOOK).map((l) => l.kind))]);
const AURA_UNIFORMS = Object.freeze(['uVP', 'uKind', 'uAt', 'uGroundR', 'uRingR', 'uFlameH', 'uLift', 'uTime', 'uSeed', 'uKindle', 'uFogMode', 'uFogDensity', 'uFogRange', 'uCamPos', 'uFocus', 'uJungleHaze', 'uYaw', 'uSide', 'uTorn', 'uSwing', 'uCapeS', 'uCapeH', 'uKneeL', 'uKneeR', 'uTorsoU', 'uTorsoF', 'uWingBack', 'uResLit', 'uWarren', 'uWarrenPrint', 'uSage', 'uSageLook']);
const _lookPrograms = new Map();
// Each look compiles alone with uAura made a constant, because the whole shader takes seconds to compile.
/** @param {number} kind @returns {ReadonlyArray<readonly [string, string]>} */
export function auraPrograms(kind) {
  let p = _lookPrograms.get(kind);
  if (!p) {
    // uAura must be declared exactly once: a second match, such as a comment quoting it, would be replaced instead.
    const one = (src) => { if (src.split('uniform int uAura;').length !== 2) throw new Error('aura ring: uAura not declared exactly once'); return src.replace('uniform int uAura;', `const int uAura = ${kind | 0};`); };
    _lookPrograms.set(kind, (p = Object.freeze([Object.freeze([one(AURA_VS), one(AURA_FS)])])));
  }
  return p;
}
export const AURA_PROGRAMS = /** @type {ReadonlyArray<readonly [string, string]>} */ (Object.freeze(AURA_KINDS.flatMap((k) => auraPrograms(k))));

export class AuraRingRenderer {
  constructor(gl) {
    this.gl = gl;
    this._looks = new Map();
    this._frame = 0;
    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);
    this.quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    this.flameVao = gl.createVertexArray();
    gl.bindVertexArray(this.flameVao);
    this.flameBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.flameBuf);
    gl.bufferData(gl.ARRAY_BUFFER, auraFlameStrip(), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    this.glyphVao = gl.createVertexArray();
    gl.bindVertexArray(this.glyphVao);
    this.glyphBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.glyphBuf);
    gl.bufferData(gl.ARRAY_BUFFER, auraGlyphCards(AURA_CARDS), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    this.cloakVao = gl.createVertexArray();
    gl.bindVertexArray(this.cloakVao);
    this.cloakBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.cloakBuf);
    gl.bufferData(gl.ARRAY_BUFFER, auraCloakGrid(), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    this.wingsVao = gl.createVertexArray();
    gl.bindVertexArray(this.wingsVao);
    this.wingsBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.wingsBuf);
    gl.bufferData(gl.ARRAY_BUFFER, auraWingsGrid(), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    this._vp = new Float32Array(16);
    this._resLit = new Float32Array(RESONANCE_COLUMNS);
    this._warren = new Float32Array(WARREN_BUNNIES * 4);
    this._warrenPrints = new Float32Array(WARREN_BUNNIES * WARREN_PRINTS * 2);
    this._sage = new Float32Array(SAGE_CARDS * 4);
    this._sageLook = new Float32Array(SAGE_CARDS * 4);
    this.drawn = 0;
  }

  /** @param {number} kind @param {boolean} [need] */
  programOf(kind, need = false) {
    let door = this._looks.get(kind);
    if (!door) {
      const gl = this.gl;
      door = compiledPass(gl, auraPrograms(kind), () => {
        const [[vs, fs]] = auraPrograms(kind);
        const prog = buildProgram(gl, vs, fs, 'aura ring');
        /** @type {Record<string, any>} */ const u = {};
        for (const n of AURA_UNIFORMS) u[n] = gl.getUniformLocation(prog, n);
        return { prog, u, frame: -1 };
      }, (e) => console.warn(`[aura] look ${kind} would not build`, e?.message ?? e));
      this._looks.set(kind, door);
    }
    return door(need);
  }

  kindOf(prog) {
    for (const [kind, door] of this._looks) if (door.settled && door()?.prog === prog) return kind;
    return null;
  }

  _bind(P, eye, seconds, fog) {
    const gl = this.gl, U = P.u;
    gl.useProgram(P.prog);
    if (P.frame === this._frame) return;
    P.frame = this._frame;
    gl.uniformMatrix4fv(U.uVP, false, this._vp);
    gl.uniform1f(U.uTime, auraClock(seconds));
    gl.uniform1f(U.uGroundR, AURA_GROUND_R); gl.uniform1f(U.uLift, AURA_LIFT_M);
    gl.uniform1i(U.uFogMode, fog ? fog.mode : 0);
    gl.uniform1f(U.uFogDensity, fog?.density ?? 0);
    gl.uniform2fv(U.uFogRange, fog?.range ?? NO_FOG_RANGE);
    gl.uniform3fv(U.uCamPos, fog?.camPos ?? eye);
    if (U.uFocus) gl.uniform4fv(U.uFocus, fog?.focus ?? NO_FOCUS);
    if (U.uJungleHaze) gl.uniform4fv(U.uJungleHaze, fog?.haze ?? NO_HAZE);
  }

  draw(list, proj, view, eye, seconds, fog = null) {
    this.drawn = 0;
    if (!Array.isArray(list) || !list.length) return;
    const gl = this.gl;
    mat4Multiply(this._vp, proj, view);
    this._frame++;
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -4);
    const camAt = fog?.camPos ?? eye;
    let bound = null;
    try {
      // Farthest first: the shadow of a cloak covers what is behind it, so the nearer wearer draws last.
      for (let i = list.length - 1; i >= 0; i--) {
        const w = list[i];
        if (!w || !Array.isArray(w.at)) continue;
        const look = auraLookOf(w.aura);
        const P = this.programOf(look.kind);
        if (!P) continue;
        if (P !== bound) { this._bind(P, eye, seconds, fog); bound = P; }
        const U = P.u;
        gl.uniform3f(U.uAt, w.at[0], w.at[1], w.at[2]);
        gl.uniform1f(U.uSeed, Number.isFinite(w.seed) ? w.seed : 0);
        gl.uniform1f(U.uKindle, Math.max(0, Math.min(1, Number.isFinite(w.kindle) ? w.kindle : 1)));
        gl.uniform1f(U.uRingR, look.ringR); gl.uniform1f(U.uFlameH, look.flameH);
        gl.uniform1f(U.uYaw, Number.isFinite(w.yaw) ? w.yaw : 0);
        const torn = Number.isFinite(w.torn) ? w.torn : -1;
        gl.uniform1f(U.uTorn, torn);
        const sw = w.swing, pose = w.cape ?? CLOAK_REST_POSE;
        gl.uniform4f(U.uSwing, sw?.x || 0, sw?.z || 0, sw?.lift || 0, sw?.twist || 0);
        gl.uniform4fv(U.uCapeS, pose.shoulders); gl.uniform4fv(U.uCapeH, pose.head);
        gl.uniform3fv(U.uKneeL, pose.kneeL); gl.uniform3fv(U.uKneeR, pose.kneeR);
        const torso = pose.torso ?? CLOAK_REST_POSE.torso;
        gl.uniform3f(U.uTorsoU, torso[0], torso[1], torso[2]); gl.uniform3f(U.uTorsoF, torso[3], torso[4], torso[5]);
        gl.uniform1f(U.uWingBack, Number.isFinite(pose.wingBack) ? pose.wingBack : 0);
        if (look === AURA_LOOK.resonance) gl.uniform1fv(U.uResLit, resonanceLitInto(this._resLit, resonanceClock(seconds, w.seed), Math.max(0, Math.min(1, Number.isFinite(w.kindle) ? w.kindle : 1))));
        if (look === AURA_LOOK.lilacwarren) {
          const t = warrenClock(seconds, w.seed);
          gl.uniform4fv(U.uWarren, warrenDepthOrder(warrenBunniesInto(this._warren, t, Math.max(0, Math.min(1, Number.isFinite(w.kindle) ? w.kindle : 1))), w.at, camAt));
          gl.uniform2fv(U.uWarrenPrint, warrenPrintsInto(this._warrenPrints, t));
        }
        if (look === AURA_LOOK.sagesmoke) {
          sageCardsInto(this._sage, this._sageLook, sageClock(seconds, w.seed), Math.max(0, Math.min(1, Number.isFinite(w.kindle) ? w.kindle : 1)), w.at, camAt);
          gl.uniform4fv(U.uSage, this._sage); gl.uniform4fv(U.uSageLook, this._sageLook);
        }
        if (look.shade) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform1i(U.uKind, 0);
        gl.bindVertexArray(this.quadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        if (look.mesh === 'cloak') this._drawCloak(w, look, torn, camAt, U);
        else {
          const wings = look.mesh === 'wings', closed = wings && pose.sunk === true;
          if (wings) gl.disable(gl.POLYGON_OFFSET_FILL);
          gl.uniform1i(U.uKind, 1);
          gl.bindVertexArray(wings ? this.wingsVao : this.flameVao);
          if (!closed) gl.drawArrays(gl.TRIANGLES, 0, wings ? WING_VERTS : AURA_STEPS * 6);
          if (look.glyphs && !closed) {
            gl.uniform1i(U.uKind, 2);
            gl.bindVertexArray(this.glyphVao);
            gl.drawArrays(gl.TRIANGLES, 0, look.glyphs * 6);
          }
          if (wings) gl.enable(gl.POLYGON_OFFSET_FILL);
        }
        if (look.shade) gl.blendFunc(gl.ONE, gl.ONE);
        this.drawn++;
      }
    } finally {
      gl.bindVertexArray(null);
      gl.cullFace(gl.BACK);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.enable(gl.CULL_FACE);
      gl.depthMask(true);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.disable(gl.BLEND);
    }
  }

  // The lining draws first with front faces culled, then the outside with back faces culled, so the mesh winding
  // names each side.
  _drawCloak(w, look, torn, eye, U) {
    const gl = this.gl;
    const folded = w.mounted === true || w.cape?.sunk === true;
    const dx = eye[0] - w.at[0], dz = eye[2] - w.at[2], yaw = Number.isFinite(w.yaw) ? w.yaw : 0, hd = (w.cape ?? CLOAK_REST_POSE).head, c = Math.cos(yaw), sn = Math.sin(yaw);
    const front = dx * sn + dz * c > 0, emblemsFirst = !folded && front && torn < CLOAK_RIP_S;
    gl.disable(gl.POLYGON_OFFSET_FILL);
    if (emblemsFirst) { gl.uniform1i(U.uKind, 2); gl.bindVertexArray(this.glyphVao); gl.drawArrays(gl.TRIANGLES, 0, look.glyphs * 6); }
    if (torn < CLOAK_RIP_S && !folded && Math.hypot(dx - c * hd[0] - sn * hd[2], eye[1] - w.at[1] - hd[1], dz + sn * hd[0] - c * hd[2]) >= CLOAK_INSIDE_M) {
      gl.uniform1i(U.uKind, 1);
      gl.bindVertexArray(this.cloakVao);
      gl.enable(gl.CULL_FACE);
      for (let side = 0; side < 2; side++) { gl.uniform1i(U.uSide, side); gl.cullFace(side === 0 ? gl.FRONT : gl.BACK); gl.drawArrays(gl.TRIANGLES, 0, CLOAK_ROUND * CLOAK_ROWS * 6); }
      gl.disable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
    }
    const from = emblemsFirst || torn >= CLOAK_RIP_S ? look.glyphs : 0, to = look.glyphs + (torn >= 0 ? look.shreds : 0);
    if (!folded && to > from) { gl.uniform1i(U.uKind, 2); gl.bindVertexArray(this.glyphVao); gl.drawArrays(gl.TRIANGLES, from * 6, (to - from) * 6); }
    gl.enable(gl.POLYGON_OFFSET_FILL);
  }
}
