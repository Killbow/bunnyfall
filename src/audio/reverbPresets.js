// Unity's I3DL2 presets: levels in millibels, times in seconds, HFReference in Hz. The impulse built from them is
// this game's own synthesis, not FMOD's reverb.
export const REVERB_PRESET = Object.freeze({
  Cave: Object.freeze({ room: -1000, roomHF: 0, decayTime: 2.91, decayHFRatio: 1.30, reflections: -602, reflectionsDelay: 0.015, reverb: -302, reverbDelay: 0.022, HFReference: 5000, diffusion: 100, density: 100 }),
  Stoneroom: Object.freeze({ room: -1000, roomHF: -300, decayTime: 2.31, decayHFRatio: 0.64, reflections: -711, reflectionsDelay: 0.012, reverb: 83, reverbDelay: 0.017, HFReference: 5000, diffusion: 100, density: 100 }),
  Quarry: Object.freeze({ room: -1000, roomHF: -1000, decayTime: 1.49, decayHFRatio: 0.83, reflections: -10000, reflectionsDelay: 0.061, reverb: 500, reverbDelay: 0.025, HFReference: 5000, diffusion: 100, density: 100 }),
});
export const mbToGain = (mb) => Math.pow(10, mb / 2000);

function noise(seed) {
  let x = seed | 0;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) / 4294967296) * 2 - 1; };
}

export function reverbImpulseSamples(p, sampleRate) {
  const length = Math.max(1, Math.ceil((p.reverbDelay + p.decayTime) * sampleRate));
  const out = [new Float32Array(length), new Float32Array(length)];
  const room = mbToGain(p.room), roomHF = mbToGain(p.roomHF);
  const refl = mbToGain(p.reflections) * room, tail = mbToGain(p.reverb) * room;
  for (let ch = 0; ch < 2; ch++) {
    const taps = [0, 0.011, 0.019, 0.027, 0.034][Symbol.iterator]();
    let k = 0;
    for (const t of taps) {
      const i = Math.floor((p.reflectionsDelay + t + (ch ? 0.003 : 0)) * sampleRate);
      if (i < length) out[ch][i] += refl * Math.pow(0.75, k);
      k++;
    }
  }
  const start = Math.floor(p.reverbDelay * sampleRate);
  const lowDecay = Math.log(1000) / (p.decayTime * sampleRate);
  // The high band decays over decayTime x decayHFRatio, I3DL2's high-to-mid decay ratio.
  const highDecay = Math.log(1000) / ((p.decayTime * Math.max(0.05, p.decayHFRatio)) * sampleRate);
  const alpha = Math.exp(-p.HFReference * Math.PI / (sampleRate / 2));
  for (let ch = 0; ch < 2; ch++) {
    const rnd = noise(0x9e3779b9 + ch * 7919);
    let low = 0;
    const raw = new Float32Array(Math.max(0, length - start));
    let energy = 0;
    for (let i = start; i < length; i++) {
      const n = rnd();
      low = low * alpha + n * (1 - alpha);
      const high = n - low;
      const t = i - start;
      const v = low * Math.exp(-lowDecay * t) + high * roomHF * Math.exp(-highDecay * t);
      raw[t] = v;
      energy += v * v;
    }
    // The tail is normalized to unit energy before the level scales it, so a long tail cannot blast into clipping.
    const k = energy > 0 ? tail / Math.sqrt(energy) : 0;
    for (let t = 0; t < raw.length; t++) out[ch][start + t] += raw[t] * k;
  }
  return out;
}

export function reverbImpulse(ctx, p) {
  const [l, r] = reverbImpulseSamples(p, ctx.sampleRate);
  const buf = ctx.createBuffer(2, l.length, ctx.sampleRate);
  buf.getChannelData(0).set(l);
  buf.getChannelData(1).set(r);
  return buf;
}
