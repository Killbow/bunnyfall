// @ts-check
import { midiNote, SCORE_TPQ, SCORE_STING_LEAD_MS } from '../../worldEvents/gateScore.js';

// Music packs replace these songs by name, so the names keep the 8-character stem form of the other made songs.
export const SPIRE_SONGS = Object.freeze({
  gal: 'SPIREGAL.HMI', crn: 'SPIRECRN.HMI', shd: 'SPIRESHD.HMI', wel: 'SPIREWEL.HMI', yard: 'SPIREYRD.HMI', set: 'SPIRESET.HMI', wake: 'SPIRWAKE.HMI',
  lord1: 'SPIRLRD1.HMI', lord2: 'SPIRLRD2.HMI', lord3: 'SPIRLRD3.HMI', valk: 'SPIRVALK.HMI', redoubt: 'SPIRREDT.HMI', count: 'SPIRECNT.HMI', end: 'SPIREEND.HMI',
});
export const SPIRE_BAND_SONGS = Object.freeze([SPIRE_SONGS.gal, SPIRE_SONGS.crn, SPIRE_SONGS.shd, SPIRE_SONGS.wel]);
export const SPIRE_SCORE_SILENCE = 'silence';
// `SPIRE_WAKE_MS` is about 2 bars at 138 BPM, and `SPIRE_END_MS` ends inside the end song's 12 bars at 70 BPM, so
// it never loops.
export const SPIRE_COUNT_WARN_MS = 120_000;
export const SPIRE_WAKE_MS = 3_400;
export const SPIRE_END_MS = 36_000;
export const EG_SCORE_PRIORITY = Object.freeze(['end', 'valk', 'redoubt', 'count', 'wake', 'lord', 'set', 'yard', 'hall', 'ambience']);

export const SPIRE_PROGRAMS = Object.freeze({ ostinato: 57, bass: 32, strings: 48, brass: 61, choir: 52, organ: 19, timpani: 47, horn: 60, harp: 46, bells: 14, hit: 55, pizz: 45, trem: 44, swell: 119, chant: 53 });
// The kit must stay on channel 9, the General MIDI percussion channel.
export const SPIRE_CHANNELS = Object.freeze({ ostinato: 0, bass: 1, strings: 2, brass: 3, choir: 4, organ: 5, timpani: 6, horn: 7, harp: 8, kit: 9, bells: 10, hit: 11, pizz: 12, trem: 13, swell: 14, chant: 15 });
const MIX = Object.freeze({
  ostinato: [112, 58], bass: [100, 64], strings: [104, 88], brass: [120, 44], choir: [108, 76], organ: [80, 64], timpani: [114, 64],
  horn: [116, 38], harp: [96, 30], bells: [96, 98], hit: [108, 64], pizz: [104, 72], trem: [92, 100], swell: [86, 64], chant: [104, 50],
});
const KIT_LEVEL = 118;
export const SPIRE_VOICES = Object.freeze({
  ostinato: Object.freeze({ attack: 0.006, decay: 0.12, sustain: 0.5, release: 0.07, index: 5, idxDecay: 0.16, unison: 2, cents: 7, spread: 0.2 }),
  bass: Object.freeze({ index: 2.2 }),
  strings: Object.freeze({ attack: 0.14, release: 0.7, index: 2, idxDecay: 2, unison: 3, cents: 12, spread: 0.5 }),
  brass: Object.freeze({ attack: 0.04, index: 5, idxDecay: 0.7, unison: 3, cents: 9, spread: 0.35 }),
  choir: Object.freeze({ mod: 1, index: 1.3, idxDecay: 2, attack: 0.3, release: 0.9, unison: 3, cents: 14, spread: 0.45 }),
  organ: Object.freeze({ unison: 2, cents: 4, spread: 0.3 }),
  timpani: Object.freeze({ decay: 0.9, release: 0.5 }),
  horn: Object.freeze({ attack: 0.06, index: 3, idxDecay: 0.7, unison: 2, cents: 6, spread: 0.25 }),
  harp: Object.freeze({ unison: 2, cents: 5, spread: 0.3 }),
  bells: Object.freeze({ unison: 2, cents: 3, spread: 0.3 }),
  hit: Object.freeze({ index: 4.5, decay: 0.5, release: 0.35, unison: 2, cents: 15, sub: 0.35, spread: 0.4 }),
  pizz: Object.freeze({ attack: 0.003, decay: 0.15, sustain: 0.02, release: 0.08, index: 3.4, idxDecay: 0.07, sub: 0.15 }),
  trem: Object.freeze({ attack: 0.02, decay: 0.1, sustain: 0.8, release: 0.12, index: 2.4, idxDecay: 0.8, unison: 2, cents: 16, spread: 0.6 }),
  swell: Object.freeze({ mod: 3.73, index: 7, idxDecay: 4, attack: 1.7, decay: 0.02, sustain: 1, release: 0.05, gain: 0.5 }),
  chant: Object.freeze({ mod: 2, index: 1.8, idxDecay: 0.3, attack: 0.02, decay: 0.12, sustain: 0.65, release: 0.12, unison: 3, cents: 10, spread: 0.4 }),
});
const VOICES_BY_CHANNEL = Object.freeze(Object.fromEntries(Object.entries(SPIRE_VOICES).map(([v, o]) => [SPIRE_CHANNELS[v], o])));
export const SPIRE_LEVEL = Object.freeze({ hall: 1.3, yard: 1.45, set: 1.5, wake: 1.5, lord1: 1.45, lord2: 1.56, lord3: 1.64, valk: 1.66, redoubt: 1.25, count: 1.68, end: 1.4 });
const PRESS = Object.freeze({ threshold: -18, knee: 12, ratio: 3, attack: 0.012, release: 0.25, ceiling: -1 });
export const SPIRE_PRESS = Object.freeze(Object.fromEntries(Object.entries({ hall: 4.4, yard: 5.0, set: 5.2, wake: 5.0, lord1: 5.2, lord2: 5.4, lord3: 5.8, valk: 6.3, redoubt: 4.2, count: 5.9, end: 4.6 }).map(([k, out]) => [k, Object.freeze({ ...PRESS, out })])));
const KIT = Object.freeze({ kick: 36, snare: 38, rim: 40, lowTom: 41, hat: 42, highFloorTom: 43, tom: 45, openHat: 46, lowMidTom: 47, hiMidTom: 48, crash: 49, chinese: 52, anvil: 53, crash2: 57, woodHi: 76, woodLo: 77, shaker: 82, muteSurdo: 86, surdo: 87 });
export const SPIRE_KIT = Object.freeze({
  [KIT.kick]: Object.freeze({ hz: 52, decay: 0.38, gain: 1.15, click: 0.55 }),
  [KIT.surdo]: Object.freeze({ hz: 64, decay: 0.95, gain: 1.3, drop: 0.7, click: 0.45 }),
  [KIT.muteSurdo]: Object.freeze({ hz: 72, decay: 0.35, gain: 1, click: 0.35 }),
  [KIT.lowTom]: Object.freeze({ hz: 82, decay: 0.55, gain: 1, click: 0.3 }),
  [KIT.highFloorTom]: Object.freeze({ hz: 100, decay: 0.5, click: 0.3 }),
  [KIT.tom]: Object.freeze({ hz: 122, decay: 0.45, click: 0.3 }),
  [KIT.lowMidTom]: Object.freeze({ hz: 150, decay: 0.4, click: 0.3 }),
  [KIT.hiMidTom]: Object.freeze({ hz: 180, decay: 0.38, click: 0.3 }),
  [KIT.snare]: Object.freeze({ hz: 2000, q: 0.7, decay: 0.24, gain: 0.95, body: 185 }),
  [KIT.rim]: Object.freeze({ hz: 2600, q: 0.9, decay: 0.1, gain: 0.7, body: 220 }),
  [KIT.crash]: Object.freeze({ decay: 2, q: 0.45, gain: 0.85 }),
  [KIT.crash2]: Object.freeze({ decay: 2.6, q: 0.4, gain: 0.9 }),
  [KIT.chinese]: Object.freeze({ decay: 1.3, q: 0.55 }),
  [KIT.anvil]: Object.freeze({ hz: 1650, decay: 0.9, gain: 0.7, click: 0.7 }),
  [KIT.hat]: Object.freeze({ hz: 8000, q: 0.8, decay: 0.05, gain: 0.85 }),
  [KIT.openHat]: Object.freeze({ hz: 7000, q: 0.7, decay: 0.28, gain: 0.7 }),
  [KIT.shaker]: Object.freeze({ decay: 0.06, gain: 0.7 }),
  [KIT.woodHi]: Object.freeze({ click: 0.3 }),
  [KIT.woodLo]: Object.freeze({ click: 0.3 }),
});

const CHORDS = Object.freeze({
  Em: { bass: 'E1', timp: 'E2', pad: ['E3', 'B3', 'E4'], str: ['E4', 'G4', 'B4'], choir: ['E3', 'B3', 'G4'], ost: 'E2', stab: ['E3', 'B3', 'E4'] },
  F: { bass: 'F1', timp: 'C2', pad: ['F2', 'C3', 'F3'], str: ['F4', 'A4', 'C5'], choir: ['F2', 'C3', 'A3'], ost: 'F2', stab: ['F2', 'C3', 'F3'] },
  G: { bass: 'G1', timp: 'D2', pad: ['G2', 'D3', 'G3'], str: ['D4', 'G4', 'B4'], choir: ['G2', 'D3', 'B3'], ost: 'G2', stab: ['G2', 'D3', 'G3'] },
  Dm: { bass: 'D2', timp: 'D2', pad: ['D3', 'A3', 'D4'], str: ['D4', 'F4', 'A4'], choir: ['D3', 'A3', 'F4'], ost: 'D2', stab: ['D3', 'A3', 'D4'] },
  Am: { bass: 'A1', timp: 'A2', pad: ['A2', 'E3', 'A3'], str: ['C4', 'E4', 'A4'], choir: ['A2', 'E3', 'C4'], ost: 'A1', stab: ['A2', 'E3', 'A3'] },
  C: { bass: 'C2', timp: 'C2', pad: ['C3', 'G3', 'C4'], str: ['C4', 'E4', 'G4'], choir: ['C3', 'G3', 'E4'], ost: 'C2', stab: ['C3', 'G3', 'C4'] },
  Bdim: { bass: 'B1', timp: 'B2', pad: ['B2', 'F3', 'B3'], str: ['B3', 'D4', 'F4'], choir: ['B2', 'F3', 'D4'], ost: 'B1', stab: ['B2', 'F3', 'B3'] },
  E: { bass: 'E1', timp: 'E2', pad: ['E3', 'B3', 'E4'], str: ['E4', 'G#4', 'B4'], choir: ['E3', 'B3', 'G#4'], ost: 'E2', stab: ['E3', 'B3', 'E4'] },
  A: { bass: 'A1', timp: 'A2', pad: ['A2', 'E3', 'A3'], str: ['C#4', 'E4', 'A4'], choir: ['A2', 'E3', 'C#4'], ost: 'A1', stab: ['A2', 'E3', 'A3'] },
  B: { bass: 'B1', timp: 'B2', pad: ['B2', 'F#3', 'B3'], str: ['D#4', 'F#4', 'B4'], choir: ['B2', 'F#3', 'D#4'], ost: 'B1', stab: ['B2', 'F#3', 'B3'] },
  Csm: { bass: 'C#2', timp: 'C#2', pad: ['C#3', 'G#3', 'C#4'], str: ['C#4', 'E4', 'G#4'], choir: ['C#3', 'G#3', 'E4'], ost: 'C#2', stab: ['C#3', 'G#3', 'C#4'] },
});
const PROG = Object.freeze({
  hallA: ['Em', 'F', 'Em', 'Dm', 'C', 'F', 'Em', 'Em'], hallB: ['Am', 'F', 'G', 'Em', 'Dm', 'F', 'Em', 'Em'], hallC: ['Em', 'G', 'F', 'Em', 'Am', 'Dm', 'F', 'Em'],
  war: ['Em', 'F', 'Em', 'F', 'Dm', 'F', 'Bdim', 'Em'], war3: ['Em', 'F', 'Bdim', 'F', 'Em', 'F', 'Dm', 'Em'],
  hymn: ['E', 'A', 'E', 'B', 'Csm', 'A', 'B', 'E'], count: ['Em', 'F', 'Em', 'F', 'Em', 'F', 'Bdim', 'F'], end: ['Em', 'C', 'Am', 'F', 'Em', 'F', 'Em', 'Em'],
});
export const EG_FANFARE = Object.freeze([['E4', 0.5], ['E4', 0.5], ['B4', 1], ['G#4', 1], ['E5', 1]]);
export const EG_FANFARE_BROKEN = Object.freeze([['E4', 0.5], ['E4', 0.5], ['B4', 1], ['G4', 1], ['F4', 1]]);
export const EG_SCORE_BAND_MOTIFS = Object.freeze([
  EG_FANFARE_BROKEN,
  Object.freeze([['B4', 1], ['A4', 1], ['G4', 1], ['F4', 1]]),
  Object.freeze([['E5', 1.5], ['F5', 0.5], ['E5', 1], ['B4', 1]]),
  Object.freeze([['E3', 0.5], ['E3', 0.5], ['F3', 1], ['E3', 0.5], ['E3', 0.5], ['B2', 1]]),
]);
export const EG_SCORE_LORD_MOTIFS = Object.freeze([
  [[['E3', 0.5], ['E3', 0.5], ['G3', 1], ['F3', 2]], [['E3', 0.5], ['B2', 0.5], ['E3', 1], ['F3', 2]], [['G3', 1], ['A3', 1], ['F3', 1], ['E3', 1]], [['B2', 2], ['E3', 2]]],
  [[['B4', 1], ['C5', 1], ['B4', 1], ['F4', 1]], [['A4', 2], ['G4', 2]], [['B4', 0.5], ['C5', 0.5], ['D5', 1], ['C5', 2]], [['B4', 3], ['F4', 1]]],
  [[['E4', 1.5], ['E4', 0.5], ['D4', 1], ['E4', 1]], [['F4', 2], ['E4', 2]], [['G4', 1.5], ['F4', 0.5], ['E4', 1], ['D4', 1]], [['E4', 4]]],
  [[['E4', 0.5], ['B4', 0.5], ['E5', 2], ['F5', 1]], [['E5', 1], ['C5', 1], ['B4', 2]], [['G4', 0.5], ['B4', 0.5], ['F5', 2], ['E5', 1]], [['B4', 2], ['F4', 2]]],
  [[['A3', 2], ['G#3', 2]], [['A3', 1], ['C4', 1], ['B3', 2]], [['F3', 2], ['E3', 2]], [['D3', 2], ['E3', 2]]],
  [[['E4', 1], ['G4', 1], ['E4', 1], ['G4', 1]], [['F4', 1], ['A4', 1], ['F4', 1], ['A4', 1]], [['E4', 0.5], ['F4', 0.5], ['G4', 1], ['F4', 0.5], ['E4', 0.5], ['D4', 1]], [['E4', 2], ['B3', 2]]],
  [[['B3', 2], ['C4', 1], ['B3', 1]], [['E4', 2], ['F4', 2]], [['G4', 1], ['F4', 1], ['E4', 1], ['C4', 1]], [['B3', 4]]],
  [[['E5', 1], ['D5', 1], ['C5', 1], ['B4', 1]], [['F5', 2], ['E5', 2]], [['C5', 1], ['B4', 1], ['A4', 1], ['G4', 1]], [['F4', 2], ['E4', 2]]],
  [[['E3', 0.75], ['F3', 0.25], ['E3', 3]], [['B2', 0.75], ['C3', 0.25], ['B2', 3]], [['G3', 0.75], ['F3', 0.25], ['E3', 3]], [['F3', 1], ['E3', 3]]],
  [[['B4', 1], ['E5', 1], ['F5', 2]], [['E5', 1], ['B4', 1], ['G4', 2]], [['A4', 1], ['C5', 1], ['F5', 2]], [['E5', 4]]],
  [[['E2', 1], ['E2', 1], ['E2', 1], ['F2', 1]], [['E2', 1], ['E2', 1], ['G2', 1], ['F2', 1]], [['E2', 1], ['B1', 1], ['E2', 1], ['F2', 1]], [['E2', 2], ['E2', 2]]],
  [[['E4', 0.5], ['G4', 0.5], ['B4', 0.5], ['C5', 0.5], ['B4', 2]], [['F4', 0.5], ['A4', 0.5], ['C5', 0.5], ['D5', 0.5], ['C5', 2]], [['B4', 1], ['G4', 1], ['F4', 2]], [['E4', 4]]],
  [[['E3', 1], ['B3', 1], ['F4', 2]], [['E4', 1], ['D4', 1], ['C4', 1], ['B3', 1]], [['E3', 1], ['B3', 1], ['G4', 2]], [['F4', 2], ['E4', 2]]],
].map((m) => Object.freeze(m.map((bar) => Object.freeze(bar.map((n) => Object.freeze(n)))))));

const RANK = { programChange: 0, controller: 0, noteOn: 1 };
// Notes before bar 0 or past the last bar are dropped, so a swell into bar 0 must be written into the last bar.
function makeSong(name, bpm, bars, write, level = 1, press = null) {
  const events = [], struck = new Map();
  const tick = (bar, beat) => Math.round((bar * 4 + beat) * SCORE_TPQ);
  const end = bars * 4 * SCORE_TPQ;
  const w = {
    note(voice, bar, beat, beats, n, velocity) {
      const note = typeof n === 'number' ? n : midiNote(n), at = tick(bar, beat), channel = SPIRE_CHANNELS[voice];
      if (at >= end || at < 0) return;
      const v = Math.max(1, Math.min(127, Math.round(velocity))), duration = Math.max(1, Math.min(end - at, Math.round(beats * SCORE_TPQ)));
      const key = (at * 16 + channel) * 128 + note, was = struck.get(key);
      if (was) { was.velocity = Math.max(was.velocity, v); was.duration = Math.max(was.duration, duration); return; }
      const e = { tick: at, type: 'noteOn', channel, note, velocity: v, duration };
      struck.set(key, e);
      events.push(e);
    },
    hit(key, bar, beat, velocity) { w.note('kit', bar, beat, 0.25, KIT[key], velocity); },
  };
  write(w);
  for (const [voice, [lv, pan]] of Object.entries(MIX)) {
    const channel = SPIRE_CHANNELS[voice];
    events.push({ tick: 0, type: 'programChange', channel, program: SPIRE_PROGRAMS[voice] });
    events.push({ tick: 0, type: 'controller', channel, controller: 7, value: lv });
    events.push({ tick: 0, type: 'controller', channel, controller: 10, value: pan });
  }
  events.push({ tick: 0, type: 'controller', channel: SPIRE_CHANNELS.kit, controller: 7, value: KIT_LEVEL });
  events.sort((a, b) => a.tick - b.tick || RANK[a.type] - RANK[b.type]);
  return { name, press, beatsPerMinute: bpm, secondsPerTick: 60 / (bpm * SCORE_TPQ), events, durationTicks: end, seamless: true, level, voices: VOICES_BY_CHANNEL, kit: SPIRE_KIT };
}
function line(w, bar0, bars, voice, velocity, octave = 0) {
  bars.forEach((notes, b) => { let beat = 0; for (const [n, beats] of notes) { w.note(voice, bar0 + b, beat, beats * 0.92, midiNote(n) + 12 * octave, velocity + (beat === 0 ? 8 : 0)); beat += beats; } });
}
function roll(w, voice, bar, beat0, beats, n, v0, v1, step = 0.25) {
  const k = Math.round(beats / step);
  for (let i = 0; i < k; i++) {
    const v = v0 + ((v1 - v0) * i) / Math.max(1, k - 1);
    if (voice === 'kit') w.hit(n, bar, beat0 + i * step, v); else w.note(voice, bar, beat0 + i * step, step * 0.9, n, v);
  }
}
const ACCENT8 = Object.freeze([true, false, false, true, false, false, true, false]);
const GALLOP = Object.freeze([0, 0.75, 1.5, 2, 2.75, 3.5]);
const GALLOP16 = Object.freeze([0, 3, 6, 8, 11, 14]);
function drums(w, bar, drive, { vel = 1, fill = bar % 4 === 3, crash = bar % 8 === 0 } = {}) {
  const h = (k, beat, v) => w.hit(k, bar, beat, v * vel);
  if (drive <= 0) {
    h('surdo', 0, 92); h('lowTom', 2.5, 72);
    if (bar % 2) h('surdo', 3, 80); else h('muteSurdo', 1.5, 58);
    for (let i = 0; i < 8; i++) h('shaker', i * 0.5, ACCENT8[i] ? 52 : 38);
    return;
  }
  if (drive === 1) {
    h('surdo', 0, 104); h('surdo', 1.5, 90); h('surdo', 3, 96);
    h('muteSurdo', 0.5, 64); h('muteSurdo', 2.5, 70);
    h('lowTom', 2, 82); h('snare', 2, 84);
    for (let i = 0; i < 16; i++) h('shaker', i * 0.25, GALLOP16.includes(i) ? 64 : 44);
  } else {
    for (const b of GALLOP) h('kick', b, b === 0 || b === 2 ? 112 : 96);
    h('surdo', 0, 116); h('surdo', 2, 106);
    h('snare', 1, 104); h('snare', 3, 110);
    for (const b of [0.5, 1.5, 2.5, 3.5]) h('tom', b, 78);
    for (let i = 0; i < 16; i++) if (i !== 14) h('hat', i * 0.25, i % 2 ? 58 : 78);
    h('openHat', 3.5, 74);
    if (drive >= 3) { for (let i = 0; i < 8; i++) h('kick', i * 0.5, 100); h('surdo', 1, 100); h('surdo', 3, 108); h('rim', 1.75, 76); h('rim', 3.75, 84); }
  }
  if (fill) {
    const n = drive >= 3 ? 8 : 4, keys = ['hiMidTom', 'lowMidTom', 'tom', 'highFloorTom', 'lowTom'];
    for (let i = 0; i < n; i++) h(keys[Math.floor((i * keys.length) / n)], 4 - n * 0.25 + i * 0.25, 92 + (i * 24) / n);
  }
  if (crash) h(drive >= 2 ? 'crash2' : 'crash', 0, 104);
  if (drive >= 2 && bar % 8 === 4) h('chinese', 0, 90);
}
function bed(w, bar, chord, { drive = 0, strings = true, choir = false, organ = 1, vel = 1 } = {}) {
  const c = CHORDS[chord];
  if (drive >= 1) ACCENT8.forEach((acc, i) => w.note('ostinato', bar, i * 0.5, 0.4, c.ost, (acc ? 110 : 76) * vel));
  if (drive >= 2) for (let s = 12; s < 16; s++) w.note('ostinato', bar, s * 0.25, 0.2, s === 15 ? midiNote(c.ost) + 1 : c.ost, 92 * vel);
  for (const [b, len] of drive >= 2 ? [[0, 1.4], [1.5, 1.4], [3, 0.9]] : [[0, 3.8]]) w.note('bass', bar, b, len, c.bass, (b ? 92 : 100) * vel);
  if (organ > 0) for (const n of c.pad) w.note('organ', bar, 0, 4, n, 78 * organ);
  if (strings) for (const n of c.str) w.note('strings', bar, 0, 4, n, 86 * vel);
  if (choir) for (const n of c.choir) w.note('choir', bar, 0, 4, n, 92 * vel);
}
const SPICC = Object.freeze([0, 0, 12, 0, 7, 0, 12, 0, 0, 0, 12, 0, 7, 12, 7, 0]);
function spicc(w, bar, chord, per, vel, oct = 0) {
  const c = CHORDS[chord], root = midiNote(c.ost) + 12 * (1 + oct), fifth = midiNote(c.pad[1]) - midiNote(c.pad[0]), step = per === 16 ? 1 : 2;
  for (let i = 0; i < 16; i += step) w.note('pizz', bar, i * 0.25, step * 0.2, root + (SPICC[i] === 7 ? fifth : SPICC[i]), vel + (GALLOP16.includes(i) ? 18 : 0));
}
const CHANT = Object.freeze({ a: Object.freeze([[0, 0.7], [1.5, 0.7], [3, 0.45], [3.5, 0.45]]), b: Object.freeze([[0, 0.4], [0.5, 0.4], [1, 0.4], [1.5, 0.9], [2.5, 0.4], [3, 0.9]]) });
function chant(w, bar, chord, fig, vel) {
  const c = CHORDS[chord], root = 60 + (midiNote(c.ost) % 12), fifth = root + midiNote(c.pad[1]) - midiNote(c.pad[0]);
  for (const [b, len] of CHANT[fig]) { w.note('chant', bar, b, len, root, vel + (b === 0 ? 10 : 0)); w.note('chant', bar, b, len, fifth, vel - 6); }
}
function trem(w, bar, notes, vel, beat0 = 0, beats = 4) {
  for (let i = 0; i < beats * 4; i++) for (const n of notes) w.note('trem', bar, beat0 + i * 0.25, 0.22, n, vel + (i % 4 === 0 ? 8 : 0));
}
function ripple(w, bar, chord, vel) {
  const c = CHORDS[chord], ns = [...new Set([...c.pad, ...c.str].map(midiNote))].sort((a, b) => a - b);
  for (let i = 0; i < 16; i++) { const j = i < 8 ? i : 15 - i; w.note('harp', bar, i * 0.25, 0.5, ns[j % ns.length] + 12 * Math.floor(j / ns.length), vel + (i % 4 === 0 ? 10 : 0)); }
}
function braam(w, bar, chord, vel) {
  const c = CHORDS[chord], o = midiNote(c.ost);
  for (const n of chord === 'Em' ? [o - 12, o, o + 7, o + 13] : [o - 12, o, o + 7, o + 12]) w.note('ostinato', bar, 0, 2.5, n, vel);
  for (const n of c.stab) w.note('hit', bar, 0, 1.5, n, vel);
  w.note('timpani', bar, 0, 1, c.timp, vel);
  w.hit('surdo', bar, 0, vel); w.hit('crash2', bar, 0, vel - 4);
}
export const SPIRE_SWELL_S = 1.7;
function swellInto(w, bar, bpm, vel) {
  const len = (SPIRE_SWELL_S * bpm) / 60;
  for (const n of ['E6', 'F6']) w.note('swell', bar, -len, len, n, vel);
  roll(w, 'timpani', bar - 1, 3, 1, 'E2', vel - 40, vel);
}
function die(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function spireVariantOrder(seed) {
  const orders = [[0, 1, 2], [1, 2, 0], [2, 0, 1], [0, 2, 1], [2, 1, 0], [1, 0, 2]];
  return orders[(seed >>> 0) % 6];
}

function hallSong(band, seed) {
  const bpm = [100, 88, 92, 110][band], order = spireVariantOrder(seed), motif = EG_SCORE_BAND_MOTIFS[band];
  return makeSong(SPIRE_BAND_SONGS[band], bpm, 96, (w) => {
    order.forEach((v, slot) => {
      const r = die(0xe617 + band * 97 + v * 13), prog = [PROG.hallA, PROG.hallB, PROG.hallC][v], b0 = slot * 32;
      for (let k = 0; k < 32; k++) {
        const bar = b0 + k, chord = prog[k % 8], c = CHORDS[chord], sec = k >> 3, lift = [0.84, 0.92, 0.98, 1.04][sec];
        bed(w, bar, chord, { drive: band === 3 ? 1 + (sec >= 3 ? 1 : 0) : sec >= 1 ? 1 : 0, strings: band !== 2 || k % 2 === 0 || sec >= 2, choir: band === 1 || sec >= 2, organ: band === 1 ? 1.1 : 0.7, vel: lift });
        spicc(w, bar, chord, sec >= 2 ? 16 : 8, 62 + sec * 8, band === 2 ? 1 : 0);
        drums(w, bar, band === 3 ? Math.min(2, 1 + (sec >> 1)) : [0, 1, 1, 2][sec], { vel: k >= 30 ? 0.86 : 0.92 });
        if (sec >= 1 && k % 8 === 0) braam(w, bar, chord, 96 + sec * 6);
        if (k % 8 === 7) swellInto(w, bar + 1, bpm, 78 + sec * 8);
        if (band === 0) {
          if (k % 8 === 0) w.note('timpani', bar, 0, 1, c.timp, 100);
          if (sec === 3 && k % 2 === 0) trem(w, bar, ['E5', 'F5'], 58, 2, 2);
        }
        if (band === 1) {
          if (k % 4 === 0) w.note('bells', bar, 0, 4, 'B2', 92);
          if (sec >= 1) chant(w, bar, chord, 'a', 74 + sec * 6);
        }
        if (band === 2) {
          ripple(w, bar, chord, 60 + Math.floor(r() * 14) + sec * 4);
          if (k % 8 === 4) w.note('bells', bar, 2, 2, 'E6', 74);
          if (k % 8 === 6) w.note('bells', bar, 2, 2, 'F6', 68);
          if (sec <= 1) { w.hit('kick', bar, 0, 90); w.hit('kick', bar, 0.375, 70); }
          if (sec >= 2 && k % 4 >= 2) trem(w, bar, ['B5', 'C6'], 50 + sec * 4);
        }
        if (band === 3) ACCENT8.forEach((acc, i) => { if (acc && (sec >= 1 || k % 2 === 0)) w.hit('anvil', bar, i * 0.5, 96 + (i === 0 ? 10 : 0)); });
      }
      for (let k = 8; k < 32; k += 8) {
        const voice = v === 0 ? 'horn' : v === 1 ? 'strings' : 'brass', oct = band === 3 ? 0 : v === 2 ? -1 : 0;
        line(w, b0 + k, [motif], voice, 104 + Math.floor(r() * 10), oct);
        if (k + 4 < 32) line(w, b0 + k + 4, [motif], v === 0 ? 'strings' : 'horn', 92, oct + (v === 0 ? 1 : 0));
        if (k === 24) { line(w, b0 + k, [motif], voice === 'brass' ? 'horn' : 'brass', 100, oct + 1); line(w, b0 + k + 6, [motif], 'strings', 96, oct + 1); }
      }
    });
  }, SPIRE_LEVEL.hall, SPIRE_PRESS.hall);
}
function yardSong(band) {
  const motif = EG_SCORE_BAND_MOTIFS[band];
  return makeSong(SPIRE_SONGS.yard, 132, 32, (w) => {
    for (let bar = 0; bar < 32; bar++) {
      const chord = PROG.war[bar % 8], c = CHORDS[chord], brk = bar >= 16 && bar < 20, build = bar >= 20 && bar < 24, height = bar >= 24;
      bed(w, bar, chord, { drive: brk ? 0 : height ? 2 : 1, choir: bar >= 16, strings: !brk, organ: brk ? 0.5 : 1, vel: brk ? 0.85 : 1 });
      spicc(w, bar, chord, brk ? 8 : 16, brk ? 70 : 84);
      drums(w, bar, brk ? 0 : height ? (bar >= 28 ? 3 : 2) : bar >= 4 && !build ? 2 : 1);
      w.note('timpani', bar, 0, 1, c.timp, 108);
      if (bar % 2 === 0) for (const n of c.stab) w.note('brass', bar, 0, 0.9, n, 108);
      if (band === 3 && bar % 2 === 1) w.hit('anvil', bar, 2, 100);
      if (bar >= 16) chant(w, bar, chord, brk ? 'a' : 'b', brk ? 84 : 92);
      if (build) trem(w, bar, ['B5', 'C6'], 60 + (bar - 20) * 10);
      if (bar >= 22 && bar < 24) roll(w, 'kit', bar, 0, 4, 'snare', 60 + (bar - 22) * 30, 90 + (bar - 22) * 30);
      if (bar === 0 || bar === 16 || bar === 24) braam(w, bar, chord, 116);
      if (bar === 3 || bar === 15 || bar === 23 || bar === 31) swellInto(w, bar + 1, 132, 96);
    }
    for (let bar = 4; bar < 32; bar += 2) line(w, bar, [motif], 'brass', 112, band === 2 ? -1 : 0);
    line(w, 8, [EG_FANFARE_BROKEN], 'horn', 110);
    line(w, 24, [EG_FANFARE_BROKEN], 'horn', 116);
    for (const k of [24, 26, 28, 30]) line(w, k, [motif], 'strings', 100, (band === 2 ? -1 : 0) + 1);
  }, SPIRE_LEVEL.yard, SPIRE_PRESS.yard);
}
function setSong(band) {
  const motif = EG_SCORE_BAND_MOTIFS[band];
  return makeSong(SPIRE_SONGS.set, 140, 8, (w) => {
    for (let bar = 0; bar < 8; bar++) {
      const chord = PROG.count[bar], c = CHORDS[chord];
      bed(w, bar, chord, { drive: 2, choir: true, vel: 1.05 });
      drums(w, bar, bar >= 6 ? 3 : 2, { fill: bar % 2 === 1 });
      spicc(w, bar, chord, 16, 90);
      chant(w, bar, chord, 'b', 96);
      for (const n of c.stab) w.note('hit', bar, 0, 1, n, 104);
      line(w, bar, [motif], bar % 2 ? 'horn' : 'brass', 112, Math.floor(bar / 4));
      if (bar >= 4) trem(w, bar, ['B5', 'C6'], 66 + (bar - 4) * 6);
    }
    braam(w, 0, PROG.count[0], 118); braam(w, 4, PROG.count[4], 120);
    swellInto(w, 4, 140, 100); swellInto(w, 8, 140, 104);
    roll(w, 'kit', 7, 2, 2, 'snare', 80, 124);
  }, SPIRE_LEVEL.set, SPIRE_PRESS.set);
}
function wakeSong() {
  return makeSong(SPIRE_SONGS.wake, 138, 2, (w) => {
    for (let i = 0; i < 32; i++) w.note('timpani', Math.floor(i / 16), (i % 16) * 0.25, 0.22, 'E2', 44 + i * 2.6);
    for (let i = 0; i < 16; i++) {
      w.hit(i % 2 ? 'lowTom' : 'surdo', Math.floor(i / 8), (i % 8) * 0.5, 50 + i * 4);
      w.note('ostinato', Math.floor(i / 8), (i % 8) * 0.5, 0.45, i % 4 === 3 ? 'F2' : 'E2', 52 + i * 4);
    }
    swellInto(w, 2, 138, 104);
    w.hit('crash', 1, 3.5, 100);
    w.note('chant', 1, 3.5, 0.5, 'E4', 112); w.note('chant', 1, 3.5, 0.5, 'B4', 106);
  }, SPIRE_LEVEL.wake, SPIRE_PRESS.wake);
}
function lordSong(phase, motifIdx) {
  const motif = EG_SCORE_LORD_MOTIFS[motifIdx] ?? EG_SCORE_LORD_MOTIFS[0], bpm = [138, 144, 152][phase - 1], prog = phase === 3 ? PROG.war3 : PROG.war;
  return makeSong(SPIRE_SONGS[`lord${phase}`], bpm, 32, (w) => {
    for (let bar = 0; bar < 32; bar++) {
      const chord = prog[bar % 8], c = CHORDS[chord], sec = bar >> 3;
      bed(w, bar, chord, { drive: phase >= 2 || sec >= 1 ? 2 : 1, choir: phase >= 2 || bar >= 16, organ: 1 + 0.1 * phase, vel: 1 + 0.03 * phase });
      drums(w, bar, phase >= 3 || sec === 3 ? 3 : 2);
      spicc(w, bar, chord, phase >= 2 || sec >= 1 ? 16 : 8, 84 + phase * 4);
      for (let i = 0; i < (phase >= 3 ? 8 : 2); i++) w.note('timpani', bar, i * (phase >= 3 ? 0.5 : 2), 0.45, c.timp, i === 0 ? 112 : 96);
      for (const n of c.stab) { w.note('hit', bar, 0, 1, n, 104); if (phase >= 2) w.note('hit', bar, 2.5, 0.5, n, 98); }
      if (bar % 8 === 0) w.note('bells', bar, 0, 4, phase === 3 ? 'B2' : 'E3', 94);
      if (bar % (phase >= 3 ? 4 : 8) === 0) braam(w, bar, chord, 108 + phase * 4);
      if (bar % 8 === 7) swellInto(w, bar + 1, bpm, 90 + phase * 4);
      if ((phase >= 2 && bar >= 8) || phase >= 3) chant(w, bar, chord, phase >= 3 ? 'b' : 'a', 86 + phase * 4);
      if (phase >= 2 && sec >= (phase === 2 ? 3 : 2) && bar % 2 === 0) trem(w, bar, ['B5', 'C6'], 62 + phase * 4);
      if (bar === 23) roll(w, 'kit', bar, 2, 2, 'snare', 70, 122);
    }
    for (let k = 0; k < 32; k += 8) {
      line(w, k, motif, 'brass', 112 + phase * 2, String(motif[0][0][0]).endsWith('2') ? 1 : 0);
      if (phase >= 2) line(w, k + 4, motif, 'horn', 108, 0);
      if (phase >= 3) line(w, k + 4, motif, 'strings', 100, 1);
    }
    line(w, 24, motif.slice(0, 2), 'strings', 100, 1);
  }, SPIRE_LEVEL[`lord${phase}`], SPIRE_PRESS[`lord${phase}`]);
}
function valkSong(motifIdx) {
  const motif = EG_SCORE_LORD_MOTIFS[motifIdx] ?? EG_SCORE_LORD_MOTIFS[3];
  return makeSong(SPIRE_SONGS.valk, 148, 48, (w) => {
    for (let bar = 0; bar < 48; bar++) {
      const tier = Math.floor(bar / 16), chord = (tier === 2 ? PROG.war3 : PROG.war)[bar % 8], c = CHORDS[chord];
      bed(w, bar, chord, { drive: 1 + Math.min(1, tier), choir: tier >= 1, vel: 1 + 0.04 * tier });
      drums(w, bar, 1 + tier);
      spicc(w, bar, chord, tier >= 1 ? 16 : 8, 82 + tier * 6);
      for (const n of c.stab) w.note('hit', bar, 0, 1, n, 100 + tier * 4);
      if (bar % 4 === 0) w.note('timpani', bar, 0, 2, c.timp, 104 + tier * 4);
      if (bar % 8 === 0) braam(w, bar, chord, 104 + tier * 6);
      if (bar % 8 === 7) swellInto(w, bar + 1, 148, 88 + tier * 6);
      if (tier >= 1) chant(w, bar, chord, tier >= 2 ? 'b' : 'a', 86 + tier * 4);
      if (tier >= 2 && bar % 2 === 0) trem(w, bar, ['B5', 'C6'], 70);
      if (tier >= 2 && bar % 4 === 3) roll(w, 'timpani', bar, 2, 2, c.timp, 80, 118);
    }
    for (let k = 0; k < 48; k += 8) { line(w, k, motif, 'brass', 112 + Math.floor(k / 16) * 3, 0); line(w, k + 4, [EG_FANFARE_BROKEN], 'horn', 108 + Math.floor(k / 16) * 3, Math.floor(k / 16) >= 2 ? 1 : 0); }
  }, SPIRE_LEVEL.valk, SPIRE_PRESS.valk);
}
function redoubtSong() {
  return makeSong(SPIRE_SONGS.redoubt, 72, 16, (w) => {
    for (let bar = 0; bar < 16; bar++) {
      const chord = PROG.hymn[bar % 8], up = CHORDS[chord].str.map(midiNote);
      bed(w, bar, chord, { drive: 0, choir: true, organ: 1.2 });
      [0, 1, 2, 3, 4, 5, 4, 3].forEach((j, i) => w.note('harp', bar, i * 0.5, 1, up[j % 3] + 12 * Math.floor(j / 3), 66 + (i === 0 ? 10 : 0)));
      if (bar % 4 === 3) roll(w, 'timpani', bar, 2, 2, 'E2', 36, 72);
    }
    line(w, 0, [EG_FANFARE], 'horn', 104);
    line(w, 4, [EG_FANFARE], 'horn', 108, 0);
    line(w, 8, [EG_FANFARE], 'brass', 100, -1);
    line(w, 12, [EG_FANFARE], 'horn', 112, 0);
    w.note('bells', 15, 0, 4, 'E5', 90);
  }, SPIRE_LEVEL.redoubt, SPIRE_PRESS.redoubt);
}
function countSong() {
  return makeSong(SPIRE_SONGS.count, 160, 16, (w) => {
    for (let bar = 0; bar < 16; bar++) {
      const chord = PROG.count[bar % 8], c = CHORDS[chord];
      bed(w, bar, chord, { drive: 2, choir: true, vel: 1.08 });
      drums(w, bar, 3);
      spicc(w, bar, chord, 16, 96);
      w.note('bells', bar, 0, 2, 'E3', 100);
      for (let i = 0; i < 8; i++) w.hit(i % 2 ? 'woodLo' : 'woodHi', bar, i * 0.5, i % 2 ? 84 : 100);
      for (const n of c.stab) { w.note('hit', bar, 0, 1, n, 108); w.note('hit', bar, 2, 1, n, 100); }
      chant(w, bar, chord, 'b', 98);
      if (bar >= 8) trem(w, bar, ['B5', 'C6'], 70 + (bar - 8) * 4);
      if (bar % 4 === 0) braam(w, bar, chord, 118);
      if (bar % 8 === 7) swellInto(w, bar + 1, 160, 100);
    }
    for (let k = 0; k < 16; k += 2) line(w, k, [EG_FANFARE_BROKEN], 'brass', 116, k >= 8 ? 1 : 0);
  }, SPIRE_LEVEL.count, SPIRE_PRESS.count);
}
function endSong() {
  return makeSong(SPIRE_SONGS.end, 70, 12, (w) => {
    braam(w, 0, 'Em', 124);
    for (let bar = 0; bar < 12; bar++) {
      const chord = PROG.end[bar % 8], fade = Math.max(0.25, 1 - bar / 12);
      if (bar < 8) bed(w, bar, chord, { drive: 0, choir: bar < 6, strings: true, organ: fade, vel: fade });
      else for (const n of CHORDS.Em.pad) w.note('organ', bar, 0, 4, n, 70 * fade);
    }
    ['E5', 'D5', 'C5', 'B4', 'A4', 'G4', 'F4'].forEach((n, i) => w.note('strings', i + 1, 0, 3.8, n, 92 - i * 7));
    for (let i = 0; i < 8; i++) w.note('timpani', 0, i * 0.5, 0.45, 'E2', 100 - i * 6);
    line(w, 1, [EG_FANFARE_BROKEN], 'horn', 100);
    line(w, 4, [[['G4', 2], ['F4', 2]]], 'horn', 88);
    w.note('bells', 7, 0, 4, 'E3', 84);
  }, SPIRE_LEVEL.end, SPIRE_PRESS.end);
}

const _made = new Map();
const made = (k, fn) => { let s = _made.get(k); if (!s) { if (_made.size > 48) _made.clear(); _made.set(k, s = fn()); } return s; };
/** @param {{ band?: number, motif?: number, valk?: number, seed?: number }} ctx */
export function spireScoreSongs({ band = 0, motif = 0, valk = 3, seed = 0 } = {}) {
  const b = Math.max(0, Math.min(3, band | 0)), order = (seed >>> 0) % 6;
  return Object.freeze({
    hall: made(`hall:${b}:${order}`, () => hallSong(b, seed)), yard: made(`yard:${b}`, () => yardSong(b)), set: made(`set:${b}`, () => setSong(b)), wake: made('wake', wakeSong),
    lord1: made(`lord1:${motif}`, () => lordSong(1, motif)), lord2: made(`lord2:${motif}`, () => lordSong(2, motif)), lord3: made(`lord3:${motif}`, () => lordSong(3, motif)),
    valk: made(`valk:${valk}`, () => valkSong(valk)), redoubt: made('redoubt', redoubtSong), count: made('count', countSong), end: made('end', endSong),
  });
}

export function spireScoreFor(place) {
  if (!place) return null;
  const key = spireScoreKey(place);
  if (key === 'ambience') return SPIRE_SCORE_SILENCE;
  if (key === 'end') return (place.sinceEnd ?? 0) < SPIRE_END_MS ? SPIRE_SONGS.end : SPIRE_SCORE_SILENCE;
  if (key === 'hall') return SPIRE_BAND_SONGS[Math.max(0, Math.min(3, place.band | 0))];
  if (key === 'lord') return SPIRE_SONGS[`lord${Math.max(1, Math.min(3, place.phase | 0 || 1))}`];
  return SPIRE_SONGS[key];
}
export function spireScoreKey(p) {
  const fight = p.sg === 'trial';
  const sleeping = fight && p.kind === 'court' && !!p.asleep;
  const rows = {
    end: !!p.end || (Number.isFinite(p.sinceFall) && p.sinceFall >= 0 && p.sinceFall < SPIRE_END_MS),
    valk: fight && p.kind === 'court' && !!p.valk,
    redoubt: p.sg === 'rest',
    count: Number.isFinite(p.countLeft) && p.countLeft > 0 && p.countLeft <= SPIRE_COUNT_WARN_MS && (fight || p.sg === 'closing'),
    wake: fight && p.kind === 'court' && !sleeping && (p.sinceWake ?? Infinity) < SPIRE_WAKE_MS,
    lord: fight && p.kind === 'court' && !sleeping,
    set: fight && !!p.set,
    yard: fight && (p.kind === 'yard' || p.kind === 'rampart'),
    hall: fight && !sleeping,
    ambience: true,
  };
  return EG_SCORE_PRIORITY.find((k) => rows[k]) ?? 'ambience';
}

/** @param {{ music: any, now?: () => number }} deps */
export function createSpireScoreHost({ music, now = () => Date.now() }) {
  let held = false, ctxKey = '', endAt = null;
  return {
    frame(view) {
      if (!view?.place) {
        if (held) { held = false; endAt = null; music?.fadeOut?.(); }
        return false;
      }
      const c = view.ctx ?? {}, k = `${c.band | 0}:${c.motif | 0}:${c.valk | 0}:${(c.seed >>> 0) % 6}`;
      if (k !== ctxKey) { ctxKey = k; for (const song of Object.values(spireScoreSongs(c))) music?.registerSong?.(song.name, song); }
      held = true;
      const t = now();
      // Adding `SCORE_STING_LEAD_MS` makes `SPIRE_END_MS` count from the end song's first note.
      if (view.place.end && endAt === null) endAt = t + SCORE_STING_LEAD_MS;
      if (!view.place.end) endAt = null;
      const want = spireScoreFor({ ...view.place, sinceEnd: endAt === null ? 0 : Math.max(0, t - endAt) });
      if (want === SPIRE_SCORE_SILENCE || want == null) { if (music?.current !== null) music?.fadeOut?.(); } else music?.playSong?.(want);
      return true;
    },
    get held() { return held; },
  };
}
