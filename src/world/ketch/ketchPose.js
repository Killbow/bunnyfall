// @ts-check
// Every time here is the shared clock from ketchDeck.js, so each screen draws the hammer the relay judges and the
// section the room drops.
import { KT_HAMMER, KT_STEAM, KT_ARCS, KT_GALLERY, hammerPhase } from '../../net/ketch/ketchDeck.js';

export const KT_HAMMER_POSE = Object.freeze({ rest: KT_GALLERY.y + 3.0, top: KT_GALLERY.y + 4.3, floor: KT_GALLERY.y + 0.02, slam: 0.12, haul: 0.7 });
const ease = (k) => { const x = Math.max(0, Math.min(1, k)); return x * x * (3 - 2 * x); };
const wrap = (t, c) => ((t % c) + c) % c;

export function hammerHeadY(ri, li, t) {
  const H = KT_HAMMER, P = KT_HAMMER_POSE, c = H.cycle, sp = H.sp / 1000, wu = H.wu / 1000;
  const u = wrap(t - hammerPhase(ri, li), c);
  if (u < sp) return P.floor;
  if (u < sp + P.haul) return P.floor + (P.rest - P.floor) * ease((u - sp) / P.haul);
  if (u < c - wu) return P.rest;
  if (u < c - P.slam) return P.rest + (P.top - P.rest) * ease((u - (c - wu)) / (wu - P.slam));
  return P.top + (P.floor - P.top) * ((u - (c - P.slam)) / P.slam) ** 2;
}

export function hazardState(kind, j, t, out = { live: false, warn: false, k: 0 }) {
  const H = kind === 'steam' ? KT_STEAM : KT_ARCS;
  const u = wrap(t - hazardPhase(kind, j), H.cycle), sp = H.sp / 1000, wu = H.wu / 1000;
  if (u < sp) { out.live = true; out.warn = false; out.k = 1; } else if (u >= H.cycle - wu) { out.live = false; out.warn = true; out.k = (u - (H.cycle - wu)) / wu; } else { out.live = false; out.warn = false; out.k = 0; }
  return out;
}

export const hazardPhase = (kind, j) => (kind === 'steam' ? (j * KT_STEAM.cycle) / 2 : (j * KT_ARCS.cycle) / 3);
// A look keyed to the strike number changes once per strike, which keeps arc frame swaps under the 3 Hz flash
// limit.
export function hazardStrike(kind, j, t) {
  const H = kind === 'steam' ? KT_STEAM : KT_ARCS;
  return Math.floor((t - hazardPhase(kind, j)) / H.cycle);
}

export const KT_SECTION_DROP = Object.freeze({ seen: 60, g: 14, shudder: 0.06 });
export const KT_SECTION_RISE_MS = 1200;
// Stays under TELEGRAPH_THROB_MAX_HZ (3 Hz) and the 2.5 Hz heartbeat ceiling.
export const KT_SECTION_LURCH_HZ = 1.5;
export function sectionPose(k, sec, now, warnMs, out = { solid: true, dy: 0, shake: 0, hidden: false }) {
  const put = (solid, dy, shake, hidden) => { out.solid = solid; out.dy = dy; out.shake = shake; out.hidden = hidden; return out; };
  let s = null;
  for (const e of sec ?? []) if (e[0] === k) { s = e; break; }
  if (!s || now >= s[2]) return put(true, 0, 0, false);
  const at = s[1], back = s[2];
  if (now < at - warnMs) return put(true, 0, 0, false);
  if (now < at) return put(true, 0, KT_SECTION_DROP.shudder * Math.sin((2 * Math.PI * KT_SECTION_LURCH_HZ * now) / 1000) * ((now - (at - warnMs)) / warnMs), false);
  const D = KT_SECTION_DROP;
  if (now >= back - KT_SECTION_RISE_MS) { const k2 = (back - now) / KT_SECTION_RISE_MS; return put(false, -D.seen * k2 * k2, 0, false); }
  const f = (now - at) / 1000, dy = -0.5 * D.g * f * f;
  return dy < -D.seen ? put(false, -D.seen, 0, true) : put(false, dy, 0, false);
}
