// @ts-check
// This word travels inside the `foes` frame of a cell, which the relay never reads,
// so this module stays out of the relay's bundle.
import { POSE_BOUND, POSE_Y_BOUND } from '../../net/wire.js';
import { SHIP_CLASSES, CROWNS } from './navalShips.js';
import { LOT_KEYS, SALVAGE_LOT, isSalvage } from './navalPlunder.js';
import { NOTORIETY } from './navalLaw.js';
import { DENSITY_KEYS } from './navalDirector.js';
import { REGION_NAMES } from '../../formats/mapsFile.js';
import { HULL_NAMES, HULL_VARIANT_COUNTS } from './comeSailAwayBoat.js';
import { TEMPERS } from './navalAI.js';
import { SHOT_CODES, SHOT_ORDER } from './shotKinds.js';

// An older build refuses a class row it does not know, and the whole word with it,
// so ships and casks of later classes go on h and j.
export const NAVAL_WIRE_OLD_CLASSES = 15;
export const NAVAL_SHARE_RADIUS = 1200;
export const NAVAL_WIRE_SHIPS = 8;
export const NAVAL_WIRE_VOLLEYS = 12;
export const NAVAL_WIRE_BARRELS = 8;
export const NAVAL_WIRE_CASKS = 12;
export const NAVAL_WIRE_SPENT = 8;
export const NAVAL_WIRE_GONE = 8;
export const NAVAL_VOLLEY_KEEP_MS = 1500;
export const TRAFFIC_DEFAULT = 'some';
export const NAVAL_HIT_MAX = 400;
export const WIRE_STATES = Object.freeze(['afloat', 'struck', 'sinking', 'sunk', 'prize', 'boarded']);
export const SIDE_CODES = Object.freeze(['starboard', 'port', 'bow', 'stern']);
export const NAVAL_GEN_MAX = 255;
export const TEMPER_CODES = Object.freeze(Object.values(TEMPERS));
export const MODE_CODES = Object.freeze(['cruise', 'engage', 'board', 'flee', 'answer', 'struck', 'prize', 'boarded']);

const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const inBounds = (p) => Math.abs(p[0]) <= POSE_BOUND && Math.abs(p[2]) <= POSE_BOUND && Math.abs(p[1]) <= POSE_Y_BOUND;
const pct = (v) => Math.max(0, Math.min(100, Math.round(v * 100)));
const U32 = 0xffffffff;

/**
 * @param {{ ships?: any[], volleys?: any[], barrels?: any[], me?: { hull: number, crippled: boolean, boarders: boolean, crew?: number, battle?: boolean, boatHull?: number } | null,
 *   law?: Record<string, number>, traffic?: string, casks?: { id: number, pos: number[], from: string, lot: string, deep?: boolean }[], spent?: number[],
 *   gone?: number[], laid?: string[] }} view
 */
export function navalWireRecord(view, toWire = (p) => p) {
  const s = [], v = [], b = [], k = [], d = [], e = [], o = [], h = [];
  for (const sh of view?.ships ?? []) {
    if (s.length + h.length >= NAVAL_WIRE_SHIPS) break;
    const cls = SHIP_CLASSES.findIndex((c) => c.id === sh.classId);
    if (cls < 0 || !Array.isArray(sh.pos) || !sh.pos.every(Number.isFinite)) continue;
    const p = toWire(sh.pos);
    (cls < NAVAL_WIRE_OLD_CLASSES ? s : h).push([sh.n | 0, cls, sh.variant | 0, r2(p[0]), r2(p[1]), r2(p[2]), r4(sh.yaw), r2(sh.speed), r2(sh.sails), pct(sh.hull), pct(sh.sail), pct(sh.crew),
      Math.max(0, WIRE_STATES.indexOf(sh.state)), Math.round(sh.heel * 10) / 10, sh.seed >>> 0, sh.fire ? 1 : 0, (sh.runOut | 0) & 15,
      Math.max(0, Math.min(NAVAL_GEN_MAX, sh.gen | 0)), Number.isInteger(sh.region) && sh.region >= 0 && sh.region < REGION_NAMES.length ? sh.region : -1]);
    const temper = TEMPER_CODES.indexOf(sh.temper);
    if (temper >= 0) k.push([sh.n | 0, temper, Math.max(0, MODE_CODES.indexOf(sh.mode)), Number.isInteger(sh.struckTo) && sh.struckTo >= 0 && sh.struckTo <= 0xffff ? sh.struckTo : -1]);
    if (sh.deep) d.push(sh.n | 0);
  }
  for (const vo of view?.volleys ?? []) {
    if (v.length >= NAVAL_WIRE_VOLLEYS) break;
    const side = SIDE_CODES.indexOf(vo.side);
    if (side < 0 || !Array.isArray(vo.pos)) continue;
    const p = toWire(vo.pos);
    v.push([vo.id >>> 0, vo.shooter | 0, vo.hull | 0, side, r2(p[0]), r2(p[1]), r2(p[2]), r4(vo.yaw), r2(vo.vel?.[0] ?? 0), r2(vo.vel?.[2] ?? 0), r4(vo.elevation), vo.seed >>> 0, r2(vo.skill ?? 0.5),
      Math.max(0, Math.min(NAVAL_VOLLEY_KEEP_MS, Math.round(vo.age ?? 0)))]);
    if (vo.shot != null && SHOT_CODES[vo.shot] != null) o.push([vo.id >>> 0, SHOT_CODES[vo.shot]]);
  }
  for (const ba of view?.barrels ?? []) {
    if (b.length >= NAVAL_WIRE_BARRELS) break;
    const p = toWire(ba.pos);
    b.push([ba.id >>> 0, r2(p[0]), r2(p[1]), r2(p[2]), Number.isInteger(ba.shooter) && ba.shooter >= 0 && ba.shooter <= 0xffff ? ba.shooter : -1]);
  }
  // New fields go on keys of their own. An older build checks every entry of s and p by length and refuses
  // the whole word on a mismatch, but it ignores keys it does not know.
  const out = { s, v, b };
  const f = [], w = [], j = [];
  for (const c of view?.casks ?? []) {
    const salvage = isSalvage(c.lot);
    if ((salvage ? w : f).length + j.filter((x) => (x.length === 5) === salvage).length >= NAVAL_WIRE_CASKS) continue;
    const cls = SHIP_CLASSES.findIndex((k) => k.id === c.from), lot = LOT_KEYS.indexOf(c.lot);
    if (cls < 0 || (!salvage && lot < 0) || !Array.isArray(c.pos)) continue;
    // Rounded to half a meter so a drifting cask does not change the word every frame.
    const p = toWire(c.pos.map((x) => Math.round(x * 2) / 2));
    const old = cls < NAVAL_WIRE_OLD_CLASSES;
    if (salvage) (old ? w : j).push([c.id >>> 0, r2(p[0]), r2(p[1]), r2(p[2]), cls]);
    else { (old ? f : j).push([c.id >>> 0, r2(p[0]), r2(p[1]), r2(p[2]), cls, lot]); if (c.deep) e.push(c.id >>> 0); }
  }
  if (f.length) out.f = f;
  if (w.length) out.w = w;
  if (h.length) out.h = h;
  if (j.length) out.j = j;
  if (d.length) out.d = d;
  if (e.length) out.e = e;
  if (o.length) out.o = o;
  const me = view?.me;
  if (me) out.p = [pct(me.hull), me.crippled ? 1 : 0, me.boarders === false ? 0 : 1];
  const laid = (view?.laid ?? []).reduce((m, side) => { const i = SIDE_CODES.indexOf(side); return i >= 0 ? m | (1 << i) : m; }, 0);
  if (laid) out.g = laid;
  if (k.length) out.k = k;
  if (me && int(me.crew, 0, 0xffff) && int(me.boatHull, 0, HULL_NAMES.length - 1)) out.m = [me.crew, me.battle ? 1 : 0, me.boatHull];
  const law = [];
  for (const [i, c] of CROWNS.entries()) { const n = Math.round(view?.law?.[c.name] ?? 0); if (n > 0) law.push([i, Math.min(NOTORIETY.max, n)]); }
  if (law.length) out.n = law;
  const t = DENSITY_KEYS.indexOf(view?.traffic);
  if (t >= 0 && view?.traffic !== TRAFFIC_DEFAULT) out.t = t;
  const l = (view?.spent ?? []).filter((x) => int(x, 0, U32)).slice(-NAVAL_WIRE_SPENT);
  if (l.length) out.l = l;
  const q = (view?.gone ?? []).filter((x) => int(x, 0, U32)).slice(-NAVAL_WIRE_GONE);
  if (q.length) out.q = q;
  return s.length || h.length || v.length || b.length || out.p || out.n || out.t !== undefined || out.f || out.w || out.j || out.l || out.g || out.q ? out : null;
}

function validCaptains(raw) {
  const out = new Map();
  if (raw === undefined) return out;
  if (!Array.isArray(raw) || raw.length > NAVAL_WIRE_SHIPS) return null;
  for (const w of raw) {
    if (!Array.isArray(w) || !int(w[0], 0, 0xffff) || !int(w[1], 0, TEMPER_CODES.length - 1) || !int(w[2], 0, MODE_CODES.length - 1) || !int(w[3], -1, 0xffff)) return null;
    out.set(w[0], { temper: TEMPER_CODES[w[1]], mode: MODE_CODES[w[2]], struckTo: w[3] });
  }
  return out;
}

function shipOf(w) {
  // These lengths are the entry shapes older builds say; fields they lack read as defaults.
  if (!Array.isArray(w) || (w.length !== 16 && w.length !== 17 && w.length !== 19) || !w.every(Number.isFinite)) return null;
  if (!int(w[0], 0, 0xffff) || !int(w[1], 0, SHIP_CLASSES.length - 1)) return null;
  const cls = SHIP_CLASSES[w[1]];
  const variants = HULL_VARIANT_COUNTS[cls.hull] ?? 0;
  if (!int(w[2], 0, Math.max(0, variants - 1))) return null;
  const pos = [w[3], w[4], w[5]];
  if (!inBounds(pos) || Math.abs(w[6]) > 7 || w[7] < 0 || w[7] > 40 || w[8] < 0 || w[8] > 1) return null;
  if (!int(w[9], 0, 100) || !int(w[10], 0, 100) || !int(w[11], 0, 100) || !int(w[12], 0, WIRE_STATES.length - 1)) return null;
  if (Math.abs(w[13]) > 90 || !int(w[14], 0, U32) || (w[15] !== 0 && w[15] !== 1) || (w.length >= 17 && !int(w[16], 0, 15))) return null;
  if (w.length === 19 && (!int(w[17], 0, NAVAL_GEN_MAX) || !int(w[18], -1, REGION_NAMES.length - 1))) return null;
  return { n: w[0], classId: cls.id, hull: cls.hull, variant: w[2], pos, yaw: w[6], speed: w[7], sails: w[8], hull100: w[9], sail100: w[10], crew100: w[11], state: WIRE_STATES[w[12]], heel: w[13], seed: w[14], fire: w[15] === 1, runOut: w[16] ?? 0,
    gen: w[17] ?? 0, region: w[18] ?? -1 };
}

function caskOf(w) {
  if (!Array.isArray(w) || (w.length !== 5 && w.length !== 6) || !w.every(Number.isFinite) || !int(w[0], 0, U32)) return null;
  const pos = [w[1], w[2], w[3]];
  if (!inBounds(pos) || !int(w[4], 0, SHIP_CLASSES.length - 1) || (w.length === 6 && !int(w[5], 0, LOT_KEYS.length - 1))) return null;
  return { id: w[0], pos, from: SHIP_CLASSES[w[4]].id, lot: w.length === 6 ? LOT_KEYS[w[5]] : SALVAGE_LOT };
}

// A word passes whole or not at all; a missing key reads as an older build saying none.
export function validNavalRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const s = raw.s ?? [], v = raw.v ?? [], b = raw.b ?? [], later = raw.h ?? [];
  if (!Array.isArray(s) || !Array.isArray(v) || !Array.isArray(b) || !Array.isArray(later)) return null;
  if (s.length + later.length > NAVAL_WIRE_SHIPS || v.length > NAVAL_WIRE_VOLLEYS || b.length > NAVAL_WIRE_BARRELS) return null;
  const ships = [];
  for (const w of [...s, ...later]) {
    const ship = shipOf(w);
    if (!ship) return null;
    ships.push(ship);
  }
  const volleys = [];
  for (const w of v) {
    if (!Array.isArray(w) || (w.length !== 13 && w.length !== 14) || !w.every(Number.isFinite)) return null;
    if (!int(w[0], 0, U32) || !int(w[1], -1, 0xffff) || !int(w[2], 0, HULL_NAMES.length - 1) || !int(w[3], 0, SIDE_CODES.length - 1)) return null;
    const pos = [w[4], w[5], w[6]];
    if (!inBounds(pos) || Math.abs(w[7]) > 7 || Math.abs(w[8]) > 40 || Math.abs(w[9]) > 40 || Math.abs(w[10]) > 1.6 || !int(w[11], 0, U32) || w[12] < 0 || w[12] > 1) return null;
    if (w.length === 14 && !int(w[13], 0, NAVAL_VOLLEY_KEEP_MS)) return null;
    volleys.push({ id: w[0], shooter: w[1], hull: w[2], side: SIDE_CODES[w[3]], pos, yaw: w[7], vel: [w[8], 0, w[9]], elevation: w[10], seed: w[11], skill: w[12], age: w[13] ?? 0 });
  }
  const barrels = [];
  for (const w of b) {
    if (!Array.isArray(w) || (w.length !== 4 && w.length !== 5) || !w.every(Number.isFinite) || !int(w[0], 0, U32)) return null;
    const pos = [w[1], w[2], w[3]];
    if (!inBounds(pos) || (w.length === 5 && !int(w[4], -1, 0xffff))) return null;
    barrels.push({ id: w[0], pos, shooter: w[4] ?? -1 });
  }
  let me = null;
  if (raw.p !== undefined) {
    const p = raw.p;
    if (!Array.isArray(p) || p.length !== 3 || !int(p[0], 0, 100) || !int(p[1], 0, 1) || !int(p[2], 0, 1)) return null;
    me = { hull: p[0] / 100, crippled: p[1] === 1, boarders: p[2] === 1 };
  }
  const law = {};
  if (raw.n !== undefined) {
    if (!Array.isArray(raw.n) || raw.n.length > CROWNS.length) return null;
    for (const w of raw.n) {
      if (!Array.isArray(w) || w.length !== 2 || !int(w[0], 0, CROWNS.length - 1) || !int(w[1], 0, NOTORIETY.max)) return null;
      law[CROWNS[w[0]].name] = w[1];
    }
  }
  if (raw.t !== undefined && !int(raw.t, 0, DENSITY_KEYS.length - 1)) return null;
  const lots = raw.f ?? [], wrecks = raw.w ?? [], later2 = raw.j ?? [];
  if (!Array.isArray(lots) || !Array.isArray(wrecks) || !Array.isArray(later2)) return null;
  if (!lots.every((w) => w?.length === 6) || !wrecks.every((w) => w?.length === 5)) return null;
  const caskWords = [...lots, ...wrecks, ...later2];
  if (caskWords.filter((w) => w?.length === 6).length > NAVAL_WIRE_CASKS || caskWords.filter((w) => w?.length !== 6).length > NAVAL_WIRE_CASKS) return null;
  const casks = [];
  for (const w of caskWords) {
    const c = caskOf(w);
    if (!c) return null;
    casks.push(c);
  }
  const captains = validCaptains(raw.k);
  if (!captains) return null;
  let boat = null;
  if (raw.m !== undefined) {
    if (!Array.isArray(raw.m) || !int(raw.m[0], 0, 0xffff) || !int(raw.m[1], 0, 1) || !int(raw.m[2], 0, HULL_NAMES.length - 1)) return null;
    boat = { crew: raw.m[0], battle: raw.m[1] === 1, hull: raw.m[2] };
  }
  const spent = raw.l ?? [];
  if (!Array.isArray(spent) || spent.length > NAVAL_WIRE_SPENT || !spent.every((x) => int(x, 0, U32))) return null;
  const gone = raw.q ?? [];
  if (!Array.isArray(gone) || gone.length > NAVAL_WIRE_GONE || !gone.every((x) => int(x, 0, U32))) return null;
  if (raw.g !== undefined && !int(raw.g, 0, 15)) return null;
  const laid = SIDE_CODES.filter((_, i) => ((raw.g ?? 0) & (1 << i)) !== 0);
  const deepShips = raw.d ?? [], deepCasks = raw.e ?? [];
  if (!Array.isArray(deepShips) || deepShips.length > NAVAL_WIRE_SHIPS || !deepShips.every((x) => int(x, 0, 0xffff))) return null;
  if (!Array.isArray(deepCasks) || deepCasks.length > NAVAL_WIRE_CASKS || !deepCasks.every((x) => int(x, 0, U32))) return null;
  for (const sh of ships) if (deepShips.includes(sh.n)) sh.deep = true;
  for (const c of casks) if (c.lot !== SALVAGE_LOT && deepCasks.includes(c.id)) c.deep = true;
  const loaded = raw.o ?? [];
  if (!Array.isArray(loaded) || loaded.length > NAVAL_WIRE_VOLLEYS) return null;
  for (const w of loaded) if (!Array.isArray(w) || w.length !== 2 || !int(w[0], 0, U32) || !int(w[1], 0, SHOT_ORDER.length - 1)) return null;
  for (const vo of volleys) { const w = loaded.find((x) => x[0] === vo.id); if (w) vo.shot = SHOT_ORDER[w[1]]; }
  return { ships, volleys, barrels, me, law, traffic: raw.t === undefined ? TRAFFIC_DEFAULT : DENSITY_KEYS[raw.t], casks, captains, boat, spent: [...spent], gone: [...gone], laid };
}

export const navalRecordKey = (rec) => (rec ? JSON.stringify(rec) : '');

// The relay routes a blow by its target alone; the client sailing the ship lands it and says her new state next.
/**
 * @param {string} to
 * @param {{ n: number, hull?: number, sail?: number, crew?: number, fire?: boolean | 'barrel', zone?: string, grapple?: boolean,
 *   cask?: number | null, answer?: boolean, ram?: boolean }} blow
 */
export function navalHitData(to, { n, hull = 0, sail = 0, crew = 0, fire = false, zone = 'hull', grapple = false, cask = null, answer = false, ram = false }) {
  const nv = { n: n | 0, h: Math.round(hull), s: Math.round(sail), c: crew | 0, f: fire === 'barrel' ? 2 : fire ? 1 : 0, z: zone === 'rig' ? 1 : zone === 'holed' ? 2 : 0 };
  if (ram && !grapple && cask == null) nv.r = 1;
  if (grapple) nv.g = 1;
  if (cask != null) { nv.k = cask >>> 0; if (answer) nv.a = 1; }
  return { to, nv };
}

/**
 * @returns {{ n: number, hull: number, sail: number, crew: number, fire: boolean | 'barrel', zone: string, grapple: boolean,
 *   cask: number | null, answer: boolean, ram: boolean } | null}
 */
export function validNavalHit(data) {
  const nv = data?.nv;
  if (!nv || typeof nv !== 'object' || Array.isArray(nv)) return null;
  if (!int(nv.n, 0, 0xffff) || !int(nv.h, 0, NAVAL_HIT_MAX) || !int(nv.s, 0, NAVAL_HIT_MAX) || !int(nv.c, 0, 60)) return null;
  if (!int(nv.f, 0, 2) || !int(nv.z, 0, 2)) return null;
  // A grapple and a cask word carry no hurt, an answer is a cask's, and a ram is a plain blow's.
  if (nv.g !== undefined && (nv.g !== 1 || nv.h || nv.s || nv.c || nv.f)) return null;
  if (nv.k !== undefined && (!int(nv.k, 0, U32) || nv.g !== undefined || nv.h || nv.s || nv.c || nv.f)) return null;
  if (nv.a !== undefined && (nv.a !== 1 || nv.k === undefined)) return null;
  if (nv.r !== undefined && (nv.r !== 1 || nv.g !== undefined || nv.k !== undefined)) return null;
  return {
    n: nv.n, hull: nv.h, sail: nv.s, crew: nv.c, fire: nv.f === 2 ? 'barrel' : nv.f === 1, zone: ['hull', 'rig', 'holed'][nv.z], grapple: nv.g === 1,
    cask: nv.k ?? null, answer: nv.a === 1, ram: nv.r === 1,
  };
}
