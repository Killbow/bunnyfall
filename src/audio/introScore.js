// @ts-check

import { midiNote } from '../worldEvents/gateScore.js';
import { CLOUD_REVEAL_TIME, CREST_TIME } from '../ui/introCue.js';

export const INTRO_SONG = 'DFOTHEME.HMI';
export const INTRO_SCORE_TPQ = 60;
const BAR = 4 * INTRO_SCORE_TPQ;
// Bars count as the transcription does: bar 0 is the recording's E-flat at 8.0 s, the opening is bars -4 to -1.
export const FIRST_BAR = -4;
export const LAST_BAR = 82;
export const CLOUD_BAR = 2;
export const IMPACT_BAR = 6;
const CLOSE_BAR = 80;
// One tempo puts the bar lines of the cloud break and the crest on the two film cue times, four bars apart.
export const INTRO_SECONDS_PER_TICK = (CREST_TIME - CLOUD_REVEAL_TIME) / ((IMPACT_BAR - CLOUD_BAR) * BAR);
export const INTRO_LEAD_TICKS = Math.round(CLOUD_REVEAL_TIME / INTRO_SECONDS_PER_TICK) - (CLOUD_BAR - FIRST_BAR) * BAR;
export const introTick = (bar, beat = 0) => INTRO_LEAD_TICKS + Math.round(((bar - FIRST_BAR) * 4 + beat) * INTRO_SCORE_TPQ);
export const introSeconds = (bar, beat = 0) => introTick(bar, beat) * INTRO_SECONDS_PER_TICK;

export const INTRO_PROGRAMS = Object.freeze({
  horn: 60, violins: 40, strings: 48, choir: 52, ostinato: 32, cellos: 42, contrabass: 43, brass: 61,
  timpani: 47, harp: 46, bells: 14, pad: 89, hit: 55, halo: 44,
});
export const INTRO_CHANNELS = Object.freeze({
  horn: 0, violins: 1, strings: 2, choir: 3, ostinato: 4, cellos: 5, contrabass: 6, brass: 7,
  timpani: 8, kit: 9, harp: 11, bells: 12, pad: 13, hit: 14, halo: 15,
});
const MIX = Object.freeze({
  horn: [118, 58], violins: [96, 82], strings: [100, 40], choir: [104, 88], ostinato: [100, 64], cellos: [92, 48],
  contrabass: [104, 64], brass: [108, 72], timpani: [110, 64], harp: [84, 30], bells: [86, 92],
  pad: [90, 64], hit: [100, 64], halo: [80, 64],
});
const KIT_LEVEL = 112;

export const INTRO_TONE = Object.freeze({ low: [60, -3], bands: [[100, 2, 1.2], [250, -4, 1.2], [500, 3, 1.4], [3150, 4, 0.9]], high: [5000, 4] });
export const INTRO_LEVEL = 1;
export const INTRO_PRESS = Object.freeze({ threshold: -14, knee: 12, ratio: 3, attack: 0.012, release: 0.25, ceiling: -1, out: 2 });
const KIT = Object.freeze({ kick: 36, snare: 38, clap: 39, lowTom: 41, floorTom: 43, tom: 45, midTom: 47, crash: 49, ride: 51, splash: 55, surdo: 87 });

export const INTRO_VOICES = Object.freeze({
  horn: Object.freeze({ attack: 0.05, index: 3, idxDecay: 1.1, idxFloor: 0.5, release: 0.3, unison: 2, cents: 3, spread: 0.2, vibrato: 5, vibRate: 4.8, noise: 0.06, body: [[450, 6, 1.2]], air: -3 }),
  violins: Object.freeze({ saw: 1, cutoff: 10, cutQ: 0.9, attack: 0.12, release: 0.6, unison: 3, cents: 6, spread: 0.55, vibrato: 13, vibRate: 5.6, arc: 0.4, sway: 0.25, swayRate: 0.4, noise: 0.08, body: [[550, 5, 1], [1300, 2, 1.5], [3000, 8, 1]], air: -4, ensemble: 0.45, ensembleRate: 0.8, ensembleMs: 10 }),
  strings: Object.freeze({ saw: 1, cutoff: 12, cutQ: 0.9, attack: 0.18, release: 0.8, gain: 1.1, unison: 3, cents: 6, spread: 0.6, vibrato: 11, vibRate: 5.2, arc: 0.5, sway: 0.3, swayRate: 0.35, noise: 0.08, body: [[450, 7, 0.8], [1000, 2, 1.4], [2700, 8, 1]], air: -4, ensemble: 0.45, ensembleRate: 0.7, ensembleMs: 12 }),
  choir: Object.freeze({ saw: 1, cutoff: 6, cutQ: 0.7, attack: 0.35, release: 1.1, gain: 1.1, unison: 3, cents: 8, spread: 0.5, vibrato: 14, vibRate: 5, arc: 0.5, sway: 0.3, swayRate: 0.2, body: [[650, 7, 2.5], [1050, 5, 3], [2500, 6, 3]], air: -10, ensemble: 0.5, ensembleRate: 0.5, ensembleMs: 18 }),
  ostinato: Object.freeze({ attack: 0.008, decay: 0.14, sustain: 0.45, release: 0.08, index: 4.2, idxDecay: 0.18, unison: 2, cents: 6, spread: 0.25 }),
  cellos: Object.freeze({ saw: 1, cutoff: 10, attack: 0.02, unison: 2, cents: 5, spread: 0.3, vibrato: 8, vibRate: 4.9, noise: 0.1, body: [[220, 6, 0.9], [600, 3, 1.3], [1800, 6, 1.2]], air: -6, ensemble: 0.35, ensembleRate: 0.6, ensembleMs: 14 }),
  contrabass: Object.freeze({ saw: 1, cutoff: 14, attack: 0.05, release: 0.45, gain: 1, unison: 2, cents: 4, spread: 0.15, vibrato: 5, vibRate: 4.4, arc: 1, sway: 0.2, swayRate: 0.15, body: [[100, 4, 0.7], [200, 4, 1], [400, 4, 1.2]], air: -10, ensemble: 0.25, ensembleRate: 0.5, ensembleMs: 16 }),
  brass: Object.freeze({ attack: 0.035, index: 5, idxDecay: 0.8, idxFloor: 0.35, release: 0.3, unison: 3, cents: 6, spread: 0.4, noise: 0.06 }),
  timpani: Object.freeze({ decay: 0.9, release: 0.5, gain: 1.2, sub: 0.2 }),
  harp: Object.freeze({ index: 3, idxDecay: 0.4, unison: 2, cents: 5, spread: 0.35 }),
  bells: Object.freeze({ index: 6, idxDecay: 0.8, unison: 2, cents: 3, spread: 0.3 }),
  pad: Object.freeze({ saw: 1, cutoff: 4, attack: 0.4, release: 1.2, unison: 3, cents: 8, spread: 0.7, vibrato: 5, vibRate: 4, arc: 0.8, sway: 0.4, swayRate: 0.25, body: [[300, 5, 0.8]], air: -12, ensemble: 0.8, ensembleRate: 0.4, ensembleMs: 20 }),
  hit: Object.freeze({ index: 4.5, decay: 0.5, release: 0.35, unison: 2, cents: 15, sub: 0.35, spread: 0.4 }),
  halo: Object.freeze({ saw: 1, cutoff: 6, attack: 0.35, release: 1, gain: 0.6, unison: 3, cents: 5, spread: 0.8, vibrato: 14, vibRate: 6.1, arc: 0.5, body: [[3000, 5, 1.6]], air: -5, ensemble: 0.45, ensembleRate: 0.9, ensembleMs: 9 }),
});
const INTRO_VOICES_BY_CHANNEL = Object.freeze(Object.fromEntries(Object.entries(INTRO_VOICES).map(([v, o]) => [INTRO_CHANNELS[/** @type {keyof typeof INTRO_CHANNELS} */ (v)], o])));
export const INTRO_KIT = Object.freeze({
  [KIT.kick]: Object.freeze({ hz: 50, decay: 0.42, gain: 1.4, click: 0.5 }),
  [KIT.surdo]: Object.freeze({ hz: 62, decay: 1.1, gain: 1.5, drop: 0.7, click: 0.5 }),
  [KIT.lowTom]: Object.freeze({ hz: 84, decay: 0.6, gain: 1.05, click: 0.3 }),
  [KIT.floorTom]: Object.freeze({ hz: 102, decay: 0.55, click: 0.3 }),
  [KIT.tom]: Object.freeze({ hz: 124, decay: 0.48, click: 0.3 }),
  [KIT.midTom]: Object.freeze({ hz: 152, decay: 0.42, click: 0.3 }),
  [KIT.snare]: Object.freeze({ hz: 2000, q: 0.7, decay: 0.26, gain: 0.95, body: 185 }),
  [KIT.clap]: Object.freeze({ hz: 1500, q: 0.9, decay: 0.14, gain: 0.6 }),
  [KIT.crash]: Object.freeze({ decay: 2.6, q: 0.45, gain: 1 }),
  [KIT.ride]: Object.freeze({ hz: 5500, q: 0.6, attack: 0.02, decay: 0.45, gain: 0.55 }),
  [KIT.splash]: Object.freeze({ decay: 1.1, q: 0.6, gain: 0.7 }),
});

const CHORDS = Object.freeze({
  Gm: { root: 'G1', str: ['G3', 'Bb3', 'D4', 'G4'], choir: ['D4', 'G4', 'Bb4'], brass: ['G3', 'D4', 'G4', 'Bb4'] },
  Gsus: { root: 'G1', str: ['G3', 'C4', 'D4', 'G4'], choir: ['D4', 'G4', 'C5'], brass: ['G3', 'D4', 'G4', 'C5'] },
  GmA: { root: 'A1', str: ['G3', 'Bb3', 'D4', 'G4'], choir: ['D4', 'G4', 'Bb4'], brass: ['A2', 'D4', 'G4', 'Bb4'] },
  Gm7: { root: 'G1', str: ['F3', 'Bb3', 'D4', 'A4'], choir: ['D4', 'F4', 'Bb4'], brass: ['G3', 'D4', 'F4', 'Bb4'] },
  CmG: { root: 'G1', str: ['G3', 'C4', 'Eb4', 'G4'], choir: ['C4', 'Eb4', 'G4'], brass: ['G3', 'C4', 'Eb4', 'G4'] },
  F6: { root: 'F1', str: ['F3', 'A3', 'C4', 'D4'], choir: ['D4', 'F4', 'A4'], brass: ['F3', 'C4', 'D4', 'A4'] },
  F: { root: 'F1', str: ['F3', 'A3', 'C4', 'F4'], choir: ['C4', 'F4', 'A4'], brass: ['F3', 'C4', 'F4', 'A4'] },
  Eb: { root: 'Eb1', str: ['Eb3', 'G3', 'Bb3', 'Eb4'], choir: ['Bb3', 'Eb4', 'G4'], brass: ['Eb3', 'Bb3', 'Eb4', 'G4'] },
  Cm: { root: 'C2', str: ['C3', 'G3', 'C4', 'Eb4'], choir: ['C4', 'Eb4', 'G4'], brass: ['C3', 'G3', 'C4', 'Eb4'] },
  C: { root: 'C2', str: ['C3', 'G3', 'D4', 'E4', 'G4'], choir: ['C4', 'E4', 'G4'], brass: ['C3', 'G3', 'C4', 'E4'] },
  Dm: { root: 'D2', str: ['D3', 'A3', 'D4', 'F4'], choir: ['D4', 'F4', 'A4'], brass: ['D3', 'A3', 'D4', 'F4'] },
  D: { root: 'D2', str: ['D3', 'A3', 'D4', 'F#4'], choir: ['D4', 'F#4', 'A4'], brass: ['D3', 'A3', 'D4', 'F#4'] },
  Dsus: { root: 'D2', str: ['D3', 'A3', 'D4', 'G4'], choir: ['D4', 'G4', 'A4'], brass: ['D3', 'A3', 'D4', 'G4'] },
  Ab: { root: 'Ab1', str: ['Ab2', 'Eb3', 'Ab3', 'C4'], choir: ['C4', 'Eb4', 'Ab4'], brass: ['Ab2', 'Eb3', 'Ab3', 'C4'] },
  Bb: { root: 'Bb1', str: ['Bb2', 'F3', 'Bb3', 'D4'], choir: ['Bb3', 'D4', 'F4'], brass: ['Bb2', 'F3', 'Bb3', 'D4'] },
});

const HARMONY = Object.freeze({
  [-4]: ['Gm', 'Gm'], [-3]: ['CmG', 'CmG'], [-2]: ['Gm7', 'Gm7'], [-1]: ['Gm', 'Gm'],
  0: ['Eb', 'Eb'], 1: ['F', 'F'], 2: ['C', 'C'], 3: ['C', 'C'], 4: ['C', 'C'], 5: ['C', 'C'], 6: ['Gm', 'Gm'], 7: ['Gsus', 'Gm'],
  8: ['Gm', 'Gm'], 9: ['F', 'Gm'], 10: ['Cm', 'F'], 11: ['Gm', 'Dm'], 12: ['Eb', 'Eb'], 13: ['F', 'Gm'], 14: ['Gm', 'Gm'], 15: ['Gm', 'Gm'], 16: ['Gm', 'Gm'],
  17: ['D', 'Eb'], 18: ['Ab', 'Cm'], 19: ['Gm', 'F'], 20: ['Eb', 'Eb'], 21: ['F', 'F'], 22: ['F', 'F6'], 23: ['Gm', 'Gm'], 24: ['Gsus', 'Gm'],
  25: ['Gm', 'Gm'], 26: ['F', 'Gm'], 27: ['Eb', 'F'], 28: ['Gm', 'Gm'], 29: ['Eb', 'Eb'], 30: ['F', 'F'], 31: ['F', 'F6'], 32: ['Gm', 'Gm'], 33: ['Gm', 'Gm'],
  34: ['Gm', 'Gm'], 35: ['F', 'Gm'], 36: ['Eb', 'Bb'], 37: ['F', 'Gm'], 38: ['Eb', 'Cm'], 39: ['F', 'F'], 40: ['F', 'F'],
  41: ['Gm', 'Gm'], 42: ['F', 'Gm'], 43: ['Gm', 'GmA'], 44: ['Bb', 'F'], 45: ['Cm', 'Gm'], 46: ['Eb', 'F'], 47: ['Eb', 'Eb'], 48: ['D', 'D'],
  49: ['Gm', 'F'], 50: ['Gm', 'F'], 51: ['Gm', 'F'], 52: ['Eb', 'Bb'], 53: ['Cm', 'Gm'], 54: ['Eb', 'F'], 55: ['Eb', 'Eb'], 56: ['F', 'F'], 57: ['F', 'F'], 58: ['Gm', 'Gm'],
  59: ['Gm', 'Gm'], 60: ['Gm', 'Gm'], 61: ['F', 'Gm'], 62: ['Eb', 'F'], 63: ['Gm', 'Dm'], 64: ['Cm', 'Cm'], 65: ['Dsus', 'D'], 66: ['D', 'D'],
  67: ['Gm', 'Gm'], 68: ['Gsus', 'Gm'], 69: ['Gm', 'Gm'], 70: ['F', 'Gm'], 71: ['Cm', 'D'], 72: ['Gm', 'F'], 73: ['Eb', 'Eb'], 74: ['F', 'F'], 75: ['F', 'D'],
  76: ['Gm', 'Gm'], 77: ['Gm', 'Gm'], 78: ['Gm', 'Gm'], 79: ['F', 'Gm'], 80: ['Gm', 'Gm'], 81: ['Gm', 'Gm'], 82: ['Gm', 'Gm'],
});

/** @type {Readonly<Record<number, ReadonlyArray<[string, number]>>>} */
const MELODY = Object.freeze({
  [-3]: [['r', 0.75], ['F4', 1], ['Eb4', 1.25], ['F4', 0.25], ['Eb4', 0.75]],
  [-2]: [['r', 1], ['D4', 1.5], ['A4', 1.5]],
  [-1]: [['r', 1.5], ['G4', 2.5]],
  0: [['r', 1], ['Eb4', 0.75], ['G4', 0.5], ['A4', 0.75], ['Bb4', 1]],
  1: [['C5', 0.75], ['C5', 0.75], ['A4', 1.5], ['C5', 0.5], ['F5', 0.5]],
  2: [['G5', 4]],
  3: [['r', 0.75], ['C5', 0.75], ['C5', 0.5], ['C5', 2]],
  4: [['G4', 4]],
  5: [['G4', 2], ['r', 1], ['D4', 0.5], ['D4', 0.5]],
  6: [['G4', 1.5], ['A4', 0.5], ['Bb4', 2]],
  7: [['C5', 1.25], ['Bb4', 0.25], ['A4', 0.5], ['G4', 2]],
  8: [['r', 1.25], ['G4', 0.25], ['A4', 0.5], ['Bb4', 0.5], ['A4', 0.5], ['Bb4', 1]],
  9: [['C5', 0.75], ['C5', 0.25], ['F5', 1], ['D5', 1], ['D5', 0.5], ['Bb4', 0.25], ['D5', 0.25]],
  10: [['Eb5', 2], ['C5', 1], ['A4', 1]],
  11: [['Bb4', 0.75], ['Bb4', 0.5], ['C5', 0.25], ['Bb4', 0.5], ['A4', 1], ['F4', 1]],
  12: [['G4', 3], ['r', 1]],
  13: [['r', 1.25], ['F4', 0.25], ['A4', 0.5], ['G4', 2]],
  14: [['r', 1.5], ['G4', 0.25], ['A4', 0.25], ['Bb4', 0.5], ['Bb4', 0.5], ['Bb4', 0.75], ['Bb4', 0.25]],
  15: [['C5', 1], ['A4', 0.25], ['Bb4', 0.25], ['C5', 0.5], ['D5', 0.25], ['C5', 0.5], ['Bb4', 0.75], ['A4', 0.5]],
  16: [['G4', 4]],
  17: [['A4', 1.25], ['G4', 0.5], ['F4', 0.25], ['G4', 1], ['G4', 0.25], ['A4', 0.25], ['Bb4', 0.5]],
  18: [['C5', 0.75], ['C5', 0.75], ['C5', 0.5], ['Eb5', 2]],
  19: [['Bb4', 1.25], ['A4', 0.25], ['Bb4', 0.5], ['C5', 1], ['A4', 0.5], ['A4', 0.5]],
  20: [['G4', 4]],
  21: [['r', 1.25], ['Bb4', 0.75], ['Bb4', 0.5], ['F5', 0.5], ['Bb4', 0.75], ['F4', 0.25]],
  22: [['A4', 0.5], ['A4', 0.5], ['F4', 3]],
  23: [['r', 2], ['A4', 0.5], ['Bb4', 1.5]],
  24: [['C5', 4]],
  26: [['r', 0.75], ['F4', 0.25], ['F4', 0.5], ['F4', 1.5], ['r', 0.25], ['A4', 0.5], ['Bb4', 0.25]],
  27: [['G4', 1.25], ['A4', 0.25], ['Bb4', 0.5], ['A4', 0.25], ['A4', 0.75], ['F4', 0.5], ['F4', 0.5]],
  28: [['C5', 0.25], ['C5', 0.75], ['Bb4', 0.5], ['Bb4', 0.5], ['Bb4', 0.25], ['A4', 0.25], ['Bb4', 0.5], ['Bb4', 0.75], ['A4', 0.25]],
  29: [['G4', 0.5], ['G4', 1], ['Bb4', 1], ['Bb4', 1.5]],
  30: [['r', 2], ['Bb4', 1], ['F4', 1]],
  31: [['A4', 1], ['F4', 0.5], ['F4', 0.5], ['F4', 2]],
  32: [['r', 0.25], ['G4', 1.25], ['G4', 0.25], ['A4', 0.25], ['Bb4', 2]],
  33: [['A4', 1.25], ['Bb4', 0.5], ['A4', 0.25], ['G4', 0.25], ['G4', 0.5], ['G4', 1.25]],
  34: [['r', 1], ['G4', 0.75], ['A4', 0.25], ['Bb4', 0.75], ['C5', 0.25], ['C5', 0.25], ['D5', 0.25], ['D5', 0.5]],
  35: [['A4', 1], ['F5', 0.5], ['F5', 0.5], ['D5', 0.75], ['D5', 0.5], ['Bb4', 0.75]],
  36: [['Bb4', 0.25], ['Eb5', 0.5], ['Eb5', 0.75], ['C5', 0.5], ['D5', 0.5], ['D5', 0.5], ['Bb4', 1]],
  37: [['C5', 0.75], ['C5', 0.5], ['Bb4', 0.25], ['A4', 0.5], ['Bb4', 0.5], ['G4', 1], ['A4', 0.5]],
  38: [['Bb4', 1], ['G4', 0.25], ['A4', 0.25], ['Bb4', 0.5], ['Eb5', 1], ['D5', 1]],
  39: [['C5', 1.75], ['F4', 0.25], ['Bb4', 1], ['Bb4', 0.5], ['F4', 0.5]],
  40: [['A4', 1], ['F4', 0.5], ['F4', 1.5], ['r', 1]],
  41: [['r', 1], ['G4', 0.5], ['A4', 0.5], ['Bb4', 0.25], ['Bb4', 0.5], ['Bb4', 0.75], ['A4', 0.25], ['Bb4', 0.25]],
  42: [['C5', 1], ['A4', 1], ['Bb4', 0.5], ['Bb4', 0.5], ['Bb4', 1]],
  43: [['r', 1.5], ['A4', 0.5], ['Bb4', 0.25], ['Bb4', 0.25], ['C5', 0.25], ['C5', 0.5], ['D5', 0.75]],
  44: [['F5', 1], ['D5', 0.25], ['Bb4', 0.75], ['C5', 0.75], ['C5', 0.5], ['C5', 0.25], ['D5', 0.5]],
  45: [['Eb5', 0.5], ['Eb5', 1.25], ['C5', 0.25], ['D5', 1], ['G4', 0.25], ['G4', 0.5], ['Bb4', 0.25]],
  46: [['Bb4', 0.25], ['Bb4', 0.5], ['Bb4', 1], ['D5', 0.25], ['C5', 0.25], ['C5', 0.75], ['A4', 0.25], ['A4', 0.25], ['A4', 0.5]],
  47: [['Bb4', 0.25], ['A4', 0.5], ['G4', 0.25], ['Bb4', 0.25], ['A4', 0.5], ['G4', 0.25], ['Bb4', 0.25], ['A4', 0.5], ['G4', 0.5], ['Bb4', 0.25], ['G4', 0.25], ['A4', 0.25]],
  48: [['A4', 1], ['G4', 0.75], ['Bb4', 0.25], ['D5', 0.25], ['D5', 0.5], ['A4', 0.25], ['D5', 1]],
  51: [['r', 1], ['G5', 0.25], ['A5', 0.5], ['Bb5', 0.25], ['A5', 0.5], ['A5', 0.5], ['F5', 0.75], ['F5', 0.25]],
  52: [['G5', 0.25], ['G5', 1], ['F5', 0.25], ['F5', 0.5], ['D5', 0.5], ['D5', 0.75], ['D5', 0.25], ['D5', 0.5]],
  53: [['Eb5', 0.5], ['Eb5', 0.25], ['Eb5', 0.5], ['F5', 0.75], ['D5', 0.5], ['D5', 0.5], ['G5', 0.5], ['Bb5', 0.5]],
  54: [['Bb5', 0.75], ['Bb5', 0.5], ['A5', 0.25], ['Bb5', 0.5], ['C6', 0.25], ['C6', 0.75], ['F5', 0.5], ['C6', 0.5]],
  55: [['D6', 3], ['r', 1]],
  56: [['r', 2], ['Bb4', 0.5], ['F4', 0.25], ['F4', 0.25], ['Bb4', 0.5], ['F5', 0.5]],
  57: [['r', 0.25], ['F5', 1.25], ['A4', 0.5], ['F4', 0.25], ['A4', 0.25], ['F4', 1.5]],
  58: [['G4', 4]],
  60: [['r', 1.25], ['G4', 0.25], ['A4', 0.5], ['Bb4', 0.5], ['A4', 0.5], ['Bb4', 1]],
  61: [['C5', 0.5], ['C5', 0.5], ['F5', 1], ['D5', 0.25], ['D5', 0.25], ['D5', 0.5], ['D5', 1]],
  62: [['G4', 0.5], ['G4', 0.25], ['G4', 0.25], ['G4', 0.5], ['G4', 0.25], ['G4', 0.25], ['A4', 0.5], ['A4', 0.5], ['F4', 0.25], ['F4', 0.25], ['F4', 0.25], ['F4', 0.25]],
  63: [['D5', 0.25], ['D5', 0.25], ['D5', 0.25], ['D5', 0.25], ['D5', 0.25], ['G4', 0.25], ['Bb4', 0.25], ['Bb4', 0.25], ['A4', 0.5], ['A4', 0.25], ['A4', 0.25], ['F4', 0.25], ['F4', 0.25], ['F4', 0.25], ['F4', 0.25]],
  64: [['F5', 0.5], ['Eb5', 1], ['G4', 0.5], ['G4', 1], ['A4', 0.5], ['Bb4', 0.5]],
  65: [['A4', 0.5], ['A4', 0.5], ['D5', 0.5], ['D5', 0.5], ['D5', 0.5], ['D5', 0.5], ['D5', 0.5], ['D5', 0.5]],
  66: [['D5', 0.5], ['F#4', 0.5], ['A4', 1], ['F#4', 1], ['A4', 1]],
  67: [['r', 1], ['G4', 0.5], ['A4', 0.5], ['Bb4', 0.25], ['Bb4', 0.25], ['Bb4', 0.5], ['Bb4', 0.75], ['Bb4', 0.25]],
  68: [['C5', 0.5], ['C5', 1.25], ['A4', 0.75], ['G4', 1.5]],
  69: [['G4', 1.5], ['G4', 0.25], ['A4', 0.25], ['Bb4', 0.75], ['A4', 0.5], ['Bb4', 0.75]],
  70: [['C5', 0.5], ['C5', 0.5], ['F5', 1], ['D5', 1], ['D5', 0.25], ['C5', 0.25], ['D5', 0.5]],
  71: [['Eb5', 0.25], ['Eb5', 0.75], ['Eb5', 0.75], ['Eb5', 0.25], ['D5', 0.25], ['D5', 0.25], ['D5', 0.5], ['D5', 0.75], ['A4', 0.25]],
  72: [['Bb4', 0.25], ['Bb4', 0.5], ['Bb4', 0.5], ['C5', 1], ['C5', 0.75], ['F4', 0.5], ['F4', 0.25], ['F4', 0.25]],
  73: [['G4', 0.5], ['G4', 0.25], ['G4', 0.25], ['G4', 0.25], ['G4', 0.75], ['Bb4', 0.75], ['C5', 0.5], ['D5', 0.75]],
  74: [['C5', 1.75], ['F4', 1.5], ['F4', 0.75]],
  75: [['A4', 0.5], ['F4', 1.5], ['F#4', 2]],
  76: [['G4', 4]],
  77: [['C5', 1.5], ['A4', 0.5], ['Bb4', 0.5], ['Bb4', 1.5]],
  78: [['r', 1.5], ['A4', 0.5], ['Bb4', 0.5], ['A4', 1], ['Bb4', 0.5]],
  79: [['C5', 1], ['F5', 0.25], ['F4', 0.75], ['G4', 2]],
  80: [['G4', 4]],
});

/** @typedef {{ dyn: number, kit: 0 | 1 | 2 | 3, pulse?: boolean, choir?: boolean, brass?: boolean, octave?: boolean, harp?: boolean, pad?: boolean, bare?: boolean, halo?: boolean }} Shape */
/** @type {(m: number) => Shape} */
function shapeOf(m) {
  if (m < 0) return { dyn: 0.55 + 0.1 * (m + 4), kit: 0, pad: true, harp: m >= -2 };
  if (m <= 1) return { dyn: 0.85, kit: 0, pad: true, harp: true };
  if (m <= 3) return { dyn: 1, kit: 0, choir: true, brass: true, pad: true, halo: true, octave: true };
  if (m <= 5) return { dyn: 0.75, kit: 0, pad: true, harp: true };
  if (m <= 7) return { dyn: 0.95, kit: 1, pulse: true, choir: true, brass: true, octave: true };
  if (m <= 16) return { dyn: 1, kit: 2, pulse: true, choir: m >= 12, octave: m >= 14, halo: m >= 14 };
  if (m <= 24) return { dyn: 1, kit: m <= 22 ? 2 : 1, pulse: true, choir: true, brass: m === 17 || m === 18, halo: m <= 20 };
  if (m <= 33) return { dyn: 0.85, kit: m >= 28 && m <= 31 ? 1 : 2, pulse: true, harp: true };
  if (m <= 40) return { dyn: 1, kit: 2, pulse: true, choir: true, octave: true, halo: true };
  if (m <= 48) return { dyn: 1.05, kit: 3, pulse: true, choir: true, brass: m >= 44, octave: true, halo: true };
  if (m <= 50) return { dyn: 1, kit: 2, pulse: true, choir: true, brass: true };
  if (m <= 55) return { dyn: 1.1, kit: 3, pulse: true, choir: true, brass: true, halo: true };
  if (m <= 58) return { dyn: 1, kit: 2, pulse: true, choir: true };
  if (m <= 60) return { dyn: 0.85, kit: 2, pad: true, harp: true, bare: true };
  if (m <= 66) return { dyn: 1.05, kit: m >= 63 ? 3 : 2, pulse: true, choir: true, brass: m >= 64, octave: m >= 63, halo: m >= 63 };
  if (m <= 75) return { dyn: 1.12, kit: 3, pulse: true, choir: true, brass: true, octave: true, halo: true };
  if (m < CLOSE_BAR) return { dyn: 1, kit: 2, pulse: true, choir: true, octave: m <= 77, halo: m <= 77 };
  return { dyn: 0.9, kit: 0, choir: true, pad: true, halo: true };
}

// Control events sort before notes on the same tick, so a note hears the program change beside it.
const RANK = { programChange: 0, controller: 0, noteOn: 1 };
const clampVel = (v) => Math.max(1, Math.min(127, Math.round(v)));

function writer() {
  /** @type {Array<{ tick: number, type: string, channel: number, note?: number, velocity?: number, duration?: number, program?: number, controller?: number, value?: number }>} */
  const events = [];
  const struck = new Map();
  const w = {
    events,
    /** @param {keyof typeof INTRO_CHANNELS} voice @param {number} bar @param {number} beat @param {number} beats @param {string | number} n @param {number} velocity */
    note(voice, bar, beat, beats, n, velocity) {
      const note = typeof n === 'number' ? n : midiNote(n), at = introTick(bar, beat), channel = INTRO_CHANNELS[voice];
      const v = clampVel(velocity), duration = Math.max(1, Math.round(beats * INTRO_SCORE_TPQ));
      const key = (at * 16 + channel) * 128 + note, was = struck.get(key);
      // One note per key per moment: a note laid where the voice already strikes it merges, loudest and longest.
      if (was) { was.velocity = Math.max(was.velocity, v); was.duration = Math.max(was.duration, duration); return; }
      const e = { tick: at, type: 'noteOn', channel, note, velocity: v, duration };
      struck.set(key, e);
      events.push(e);
    },
    /** @param {keyof typeof KIT} key @param {number} bar @param {number} beat @param {number} velocity */
    hit(key, bar, beat, velocity) { w.note('kit', bar, beat, 0.25, KIT[key], velocity); },
    /** @param {keyof typeof INTRO_CHANNELS} voice @param {number} bar @param {number} beat @param {number} value */
    volume(voice, bar, beat, value) {
      events.push({ tick: introTick(bar, beat), type: 'controller', channel: INTRO_CHANNELS[voice], controller: 7, value: Math.max(0, Math.min(127, Math.round(value))) });
    },
  };
  return w;
}

function swellInto(w, bar, beats) {
  const steps = beats * 4 - 1;
  for (let i = 0; i <= steps; i++) w.hit('ride', bar - 1, 4 - beats + i / 4, 12 + 115 * Math.pow(i / steps, 1.6));
}

function rollInto(w, bar, beats, note, from = 50, to = 112) {
  const n = beats * 4;
  for (let i = 0; i < n; i++) w.note('timpani', bar - 1, 4 - beats + i / 4, 0.24, note, from + (to - from) * (i / (n - 1)));
}

function rollSnare(w, bar, beats, from = 40, to = 104) {
  const n = beats * 4;
  for (let i = 0; i < n; i++) w.hit('snare', bar - 1, 4 - beats + i / 4, from + (to - from) * (i / (n - 1)));
}

const BED = /** @type {const} */ (['strings', 'choir', 'violins', 'halo', 'pad']);
function crescendoInto(w, bar, from = 0.86) {
  for (let i = 0; i <= 16; i++) {
    const k = i <= 8 ? 1 - (1 - from) * (i / 8) : from + (1 - from) * ((i - 8) / 8);
    for (const voice of BED) w.volume(voice, bar - 2, i / 2, MIX[voice][0] * k);
  }
}

function landOn(w, bar, chord, vel = 1) {
  const c = CHORDS[chord];
  w.note('timpani', bar, 0, 1.5, midiNote(c.root) + 12, 124 * vel);
  w.note('contrabass', bar, 0, 4, c.root, 120 * vel);
  for (const n of c.brass) { w.note('hit', bar, 0, 1, n, 116 * vel); w.note('brass', bar, 0, 2, n, 112 * vel); }
  w.note('brass', bar, 0, 2, midiNote(c.brass[0]) - 12, 112 * vel);
  w.hit('crash', bar, 0, 118 * vel);
  w.hit('surdo', bar, 0, 120 * vel);
  w.hit('kick', bar, 0, 122 * vel);
  w.hit('splash', bar, 0, 100 * vel);
  w.note('bells', bar, 0, 4, midiNote(c.root) + 36, 100 * vel);
}

const PULSE = Object.freeze([[0, true], [0.25, false], [0.75, true], [1, false], [1.5, true], [2, true], [2.25, false], [2.75, true], [3, false], [3.5, true]]);
const pulseNote = (root) => { let n = midiNote(root); while (n < 41) n += 12; while (n > 52) n -= 12; return n; };

function bandBar(w, m) {
  if (m > CLOSE_BAR) return;
  const s = shapeOf(m), [h1, h2] = HARMONY[m], d = s.dyn;
  for (const [half, name] of [[0, h1], [2, h2]]) {
    const c = CHORDS[name];
    const sameAsBefore = half === 2 && h1 === h2;
    if (!sameAsBefore) {
      const len = m === CLOSE_BAR ? 4 * (LAST_BAR - CLOSE_BAR + 1) : half === 0 && h1 === h2 ? 4 : 2;
      for (const n of c.str) w.note('strings', m, half, len, n, 82 * d);
      if (s.choir) for (const n of c.choir) w.note('choir', m, half, len, n, 88 * d);
      if (s.pad) for (const n of c.choir) w.note('pad', m, half, len, midiNote(n) - 12, 84 * d);
      if (!s.bare) w.note('contrabass', m, half, len, c.root, 100 * d);
      if (s.brass) for (const n of c.brass) w.note('brass', m, half, len * 0.9, n, 92 * d);
      if (s.brass) w.note('brass', m, half, len * 0.9, midiNote(c.brass[0]) - 12, 96 * d);
      if (s.halo) for (const n of c.choir) w.note('halo', m, half, len, midiNote(n) + 12, 72 * d);
    }
    if (s.pulse) {
      const p = pulseNote(c.root);
      for (const [b, accent] of PULSE) {
        if (b < half || b >= half + 2) continue;
        w.note('ostinato', m, b, accent ? 0.4 : 0.2, p, (accent ? 104 : 74) * d);
        if (accent || s.kit >= 3) w.note('cellos', m, b, 0.45, p, (accent ? 88 : 70) * d);
      }
    }
    if (s.harp) {
      const tones = c.choir.map(midiNote), up = [tones[0], tones[1], tones[2], tones[0] + 12];
      up.forEach((n, i) => w.note('harp', m, half + i * 0.5, 0.9, n, (i === 0 ? 80 : 66) * d));
    }
  }
  if (s.kit >= 1) {
    w.hit('surdo', m, 0, 104 * d);
    w.hit('surdo', m, 2, 92 * d);
    w.note('timpani', m, 0, 1, midiNote(CHORDS[h1].root) + 12, 96 * d);
  }
  if (s.kit >= 2) w.note('timpani', m, 2, 1, midiNote(CHORDS[h2].root) + 12, 80 * d);
  if (s.kit >= 2) for (const b of s.kit >= 3 ? [0, 1, 2, 3] : [0, 2]) w.hit('crash', m, b, (s.kit >= 3 ? 54 : 46) * d);
  if (s.kit >= 2) {
    for (const b of [0, 0.75, 1.5, 2, 2.75, 3.5]) w.hit('kick', m, b, (b === 0 || b === 2 ? 108 : 90) * d);
    w.hit('lowTom', m, 1.5, 84 * d);
    w.hit('floorTom', m, 3, 80 * d);
    if (m % 4 === 3) ['midTom', 'tom', 'floorTom', 'lowTom'].forEach((k, i) => w.hit(/** @type {keyof typeof KIT} */ (k), m, 3 + i * 0.25, (86 + i * 6) * d));
    if (m % 4 === 0) w.hit('crash', m, 0, 96 * d);
  }
  if (s.kit >= 3) for (const b of [1, 3]) { w.hit('snare', m, b, 100 * d); w.hit('clap', m, b, 84 * d); }
}

function melodyBar(w, m) {
  const bar = MELODY[m];
  if (!bar) return;
  const s = shapeOf(m);
  let beat = 0;
  for (const [n, beats] of bar) {
    if (n !== 'r') {
      const accent = beat === 0 || beat === 2 ? 8 : 0;
      w.note('horn', m, beat, beats * 0.94, n, (100 + accent) * Math.min(1.1, s.dyn));
      if (s.octave) w.note('violins', m, beat, beats * 0.94, midiNote(n) + 12, (90 + accent) * s.dyn);
    }
    beat += beats;
  }
}

function makeTheme() {
  const w = writer();
  for (let m = FIRST_BAR; m <= LAST_BAR; m++) { bandBar(w, m); melodyBar(w, m); }
  for (let i = 0; i < 32; i++) {
    const v = 44 + (i / 32) * 56;
    for (const voice of /** @type {const} */ (['strings', 'pad', 'contrabass', 'harp'])) w.volume(voice, FIRST_BAR, i / 2, voice === 'harp' ? v * 0.84 : v);
  }
  w.volume('strings', 0, 0, MIX.strings[0]); w.volume('pad', 0, 0, MIX.pad[0]); w.volume('contrabass', 0, 0, MIX.contrabass[0]); w.volume('harp', 0, 0, MIX.harp[0]);
  rollInto(w, CLOUD_BAR, 2, 'C3');
  swellInto(w, CLOUD_BAR, 2);
  crescendoInto(w, CLOUD_BAR, 0.82);
  landOn(w, CLOUD_BAR, 'C', 0.96);
  rollInto(w, IMPACT_BAR, 2, 'D3', 46, 116);
  swellInto(w, IMPACT_BAR, 4);
  crescendoInto(w, IMPACT_BAR, 0.76);
  landOn(w, IMPACT_BAR, 'Gm', 1.05);
  for (const [bar, chord, vel] of /** @type {Array<[number, string, number]>} */ ([[8, 'Gm', 0.92], [17, 'D', 0.9], [41, 'Gm', 0.95], [55, 'Eb', 1], [61, 'F', 0.9], [67, 'Gm', 1.05]])) {
    w.hit('crash', bar, 0, 110 * vel);
    w.note('timpani', bar, 0, 1, midiNote(CHORDS[chord].root) + 12, 116 * vel);
    for (const n of CHORDS[chord].brass) w.note('hit', bar, 0, 1, n, 100 * vel);
    w.note('brass', bar, 0, 1.5, midiNote(CHORDS[chord].brass[0]) - 12, 104 * vel);
    crescendoInto(w, bar);
  }
  rollInto(w, 41, 2, 'D3');
  rollSnare(w, 55, 2);
  rollInto(w, 61, 4, 'D3', 40, 110);
  swellInto(w, 61, 4);
  rollInto(w, 67, 4, 'D3', 50, 120);
  swellInto(w, 67, 2);
  rollSnare(w, 67, 4, 36, 110);
  crescendoInto(w, CLOSE_BAR, 0.9);
  landOn(w, CLOSE_BAR, 'Gm', 0.92);
  for (let i = 0; i < 16; i++) for (const voice of /** @type {const} */ (['strings', 'choir', 'pad', 'contrabass', 'halo', 'violins'])) w.volume(voice, CLOSE_BAR + 1, i / 2, MIX[voice][0] * (1 - i / 16));
  for (const [voice, [level, pan]] of Object.entries(MIX)) {
    const channel = INTRO_CHANNELS[/** @type {keyof typeof INTRO_CHANNELS} */ (voice)];
    w.events.push({ tick: 0, type: 'programChange', channel, program: INTRO_PROGRAMS[/** @type {keyof typeof INTRO_PROGRAMS} */ (voice)] });
    w.events.push({ tick: 0, type: 'controller', channel, controller: 7, value: voice === 'strings' || voice === 'pad' || voice === 'contrabass' || voice === 'harp' ? 44 : level });
    w.events.push({ tick: 0, type: 'controller', channel, controller: 10, value: pan });
  }
  w.events.push({ tick: 0, type: 'controller', channel: INTRO_CHANNELS.kit, controller: 7, value: KIT_LEVEL });
  w.events.sort((a, b) => a.tick - b.tick || RANK[/** @type {keyof typeof RANK} */ (a.type)] - RANK[/** @type {keyof typeof RANK} */ (b.type)]);
  return {
    name: INTRO_SONG, press: INTRO_PRESS, tone: INTRO_TONE, level: INTRO_LEVEL,
    beatsPerMinute: 60 / (INTRO_SECONDS_PER_TICK * INTRO_SCORE_TPQ), secondsPerTick: INTRO_SECONDS_PER_TICK,
    events: w.events, durationTicks: introTick(LAST_BAR + 1), seamless: true,
    voices: INTRO_VOICES_BY_CHANNEL, kit: INTRO_KIT,
  };
}

let _theme = null;
export function introThemeSong() {
  return (_theme ??= Object.freeze(makeTheme()));
}

export const INTRO_SCORE_TABLES = Object.freeze({ HARMONY, MELODY, CHORDS });
