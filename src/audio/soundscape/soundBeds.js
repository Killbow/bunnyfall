// @ts-check
import { section, mulberry32 } from './bedDsp.js';

export const BED_RATE = 22050;
export const BED_RATE_LOW = 11025;

/** @typedef {['lowpass' | 'bandpass' | 'highpass', number, number]} BedSection */
/** @typedef {{ chain: ReadonlyArray<BedSection>, gain: number }} BedLayer */
/** @typedef {{ seconds: number, seed: number, rms: number, rate: number, layers: ReadonlyArray<BedLayer> }} BedSpec */

/** @param {number} seconds @param {number} seed @param {number} rms @param {number} rate @param {Array<[ReadonlyArray<BedSection>, number]>} layers @returns {BedSpec} */
const bed = (seconds, seed, rms, rate, layers) => Object.freeze({
  seconds, seed, rms, rate,
  layers: Object.freeze(layers.map(([chain, gain]) => Object.freeze({ chain: Object.freeze(chain.map((s) => /** @type {BedSection} */ (Object.freeze([...s])))), gain }))),
});

export const SOUND_BEDS = Object.freeze({
  'sea:swell': bed(12, 0x5ea5e11, 0.05, BED_RATE_LOW, [[[['lowpass', 520, 0.7], ['lowpass', 380, 0.8], ['highpass', 40, 0.7]], 1], [[['bandpass', 160, 0.9]], 0.5]]),
  'sea:wash': bed(9, 0x5eaa45a, 0.04, BED_RATE, [[[['bandpass', 1500, 0.55], ['lowpass', 4800, 0.707]], 1]]),
  'sea:rigging': bed(10, 0x51661a6, 0.03, BED_RATE_LOW, [[[['bandpass', 410, 14], ['bandpass', 410, 14]], 1], [[['bandpass', 615, 16], ['bandpass', 615, 16]], 0.6], [[['bandpass', 900, 1.2]], 0.25]]),
  'shore:surf': bed(12, 0x5a0f5e1, 0.05, BED_RATE, [[[['lowpass', 700, 0.7], ['highpass', 45, 0.7]], 1], [[['highpass', 1800, 0.6], ['lowpass', 7000, 0.707]], 0.45]]),
  'shore:lap': bed(8, 0x1a91a9, 0.03, BED_RATE_LOW, [[[['bandpass', 700, 0.9], ['lowpass', 2400, 0.707]], 1]]),
  'wild:marsh': bed(10, 0x3a125b, 0.025, BED_RATE, [[[['bandpass', 240, 3], ['lowpass', 900, 0.707]], 1], [[['bandpass', 4200, 6]], 0.35]]),
});

/**
 * @param {BedSpec} spec
 * @param {number} [sampleRate]
 */
export function bedSamples(spec, sampleRate = spec.rate) {
  const n = Math.max(1, Math.round(sampleRate * spec.seconds));
  const next = mulberry32(spec.seed);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = next() * 2 - 1;
  const sum = new Float64Array(n);
  const y = new Float64Array(n);
  for (const { chain, gain } of spec.layers) {
    const st = chain.map(() => new Float64Array(4));
    // Each chain runs twice and keeps the second pass, so the filter state at the end matches the start and the
    // loop has no seam.
    for (let pass = 0; pass < 2; pass++) {
      y.set(x);
      chain.forEach(([type, f0, q], k) => {
        const [c0, c1, c2, c3, c4] = section(type, f0, q, sampleRate), s = st[k];
        let x1 = s[0], x2 = s[1], y1 = s[2], y2 = s[3];
        for (let i = 0; i < n; i++) {
          const v = y[i], o = c0 * v + c1 * x1 + c2 * x2 - c3 * y1 - c4 * y2;
          x2 = x1; x1 = v; y2 = y1; y1 = o;
          y[i] = o;
        }
        s[0] = x1; s[1] = x2; s[2] = y1; s[3] = y2;
      });
    }
    for (let i = 0; i < n; i++) sum[i] += y[i] * gain;
  }
  let acc = 0;
  for (let i = 0; i < n; i++) acc += sum[i] * sum[i];
  const k = acc > 0 ? spec.rms / Math.sqrt(acc / n) : 0;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = sum[i] * k;
  return out;
}

/** @type {Map<string, Float32Array>} */
const _beds = new Map();
export function bedOf(/** @type {string} */ key) {
  const spec = /** @type {Record<string, BedSpec>} */ (SOUND_BEDS)[key];
  if (!spec) return null;
  let s = _beds.get(key);
  if (!s) _beds.set(key, (s = bedSamples(spec)));
  return s;
}
