// A puppet leads the last position record its owner sent.
import { ownerTmDiffS } from '../net/ownerClock.js';

export const LEAD_MAX_S = 0.3;
export const LEAD_SPEED_MAX = 9;
export const LEAD_DIST_MAX = 1;
const LEAD_DT_MIN = 0.04;
const LEAD_DT_MAX = 1.2;
export const LEAD_SLOW_MAX_S = 0.75;
export const LEAD_DIST_SLOW_MAX = LEAD_DIST_MAX * LEAD_SLOW_MAX_S / LEAD_MAX_S;
export const LEAD_SLACK_S = 0.1;
export const LEAD_GAP_EASE = 0.25;

/**
 * @param {{ moving?: boolean, tm?: number | null, _lead?: any } | null} p
 * @param {ArrayLike<number> | null} t
 * @param {number} nowS
 */
export function puppetLead(p, t, nowS) {
  if (!p || !t || !Number.isFinite(nowS)) return t;
  const tm = Number.isInteger(p.tm) ? p.tm : null;
  let L = p._lead;
  if (!L) { L = p._lead = { x: t[0], y: t[1], z: t[2], at: nowS, tm, gap: 0, cap: LEAD_MAX_S, vx: 0, vz: 0, out: [0, 0, 0] }; return t; }
  if (t[0] !== L.x || t[1] !== L.y || t[2] !== L.z || (tm != null && tm !== L.tm)) {
    const owned = tm != null && L.tm != null && tm !== L.tm;
    const dt = owned ? ownerTmDiffS(tm, L.tm) : nowS - L.at, dx = t[0] - L.x, dz = t[2] - L.z;
    L.vx = 0; L.vz = 0;
    if (dt >= LEAD_DT_MIN && dt <= LEAD_DT_MAX) {
      const vx = dx / dt, vz = dz / dt, s2 = vx * vx + vz * vz;
      if (s2 <= LEAD_SPEED_MAX * LEAD_SPEED_MAX) { L.vx = vx; L.vz = vz; }
      if (owned) L.gap = dt >= L.gap ? dt : L.gap + (dt - L.gap) * LEAD_GAP_EASE;
    }
    L.cap = owned ? Math.min(LEAD_SLOW_MAX_S, Math.max(LEAD_MAX_S, L.gap + LEAD_SLACK_S)) : LEAD_MAX_S;
    L.x = t[0]; L.y = t[1]; L.z = t[2]; L.at = nowS; L.tm = tm;
  }
  if (!p.moving || (L.vx === 0 && L.vz === 0)) return t;
  const age = Math.min(Math.max(0, nowS - L.at), L.cap);
  let ox = L.vx * age, oz = L.vz * age;
  const d = Math.hypot(ox, oz), far = LEAD_DIST_MAX * (L.cap / LEAD_MAX_S);
  if (d > far) { ox *= far / d; oz *= far / d; }
  L.out[0] = t[0] + ox; L.out[1] = t[1]; L.out[2] = t[2] + oz;
  return L.out;
}
