// @ts-check
/* global btoa, atob, Buffer */
// BARDS' COLLEGE (2026-11-02): THE TUNE - a bard's MIDI, read, shrunk to what the relay will carry, and turned into the
// chart the rhythm game plays. A leaf, shared by the client and the relay (the relay validates every tune it fans).
//
// WHY NOT THE FILE. Every frame on the wire is capped (wire.js MAX_FRAME_BYTES, 16 KiB) and a .mid is anything up to
// megabytes, with tracks, controllers and sysex nobody in the tavern needs. So the player's own machine reads the file
// (`tuneFromMidi`) and keeps what a tavern hears: the notes - when, how long, which key - on one voice's worth of
// channels, no drums, at most MAX_NOTES of them over at most MAX_MS. That is what travels (`encodeTune`), and the relay
// checks it note by note (`validTune`) rather than relaying a blob it cannot read.
//
// THE WIRE FORM: { n: title, d: base64 }. d = one version byte, then 4 bytes a note: the gap since the last note began
// (u16, tens of ms), how long it sounds (u8, 20 ms steps, five seconds at most) and its key (u8, 0..127).
// MAX_NOTES x 4 + 1 bytes is 7.2 KB, 9.6 KB as base64 - under the frame cap with room for the envelope.

/** The most notes a tune carries. */
export const TUNE_MAX_NOTES = 1800;
/** The longest a tune plays, ms (four minutes). */
export const TUNE_MAX_MS = 240_000;
/** The longest title, characters. */
export const TUNE_TITLE_MAX = 32;
/** The biggest .mid the client will read, bytes. */
export const MIDI_FILE_MAX = 512 * 1024;
/** The wire form's version byte. */
export const TUNE_VERSION = 1;
/** The longest base64 body the relay accepts. */
export const TUNE_B64_MAX = Math.ceil(((TUNE_MAX_NOTES * 4) + 1) / 3) * 4;
const GAP_UNIT = 10, DUR_UNIT = 20, DUR_MAX = 255 * DUR_UNIT;

/** @typedef {{ t: number, d: number, p: number }} TuneNote - start ms, length ms, key 0..127 */
/** @typedef {{ title: string, notes: TuneNote[] }} Tune */

const clean = (/** @type {unknown} */ s) => String(s ?? '').replace(/[^\p{L}\p{N} '.,!?&()-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, TUNE_TITLE_MAX);

/** Standard MIDI File bytes -> a tune, or null (not a file we read, or nothing playable in it). Pure.
 *  @param {Uint8Array} bytes @param {string} [title] */
export function tuneFromMidi(bytes, title = '') {
  if (!bytes || bytes.length < 22 || bytes.length > MIDI_FILE_MAX) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (/** @type {number} */ i) => String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
  if (tag(0) !== 'MThd' || dv.getUint32(4) < 6) return null;
  const ntrks = dv.getUint16(10), division = dv.getUint16(12);
  if (division & 0x8000 || division === 0) return null;   // SMPTE time is not music we keep
  /** @type {{ tick: number, on: boolean, ch: number, key: number, order: number }[]} */
  const ev = [];
  /** @type {{ tick: number, uspq: number }[]} */
  const tempi = [{ tick: 0, uspq: 500000 }];
  let pos = 8 + dv.getUint32(4), order = 0;
  for (let tr = 0; tr < ntrks && pos + 8 <= bytes.length; tr++) {
    if (tag(pos) !== 'MTrk') return null;
    const end = Math.min(bytes.length, pos + 8 + dv.getUint32(pos + 4));
    let i = pos + 8, tick = 0, status = 0;
    const varint = () => { let v = 0; for (let k = 0; k < 4; k++) { const b = bytes[i++]; v = (v << 7) | (b & 0x7f); if (!(b & 0x80)) break; } return v; };
    while (i < end) {
      tick += varint();
      let b = bytes[i];
      if (b === undefined) break;
      if (b & 0x80) { status = b; i++; } else if (!status) return null;
      b = status;
      if (b === 0xff) {   // meta
        const type = bytes[i++], len = varint();
        if (type === 0x51 && len === 3) tempi.push({ tick, uspq: (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2] });
        i += len;
        if (type === 0x2f) break;
      } else if (b === 0xf0 || b === 0xf7) { i += varint(); }
      else {
        const hi = b & 0xf0, ch = b & 0x0f;
        if (hi === 0x90 || hi === 0x80) {
          const key = bytes[i], vel = bytes[i + 1]; i += 2;
          ev.push({ tick, on: hi === 0x90 && vel > 0, ch, key, order: order++ });
        } else if (hi === 0xc0 || hi === 0xd0) i += 1; else i += 2;
      }
    }
    pos = end;
  }
  tempi.sort((a, b) => a.tick - b.tick);
  /** @param {number} tick */
  const ms = (tick) => {
    let t = 0, lastTick = 0, uspq = 500000;
    for (const tp of tempi) { if (tp.tick > tick) break; t += ((tp.tick - lastTick) * uspq) / division / 1000; lastTick = tp.tick; uspq = tp.uspq; }
    return t + ((tick - lastTick) * uspq) / division / 1000;
  };
  ev.sort((a, b) => a.tick - b.tick || a.order - b.order);
  /** @type {Map<number, number>} */ const open = new Map();   // channel*128+key -> start ms
  /** @type {TuneNote[]} */ let notes = [];
  for (const e of ev) {
    if (e.ch === 9 || !(e.key >= 0 && e.key < 128)) continue;   // drums are not a tune
    const k = e.ch * 128 + e.key, t = ms(e.tick);
    if (e.on) { if (!open.has(k)) open.set(k, t); } else if (open.has(k)) {
      const t0 = /** @type {number} */ (open.get(k)); open.delete(k);
      if (t0 < TUNE_MAX_MS) notes.push({ t: Math.round(t0), d: Math.max(DUR_UNIT, Math.min(DUR_MAX, Math.round(t - t0))), p: e.key });
    }
  }
  if (!notes.length) return null;
  notes.sort((a, b) => a.t - b.t || b.p - a.p);
  // too many voices: keep the top two of any chord (the tune and its bass), then the top one, then cut it short
  const thin = (/** @type {number} */ keep) => {
    const out = []; let at = -1e9, n = 0;
    for (const x of notes) { if (x.t - at > 30) { at = x.t; n = 0; } if (n++ < keep) out.push(x); }
    return out;
  };
  if (notes.length > TUNE_MAX_NOTES) notes = thin(2);
  if (notes.length > TUNE_MAX_NOTES) notes = thin(1);
  notes = notes.slice(0, TUNE_MAX_NOTES);
  const t0 = notes[0].t;
  notes = notes.map((x) => ({ ...x, t: x.t - t0 })).filter((x) => x.t < TUNE_MAX_MS);
  return notes.length ? { title: clean(title) || 'A tune', notes } : null;
}

/** A tune -> its wire form. @param {Tune} tune */
export function encodeTune(tune) {
  const n = tune.notes.length;
  const buf = new Uint8Array(1 + n * 4);
  buf[0] = TUNE_VERSION;
  let last = 0;
  for (let i = 0; i < n; i++) {
    const x = tune.notes[i], gap = Math.min(65535, Math.max(0, Math.round((x.t - last) / GAP_UNIT)));
    last += gap * GAP_UNIT;
    const o = 1 + i * 4;
    buf[o] = gap >> 8; buf[o + 1] = gap & 255;
    buf[o + 2] = Math.min(255, Math.max(1, Math.round(x.d / DUR_UNIT)));
    buf[o + 3] = x.p & 127;
  }
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { n: clean(tune.title), d: typeof btoa === 'function' ? btoa(s) : Buffer.from(buf).toString('base64') };
}

/** A wire form -> a tune, or null where any part of it is out of law. The relay and every listener both run this.
 *  @param {unknown} w */
export function validTune(w) {
  const o = /** @type {any} */ (w);
  if (!o || typeof o !== 'object' || typeof o.d !== 'string' || typeof o.n !== 'string') return null;
  if (o.n.length > TUNE_TITLE_MAX * 4 || o.d.length > TUNE_B64_MAX || o.d.length < 8 || o.d.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(o.d)) return null;
  /** @type {Uint8Array} */ let buf;
  try {
    if (typeof atob === 'function') { const s = atob(o.d); buf = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) buf[i] = s.charCodeAt(i); }
    else buf = new Uint8Array(Buffer.from(o.d, 'base64'));
  } catch { return null; }
  if (buf.length < 5 || buf[0] !== TUNE_VERSION || (buf.length - 1) % 4 !== 0) return null;
  const n = (buf.length - 1) / 4;
  if (n < 1 || n > TUNE_MAX_NOTES) return null;
  /** @type {TuneNote[]} */ const notes = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const b = 1 + i * 4;
    t += ((buf[b] << 8) | buf[b + 1]) * GAP_UNIT;
    const d = buf[b + 2] * DUR_UNIT, p = buf[b + 3];
    if (t >= TUNE_MAX_MS || d < DUR_UNIT || p > 127) return null;
    notes.push({ t, d, p });
  }
  return { title: clean(o.n) || 'A tune', notes };
}

/** @typedef {{ t: number, lane: number }} ChartNote */
export const LANES = 4;
/** The rhythm game's chart for a tune: the notes worth pressing (onsets at least `gap` ms apart, at most `max` of them - the tune's own cap),
 *  each on a lane by where its key falls in the tune's own range - the same chart on every machine. Pure.
 *  @param {Tune} tune @param {{ gap?: number, max?: number }} [o] @returns {ChartNote[]} */
export function chartOf(tune, { gap = 190, max = TUNE_MAX_NOTES } = {}) {   // BUNNYFALL: the whole tune charted (it stopped at 360 notes, before a long song's end)
  const ps = tune.notes.map((x) => x.p).sort((a, b) => a - b);
  const lo = ps[Math.floor(ps.length * 0.05)] ?? 0, hi = ps[Math.floor(ps.length * 0.95)] ?? 127;
  const span = Math.max(1, hi - lo + 1);
  /** @type {ChartNote[]} */ const out = [];
  let last = -1e9;
  for (const x of tune.notes) {
    if (x.t - last < gap) continue;
    last = x.t;
    out.push({ t: x.t, lane: Math.min(LANES - 1, Math.max(0, Math.floor(((x.p - lo) / span) * LANES))) });
    if (out.length >= max) break;
  }
  return out;
}

/** The house tune, for a bard with no file: a short jig in D, nine bars. */
export function houseTune() {
  const q = 240;   // an eighth note, ms
  const bars = [
    [74, 76, 78, 74, 78, 74, 78, 74], [76, 78, 79, 76, 79, 76, 79, 76], [78, 79, 81, 78, 81, 78, 81, 78],
    [81, 79, 78, 76, 78, 76, 74, 73], [74, 76, 78, 74, 78, 74, 78, 74], [76, 78, 79, 76, 79, 76, 79, 76],
    [78, 76, 74, 76, 78, 81, 79, 78], [76, 74, 73, 71, 74, 76, 74, 74], [81, 78, 74, 78, 81, 78, 74, 74],
  ];
  /** @type {TuneNote[]} */ const notes = [];
  let t = 0;
  for (const bar of bars) for (const p of bar) { notes.push({ t, d: q - 30, p }); t += q; }
  return { title: 'The Tavern Jig', notes };
}
