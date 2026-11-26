// @ts-check

import { MOBILE_TYPES } from '../characters/mobileTypes.js';

export const REPLAY_VERSION = 1;
export const REPLAY_KEEP = 3;
export const REPLAY_HZ = 10;
export const REPLAY_TICK_MS = 1000 / REPLAY_HZ;
export const REPLAY_MAX_TICKS = 4 * 60 * REPLAY_HZ;
export const REPLAY_FIGHTERS_MAX = 4;
export const REPLAY_POS_Q = 0.1;
export const REPLAY_YAW_STEPS = 256;
export const REPLAY_BYTES_MAX = 64 * 1024;
export const REPLAY_EVENTS = Object.freeze(['call', 'crier', 'walk', 'count', 'fight', 'hit', 'crit', 'miss', 'knockdown', 'comeback', 'stall', 'flee', 'yield', 'fall', 'ringout', 'timeout', 'end', 'verdict', 'heal', 'done']);
// Deltas clamp to -127..127, so -128 never occurs as a delta and marks a run of still ticks.
const RUN = -128;

const clampI = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const qPos = (m) => clampI(m / REPLAY_POS_Q, -32000, 32000);
const qYaw = (rad) => ((Math.round(((Number(rad) || 0) / (Math.PI * 2)) * REPLAY_YAW_STEPS) % REPLAY_YAW_STEPS) + REPLAY_YAW_STEPS) % REPLAY_YAW_STEPS;
const share255 = (hp, max) => clampI((Math.max(0, Number(hp) || 0) / Math.max(1, Number(max) || 1)) * 255, 0, 255);

export function playerMobileOf(entity) {
  const m = MOBILE_TYPES[entity?.career?.name ?? ''];
  return Number.isInteger(m) && m >= 128 && m <= 145 ? m : MOBILE_TYPES.Warrior;
}

export function newRecording({ t0 = 0, fighters = [], next = null, sides = [null, null], at = 0 } = {}) {
  const f = fighters.slice(0, REPLAY_FIGHTERS_MAX);
  return {
    t0, at: Math.floor(Number(at) || 0), ids: f.map((x) => x.id),
    f: f.map((x) => ({ n: String(x.name ?? '').slice(0, 40), s: clampI(x.side, 0, 3), m: clampI(x.mobile, -1, 999), g: x.gender === 'female' ? 'female' : 'male', h: String(x.home ?? '').slice(0, 40), e: String(x.epithet ?? '').slice(0, 40) })),
    next: next ? { tier: clampI(next.tier, 0, 9), bout: clampI(next.bout, 0, 3), label: String(next.label ?? ''), tierName: String(next.tierName ?? ''), champion: !!next.champion, grand: !!next.grand, free: !!next.free, beasts: !!next.beasts } : null,
    sides: [0, 1].map((i) => (sides?.[i] === 'red' || sides?.[i] === 'blue' ? sides[i] : null)),
    ticks: 0, start: null, last: null, deltas: f.map(() => []), zeros: f.map(() => 0), ev: [], hp0: f.map((x) => share255(x.health ?? x.maxHealth, x.maxHealth)), hp: [], hpLog: [], k: [], lastStrike: f.map(() => -Infinity), full: false,
  };
}

function flushRun(R, i) {
  while (R.zeros[i] > 0) { const n = Math.min(127, R.zeros[i]); R.deltas[i].push(RUN, n); R.zeros[i] -= n; }
}

export function recordTick(R, t, poses, health = []) {
  if (!R || R.full) return R;
  const due = Math.floor((t - R.t0) / REPLAY_TICK_MS);
  if (!R.hp.length) R.hp = [...R.hp0];
  while (R.ticks <= due) {
    if (R.ticks >= REPLAY_MAX_TICKS) { R.full = true; break; }
    const q = R.f.map((_, i) => {
      const p = poses[i] ?? null;
      return p ? [qPos(p[0]), qPos(p[1]), qYaw(p[2])] : R.last ? [...R.last[i]] : [0, 0, 0];
    });
    if (!R.start) { R.start = q.map((x) => [...x]); R.last = q.map((x) => [...x]); }
    else {
      for (let i = 0; i < q.length; i++) {
        const L = R.last[i];
        const dx = clampI(q[i][0] - L[0], -127, 127), dz = clampI(q[i][1] - L[1], -127, 127);
        let dy = ((q[i][2] - L[2] + 128) & 255) - 128;
        if (dy < -127) dy = -127;
        // The last pose advances by the clamped delta, so the decoded poses never drift from the recorded ones.
        L[0] += dx; L[1] += dz; L[2] = (L[2] + dy + 256) & 255;
        if (dx === 0 && dz === 0 && dy === 0) { R.zeros[i]++; continue; }
        flushRun(R, i);
        R.deltas[i].push(dx, dz, dy);
      }
    }
    for (let i = 0; i < R.f.length; i++) {
      const h = health[i];
      if (!h) continue;
      const s = share255(h[0], h[1]);
      if (s !== R.hp[i]) { R.hp[i] = s; R.hpLog.push(R.ticks, i, s); }
    }
    R.ticks++;
  }
  return R;
}

export function recordStrike(R, t, id) {
  if (!R || R.full) return R;
  const i = R.ids.indexOf(id);
  if (i < 0 || t - R.lastStrike[i] < 300) return R;
  R.lastStrike[i] = t;
  R.k.push(Math.max(0, Math.round((t - R.t0) / 10)), i);
  return R;
}

export function recordEvent(R, e) {
  if (!R || !e || R.full) return R;
  const k = REPLAY_EVENTS.indexOf(e.k);
  if (k < 0) return R;
  const fi = (id) => (id == null ? -1 : R.ids.indexOf(id));
  const row = [Math.max(0, Math.round(((e.at ?? R.t0) - R.t0) / 10)), k, fi(e.a), fi(e.b), clampI(e.dmg ?? 0, 0, 99999), e.n == null ? -9 : clampI(e.n, -1, 3), e.side === undefined ? -9 : e.side === null ? -1 : clampI(e.side, 0, 3), typeof e.how === 'string' ? e.how.slice(0, 12) : ''];
  while (row.length > 2) { const v = row[row.length - 1], j = row.length - 1; if ((j <= 3 && v === -1) || (j === 4 && v === 0) || ((j === 5 || j === 6) && v === -9) || (j === 7 && v === '')) row.pop(); else break; }
  R.ev.push(row);
  return R;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0, n = (a << 16) | (b << 8) | c;
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return s;
}
export function fromBase64(s) {
  if (typeof s !== 'string' || s.length % 4) return null;
  const out = [];
  for (let i = 0; i < s.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (s[i + k] === '=' ? -2 : B64.indexOf(s[i + k])));
    if (v.some((x) => x === -1) || v[0] < 0 || v[1] < 0 || (v[2] === -2 && v[3] !== -2)) return null;
    const n = (v[0] << 18) | (v[1] << 12) | (Math.max(0, v[2]) << 6) | Math.max(0, v[3]);
    out.push((n >> 16) & 255);
    if (v[2] >= 0) out.push((n >> 8) & 255);
    if (v[3] >= 0) out.push(n & 255);
  }
  return Uint8Array.from(out);
}

export function finishRecording(R, result = null) {
  if (!R?.start) return null;
  R.f.forEach((_, i) => flushRun(R, i));
  return {
    v: REPLAY_VERSION, at: R.at, next: R.next, f: R.f.map((x) => ({ ...x })), sides: [...R.sides], n: R.ticks,
    s: R.start.flat(), d: toBase64(Uint8Array.from(R.deltas.flat(), (x) => x & 255)), hp0: [...R.hp0], hp: [...R.hpLog], k: [...R.k], ev: R.ev.map((r) => [...r]),
    r: result ? { side: result.side ?? null, how: String(result.how ?? '').slice(0, 12) } : null,
  };
}

export function decodePoses(rec) {
  const nf = rec?.f?.length ?? 0, n = rec?.n ?? 0;
  const bytes = fromBase64(rec?.d);
  if (!bytes || !Array.isArray(rec.s) || rec.s.length !== nf * 3) return null;
  const out = Array.from({ length: Math.max(1, n) }, () => []);
  const sb = (b) => (b > 127 ? b - 256 : b);
  let p = 0;
  for (let i = 0; i < nf; i++) {
    let L = [rec.s[i * 3], rec.s[i * 3 + 1], rec.s[i * 3 + 2]], run = 0;
    out[0].push([...L]);
    for (let t = 1; t < n; t++) {
      if (run === 0 && p < bytes.length && sb(bytes[p]) === RUN) { run = bytes[p + 1] ?? 0; p += 2; if (run < 1) return null; }
      if (run > 0) { run--; out[t].push([...L]); continue; }
      if (p + 3 > bytes.length) return null;
      L = [L[0] + sb(bytes[p]), L[1] + sb(bytes[p + 1]), (L[2] + sb(bytes[p + 2]) + 256) & 255];
      p += 3;
      out[t].push([...L]);
    }
    if (run !== 0) return null;
  }
  return p === bytes.length ? out : null;
}

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isStr = (v, max) => typeof v === 'string' && v.length <= max;
export function replayOk(r) {
  if (!r || typeof r !== 'object' || r.v !== REPLAY_VERSION) return null;
  if (!Array.isArray(r.f) || r.f.length < 1 || r.f.length > REPLAY_FIGHTERS_MAX) return null;
  for (const f of r.f) if (!f || !isStr(f.n, 40) || !isInt(f.s, 0, 3) || !isInt(f.m, -1, 999) || (f.g !== 'male' && f.g !== 'female') || !isStr(f.h, 40) || !isStr(f.e, 40)) return null;
  if (!isInt(r.n, 1, REPLAY_MAX_TICKS) || !isInt(r.at, 0, 2 ** 40) || !Array.isArray(r.sides) || r.sides.length !== 2 || !r.sides.every((b) => b === null || b === 'red' || b === 'blue')) return null;
  if (!Array.isArray(r.hp0) || r.hp0.length !== r.f.length || !r.hp0.every((v) => isInt(v, 0, 255))) return null;
  if (!Array.isArray(r.hp) || r.hp.length % 3 || !r.hp.every((v, i) => isInt(v, 0, i % 3 === 1 ? r.f.length - 1 : i % 3 === 0 ? r.n : 255))) return null;
  if (!Array.isArray(r.k) || r.k.length % 2 || !r.k.every((v, i) => isInt(v, 0, i % 2 ? r.f.length - 1 : 1e6))) return null;
  if (!Array.isArray(r.ev) || !r.ev.every((e) => Array.isArray(e) && e.length >= 2 && e.length <= 8 && isInt(e[0], 0, 1e6) && isInt(e[1], 0, REPLAY_EVENTS.length - 1) && e.slice(2, 4).every((v) => isInt(v, -1, r.f.length - 1)) && (e.length < 5 || isInt(e[4], 0, 99999)) && e.slice(5, 7).every((v) => isInt(v, -9, 3)) && (e.length < 8 || isStr(e[7], 12)))) return null;
  if (r.next !== null && (!r.next || !isInt(r.next.tier, 0, 9) || !isInt(r.next.bout, 0, 3) || !isStr(r.next.label, 60) || !isStr(r.next.tierName, 40))) return null;
  if (!isStr(r.d, REPLAY_BYTES_MAX) || !decodePoses(r)) return null;
  return r;
}
export function arenaReplaysRestore(raw) {
  return (Array.isArray(raw) ? raw : []).map(replayOk).filter(Boolean).slice(0, REPLAY_KEEP);
}
export const arenaReplaysSnapshot = (list) => arenaReplaysRestore(list).map((r) => JSON.parse(JSON.stringify(r)));
export const keepReplay = (list, rec) => (replayOk(rec) ? [rec, ...arenaReplaysRestore(list)].slice(0, REPLAY_KEEP) : arenaReplaysRestore(list));
export const replayBytes = (rec) => JSON.stringify(rec ?? null).length;

export const replayId = (i) => `a${i}`;
export function replayBoutId(rec) {
  let h = 0x811c9dc5;
  const s = `${rec?.at ?? 0}:${rec?.next?.tier ?? 0}:${rec?.next?.bout ?? 0}:${rec?.n ?? 0}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h.toString(16).padStart(8, '0') + (h ^ 0x5a5a5a5a).toString(16).padStart(8, '0')).slice(0, 16);
}

/**
 * @param {any} rec
 * @param {{ t0: number, centre: number[], o?: string, limitMs?: number }} o
 */
export function replayFeed(rec, { t0, centre, o = replayBoutId(rec), limitMs = 180_000 }) {
  const poses = replayOk(rec) ? decodePoses(rec) : null;
  if (!poses) return null;
  const c = centre ?? [0, 0, 0];
  const X = (q) => c[0] + q * REPLAY_POS_Q, Z = (q) => c[2] + q * REPLAY_POS_Q;
  const nf = rec.f.length;
  /** @type {{ t: number, w: any }[]} */
  const words = [];
  for (let k = 1; k < poses.length; k++) {
    for (let i = 0; i < nf; i++) {
      const a = poses[k - 1][i], b = poses[k][i];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      const tm = (k - 1) * REPLAY_TICK_MS;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) * REPLAY_POS_Q;
      words.push({ t: tm, w: { k: 'mv', i: replayId(i), x: X(a[0]), z: Z(a[1]), tx: X(b[0]), tz: Z(b[1]), v: len / (REPLAY_TICK_MS / 1000), at: t0 + tm } });
    }
  }
  const hp = [...rec.hp0];
  for (let j = 0; j < rec.hp.length; j += 3) {
    hp[rec.hp[j + 1]] = rec.hp[j + 2];
    words.push({ t: rec.hp[j] * REPLAY_TICK_MS, w: { k: 'hp', h: hp.map((s, i) => [replayId(i), s, 255]) } });
  }
  for (let j = 0; j < rec.k.length; j += 2) {
    const tm = rec.k[j] * 10, i = rec.k[j + 1];
    const tick = Math.min(poses.length - 1, Math.floor(tm / REPLAY_TICK_MS));
    const me = poses[tick][i];
    let tg = -1, best = Infinity;
    for (let q = 0; q < nf; q++) {
      if (q === i || rec.f[q].s === rec.f[i].s) continue;
      const p = poses[tick][q], d = Math.hypot(p[0] - me[0], p[1] - me[1]);
      if (d < best) { best = d; tg = q; }
    }
    const at = tg >= 0 ? poses[tick][tg] : me;
    words.push({ t: tm, w: { k: 'atk', i: replayId(i), at: t0 + tm, x: X(at[0]), z: Z(at[1]), tg: replayId(Math.max(0, tg)) } });
  }
  for (const e of rec.ev) {
    const tm = e[0] * 10, kind = REPLAY_EVENTS[e[1]];
    if (kind === 'call') { words.push({ t: tm, w: { k: 'call' } }); continue; }
    const ev = { k: kind, at: t0 + tm };
    if ((e[2] ?? -1) >= 0) ev.a = replayId(e[2]);
    if ((e[3] ?? -1) >= 0) ev.b = replayId(e[3]);
    if ((e[4] ?? 0) > 0) ev.dmg = e[4];
    if ((e[5] ?? -9) !== -9) ev.n = e[5];
    if ((e[6] ?? -9) !== -9) ev.side = e[6] === -1 ? null : e[6];
    if (e[7]) ev.how = e[7];
    words.push({ t: tm, w: { k: 'ev', e: [ev] } });
  }
  // The sort is stable: words at one moment keep their push order of walks, health, blows, then events.
  words.sort((a, b) => a.t - b.t);
  const first = poses[0].map((p, i) => ({ k: 'mv', i: replayId(i), x: X(p[0]), z: Z(p[1]), tx: X(p[0]), tz: Z(p[1]), v: 0, at: t0 }));
  const st = {
    k: 'st', o, kind: 'pve', ph: 'call', pa: t0, fa: null, lim: limitMs, me: '', sp: 0,
    f: rec.f.map((f, i) => [replayId(i), f.n || '?', f.s, rec.hp0[i], 255, '', 1, f.m, 0, f.h, f.e]),
    ...(rec.next ? { tier: rec.next.tier, bout: rec.next.bout } : {}),
  };
  let at = 0;
  const end = words.length ? words[words.length - 1].t : 0;
  return {
    first, st, end,
    due(t) {
      const out = [];
      while (at < words.length && words[at].t <= t - t0) out.push(words[at++].w);
      return out;
    },
    yawAt(i, t) {
      const k = Math.max(0, Math.min(poses.length - 1, Math.floor((t - t0) / REPLAY_TICK_MS)));
      return ((poses[k][i]?.[2] ?? 0) / REPLAY_YAW_STEPS) * Math.PI * 2;
    },
  };
}
