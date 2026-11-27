// @ts-check
import { BARREL, SHIP_TOUGHNESS, PLAYER_CREW_TOUGHNESS } from './navalShips.js';

export const SHIP_STATES = Object.freeze({ afloat: 'afloat', struck: 'struck', sinking: 'sinking', sunk: 'sunk', prize: 'prize', wrecked: 'wrecked' });
export const STRUCK_AT = 0.25;
export const SINK_SECONDS = 22;
export const SINK_LIST = 32;
export const SINK_PITCH = 20;
export const SINK_CLEAR = 2;
export const WATERLINE_BAND = 1.1;
export const HOLED_BONUS = 0.4;
export const FIRE_CHANCE = 0.06;
export const FIRE_HP = 1.4;
export const FIRE_SECONDS = 15;
export const FIRE_STACK = 3;
export const FIRE_SAIL = 0.5;
export const FIRE_CREW_S = 10;
export const BRACE_TAKEN = 0.5;
export const WRECKED_OARS = 0.35;
export const BARE_POLES = 0.35;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** @param {number} pointOverSea */
export function hitZone(pointOverSea) {
  return pointOverSea <= WATERLINE_BAND ? 'holed' : 'hull';
}

export function sinkAngles(seed, k) {
  const kk = clamp(Number.isFinite(k) ? k : 0, 0, 1);
  return { roll: (seed & 1 ? 1 : -1) * SINK_LIST * kk, pitch: (seed & 2 ? -1 : 1) * SINK_PITCH * kk };
}
export const sinkDepth = (under, k) => Math.max(0, under) * clamp(Number.isFinite(k) ? k : 0, 0, 1) ** 2;

export function fireOf(kind) {
  return kind === 'barrel' || kind === 2 ? { hp: BARREL.burnPerSecond, t: BARREL.burn } : { hp: FIRE_HP, t: FIRE_SECONDS };
}

export function shotDamage(gun, zone, { braced = false, roll = 0.5, tough = SHIP_TOUGHNESS, weight = 1 } = {}) {
  const k = (braced ? BRACE_TAKEN : 1) * (Number.isFinite(weight) && weight > 0 ? weight : 1);
  const r = clamp(roll, 0, 1);
  const spread = 0.85 + 0.3 * r;
  if (zone === 'rig') return { hull: 0, sail: Math.round(Math.max(gun.sail * 2, gun.hull * 0.5) * k * spread), crew: ballMen(shotMen(gun, zone), r, tough) };
  const holed = zone === 'holed' ? 1 + HOLED_BONUS : 1;
  return { hull: Math.round(gun.hull * holed * k * spread), sail: Math.round(gun.sail * 0.25 * k * spread), crew: ballMen(shotMen(gun, zone), r, tough) };
}
// Peer hits carry this count before toughness; the ship owner applies `ballMen`, so every build takes the same men.
export const shotMen = (gun, zone) => (zone === 'rig' ? (gun.crew > 0 ? 1 : 0) : gun.crew);
export const ballMen = (men, roll, tough = SHIP_TOUGHNESS) => (men > 0 ? Math.floor(men / tough + clamp(roll, 0, 0.999999)) : 0);
export const playerMen = (men, roll) => ballMen(men, roll, PLAYER_CREW_TOUGHNESS);

/** @param {{ hullHp: number, sailHp: number, crew: number, player?: boolean }} spec */
export function createShipDamage({ hullHp, sailHp, crew, player = false }) {
  /** @type {{ maxHull: number, maxSail: number, maxCrew: number, hull: number, sail: number, crew: number, fires: { hp: number, t: number }[], crewBurn: number, wound: number, state: string, sinkT: number, lastHitAt: number }} */
  const s = {
    maxHull: Math.max(1, hullHp), maxSail: Math.max(0, sailHp), maxCrew: Math.max(0, crew),
    hull: Math.max(1, hullHp), sail: Math.max(0, sailHp), crew: Math.max(0, crew),
    fires: [], crewBurn: 0, wound: 0, state: SHIP_STATES.afloat, sinkT: 0, lastHitAt: -Infinity,
  };
  const ignite = (kind) => {
    const f = fireOf(kind);
    if (s.fires.length < FIRE_STACK) { s.fires.push(f); return; }
    const harm = (x) => x.hp * x.t;
    let low = 0;
    for (let i = 1; i < s.fires.length; i++) if (harm(s.fires[i]) < harm(s.fires[low])) low = i;
    if (harm(s.fires[low]) < harm(f)) s.fires[low] = f;
  };
  const douse = () => { s.fires = []; s.crewBurn = 0; };
  const unmanned = () => s.maxCrew > 0 && s.crew <= 0;
  const d = {
    get state() { return s.state; },
    get hull() { return s.hull; }, get maxHull() { return s.maxHull; },
    get sail() { return s.sail; }, get maxSail() { return s.maxSail; },
    get crew() { return s.crew; }, get maxCrew() { return s.maxCrew; },
    get fire() { return s.fires.reduce((m, f) => Math.max(m, f.t), 0); },
    get fires() { return s.fires.length; },
    get sinkT() { return s.sinkT; },
    get lastHitAt() { return s.lastHitAt; },
    hullShare: () => s.hull / s.maxHull,
    sailShare: () => (s.maxSail > 0 ? s.sail / s.maxSail : 1),
    crewShare: () => (s.maxCrew > 0 ? s.crew / s.maxCrew : 1),
    wayShare: () => (s.maxSail > 0 ? BARE_POLES + (1 - BARE_POLES) * (s.sail / s.maxSail) : 1),
    fighting: () => s.state === SHIP_STATES.afloat,
    apply(hurt, now = 0, { floor = 0 } = {}) {
      if (s.state === SHIP_STATES.sunk || s.state === SHIP_STATES.prize) return null;
      s.lastHitAt = now;
      s.hull = Math.max(Math.min(s.hull, floor), s.hull - Math.max(0, hurt.hull | 0));
      s.sail = Math.max(0, s.sail - Math.max(0, hurt.sail | 0));
      s.crew = Math.max(0, s.crew - Math.max(0, hurt.crew | 0));
      if (hurt.fire && !(floor > 0 && s.state === SHIP_STATES.struck)) ignite(hurt.fire);
      return d.settle();
    },
    douse,
    settle() {
      const was = s.state;
      if (player) {
        if (s.hull <= 0 && s.state !== SHIP_STATES.wrecked) s.state = SHIP_STATES.wrecked;
      } else if (s.state === SHIP_STATES.afloat || s.state === SHIP_STATES.struck) {
        if (s.hull <= 0) { s.state = SHIP_STATES.sinking; s.sinkT = 0; }
        else if (s.state === SHIP_STATES.afloat && s.hull <= s.maxHull * STRUCK_AT) { s.state = SHIP_STATES.struck; douse(); }
        else if (s.state === SHIP_STATES.afloat && unmanned()) s.state = SHIP_STATES.struck;
      }
      return s.state !== was ? s.state : null;
    },
    step(dt, now = 0) {
      const t = Math.max(0, dt);
      if (s.fires.length && s.state !== SHIP_STATES.sinking && s.state !== SHIP_STATES.sunk) {
        s.lastHitAt = now;
        for (const f of s.fires) {
          const burn = Math.min(f.t, t);
          f.t -= burn;
          s.hull = Math.max(0, s.hull - f.hp * burn);
          s.sail = Math.max(0, s.sail - FIRE_SAIL * burn);
          s.crewBurn += burn;
        }
        s.fires = s.fires.filter((f) => f.t > 1e-9);
        // `wound` carries a part of a man from fire to fire and is never reset when one burns out.
        while (s.crewBurn >= FIRE_CREW_S) { s.crewBurn -= FIRE_CREW_S; s.wound += 1 / (player ? PLAYER_CREW_TOUGHNESS : SHIP_TOUGHNESS); }
        while (s.wound >= 1 - 1e-9) { s.wound = Math.max(0, s.wound - 1); s.crew = Math.max(0, s.crew - 1); }
        if (!s.fires.length) s.crewBurn = 0;
        const change = d.settle();
        if (change) return change;
      }
      if (s.state === SHIP_STATES.sinking) {
        s.sinkT += t;
        if (s.sinkT >= SINK_SECONDS) { s.state = SHIP_STATES.sunk; return SHIP_STATES.sunk; }
      }
      return null;
    },
    sinkOn(dt) {
      if (s.state !== SHIP_STATES.sinking) return s.state === SHIP_STATES.sunk;
      s.sinkT = Math.min(SINK_SECONDS, s.sinkT + Math.max(0, Number.isFinite(dt) ? dt : 0));
      return s.sinkT >= SINK_SECONDS;
    },
    takePrize() { if (s.state !== SHIP_STATES.sunk && s.state !== SHIP_STATES.sinking) s.state = SHIP_STATES.prize; },
    scuttle() { if (s.state !== SHIP_STATES.sunk && s.state !== SHIP_STATES.sinking) { s.state = SHIP_STATES.sinking; s.sinkT = 0; } },
    repair({ hull = Infinity, sail = Infinity, crew = Infinity } = {}, { refloat = 0, douse: putOut = true } = {}) {
      s.hull = Math.min(s.maxHull, s.hull + Math.max(0, hull));
      s.sail = Math.min(s.maxSail, s.sail + Math.max(0, sail));
      s.crew = Math.min(s.maxCrew, s.crew + Math.max(0, crew));
      if (s.hull > 0 && putOut) douse();
      if (s.state === SHIP_STATES.wrecked && s.hull > s.maxHull * refloat && s.hull > 0) s.state = SHIP_STATES.afloat;
      if (s.state === SHIP_STATES.struck && s.hull > s.maxHull * STRUCK_AT && !unmanned()) s.state = SHIP_STATES.afloat;
    },
    discharge(crew) { if (Number.isFinite(crew)) s.crew = Math.max(0, Math.min(s.crew, crew)); },
    muster(crew) { if (Number.isFinite(crew)) s.crew = Math.min(s.maxCrew, Math.max(s.crew, crew)); },
    rewhole({ hullHp, sailHp }) {
      const h = Number.isFinite(hullHp) ? Math.max(1, hullHp) : s.maxHull, sl = Number.isFinite(sailHp) ? Math.max(0, sailHp) : s.maxSail;
      s.hull = (s.hull / s.maxHull) * h;
      s.sail = s.maxSail > 0 ? (s.sail / s.maxSail) * sl : sl;
      s.maxHull = h; s.maxSail = sl;
    },
    snapshot: () => ({ hull: Math.round(s.hull), sail: Math.round(s.sail), crew: s.crew, fire: +d.fire.toFixed(1), state: s.state }),

    // Persistence retains fractional damage and each fire; the compact wire snapshot stays unchanged.
    saveData: () => Object.assign(d.snapshot(), { hull: s.hull, sail: s.sail, fires: s.fires.map((f) => ({ ...f })), crewBurn: s.crewBurn }),
    restore(r) {
      if (!r || typeof r !== 'object') return;
      const num = (v, max) => (Number.isFinite(v) ? clamp(v, 0, max) : max);
      s.hull = num(r.hull, s.maxHull); s.sail = num(r.sail, s.maxSail); s.crew = Math.round(num(r.crew, s.maxCrew));
      douse();
      if (Array.isArray(r.fires)) {
        for (const f of r.fires.slice(0, FIRE_STACK)) {
          if (!f || !Number.isFinite(f.t) || !(f.t > 0) || (f.hp !== FIRE_HP && f.hp !== BARREL.burnPerSecond)) continue;
          s.fires.push({ hp: f.hp, t: Math.min(f.t, f.hp === FIRE_HP ? FIRE_SECONDS : BARREL.burn) });
        }
        if (s.fires.length && Number.isFinite(r.crewBurn)) s.crewBurn = clamp(r.crewBurn, 0, FIRE_CREW_S);
      } else {
        const fire = Number.isFinite(r.fire) ? clamp(r.fire, 0, FIRE_SECONDS) : 0;
        // Older saves carry a single ordinary fire in `fire`.
        if (fire > 0) s.fires.push({ hp: FIRE_HP, t: fire });
      }
      const st = Object.values(SHIP_STATES).includes(r.state) ? r.state : SHIP_STATES.afloat;
      const was = s.state;
      s.state = player ? (st === SHIP_STATES.wrecked || s.hull <= 0 ? SHIP_STATES.wrecked : SHIP_STATES.afloat) : st;
      if (s.state === SHIP_STATES.sinking && was !== SHIP_STATES.sinking) s.sinkT = 0;
    },
  };
  return d;
}

export const REPAIR_PRICE = Object.freeze({ hull: 7, sail: 4, crew: 30 });
export function repairCost(damage) {
  if (!damage) return 0;
  return Math.round((damage.maxHull - damage.hull) * REPAIR_PRICE.hull + (damage.maxSail - damage.sail) * REPAIR_PRICE.sail + (damage.maxCrew - damage.crew) * REPAIR_PRICE.crew);
}
