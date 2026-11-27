// @ts-check
// Optional keys (`wk`, `wh`, `wl`, `we`, `wg`, `hc`, `ps`, `go`, `pn`) sit at the record's top level so older
// readers ignore them. `w` must stay 10 numbers and `h` 6, because a reader drops a record of any other length.
// Positions are in the wire frame.
import { POSE_BOUND, POSE_Y_BOUND, sanitizeLabel, MAP_PIXELS_X, MAP_PIXELS_Y } from '../net/wire.js';
import { HORSE_NAME_MAX, CARGO_TIERS } from './horseCartLaw.js';
import { wagonKindCode, wagonKindOfCode } from './wagonKinds.js';
import { validPassengers, validPeerId, MAX_SEATS } from './wagonSeats.js';
import { wagonLookCode, wagonLookOfCode, WAGON_LOOK_CODE_MAX } from './wagonLooks.js';
import { caravanEntryCode, caravanEntryOfCode, caravanGuildTag, CARAVAN_GUILD_CODE } from './caravanVisit.js';
import { horseLookCode, horseLookOfCode, HORSE_LOOK_CODE_MAX } from './horseCoats.js';

export const HCC_WIRE_KIND = Object.freeze({ Trailing: 1, Deployed: 2, Following: 3 });
const KINDS = new Set(Object.values(HCC_WIRE_KIND));
const TIERS = new Set([0, ...CARGO_TIERS]);
const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;
const finite3 = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const inBounds = (p) => Math.abs(p[0]) <= POSE_BOUND && Math.abs(p[2]) <= POSE_BOUND && Math.abs(p[1]) <= POSE_Y_BOUND;

/** @returns {{ w?: number[], h?: number[], n?: string, hc?: number, wk?: number, wh?: number, wl?: number, we?: number, wg?: string, ps?: any[], go?: number[], pn?: string[] } | null} */
export function hccWireRecord(view, toWire = (p) => p) {
  if (!view) return null;
  const out = {};
  const w = view.wagon;
  if (w && finite3(w.position) && Array.isArray(w.rotation) && w.rotation.length === 4) {
    const p = toWire(w.position);
    out.w = [w.kind | 0, r2(p[0]), r2(p[1]), r2(p[2]), r4(w.rotation[0]), r4(w.rotation[1]), r4(w.rotation[2]), r4(w.rotation[3]), w.tier | 0, r2(w.angle ?? 0)];
    const wk = wagonKindCode(w.model);
    if (wk) out.wk = wk;
    if (w.hitched && (w.kind | 0) === HCC_WIRE_KIND.Deployed) out.wh = 1;
    const wl = wagonLookCode(w.look);
    if (wl) out.wl = wl;
    const we = caravanEntryCode(w.entry);
    if (we) { out.we = we; const wg = we === CARAVAN_GUILD_CODE ? caravanGuildTag(w.guild) : null; if (wg) out.wg = wg; }
    const ps = validPassengers(w.passengers);
    if (ps?.length) out.ps = ps;
  }
  if (Array.isArray(view.go) && view.go.length === 3 && view.go.every(Number.isInteger)) out.go = [...view.go];
  if (Array.isArray(view.declined) && view.declined.length) out.pn = view.declined.filter(validPeerId).slice(0, MAX_SEATS * 2);
  const h = view.horse;
  if (h && finite3(h.position) && finite3(h.forward)) {
    const p = toWire(h.position);
    out.h = [r2(p[0]), r2(p[1]), r2(p[2]), r4(h.forward[0]), r4(h.forward[2]), h.walking ? 1 : 0];
  }
  const n = hccHorseNameOnWire(view.name);
  if (n && out.h) out.n = n;
  const hc = horseLookCode(horseLookOfCode(view.look ?? 0));
  if (hc && (out.w || out.h)) out.hc = hc;
  return out.w || out.h || out.go || out.pn ? out : null;
}

export const hccHorseNameOnWire = (name) => (typeof name === 'string' ? sanitizeLabel(name, HORSE_NAME_MAX) : '');

export function validHccRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  if (raw.w !== undefined) {
    const w = raw.w;
    if (!Array.isArray(w) || w.length !== 10 || !w.every(Number.isFinite)) return null;
    if (!KINDS.has(w[0])) return null;
    const p = [w[1], w[2], w[3]];
    if (!inBounds(p)) return null;
    const q = [w[4], w[5], w[6], w[7]];
    const len = Math.hypot(q[0], q[1], q[2], q[3]);
    if (!(len > 0.5 && len < 2)) return null;
    if (!TIERS.has(w[8])) return null;
    out.w = { kind: w[0], position: p, rotation: q.map((v) => v / len), tier: w[8], angle: ((w[9] % 360) + 360) % 360, model: wagonKindOfCode(raw.wk ?? 0), hitched: raw.wh === 1, look: wagonLookOfCode(Number.isInteger(raw.wl) && raw.wl > 0 && raw.wl <= WAGON_LOOK_CODE_MAX ? raw.wl : 0), passengers: validPassengers(raw.ps) ?? [] };
    out.w.entry = caravanEntryOfCode(raw.we); out.w.guild = out.w.entry === 'guild' ? caravanGuildTag(raw.wg) : null;
  }
  if (Array.isArray(raw.go) && raw.go.length === 3 && raw.go.every(Number.isInteger) && raw.go[0] >= 0 && raw.go[0] < MAP_PIXELS_X && raw.go[1] >= 0 && raw.go[1] < MAP_PIXELS_Y && raw.go[2] >= 0) out.go = [...raw.go];
  if (Array.isArray(raw.pn) && raw.pn.length <= MAX_SEATS * 2) out.pn = raw.pn.filter(validPeerId);
  if (raw.h !== undefined) {
    const h = raw.h;
    if (!Array.isArray(h) || h.length !== 6 || !h.every(Number.isFinite)) return null;
    const p = [h[0], h[1], h[2]];
    if (!inBounds(p)) return null;
    const fl = Math.hypot(h[3], h[4]);
    if (!(fl > 1e-6)) return null;
    if (h[5] !== 0 && h[5] !== 1) return null;
    out.h = { position: p, forward: [h[3] / fl, 0, h[4] / fl], walking: h[5] === 1 };
  }
  if (raw.n !== undefined) {
    if (typeof raw.n !== 'string' || raw.n.length > HORSE_NAME_MAX * 4) return null;
    out.n = hccHorseNameOnWire(raw.n);
  }
  if (Number.isInteger(raw.hc) && raw.hc >= 1 && raw.hc <= HORSE_LOOK_CODE_MAX && (out.w || out.h)) out.hc = raw.hc;
  if (!out.w && !out.h && !out.go && !out.pn?.length) return null;
  return out;
}

// Every record field must appear in this key; a change to a field missing here is sent only on the next full frame.
export function hccRecordKey(rec) {
  if (!rec) return '';
  return JSON.stringify([rec.w ?? 0, rec.h ?? 0, rec.n ?? '', rec.wk ?? 0, rec.wh ?? 0, rec.ps ?? 0, rec.go ?? 0, rec.pn ?? 0, rec.wl ?? 0, rec.we ?? 0, rec.wg ?? '', rec.hc ?? 0]);
}

export function easeToward(shown, target, dt, rate = 12, snap = 20) {
  if (!shown) return [...target];
  const dx = target[0] - shown[0], dy = target[1] - shown[1], dz = target[2] - shown[2];
  if (dx * dx + dy * dy + dz * dz > snap * snap) return [...target];
  const t = 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt));
  return [shown[0] + dx * t, shown[1] + dy * t, shown[2] + dz * t];
}
