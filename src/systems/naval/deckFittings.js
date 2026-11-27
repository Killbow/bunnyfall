// @ts-check
// The wire sends a fitting's index in this list, so new fittings go at the end.
export const DECK_FITTINGS = Object.freeze([
  ...[41815, 41816, 41817, 41818, 41819, 41820, 41821, 41822, 41823, 41824, 41825, 41826, 41827, 41828, 41829, 41830, 41831, 41832, 41833, 41834].map((m) => Object.freeze([m, 'crate'])),
  ...[41811, 41812, 41813].map((m) => Object.freeze([m, 'chest'])),
]);
const MODELS = new Map(DECK_FITTINGS.map(([m, kind], i) => [m, { i, kind }]));
export const DECK_FITTINGS_MAX = 24;
export const FITTING_GAP = 0.6;
export const FITTING_REACH = 40;
export const YAW_STEPS = 16;

export const isFitting = (m) => MODELS.has(m);
export const fittingKind = (m) => MODELS.get(m)?.kind ?? null;
export const yawDegrees = (yaw) => ((yaw % YAW_STEPS) / YAW_STEPS) * 360;

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const dm = (v) => Math.round(v * 10) / 10;
export function fittingsOf(raw) {
  const out = [];
  for (const f of Array.isArray(raw) ? raw : []) {
    if (out.length >= DECK_FITTINGS_MAX) break;
    if (!f || typeof f !== 'object' || !isFitting(f.m) || !finite(f.x) || !finite(f.z)) continue;
    const x = dm(f.x), z = dm(f.z);
    if (Math.hypot(x, z) > FITTING_REACH) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < FITTING_GAP)) continue;
    const yaw = Number.isInteger(f.yaw) ? ((f.yaw % YAW_STEPS) + YAW_STEPS) % YAW_STEPS : 0;
    out.push({ m: f.m, x, z, yaw });
  }
  return out;
}
export function fittingsCode(list) {
  const out = [];
  for (const f of fittingsOf(list)) out.push(MODELS.get(f.m).i, Math.round(f.x * 10), Math.round(f.z * 10), f.yaw);
  return out;
}
export function fittingsOfCode(code) {
  if (!Array.isArray(code) || code.length % 4 || code.length > DECK_FITTINGS_MAX * 4 || !code.every(Number.isInteger)) return [];
  const raw = [];
  for (let i = 0; i < code.length; i += 4) raw.push({ m: DECK_FITTINGS[code[i]]?.[0], x: code[i + 1] / 10, z: code[i + 2] / 10, yaw: code[i + 3] });
  return fittingsOf(raw);
}
export const fittingsKey = (list) => fittingsCode(list).join(',');
