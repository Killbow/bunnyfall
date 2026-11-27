// @ts-check

// Must match `HMI_TICKS_PER_QUARTER` in `formats/hmiFile.js`.
export const SCORE_TPQ = 60;
// These names match no record in MIDI.BSA, so a music pack can replace them by name like any other song.
export const GATE_SONGS = Object.freeze({ war1: 'GATEWAR1.HMI', war2: 'GATEWAR2.HMI', war3: 'GATEWAR3.HMI', fell: 'GATEFELL.HMI' });
export const SCORE_SILENCE = 'silence';
export const SCORE_WRATH_WARN_MS = 60000;
// `SCORE_STING_MS` covers the fanfare (four bars and a hit at 92 BPM, about 11.1 s) plus its ring.
export const SCORE_STING_MS = 12500;
// Equals `MUSIC_FADE_OUT_S` in `audio/music.js` plus the 0.06 s start delay in `songPlayer.js`; update it when
// either changes.
export const SCORE_STING_LEAD_MS = 1560;

export const SCORE_PROGRAMS = Object.freeze({ ostinato: 57, bass: 32, strings: 48, brass: 61, choir: 52, organ: 19, timpani: 47, hit: 55, bells: 14 });
export const SCORE_CHANNELS = Object.freeze({ ostinato: 0, bass: 1, strings: 2, brass: 3, choir: 4, organ: 5, timpani: 6, hit: 7, bells: 8, kit: 9 });
const MIX = Object.freeze({
  ostinato: [116, 50], bass: [98, 64], strings: [108, 80], brass: [122, 60], choir: [114, 70], organ: [86, 64], timpani: [112, 64], hit: [110, 64], bells: [96, 76],
});
const KIT_LEVEL = 114;
export const SCORE_LEVEL = Object.freeze({ war1: 1.42, war2: 1.6, war3: 1.64, fell: 1.7 });
const PRESS = Object.freeze({ threshold: -18, knee: 12, ratio: 4, attack: 0.003, release: 0.25, ceiling: -1 });
export const SCORE_PRESS = Object.freeze({
  war1: Object.freeze({ ...PRESS, out: 5.2 }), war2: Object.freeze({ ...PRESS, out: 5 }), war3: Object.freeze({ ...PRESS, out: 5.8 }), fell: Object.freeze({ ...PRESS, out: 5.6 }),
});
const KIT = Object.freeze({ kick: 36, snare: 38, lowTom: 41, highFloorTom: 43, tom: 45, lowMidTom: 47, hiMidTom: 48, crash: 49, chinese: 52, surdo: 87 });

const PITCH = Object.freeze({ C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 });
export function midiNote(name) {
  const m = /^([A-G](?:#|b)?)(-?\d)$/.exec(name);
  if (!m || PITCH[m[1]] === undefined) throw new Error(`gateScore: not a note: ${name}`);
  return 12 * (Number(m[2]) + 1) + PITCH[m[1]];
}

const CHORDS = Object.freeze({
  Dm: { bass: 'D2', timp: 'D2', pad: ['D3', 'A3', 'D4'], str: ['D4', 'F4', 'A4'], choir: ['D3', 'A3', 'F4'], ost: ['D3', 'D3', 'D3', 'D3', 'D3', 'D3', 'Bb2', 'A2'], stab: ['D3', 'A3', 'D4'] },
  Bbm: { bass: 'Bb1', timp: 'F2', pad: ['Bb2', 'F3', 'Bb3'], str: ['Db4', 'F4', 'Bb4'], choir: ['Bb2', 'F3', 'Db4'], ost: ['Bb2', 'Bb2', 'Bb2', 'Bb2', 'Bb2', 'Bb2', 'C3', 'Db3'], stab: ['Bb2', 'F3', 'Bb3'] },
  Gm: { bass: 'G1', timp: 'G2', pad: ['G2', 'D3', 'G3'], str: ['D4', 'G4', 'Bb4'], choir: ['G2', 'D3', 'Bb3'], ost: ['G2', 'G2', 'G2', 'G2', 'G2', 'G2', 'Eb3', 'D3'], stab: ['G2', 'D3', 'G3'] },
  A: { bass: 'A1', timp: 'A2', pad: ['A2', 'E3', 'A3'], str: ['C#4', 'E4', 'A4'], choir: ['A2', 'E3', 'C#4'], ost: ['A2', 'A2', 'A2', 'A2', 'A2', 'A2', 'F3', 'E3'], stab: ['A2', 'E3', 'A3'] },
  Eb: { bass: 'Eb2', timp: 'Bb2', pad: ['Eb3', 'Bb3', 'Eb4'], str: ['Eb4', 'G4', 'Bb4'], choir: ['Eb3', 'Bb3', 'G4'], ost: ['Eb3', 'Eb3', 'Eb3', 'Eb3', 'Eb3', 'Eb3', 'B2', 'Bb2'], stab: ['Eb3', 'Bb3', 'Eb4'] },
  D: { bass: 'D2', timp: 'D2', pad: ['D3', 'F#3', 'A3'], choir: ['A3', 'D4', 'F#4'], ost: ['D3', 'D3', 'A3', 'D3', 'B3', 'D3', 'A3', 'F#3'], stab: ['D4', 'F#4', 'A4'] },
});
const WAR_A = Object.freeze(['Dm', 'Bbm', 'Dm', 'Bbm', 'Gm', 'Dm', 'A', 'A']);
const WAR_C = Object.freeze(['Dm', 'Eb', 'Dm', 'Eb', 'Bbm', 'Gm', 'A', 'A']);
const THEME_A = Object.freeze([
  [['D4', 2], ['C#4', 0.5], ['D4', 0.5], ['A3', 1]],
  [['Db4', 2], ['C4', 0.5], ['Bb3', 0.5], ['F3', 1]],
  [['A4', 2], ['Bb4', 0.5], ['A4', 0.5], ['E4', 1]],
  [['F4', 2], ['Db4', 1], ['Bb3', 1]],
  [['G4', 1.5], ['F4', 0.5], ['Eb4', 1], ['D4', 1]],
  [['F4', 1], ['E4', 1], ['D4', 1], ['C#4', 1]],
  [['D4', 1.5], ['C#4', 0.5], ['E4', 1], ['F4', 1]],
  [['E4', 2], ['Bb3', 1], ['A3', 1]],
]);
const THEME_B = Object.freeze([
  [['A4', 0.75], ['A4', 0.25], ['A4', 1], ['Bb4', 1], ['A4', 1]],
  [['Db5', 0.75], ['C5', 0.25], ['Bb4', 1], ['F4', 2]],
  [['A4', 0.75], ['A4', 0.25], ['A4', 1], ['D5', 1], ['C#5', 1]],
  [['Db5', 2], ['F4', 1], ['Bb4', 1]],
  [['G4', 0.75], ['G4', 0.25], ['Bb4', 1], ['D5', 1], ['Eb5', 1]],
  [['D5', 1.5], ['C#5', 0.5], ['D5', 1], ['A4', 1]],
  [['E5', 0.75], ['E5', 0.25], ['F5', 1], ['E5', 1], ['C#5', 1]],
  [['A4', 2], ['Bb4', 1], ['A4', 1]],
]);
const THEME_C = Object.freeze([
  [['D5', 0.5], ['D5', 0.5], ['D5', 0.5], ['Eb5', 0.5], ['D5', 1], ['A4', 1]],
  [['Eb5', 1], ['D5', 0.5], ['Eb5', 0.5], ['G5', 1], ['Bb4', 1]],
  [['F5', 0.5], ['F5', 0.5], ['E5', 0.5], ['F5', 0.5], ['D5', 1], ['A4', 1]],
  [['G5', 1], ['Eb5', 1], ['Bb4', 1], ['G4', 1]],
  [['Db5', 1], ['F5', 1], ['Db5', 1], ['Bb4', 1]],
  [['G4', 0.5], ['Bb4', 0.5], ['D5', 0.5], ['G5', 0.5], ['F5', 1], ['Eb5', 1]],
  [['E5', 1], ['F5', 1], ['E5', 1], ['C#5', 1]],
  [['A4', 2], ['Bb4', 0.5], ['A4', 0.5], ['G#4', 0.5], ['A4', 0.5]],
]);

// Control events sort before notes on the same tick, so a program change applies to the note that starts with it.
const RANK = { programChange: 0, controller: 0, noteOn: 1 };

function makeSong(name, bpm, bars, write, level = 1, press = null) {
  const events = [];
  const tick = (bar, beat) => Math.round((bar * 4 + beat) * SCORE_TPQ);
  // A second note on the same voice, key, and tick merges into the first with the louder velocity and longer
  // duration. Two note-ons at once would double the hit or cut it short.
  const struck = new Map();
  const w = {
    note(voice, bar, beat, beats, n, velocity) {
      const note = typeof n === 'number' ? n : midiNote(n), at = tick(bar, beat), channel = SCORE_CHANNELS[voice];
      const v = Math.max(1, Math.min(127, Math.round(velocity))), duration = Math.max(1, Math.round(beats * SCORE_TPQ));
      const key = (at * 16 + channel) * 128 + note, was = struck.get(key);
      if (was) { was.velocity = Math.max(was.velocity, v); was.duration = Math.max(was.duration, duration); return; }
      const e = { tick: at, type: 'noteOn', channel, note, velocity: v, duration };
      struck.set(key, e);
      events.push(e);
    },
    hit(key, bar, beat, velocity) { w.note('kit', bar, beat, 0.25, KIT[key], velocity); },
  };
  write(w);
  for (const [voice, [level, pan]] of Object.entries(MIX)) {
    const channel = SCORE_CHANNELS[voice];
    events.push({ tick: 0, type: 'programChange', channel, program: SCORE_PROGRAMS[voice] });
    events.push({ tick: 0, type: 'controller', channel, controller: 7, value: level });
    events.push({ tick: 0, type: 'controller', channel, controller: 10, value: pan });
  }
  events.push({ tick: 0, type: 'controller', channel: SCORE_CHANNELS.kit, controller: 7, value: KIT_LEVEL });
  events.sort((a, b) => a.tick - b.tick || RANK[a.type] - RANK[b.type]);
  // The song loops on its bar line, because the classic player rewinds a second past the end and leaves a gap of
  // silence at every loop.
  return { name, press, beatsPerMinute: bpm, secondsPerTick: 60 / (bpm * SCORE_TPQ), events, durationTicks: bars * 4 * SCORE_TPQ, seamless: true, level };
}

const ACCENT8 = Object.freeze([true, false, false, true, false, false, true, false]);

function underBar(w, bar, chord, { pads = true, strings = false, choir = false, organ = 1, busy = false, drive = null, vel = 1 } = {}) {
  const c = CHORDS[chord];
  const from = drive ?? (busy ? 3 : 4);
  c.ost.forEach((n, i) => { if (i * 0.5 < from) w.note('ostinato', bar, i * 0.5, 0.4, n, (ACCENT8[i] ? 108 : 80) * vel); });
  for (let s = from * 4; s < 16; s++) w.note('ostinato', bar, s * 0.25, 0.2, s >= 14 ? c.ost[s - 8] : c.ost[0], (ACCENT8[s % 8] ? 110 : 78) * vel);
  w.note('bass', bar, 0, 1.8, c.bass, 104 * vel);
  w.note('bass', bar, 2, 1.8, c.bass, 96 * vel);
  if (pads && organ > 0) for (const n of c.pad) w.note('organ', bar, 0, 4, n, 80 * organ);
  if (strings) for (const n of c.str) w.note('strings', bar, 0, 4, n, 90 * vel);
  if (choir) for (const n of c.choir) w.note('choir', bar, 0, 4, n, 96 * vel);
}

function themeBars(w, bar0, theme, voice, velocity, octave = 0) {
  theme.forEach((notes, b) => {
    let beat = 0;
    for (const [n, beats] of notes) {
      w.note(voice, bar0 + b, beat, beats * 0.92, midiNote(n) + 12 * octave, velocity + (beat === 0 ? 10 : 0));
      beat += beats;
    }
  });
}

function war1() {
  return makeSong(GATE_SONGS.war1, 132, 32, (w) => {
    for (let bar = 0; bar < 32; bar++) {
      const chord = WAR_A[bar % 8], c = CHORDS[chord];
      underBar(w, bar, chord, { strings: true, choir: bar >= 8, busy: bar % 4 === 3 });
      w.note('timpani', bar, 0, 1, c.timp, 110);
      w.note('timpani', bar, 1.5, 0.5, c.timp, 94);
      if (bar % 4 === 3) { for (const [b, n] of [[2.5, c.timp], [3, c.timp], [3.5, 'A2']]) w.note('timpani', bar, b, 0.45, n, 106); }
      if (bar < 8 || bar % 2 === 0) for (const n of c.stab) { w.note('brass', bar, 0, 0.9, n, 112); w.note('brass', bar, 1.5, 0.45, n, 98); }
      if (bar % 4 === 0) for (const n of c.stab) w.note('hit', bar, 0, 1, n, 104);
      if (bar % 8 === 0) w.note('bells', bar, 0, 4, 'D3', 96);
      w.hit('surdo', bar, 0, 106);
      w.hit('lowTom', bar, 0, 96);
      for (const b of [0.75, 1.5]) w.hit('kick', bar, b, 94);
      w.hit('snare', bar, 2, 108);
      w.hit('tom', bar, 2, 88);
      if (bar % 4 === 3) ['lowMidTom', 'tom', 'highFloorTom', 'lowTom'].forEach((k, i) => w.hit(k, bar, 3 + i * 0.25, 92 + i * 6));
      else for (const b of [2.75, 3.5]) w.hit('lowTom', bar, b, 92);
      if (bar % 4 === 0) w.hit('crash', bar, 0, 92);
    }
    themeBars(w, 8, THEME_A, 'brass', 112);
    themeBars(w, 16, THEME_A, 'brass', 116);
    themeBars(w, 16, THEME_A, 'strings', 92, 1);
    themeBars(w, 24, THEME_A, 'brass', 120);
    themeBars(w, 24, THEME_A, 'brass', 104, -1);
    themeBars(w, 24, THEME_A, 'choir', 100, -1);
  }, SCORE_LEVEL.war1, SCORE_PRESS.war1);
}

function war2() {
  return makeSong(GATE_SONGS.war2, 138, 32, (w) => {
    for (let bar = 0; bar < 32; bar++) {
      const chord = WAR_A[bar % 8], c = CHORDS[chord];
      underBar(w, bar, chord, { strings: true, choir: true, drive: bar % 2 === 1 ? 2 : 3 });
      w.note('timpani', bar, 0, 1, c.timp, 110);
      w.note('timpani', bar, 1.5, 0.5, c.timp, 94);
      w.note('timpani', bar, 2, 1, c.timp, 104);
      for (const n of c.stab) { w.note('hit', bar, 0, 1, n, 104); if (bar % 2 === 1) w.note('hit', bar, 2.5, 0.5, n, 98); }
      if (bar % 4 === 0) w.note('bells', bar, 0, 4, bar % 8 === 0 ? 'D3' : 'A2', 92);
      w.hit('surdo', bar, 0, 104);
      w.hit('surdo', bar, 2, 92);
      for (const b of [0, 0.75, 1.5, 2, 2.75, 3.5]) w.hit('kick', bar, b, b === 0 ? 110 : 94);
      for (const b of [1, 3]) w.hit('snare', bar, b, 106);
      for (const b of [0.5, 2.5]) w.hit('tom', bar, b, 82);
      if (bar % 4 === 3) { const toms = ['hiMidTom', 'hiMidTom', 'lowMidTom', 'lowMidTom', 'highFloorTom', 'highFloorTom', 'lowTom', 'lowTom']; toms.forEach((k, i) => w.hit(k, bar, 2 + i * 0.25, 84 + i * 5)); }
      else for (const b of [3, 3.5]) w.hit('lowTom', bar, b, 94);
      if (bar % 4 === 0) w.hit('crash', bar, 0, 96);
    }
    themeBars(w, 0, THEME_B, 'brass', 112, -1);
    themeBars(w, 8, THEME_B, 'brass', 116, -1);
    themeBars(w, 8, THEME_B, 'strings', 92);
    themeBars(w, 16, THEME_A, 'brass', 112);
    themeBars(w, 16, THEME_A, 'strings', 94, 1);
    themeBars(w, 24, THEME_B, 'brass', 120, -1);
    themeBars(w, 24, THEME_B, 'choir', 98, -1);
  }, SCORE_LEVEL.war2, SCORE_PRESS.war2);
}

function war3() {
  return makeSong(GATE_SONGS.war3, 150, 32, (w) => {
    for (let bar = 0; bar < 32; bar++) {
      const chord = WAR_C[bar % 8], c = CHORDS[chord];
      underBar(w, bar, chord, { strings: true, choir: false, drive: 0, organ: 1.2, vel: 1.05 });
      for (let b = 0; b < 4; b++) for (const n of c.choir) w.note('choir', bar, b, 0.9, n, b === 0 ? 106 : 92);
      for (let i = 0; i < 8; i++) w.note('timpani', bar, i * 0.5, 0.4, i % 4 === 3 ? 'A2' : c.timp, i === 0 ? 110 : 96);
      for (const n of c.stab) { w.note('hit', bar, 0, 1, n, 106); w.note('hit', bar, 2.5, 0.5, n, 100); if (bar % 2 === 1) w.note('hit', bar, 3.5, 0.5, n, 100); }
      if (bar % 4 === 0) { w.note('bells', bar, 0, 2, 'D3', 98); w.note('bells', bar, 2, 2, 'Ab2', 94); }
      w.hit('surdo', bar, 0, 106);
      w.hit('surdo', bar, 2, 96);
      for (let b = 0; b < 4; b++) w.hit('kick', bar, b, b === 0 ? 112 : 98);
      if (bar % 4 === 3) for (const b of [0.5, 1.5, 2.5, 3.5]) w.hit('kick', bar, b, 88);
      for (const b of [1, 3]) w.hit('snare', bar, b, 112);
      for (const b of [0.5, 1.5, 2.5, 3.5]) w.hit('tom', bar, b, 84);
      if (bar % 2 === 0) w.hit('crash', bar, 0, 98);
      if (bar % 4 === 3) { w.hit('chinese', bar, 3, 100); ['hiMidTom', 'lowMidTom', 'highFloorTom', 'lowTom'].forEach((k, i) => { w.hit(k, bar, 2 + i * 0.25, 100); w.hit(k, bar, 2.125 + i * 0.25, 88); }); }
    }
    themeBars(w, 0, THEME_C, 'brass', 114, -1);
    themeBars(w, 8, THEME_C, 'brass', 118, -1);
    themeBars(w, 8, THEME_C, 'strings', 96);
    themeBars(w, 16, THEME_B, 'brass', 116, -1);
    themeBars(w, 16, THEME_B, 'strings', 94);
    themeBars(w, 24, THEME_C, 'brass', 122, -1);
    themeBars(w, 24, THEME_C, 'brass', 108, -2);
    themeBars(w, 24, THEME_C, 'strings', 100);
  }, SCORE_LEVEL.war3, SCORE_PRESS.war3);
}

function fell() {
  return makeSong(GATE_SONGS.fell, 92, 12, (w) => {
    for (let i = 0; i < 16; i++) w.note('timpani', 0, i * 0.25, 0.24, 'D2', 56 + i * 4);
    for (const n of ['A3', 'D4', 'F#4']) w.note('choir', 0, 2, 2, n, 82);
    const D = CHORDS.D;
    for (const n of D.stab) w.note('hit', 1, 0, 1.5, n, 112);
    w.note('timpani', 1, 0, 1, 'D2', 112);
    w.hit('crash', 1, 0, 104); w.hit('kick', 1, 0, 112); w.hit('surdo', 1, 0, 104);
    /** @type {Array<[string, number, number]>} */
    const call = [['D4', 0, 0.5], ['F#4', 0.5, 0.5], ['A4', 1, 1], ['D5', 2, 2]];
    /** @type {Array<[string, number, number]>} */
    const answer = [['A4', 0, 1], ['B4', 1, 1], ['A4', 2, 1], ['F#4', 3, 1]];
    for (const [n, b, len] of call) { w.note('brass', 1, b, len * 0.95, n, 124); w.note('strings', 1, b, len * 0.95, midiNote(n) + 12, 100); }
    for (const [n, b, len] of answer) { w.note('brass', 2, b, len * 0.95, n, 118); w.note('strings', 2, b, len * 0.95, midiNote(n) + 12, 96); }
    w.note('brass', 3, 0, 4, 'D5', 122);
    for (const n of D.pad) { w.note('organ', 1, 0, 12, n, 94); w.note('strings', 3, 0, 5, midiNote(n) + 12, 100); }
    for (const n of D.choir) w.note('choir', 1, 0, 12, n, 108);
    w.note('bass', 1, 0, 12, 'D2', 118);
    w.note('bells', 1, 0, 4, 'D5', 100); w.note('bells', 3, 0, 2, 'A4', 92); w.note('bells', 3, 2, 2, 'D5', 96);
    w.note('timpani', 3, 0, 1, 'D2', 116);
    for (let i = 0; i < 8; i++) w.note('timpani', 3, 2 + i * 0.25, 0.24, 'D2', 76 + i * 5);
    w.note('timpani', 4, 0, 1, 'D2', 112); w.hit('crash', 4, 0, 102); w.hit('kick', 4, 0, 104);
    for (const n of D.stab) w.note('hit', 4, 0, 1, n, 108);
  }, SCORE_LEVEL.fell, SCORE_PRESS.fell);
}

let _songs = null;
export function gateScoreSongs() {
  return (_songs ??= Object.freeze({ war1: war1(), war2: war2(), war3: war3(), fell: fell() }));
}

// Returns null when no fight is on this client, which leaves music to the host's director; `SCORE_SILENCE` asks for
// quiet.
export function courtScoreFor(s, now) {
  if (!s || s.day === null || s.day === undefined) return null;
  if (s.fell) return now - s.fell.at < SCORE_STING_MS ? GATE_SONGS.fell : SCORE_SILENCE;
  if (s.wrath != null) return SCORE_SILENCE;
  if (Number.isFinite(s.wrathAt) && s.wrathAt - now <= SCORE_WRATH_WARN_MS) return GATE_SONGS.war3;
  return s.phase >= 3 ? GATE_SONGS.war3 : s.phase === 2 ? GATE_SONGS.war2 : GATE_SONGS.war1;
}

// The fanfare is timed from when it starts on this client, not from the boss's fall, so a late kill message does
// not cut it short.
export function createCourtScore() {
  let stingAt = null, day = null;
  return {
    want(s, now) {
      const law = courtScoreFor(s, now);
      if (law === null) { stingAt = null; day = null; return null; }
      if (s.day !== day) { day = s.day; stingAt = null; }
      if (law === GATE_SONGS.fell && stingAt === null) stingAt = now + SCORE_STING_LEAD_MS;
      if (stingAt !== null && s.fell) return now - stingAt < SCORE_STING_MS ? GATE_SONGS.fell : SCORE_SILENCE;
      return law;
    },
  };
}
