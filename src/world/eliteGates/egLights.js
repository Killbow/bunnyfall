// @ts-check
import { egHallOf, egCircleOfHall, egBandOfCircle, EG_DOOR_REACH_M, EG_TWIST_LINES } from '../../net/eliteGates/egLaw.js';
import { egBodyPlace, egGatherOf } from '../../net/eliteGates/egLink.js';
import { EG_ROLE, EG_FL } from '../../net/eliteGates/egBodies.js';
import { EG_KIND } from '../../net/eliteGates/egLegion.js';
import { egTwistShown } from '../../net/eliteGates/egRun.js';
import { egToDungeon } from './egHall.js';
import { EG_STAIR, egStairOf } from './egLook.js';
import { EG_DANGER_PALETTES } from '../../ui/eliteGates/egAccess.js';
import { EG_SCORE_BAND_MOTIFS } from '../../systems/eliteGates/egScore.js';
import { midiNote } from '../../worldEvents/gateScore.js';

// Close, fall hold, and open must total less than `VEIL_CLOSE_S` + `VEIL_OPEN_S` (2.9 s), and the swap work runs
// inside the hold.
export const EG_STAIR_VEIL = Object.freeze({ close: EG_STAIR.dither, open: EG_STAIR.dither, fallHold: 1.2 });
export const EG_STAIR_THEME = Object.freeze({ fall: 'egFall', veil: 'egVeil', cut: 'egCut' });
export function egStairChime(band) {
  const m = EG_SCORE_BAND_MOTIFS[Math.max(0, Math.min(EG_SCORE_BAND_MOTIFS.length - 1, band | 0))];
  return Math.max(0.3, 0.7 * 2 ** ((midiNote(m[0][0]) - midiNote('C5')) / 12));
}
export const egStairLabel = (h) => `Hall ${h | 0}`;
export function egStairStep(h, reduced = false, again = false) {
  const kind = again ? (reduced ? 'cut' : 'veil') : egStairOf(h, reduced);
  const band = egBandOfCircle(egCircleOfHall(Math.max(1, h | 0)));
  return { kind, look: EG_STAIR_THEME[kind], opts: { band, label: egStairLabel(h), chime: egStairChime(band) } };
}

export const EG_LIGHT_KIND = Object.freeze({ beam: 0, pillar: 1, ring: 2, glyph: 3 });
export const EG_GLYPH = Object.freeze({ here: 0, danger: 1, mine: 2, eye: 3 });
// Matches the HUD blue `#6f9dff` in `ui/eliteGates/egSpireHud.js`; change both together.
export const EG_LIGHT_BLUE = Object.freeze([0.435, 0.616, 1.0]);
export const EG_DOOR_BEAM = Object.freeze({ h: 48, w: 1.4, rise: 0.6, fog: 0.6 });
export const EG_CLOSING_RING = Object.freeze({ r: EG_DOOR_REACH_M, w: 0.22, lift: 0.04, spent: 0.25 });
export const EG_BEACON = Object.freeze({ at: 1.5, climb: 1.2, h: 90, w: 2.4, flare: 0.8, flareK: 1.6 });
export const EG_RECALL_PILLAR = Object.freeze({ h: 6, w: 1.1, s: 3, rise: 0.4, fade: 0.6 });
export const EG_PING = Object.freeze({ h: 6, w: 0.5, s: 5, fade: 1, rise: 0.25, glyph: 0.9 });
export const EG_SIGHT = Object.freeze({ r: 1.2, w: 0.14, glyph: 0.7, up: 2.2 });
export const EG_LIGHTS_MAX = 48;
export const EG_FLOOR_NEAR_UP = 0.5;
export const EG_LIGHTS_TEXT = Object.freeze({ sight: (line) => `Beyond the door: ${line}` });

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const NO_LIGHTS = Object.freeze([]);
function laneDist(x, z, l) {
  const dx = l.bx - l.ax, dz = l.bz - l.az, L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? clamp01(((x - l.ax) * dx + (z - l.az) * dz) / L2) : 0;
  return Math.hypot(x - (l.ax + dx * t), z - (l.az + dz * t));
}
export function egFloorUnder(spec, x, z, near = null) {
  let top = -Infinity, best = -Infinity;
  const ok = near != null && Number.isFinite(near);
  const take = (y) => { if (y > top) top = y; if (ok && y <= near + EG_FLOOR_NEAR_UP && y > best) best = y; };
  for (const d of spec.discs ?? []) if (Math.hypot(x - d.x, z - d.z) <= d.r) take(d.y ?? 0);
  for (const b of spec.bands ?? []) if (Math.abs(x - b.x) <= b.halfW && z >= Math.min(b.z0, b.z1) && z <= Math.max(b.z0, b.z1)) take(b.y ?? 0);
  for (const l of spec.lanes ?? []) if (laneDist(x, z, l) <= l.hw) take(l.y ?? 0);
  if (best > -Infinity) return best;
  if (top > -Infinity) return top;
  return spec.arrive?.y ?? 0;
}

const light = (k, p, h, w, r, c, a, f) => ({ k, x: p[0], y: p[1], z: p[2], h, w, r, c, a, f });
function pillarWithGlyph(out, p, h, w, c, a, g, size) {
  out.push(light(EG_LIGHT_KIND.pillar, p, h, w, 0, c, a, 0));
  if (g >= 0) out.push(light(EG_LIGHT_KIND.glyph, [p[0], p[1] + h + size * 0.75, p[2]], 0, size, 0, c, a, g));
}

/**
 * @param {any} E
 * @param {number} now
 * @param {{ witness?: boolean, still?: boolean, palette?: any, ys?: Map<string, number>|null }} [o]
 */
export function egSpireLights(E, now, { witness = false, still = false, palette = null, ys = null } = {}) {
  if (!E?.b || !(E.h > 0) || E.end) return NO_LIGHTS;
  if (E.sg !== 'closing' && E.sg !== 'rest' && E.sg !== 'arrive' && !witness && !E.rises?.length && !E.pings?.length) return NO_LIGHTS;
  const out = [];
  const spec = egHallOf(E.seed, E.h, E.geo ?? 0), gold = palette?.safety ?? EG_DANGER_PALETTES.standard.safety, blue = EG_LIGHT_BLUE;
  if (E.sg === 'closing' && spec.end) {
    const p = egToDungeon(spec, spec.end.x, spec.end.y ?? 0, spec.end.z);
    const up = still ? 1 : clamp01((now - (E.sa || now)) / 1000 / EG_DOOR_BEAM.rise);
    out.push(light(EG_LIGHT_KIND.beam, p, EG_DOOR_BEAM.h * up, EG_DOOR_BEAM.w, 0, gold, 1, 0));
    const span = (E.su || 0) - (E.sa || 0);
    out.push(light(EG_LIGHT_KIND.ring, [p[0], p[1] + EG_CLOSING_RING.lift, p[2]], 0, EG_CLOSING_RING.w, EG_CLOSING_RING.r, gold, 1, span > 0 ? clamp01((E.su - now) / span) : 0));
  }
  if (E.sg === 'arrive' && spec.arrive) {
    const G = egGatherOf(E);
    if (G.n > 1) { const p = egToDungeon(spec, spec.arrive.x, spec.arrive.y ?? 0, spec.arrive.z); out.push(light(EG_LIGHT_KIND.ring, [p[0], p[1] + EG_CLOSING_RING.lift, p[2]], 0, EG_CLOSING_RING.w, spec.arrive.r, gold, 1, G.here / G.n)); }
  }
  const R = E.redoubt;
  if (R && R.h === E.h && E.sg === 'rest' && spec.ring) {
    const s = (now - (R.at ?? now)) / 1000 - EG_BEACON.at;
    if (s >= 0) {
      const f = spec.fight ?? spec.end, p = egToDungeon(spec, spec.ring.x, f?.y ?? 0, spec.ring.z);
      const flare = (E.rises ?? []).some((q) => q.h === E.h && now >= q.at && now - q.at < EG_BEACON.flare * 1000);
      out.push(light(EG_LIGHT_KIND.beam, p, EG_BEACON.h * (still ? 1 : clamp01(s / EG_BEACON.climb)), EG_BEACON.w * (flare ? EG_BEACON.flareK : 1), 0, gold, flare ? EG_BEACON.flareK : 1, 0));
    }
  }
  for (const q of E.rises ?? []) {
    const s = (now - q.at) / 1000, P = EG_RECALL_PILLAR;
    if (!(s >= 0 && s < P.s) || !(q.h > 0)) continue;
    const hs = egHallOf(E.seed, q.h, E.geo ?? 0), p = egToDungeon(hs, q.x, egFloorUnder(hs, q.x, q.z), q.z);
    out.push(light(EG_LIGHT_KIND.pillar, p, P.h * (still ? 1 : clamp01(s / P.rise)), P.w, 0, blue, clamp01((P.s - s) / P.fade), 0));
  }
  for (const q of E.pings ?? []) {
    const s = (now - q.at) / 1000, P = EG_PING;
    if (!(s >= 0 && s < P.s)) continue;
    const p = egToDungeon(spec, q.x, egFloorUnder(spec, q.x, q.z, ys?.get(q.s) ?? null), q.z);
    const g = q.w === 1 ? EG_GLYPH.danger : q.w === 2 ? EG_GLYPH.mine : EG_GLYPH.here;
    pillarWithGlyph(out, p, P.h * (still ? 1 : clamp01(s / P.rise)), P.w, blue, clamp01((P.s - s) / P.fade), g, P.glyph);
  }
  if (witness) {
    const S = EG_SIGHT;
    const mark = (x, z, g, y = null) => {
      const p = egToDungeon(spec, x, Number.isFinite(y) ? y : egFloorUnder(spec, x, z), z);
      out.push(light(EG_LIGHT_KIND.ring, [p[0], p[1] + EG_CLOSING_RING.lift, p[2]], 0, S.w, S.r, blue, 1, 1));
      out.push(light(EG_LIGHT_KIND.glyph, [p[0], p[1] + S.up, p[2]], 0, S.glyph, 0, blue, 1, g));
    };
    if (E.fight?.h === E.h) for (const b of E.fight.bodies ?? []) if (b.role === EG_ROLE.add && b.k === EG_KIND.lurker && (b.fl & EG_FL.dormant) !== 0 && b.hp > 0) { const [x, z] = egBodyPlace(b, now); mark(x, z, EG_GLYPH.eye); }
    for (const q of spec.alcoves ?? []) mark(q.x, q.z, EG_GLYPH.mine, q.y);
  }
  return out.length > EG_LIGHTS_MAX ? out.slice(0, EG_LIGHTS_MAX) : out;
}

export function egDoorCompass(E, witness = false) {
  if (witness || !E?.b || E.end || E.sg !== 'closing' || !(E.h > 0)) return null;
  const spec = egHallOf(E.seed, E.h, E.geo ?? 0);
  if (!spec.end) return null;
  const p = egToDungeon(spec, spec.end.x, spec.end.y ?? 0, spec.end.z);
  return [p[0], p[2]];
}

// Returns an empty line past the Court of this circle because the next circle's decrees are not chosen yet.
export function egWitnessTwist(E) {
  if (!E?.b || !(E.h > 0) || E.end || egCircleOfHall(E.h + 1) !== egCircleOfHall(E.h)) return '';
  const next = egHallOf(E.seed, E.h + 1, E.geo ?? 0);
  return egTwistShown(next, E.dc) ? EG_TWIST_LINES[next.twist] ?? '' : '';
}
