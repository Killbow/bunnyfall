// The voice specs are this game's own: ARENA2 has no patch bank, so tests pin their structure, not their timbre.

export function noteToHz(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export const PERCUSSION_CHANNEL = 9;

export const GM_FAMILIES = Object.freeze([
  'piano', 'chromatic', 'organ', 'guitar', 'bass', 'strings', 'ensemble', 'brass',
  'reed', 'pipe', 'synthLead', 'synthPad', 'synthEffects', 'ethnic', 'percussive', 'soundEffects',
]);

const FAMILY_SPECS = Object.freeze({
  piano:        { type: 'triangle', attack: 0.005, decay: 0.35, sustain: 0.25, release: 0.25, cutoff: 6, q: 0.7, gain: 0.75 },
  chromatic:    { type: 'sine',     attack: 0.002, decay: 0.50, sustain: 0.05, release: 0.35, cutoff: 8, q: 0.7, gain: 0.70 },
  organ:        { type: 'square',   attack: 0.010, decay: 0.05, sustain: 0.90, release: 0.10, cutoff: 5, q: 0.6, gain: 0.55 },
  guitar:       { type: 'sawtooth', attack: 0.006, decay: 0.30, sustain: 0.30, release: 0.20, cutoff: 5, q: 0.9, gain: 0.60 },
  bass:         { type: 'triangle', attack: 0.008, decay: 0.25, sustain: 0.55, release: 0.15, cutoff: 3, q: 0.8, gain: 0.90 },
  strings:      { type: 'sawtooth', attack: 0.080, decay: 0.20, sustain: 0.75, release: 0.35, cutoff: 4, q: 0.7, gain: 0.55 },
  ensemble:     { type: 'sawtooth', attack: 0.120, decay: 0.20, sustain: 0.80, release: 0.45, cutoff: 4, q: 0.6, gain: 0.50 },
  brass:        { type: 'sawtooth', attack: 0.040, decay: 0.15, sustain: 0.80, release: 0.20, cutoff: 6, q: 1.0, gain: 0.60 },
  reed:         { type: 'square',   attack: 0.030, decay: 0.15, sustain: 0.80, release: 0.20, cutoff: 5, q: 0.9, gain: 0.50 },
  pipe:         { type: 'sine',     attack: 0.040, decay: 0.10, sustain: 0.85, release: 0.20, cutoff: 7, q: 0.6, gain: 0.55 },
  synthLead:    { type: 'sawtooth', attack: 0.010, decay: 0.20, sustain: 0.70, release: 0.20, cutoff: 6, q: 1.2, gain: 0.55 },
  synthPad:     { type: 'triangle', attack: 0.250, decay: 0.30, sustain: 0.80, release: 0.60, cutoff: 3, q: 0.7, gain: 0.45 },
  synthEffects: { type: 'sine',     attack: 0.100, decay: 0.40, sustain: 0.50, release: 0.50, cutoff: 4, q: 1.0, gain: 0.45 },
  ethnic:       { type: 'triangle', attack: 0.010, decay: 0.30, sustain: 0.40, release: 0.25, cutoff: 5, q: 0.8, gain: 0.60 },
  percussive:   { type: 'triangle', attack: 0.002, decay: 0.25, sustain: 0.05, release: 0.20, cutoff: 8, q: 0.9, gain: 0.70 },
  soundEffects: { type: 'sine',     attack: 0.020, decay: 0.30, sustain: 0.30, release: 0.30, cutoff: 4, q: 0.8, gain: 0.40 },
});

export function voiceSpec(program) {
  const p = Math.max(0, Math.min(127, Math.trunc(Number(program) || 0)));
  return { ...FAMILY_SPECS[GM_FAMILIES[p >> 3]], program: p, family: GM_FAMILIES[p >> 3] };
}

// `drop` is the pitch fall over the decay as a multiple of the start pitch; struck metal and wood hold at 1.
const DRUMS = Object.freeze([
  { note: 35, kind: 'tone',  hz: 55,   attack: 0.002, decay: 0.28, gain: 1.00 },
  { note: 36, kind: 'tone',  hz: 60,   attack: 0.002, decay: 0.24, gain: 1.00 },
  { note: 37, kind: 'noise', hz: 2500, attack: 0.001, decay: 0.05, gain: 0.55 },
  { note: 38, kind: 'noise', hz: 1800, attack: 0.001, decay: 0.16, gain: 0.75 },
  { note: 39, kind: 'noise', hz: 1500, attack: 0.001, decay: 0.12, gain: 0.65 },
  { note: 40, kind: 'noise', hz: 2000, attack: 0.001, decay: 0.14, gain: 0.75 },
  { note: 41, kind: 'tone',  hz: 90,   attack: 0.002, decay: 0.28, gain: 0.80 },
  { note: 42, kind: 'noise', hz: 7000, attack: 0.001, decay: 0.06, gain: 0.45 },
  { note: 43, kind: 'tone',  hz: 110,  attack: 0.002, decay: 0.26, gain: 0.80 },
  { note: 44, kind: 'noise', hz: 6500, attack: 0.001, decay: 0.08, gain: 0.40 },
  { note: 45, kind: 'tone',  hz: 130,  attack: 0.002, decay: 0.24, gain: 0.80 },
  { note: 46, kind: 'noise', hz: 6000, attack: 0.001, decay: 0.32, gain: 0.45 },
  { note: 47, kind: 'tone',  hz: 165,  attack: 0.002, decay: 0.22, gain: 0.80 },
  { note: 48, kind: 'tone',  hz: 195,  attack: 0.002, decay: 0.21, gain: 0.80 },
  { note: 49, kind: 'noise', hz: 4500, attack: 0.002, decay: 0.90, gain: 0.55 },
  { note: 50, kind: 'tone',  hz: 230,  attack: 0.002, decay: 0.20, gain: 0.80 },
  { note: 51, kind: 'noise', hz: 5500, attack: 0.002, decay: 0.50, gain: 0.40 },
  { note: 52, kind: 'noise', hz: 4000, attack: 0.002, decay: 0.70, gain: 0.50 },
  { note: 53, kind: 'tone',  hz: 2200, attack: 0.001, decay: 0.40, gain: 0.45, drop: 1 },
  { note: 54, kind: 'noise', hz: 9000, attack: 0.001, decay: 0.12, gain: 0.55 },
  { note: 55, kind: 'noise', hz: 6500, attack: 0.002, decay: 0.35, gain: 0.45 },
  { note: 56, kind: 'tone',  hz: 800,  attack: 0.001, decay: 0.22, gain: 0.55, drop: 1 },
  { note: 57, kind: 'noise', hz: 4200, attack: 0.002, decay: 0.85, gain: 0.55 },
  { note: 58, kind: 'noise', hz: 3000, attack: 0.002, decay: 0.45, gain: 0.45 },
  { note: 59, kind: 'noise', hz: 5200, attack: 0.002, decay: 0.55, gain: 0.40 },
  { note: 60, kind: 'tone',  hz: 400,  attack: 0.001, decay: 0.13, gain: 0.70, drop: 0.8 },
  { note: 61, kind: 'tone',  hz: 300,  attack: 0.001, decay: 0.15, gain: 0.70, drop: 0.8 },
  { note: 62, kind: 'tone',  hz: 360,  attack: 0.001, decay: 0.09, gain: 0.65, drop: 0.8 },
  { note: 63, kind: 'tone',  hz: 330,  attack: 0.001, decay: 0.20, gain: 0.70, drop: 0.8 },
  { note: 64, kind: 'tone',  hz: 240,  attack: 0.001, decay: 0.24, gain: 0.70, drop: 0.8 },
  { note: 65, kind: 'tone',  hz: 520,  attack: 0.001, decay: 0.18, gain: 0.65, drop: 0.85 },
  { note: 66, kind: 'tone',  hz: 420,  attack: 0.001, decay: 0.20, gain: 0.65, drop: 0.85 },
  { note: 67, kind: 'tone',  hz: 1050, attack: 0.001, decay: 0.18, gain: 0.55, drop: 1 },
  { note: 68, kind: 'tone',  hz: 850,  attack: 0.001, decay: 0.20, gain: 0.55, drop: 1 },
  { note: 69, kind: 'noise', hz: 8000, attack: 0.001, decay: 0.07, gain: 0.40 },
  { note: 70, kind: 'noise', hz: 8500, attack: 0.001, decay: 0.06, gain: 0.40 },
  { note: 71, kind: 'tone',  hz: 2300, attack: 0.002, decay: 0.12, gain: 0.40, drop: 1 },
  { note: 72, kind: 'tone',  hz: 2300, attack: 0.002, decay: 0.35, gain: 0.40, drop: 1 },
  { note: 73, kind: 'noise', hz: 2200, attack: 0.002, decay: 0.10, gain: 0.45 },
  { note: 74, kind: 'noise', hz: 2200, attack: 0.002, decay: 0.30, gain: 0.45 },
  { note: 75, kind: 'tone',  hz: 2400, attack: 0.001, decay: 0.06, gain: 0.60, drop: 1 },
  { note: 76, kind: 'tone',  hz: 2000, attack: 0.001, decay: 0.07, gain: 0.55, drop: 1 },
  { note: 77, kind: 'tone',  hz: 1600, attack: 0.001, decay: 0.08, gain: 0.55, drop: 1 },
  { note: 78, kind: 'tone',  hz: 600,  attack: 0.002, decay: 0.10, gain: 0.50, drop: 0.9 },
  { note: 79, kind: 'tone',  hz: 500,  attack: 0.002, decay: 0.25, gain: 0.50, drop: 0.9 },
  { note: 80, kind: 'tone',  hz: 6000, attack: 0.001, decay: 0.08, gain: 0.35, drop: 1 },
  { note: 81, kind: 'tone',  hz: 6000, attack: 0.001, decay: 0.60, gain: 0.35, drop: 1 },
  { note: 82, kind: 'noise', hz: 9000, attack: 0.001, decay: 0.07, gain: 0.40 },
  { note: 83, kind: 'tone',  hz: 5000, attack: 0.001, decay: 0.30, gain: 0.40, drop: 1 },
  { note: 84, kind: 'noise', hz: 7500, attack: 0.002, decay: 0.70, gain: 0.35 },
  { note: 85, kind: 'noise', hz: 4000, attack: 0.001, decay: 0.05, gain: 0.50 },
  { note: 86, kind: 'tone',  hz: 90,   attack: 0.002, decay: 0.16, gain: 0.85 },
  { note: 87, kind: 'tone',  hz: 80,   attack: 0.002, decay: 0.40, gain: 0.85 },
]);

export function percussionSpec(note) {
  const n = Math.max(0, Math.min(127, Math.trunc(Number(note) || 0)));
  let best = DRUMS[0];
  let bestDist = Infinity;
  for (const d of DRUMS) {
    const dist = Math.abs(d.note - n);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return { drop: 0.5, ...best, key: n };
}

export function velocityGain(velocity) {
  const v = Math.max(0, Math.min(127, Number(velocity) || 0)) / 127;
  return v * v;
}

export const volumeGain = velocityGain;

export function panPosition(value) {
  const v = Math.max(0, Math.min(127, Number(value) || 0));
  return (v - 64) / 63;
}

export function bendCents(value, semitoneRange = 2) {
  const v = Math.max(0, Math.min(16383, Number(value) || 0));
  return ((v - 8192) / 8192) * semitoneRange * 100;
}

// `mod` is the modulator frequency over the carrier's (a non-integer ratio is inharmonic); `index` is the
// modulation depth in carrier multiples, decaying over `idxDecay`.
const FM_SPECS = Object.freeze({
  piano:        { car: 1, mod: 1,    index: 2.6, idxDecay: 0.30, attack: 0.003, decay: 0.55, sustain: 0.18, release: 0.30, gain: 0.80 },
  chromatic:    { car: 1, mod: 3.5,  index: 4.0, idxDecay: 0.22, attack: 0.002, decay: 0.70, sustain: 0.04, release: 0.50, gain: 0.70 },
  organ:        { car: 1, mod: 2,    index: 1.2, idxDecay: 2.00, attack: 0.012, decay: 0.06, sustain: 0.92, release: 0.10, gain: 0.55 },
  guitar:       { car: 1, mod: 2,    index: 3.2, idxDecay: 0.18, attack: 0.004, decay: 0.45, sustain: 0.16, release: 0.28, gain: 0.70 },
  bass:         { car: 1, mod: 1,    index: 2.0, idxDecay: 0.16, attack: 0.006, decay: 0.35, sustain: 0.45, release: 0.18, gain: 0.95 },
  strings:      { car: 1, mod: 1,    index: 1.1, idxDecay: 1.20, attack: 0.090, decay: 0.30, sustain: 0.78, release: 0.40, gain: 0.60 },
  ensemble:     { car: 1, mod: 1,    index: 1.4, idxDecay: 1.40, attack: 0.130, decay: 0.30, sustain: 0.82, release: 0.50, gain: 0.55 },
  brass:        { car: 1, mod: 1,    index: 3.4, idxDecay: 0.55, attack: 0.045, decay: 0.22, sustain: 0.75, release: 0.22, gain: 0.65 },
  reed:         { car: 1, mod: 2,    index: 2.4, idxDecay: 0.60, attack: 0.030, decay: 0.20, sustain: 0.78, release: 0.20, gain: 0.55 },
  pipe:         { car: 1, mod: 2,    index: 0.8, idxDecay: 1.00, attack: 0.045, decay: 0.15, sustain: 0.85, release: 0.20, gain: 0.60 },
  synthLead:    { car: 1, mod: 1,    index: 2.8, idxDecay: 0.70, attack: 0.010, decay: 0.25, sustain: 0.70, release: 0.20, gain: 0.60 },
  synthPad:     { car: 1, mod: 1,    index: 1.0, idxDecay: 2.00, attack: 0.260, decay: 0.40, sustain: 0.82, release: 0.70, gain: 0.50 },
  synthEffects: { car: 1, mod: 1.41, index: 3.0, idxDecay: 0.80, attack: 0.110, decay: 0.50, sustain: 0.45, release: 0.55, gain: 0.45 },
  ethnic:       { car: 1, mod: 3,    index: 2.6, idxDecay: 0.20, attack: 0.006, decay: 0.40, sustain: 0.20, release: 0.28, gain: 0.65 },
  percussive:   { car: 1, mod: 3.5,  index: 5.0, idxDecay: 0.12, attack: 0.002, decay: 0.40, sustain: 0.02, release: 0.25, gain: 0.75 },
  soundEffects: { car: 1, mod: 1.73, index: 2.0, idxDecay: 0.60, attack: 0.020, decay: 0.40, sustain: 0.25, release: 0.35, gain: 0.45 },
});

// Per-program overrides where a GM family gets the articulation wrong, such as a plucked harp in the bowed strings.
const PROGRAM_SPECS = Object.freeze({
  6:  { attack: 0.002, decay: 0.30, sustain: 0.04, release: 0.16, index: 3.8, idxDecay: 0.14 },
  13: { attack: 0.001, decay: 0.22, sustain: 0.02, release: 0.16 },
  14: { attack: 0.002, decay: 1.60, sustain: 0.06, release: 1.20, index: 5.0, idxDecay: 0.50 },
  45: { attack: 0.002, decay: 0.22, sustain: 0.02, release: 0.14, index: 2.6, idxDecay: 0.12 },
  46: { attack: 0.002, decay: 0.90, sustain: 0.05, release: 0.70, index: 2.2, idxDecay: 0.35 },
  47: { attack: 0.002, decay: 0.45, sustain: 0.02, release: 0.30, index: 4.2, idxDecay: 0.10 },
  55: { attack: 0.004, decay: 0.30, sustain: 0.03, release: 0.22, index: 3.6, idxDecay: 0.16 },
  119: { attack: 0.55, decay: 0.10, sustain: 0.90, release: 0.08, index: 4.0, idxDecay: 1.50 },
});

export function fmSpec(program) {
  const p = Math.max(0, Math.min(127, Math.trunc(Number(program) || 0)));
  const family = GM_FAMILIES[p >> 3];
  return { ...FM_SPECS[family], ...(PROGRAM_SPECS[p] ?? {}), program: p, family };
}
