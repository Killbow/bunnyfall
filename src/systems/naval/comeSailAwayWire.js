// @ts-check
// Builds the boat record a sailor's client sends to others in the cell, and checks a record received from a peer.
// Optional keys (`m`, `u`, `n`, `f`, `l`, `d`, and `p`) are sent only while some boat uses them, so older readers
// still read the record. A refused name, flag, livery, fittings list, or plaque reads as none and never drops it.
import { POSE_BOUND, POSE_Y_BOUND, POSE_ABOARD_SLOTS } from '../../net/wire.js';
import { HULL_NAMES, HULL_VARIANT_COUNTS } from './comeSailAwayBoat.js';
import { shipNameVerdict, SHIP_NAME_MAX } from './fleet.js';
import { flagCode, flagOfCode } from './shipFlag.js';
import { liveryCode, liveryOfCode } from './shipLivery.js';
import { fittingsCode, fittingsOfCode } from './deckFittings.js';

export const CSA_WIRE_BOATS_MAX = POSE_ABOARD_SLOTS;
export const CSA_WIRE_VARIANTS = 10;
export const CSA_WIRE_SAILS_MAX = 16;
// Covers the fastest boat at the top time scale; the writer clamps to it so readers never drop an honest record.
export const CSA_WIRE_SPEED_MAX = 2 * 1024 * 1024;
export const CSA_WIRE_TURN_MAX = 36000;
const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;
const finite3 = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const inBounds = (p) => Math.abs(p[0]) <= POSE_BOUND && Math.abs(p[2]) <= POSE_BOUND && Math.abs(p[1]) <= POSE_Y_BOUND;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

/** @returns {{ b: number[][], m?: number[][], u?: number[], n?: string[], f?: (number|number[])[] } | null} */
export function csaWireRecord(view, toWire = (p) => p) {
  if (!Array.isArray(view)) return null;
  const b = [], m = [], n = [], u = [], f = [], l = [], d = [], pl = [];
  let underWay = false, named = false, flagged = false, painted = false, fitted = false, boarded = false;
  for (const v of view) {
    if (b.length >= CSA_WIRE_BOATS_MAX) break;
    if (!v || !int(v.hull, 0, HULL_NAMES.length - 1) || !finite3(v.position) || !Array.isArray(v.rotation) || v.rotation.length !== 4) continue;
    const p = toWire(v.position);
    const q = v.rotation;
    b.push([v.hull, v.variant | 0, r2(p[0]), r2(p[1]), r2(p[2]), r4(q[0]), r4(q[1]), r4(q[2]), r4(q[3]), (v.sails | 0) & ((1 << CSA_WIRE_SAILS_MAX) - 1), v.helm ? 1 : 0, v.light ? 1 : 0]);
    const vel = finite3(v.velocity) ? v.velocity : null;
    const at = vel ? toWire([v.position[0] + vel[0], v.position[1] + vel[1], v.position[2] + vel[2]]) : p;
    const way = [r2(at[0] - p[0]), r2(at[2] - p[2]), Number.isFinite(v.turn) ? r2(v.turn) : 0];
    const sp = Math.hypot(way[0], way[1]);
    if (sp > CSA_WIRE_SPEED_MAX) { const k = (CSA_WIRE_SPEED_MAX * 0.999) / sp; way[0] = r2(way[0] * k); way[1] = r2(way[1] * k); }
    way[2] = Math.max(-CSA_WIRE_TURN_MAX, Math.min(CSA_WIRE_TURN_MAX, way[2]));
    if (way[0] || way[1] || way[2]) underWay = true;
    m.push(way);
    const name = typeof v.name === 'string' ? shipNameVerdict(v.name) : null;
    n.push(name?.ok ? name.name : '');
    if (name?.ok && name.name) named = true;
    u.push(Number.isSafeInteger(v.uid) && v.uid > 0 ? v.uid : 0);
    const code = flagCode(v.flag);
    f.push(code);
    if (code) flagged = true;
    const paint = liveryCode(v.livery);
    l.push(paint);
    if (paint) painted = true;
    const fit = fittingsCode(v.fittings);
    d.push(fit);
    if (fit.length) fitted = true;
    const shows = v.plaque === true && !!(name?.ok && name.name);
    pl.push(shows ? 1 : 0);
    if (shows) boarded = true;
  }
  if (!b.length) return null;
  return { b, ...(underWay ? { m } : {}), ...(u.some(Boolean) ? { u } : {}), ...(named ? { n } : {}), ...(flagged ? { f } : {}), ...(painted ? { l } : {}), ...(fitted ? { d } : {}), ...(boarded ? { p: pl } : {}) };
}

/** @returns {{ boats: { hull:number, variant:number, position:number[], rotation:number[], sails:number, helm:boolean, light:boolean }[], cabin?:boolean } | null} */
export function validCsaRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.b)) return null;
  if ((raw.b.length < 1 && raw.cabin !== 1) || raw.b.length > CSA_WIRE_BOATS_MAX) return null;
  if (raw.u !== undefined && (!Array.isArray(raw.u) || raw.u.length !== raw.b.length || raw.u.some((u) => !Number.isSafeInteger(u) || u < 0) || new Set(raw.u.filter(Boolean)).size !== raw.u.filter(Boolean).length)) return null;
  const m = raw.m;
  if (m !== undefined) {
    if (!Array.isArray(m) || m.length !== raw.b.length) return null;
    for (const way of m) {
      if (!Array.isArray(way) || way.length !== 3 || !way.every(Number.isFinite)) return null;
      if (Math.hypot(way[0], way[1]) > CSA_WIRE_SPEED_MAX || Math.abs(way[2]) > CSA_WIRE_TURN_MAX) return null;
    }
  }
  const boats = [];
  for (const w of raw.b) {
    if (!Array.isArray(w) || w.length !== 12 || !w.every(Number.isFinite)) return null;
    if (!int(w[0], 0, HULL_NAMES.length - 1) || !int(w[1], 0, CSA_WIRE_VARIANTS - 1)) return null;
    // Spawning a hull with variants throws on a variant it does not have.
    if (HULL_VARIANT_COUNTS[w[0]] > 0 && w[1] >= HULL_VARIANT_COUNTS[w[0]]) return null;
    const p = [w[2], w[3], w[4]];
    if (!inBounds(p)) return null;
    const q = [w[5], w[6], w[7], w[8]];
    const len = Math.hypot(q[0], q[1], q[2], q[3]);
    if (!(len > 0.5 && len < 2)) return null;
    if (!int(w[9], 0, (1 << CSA_WIRE_SAILS_MAX) - 1)) return null;
    if ((w[10] !== 0 && w[10] !== 1) || (w[11] !== 0 && w[11] !== 1)) return null;
    const boat = { hull: w[0], variant: w[1], position: p, rotation: q.map((v) => v / len), sails: w[9], helm: w[10] === 1, light: w[11] === 1 };
    if (m !== undefined) { const way = m[boats.length]; boat.velocity = [way[0], 0, way[1]]; boat.turn = way[2]; }
    const name = shipNameOf(raw.n, raw.b.length, boats.length);
    if (name) boat.name = name;
    if (raw.u?.[boats.length]) boat.uid = raw.u[boats.length];
    const flag = Array.isArray(raw.f) && raw.f.length === raw.b.length ? flagOfCode(raw.f[boats.length]) : null;
    if (flag) boat.flag = flag;
    const paint = Array.isArray(raw.l) && raw.l.length === raw.b.length ? liveryOfCode(raw.l[boats.length]) : null;
    if (paint) boat.livery = paint;
    const fits = Array.isArray(raw.d) && raw.d.length === raw.b.length ? fittingsOfCode(raw.d[boats.length]) : [];
    if (fits.length) boat.fittings = fits;
    if (name && Array.isArray(raw.p) && raw.p.length === raw.b.length && raw.p[boats.length] === 1) boat.plaque = true;
    boats.push(boat);
  }
  if (raw.cabin !== undefined && raw.cabin !== 1) return null;
  if (raw.cabin === 1 && boats.some((b) => b.helm || b.velocity?.some((v) => v !== 0) || b.turn)) return null;
  return { boats, ...(raw.cabin === 1 ? { cabin: true } : {}) };
}
function shipNameOf(n, count, i) {
  if (!Array.isArray(n) || n.length !== count) return '';
  const raw = n[i];
  if (typeof raw !== 'string' || raw.length > SHIP_NAME_MAX * 4) return '';
  const v = shipNameVerdict(raw);
  return v.ok ? v.name : '';
}

export const csaRecordKey = (rec) => (rec ? JSON.stringify(rec.u || rec.cabin || rec.n || rec.f || rec.l || rec.d || rec.p ? [rec.b, rec.m ?? null, rec.u ?? null, rec.cabin ?? null, rec.n ?? null, rec.f ?? null, rec.l ?? null, rec.d ?? null, rec.p ?? null] : rec.m ? [rec.b, rec.m] : rec.b) : '');
