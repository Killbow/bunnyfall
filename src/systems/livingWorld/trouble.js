// @ts-check
// Trip trouble is a pure function of the trip, its party, and world data, so every client derives the same
// encounter for the same trip.
import { lwRng, textSeed } from './seed.js';
import { DAY_MIN } from './dayPlan.js';
import { WALK_TO_H, whenWalked, wayAt, dryStop, partyAt, NATIVE_PIXEL, innAhead, PATROL_RISK } from './trips.js';

export const RISK_PER_DAY = 0.09;
export const GROUND_RISK = Object.freeze({ road: 0.6, track: 0.9, open: 1.4 });
export const RISK_MAX = 0.55;
export const CAMP_SHARE = 0.3;
export const HALT_MIN = Object.freeze({ driven: 25, won: 60, fled: 15, fell: 45, robbed: 30 });
export const FIGHT_MIN = Object.freeze({ driven: 10, won: 25, fled: 8, fell: 20, robbed: 10 });
export const ROB_RATIO = 0.6;
export const FOES_MAX = 6;
const TROU = 0x54524f55;

/** @param {any} res */
export const strengthOf = (res) => (res?.cls != null ? 4 + 1.5 * (res.level ?? 1) : res?.job === 'merchant' ? 1.5 : 1);
/** @param {number} level */
export const foeStrength = (level) => 1 + 0.6 * Math.max(1, level);

/** @typedef {{ climateAt: (px: number, py: number) => number, foesOf: (q: { climateIndex: number, dungeonType?: number, minute: number, level: number, size: number, rolls: () => number }) => (number[] | null), foeLevel?: (type: number, level: number) => number, dies?: (res: any, trip: any) => boolean, diced?: (res: any, trip: any) => boolean, turnOf?: (encId: string) => ('won'|'lost'|null), covered?: (trip: any) => boolean, bandAt?: (trip: any, px: number, py: number, t: number) => ({ band: any, foes: number[], level: number } | null) }} TroubleWorld */

/**
 * @param {import('./trips.js').Trip} trip
 * @param {TroubleWorld} world
 */
export function troubleOf(trip, world) {
  if (trip.sea) return seaTrouble(trip, world);
  const walk = Math.max(0, trip.way.len - trip.trim0 - trip.trim1);
  if (!(walk > 0) || !(trip.pace > 0)) return null;
  const walkMin = walk / trip.pace;
  const days = Math.max(1, Math.ceil(walkMin / 720));
  // Whether, where, and how the encounter happens reads `diced`, which ignores the player's turns; only `dies`
  // decides who falls, so sparing a member never re-rolls the encounter.
  const fated = trip.party.filter((m) => (world.diced ?? world.dies)?.(m, trip)).map((m) => m.id);
  const dead = trip.party.filter((m) => world.dies?.(m, trip)).map((m) => m.id);
  if (trip.dive && (fated.length || dead.length)) return diveTrouble(trip, dead, world, fated);
  const rng = lwRng(textSeed(trip.id), TROU);
  const kinds = trip.way.kinds ?? [];
  const ground = kinds.length ? kinds.reduce((a, k) => a + (GROUND_RISK[/** @type {keyof typeof GROUND_RISK} */ (k)] ?? 1), 0) / kinds.length : 1;
  const risk = Math.min(RISK_MAX, RISK_PER_DAY * 2 * days * ground) * (world.covered?.(trip) ? PATROL_RISK : 1);
  const u = rng();
  if (!fated.length && !dead.length && u >= risk) return null;
  const leg = rng() < (fated.length ? 0.7 : 0.5) ? 'out' : 'back';
  const legStart = leg === 'out' ? trip.outT0 : trip.backT0;
  let wm = (0.15 + 0.7 * rng()) * walkMin;
  let t0 = whenWalked(legStart, wm), camp = false;
  const walkWm = wm, walkT0 = t0;
  const firstLight = whenWalked(legStart, 0);
  const dayEnd = Math.floor(firstLight / DAY_MIN) * DAY_MIN + WALK_TO_H * 60;
  const firstDay = Math.max(0, dayEnd - firstLight);
  if (rng() < CAMP_SHARE && firstDay > 0 && firstDay < walkMin) { wm = firstDay; t0 = dayEnd + 4 * 60; camp = true; }
  let s = leg === 'out' ? trip.trim0 + trip.pace * wm : trip.way.len - trip.trim1 - trip.pace * wm;
  if (camp && innAhead(trip.way, s, leg === 'out' ? 1 : -1, trip.trim0, trip.way.len - trip.trim1)) {
    wm = walkWm; t0 = walkT0; camp = false;
    s = leg === 'out' ? trip.trim0 + trip.pace * wm : trip.way.len - trip.trim1 - trip.pace * wm;
  }
  if (!camp && partyAt(trip, t0).inn) {
    const end = leg === 'out' ? trip.outT1 : trip.backT1;
    for (t0 = Math.ceil(t0); t0 < end && partyAt(trip, t0).inn; t0++);
    s = partyAt(trip, t0).s ?? s;
  }
  if (trip.way.dry) {
    const dir = leg === 'out' ? 1 : -1;
    const end = leg === 'out' ? trip.outT1 : trip.backT1;
    const dry = dryStop(trip.way, s, dir, trip.trim0, trip.way.len - trip.trim1);
    if (dry !== s) {
      s = dry;
      for (t0 = Math.ceil(t0); t0 < end; t0++) { const a = partyAt(trip, t0); if (a.s != null && dir * (a.s - s) >= 0) break; }
      t0 = Math.min(t0, end);
    }
  }
  const p = wayAt(trip.way, s);
  const px = Math.floor(p.x / NATIVE_PIXEL), py = 499 - Math.floor(p.z / NATIVE_PIXEL);
  const armed = trip.party.filter((m) => m.cls != null);
  const level = Math.max(1, ...armed.map((m) => m.level ?? 1), 2);
  const size = fated.length ? Math.min(FOES_MAX, trip.party.length + 2) : Math.min(FOES_MAX, 1 + Math.floor(rng() * (trip.party.length + 1)));
  const outlaws = world.bandAt?.(trip, px, py, t0) ?? null;
  const foes = outlaws ? outlaws.foes : world.foesOf({ climateIndex: world.climateAt(px, py), minute: t0, level, size, rolls: rng }) ?? [];
  const foeLv = outlaws ? outlaws.level : level;
  if (!foes.length && !fated.length && !dead.length) return null;
  /** @type {'driven'|'won'|'fled'|'fell'|'robbed'} */
  let shape;
  if (fated.length) shape = fated.includes(trip.leader.id) ? 'fell' : 'won';
  else {
    const sP = trip.party.reduce((a, m) => a + strengthOf(m), 0);
    const sF = foes.reduce((a, f) => a + foeStrength(outlaws ? foeLv : world.foeLevel?.(f, level) ?? level), 0);
    const pWin = sP / (sP + sF);
    if (outlaws && sP < ROB_RATIO * sF) shape = 'robbed';
    else {
      const r = rng();
      shape = r < 0.55 * pWin ? 'driven' : r < pWin ? 'won' : 'fled';
    }
  }
  /** @type {'driven'|'won'|'fled'|'fell'|'robbed'} */
  let kind = dead.includes(trip.leader.id) ? 'fell' : shape === 'fell' ? 'won' : shape;
  const turn = world.turnOf?.(`${trip.id}:e`) ?? null;
  if (turn === 'won' && kind !== 'fell') kind = 'won';
  else if (turn === 'lost' && (kind === 'driven' || kind === 'won')) kind = 'fled';
  return { id: `${trip.id}:e`, leg, camp, t0, t1: t0 + HALT_MIN[shape], fightEnd: t0 + FIGHT_MIN[shape], s, x: p.x, z: p.z, px, py,
    foes, level: foeLv, kind, shape, dead, ...(outlaws ? { band: outlaws.band.key, bandName: outlaws.band.name } : {}) };
}

/**
 * @param {import('./trips.js').Trip} trip
 * @param {string[]} dead
 * @param {TroubleWorld} world
 * @param {string[]} [fated]
 */
export function diveTrouble(trip, dead, world, fated = dead) {
  const dive = /** @type {{ t0: number, t1: number }} */ (trip.dive);
  const rng = lwRng(textSeed(trip.id), TROU, 0x64656570);
  const t0 = dive.t0 + (dive.t1 - dive.t0) * (0.2 + 0.6 * rng());
  const s = trip.way.len - trip.trim1;
  const p = wayAt(trip.way, s);
  const armed = trip.party.filter((m) => m.cls != null);
  const level = Math.max(1, ...armed.map((m) => m.level ?? 1), 2);
  const foes = world.foesOf({ climateIndex: -1, dungeonType: /** @type {any} */ (trip.to).dungeonType ?? 0, minute: t0, level, size: Math.min(FOES_MAX, trip.party.length + 2), rolls: rng }) ?? [];
  /** @type {'won'|'fell'} */
  const shape = fated.includes(trip.leader.id) ? 'fell' : 'won';
  /** @type {'won'|'fell'} */
  const kind = dead.includes(trip.leader.id) ? 'fell' : 'won';
  return { id: `${trip.id}:e`, leg: 'dive', camp: false, t0, t1: t0 + HALT_MIN[shape], fightEnd: t0 + FIGHT_MIN[shape], s, x: p.x, z: p.z,
    px: Math.floor(p.x / NATIVE_PIXEL), py: 499 - Math.floor(p.z / NATIVE_PIXEL), foes, level, kind, shape, dead, inside: true };
}

/**
 * @param {import('./trips.js').Trip} trip
 * @param {TroubleWorld} world
 */
export function seaTrouble(trip, world) {
  const dead = trip.party.filter((m) => world.dies?.(m, trip)).map((m) => m.id);
  if (!dead.length) return null;
  const rng = lwRng(textSeed(trip.id), TROU, 0x736561);
  const out = rng() < 0.6;
  const [a, b] = out ? [trip.outT0, trip.outT1] : [trip.backT0, trip.backT1];
  const t0 = a + (b - a) * (0.2 + 0.6 * rng());
  return { id: `${trip.id}:e`, leg: 'sea', camp: false, t0, t1: t0, fightEnd: t0, s: 0, x: 0, z: 0, px: -1, py: -1,
    foes: /** @type {number[]} */ ([]), level: 1, kind: /** @type {'fell'} */ ('fell'), dead, atSea: true };
}

/**
 * @param {import('./trips.js').Trip} trip
 * @param {ReturnType<typeof troubleOf>} enc
 */
export function troubledTrip(trip, enc) {
  if (!enc) return trip;
  const byId = new Map(trip.party.map((m) => [m.id, m]));
  if (enc.leg === 'sea') {
    return { ...trip, enc, fallen: enc.dead.map((id) => ({ res: byId.get(id), t: enc.t0, s: 0, atSea: true })).filter((f) => f.res), turned: false };
  }
  const shape = /** @type {any} */ (enc).shape ?? enc.kind;
  const fallAt = enc.t0 + FIGHT_MIN[shape] * 0.6;
  if (enc.leg === 'dive') {
    const fallen = enc.dead.map((id) => ({ res: byId.get(id), t: fallAt, s: enc.s, inside: true })).filter((f) => f.res);
    if (shape !== 'fell') return { ...trip, enc, fallen, turned: false };
    const walk = Math.max(0, trip.way.len - trip.trim0 - trip.trim1) / trip.pace;
    const backT0 = Math.min(trip.backT0, enc.t1);
    return { ...trip, enc, fallen, turned: false, backT0, backT1: whenWalked(backT0, walk), dive: { t0: /** @type {any} */ (trip.dive).t0, t1: backT0 } };
  }
  const fallen = enc.dead.map((id) => ({ res: byId.get(id), t: fallAt, s: enc.s })).filter((f) => f.res);
  const halt = { t0: enc.t0, t1: enc.t1, fightEnd: enc.fightEnd, s: enc.s, leg: enc.leg };
  const turned = enc.leg === 'out' && (enc.kind === 'fled' || enc.kind === 'fell');
  const robbed = enc.kind === 'robbed' ? { robbed: { t: enc.t0, by: enc.band } } : {};
  if (!turned && enc.leg === 'out' && enc.t1 > trip.outT1) return { ...trip, enc, halt, fallen, turned: false, outT1: Math.min(enc.t1, trip.backT0), ...robbed };
  if (!turned && enc.leg === 'back' && enc.t1 > trip.backT1) return { ...trip, enc, halt, fallen, turned: false, backT1: enc.t1, ...robbed };
  if (!turned) return { ...trip, enc, halt, fallen, turned: false, ...robbed };
  const home = Math.max(0, enc.s - trip.trim0) / trip.pace;
  const backT1 = whenWalked(enc.t1, home);
  return { ...trip, enc, halt, fallen, turned: true, outT1: enc.t0, backT0: enc.t1, backT1 };
}
