// Resurrect (45,255) is this game's own Restoration effect; classic Daggerfall has no raise-dead effect.
// A dead player has left the room, so the caster sends `rz: {to, at}` in the party pose for RESURRECT_HOLD_MS.
// The fallen player's client rises when it reads a new `rz.at` naming it.
import { buildCustomSpell } from './spellMaker.js';
import { t } from '../ui/textManager.js';

export const RESURRECT_TYPE = 45;
export const RESURRECT_SUBTYPE = 255;
export const RESURRECT_KEY = '45,255';
export const RESURRECT_HEALTH_PCT = 30;
export const RESURRECT_REACH = 6;
export const RESURRECT_GROUND_SLACK = 2.2;
export const RESURRECT_RAY_SLACK = 1.5;
export const RESURRECT_CONE_DEG = 30;

export function pickFallenBody(eye, dir, bodies, ground = Infinity) {
  const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const d = [dir[0] / l, dir[1] / l, dir[2] / l];
  const g = Number.isFinite(ground) && ground <= RESURRECT_REACH + RESURRECT_GROUND_SLACK
    ? [eye[0] + d[0] * ground, eye[1] + d[1] * ground, eye[2] + d[2] * ground] : null;
  let best = null, bestScore = Infinity;
  for (const b of bodies ?? []) {
    const f = b?.feet;
    if (!f || f.length !== 3) continue;
    const reach = Math.hypot(f[0] - eye[0], f[1] - eye[1], f[2] - eye[2]);
    if (reach > RESURRECT_REACH) continue;
    let score = Infinity;
    if (g && Math.abs(g[1] - f[1]) < 2) {
      const dh = Math.hypot(g[0] - f[0], g[2] - f[2]);
      if (dh <= RESURRECT_GROUND_SLACK) score = dh;
    }
    const m = [f[0], f[1] + 0.3, f[2]];
    const t = (m[0] - eye[0]) * d[0] + (m[1] - eye[1]) * d[1] + (m[2] - eye[2]) * d[2];
    if (t > 0 && (!Number.isFinite(ground) || t <= ground + RESURRECT_RAY_SLACK)) {
      const off = Math.hypot(eye[0] + d[0] * t - m[0], eye[1] + d[1] * t - m[1], eye[2] + d[2] * t - m[2]);
      if (off <= RESURRECT_RAY_SLACK) score = Math.min(score, off);
    }
    if (!Number.isFinite(score)) {
      const v = [m[0] - eye[0], m[1] - eye[1], m[2] - eye[2]];
      const vl = Math.hypot(v[0], v[1], v[2]) || 1;
      const cos = (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / vl;
      if (cos >= Math.cos(RESURRECT_CONE_DEG * Math.PI / 180)) score = RESURRECT_RAY_SLACK + Math.acos(Math.min(1, cos));
    }
    if (score < bestScore) { bestScore = score; best = { ...b, distance: reach }; }
  }
  return best;
}
export const RESURRECT_HOLD_MS = 8000;
// The index is fixed so a bought copy has the same key in every save.
export const RESURRECTION_SPELL_INDEX = -45001;

export const RESURRECT_TEXT = Object.freeze({
  noBody: 'There is no fallen party member within reach.',
  aim: 'Look at a fallen party member\'s body and cast.',
  cast: (name) => `You call ${name || 'your companion'} back from death.`,
  raised: (name) => `${name || 'A companion'} has brought you back from death.`,
  spared: (n) => `Death takes none of your gold: the ${n.toLocaleString('en-US')} it claimed stay in your purse.`,
  forGood: (name) => t('resurrect.forGood', '{name} has fallen for good. No spell will raise them now.', { name: name || t('resurrect.companion', 'Your companion') }),
});

export const hasResurrect = (sp) => !!sp && Array.isArray(sp.effects) && sp.effects.some((e) => e && e.type === RESURRECT_TYPE);

export function resurrectionSpell() {
  return buildCustomSpell({ slots: [{ type: RESURRECT_TYPE, subType: RESURRECT_SUBTYPE, settings: {} }], rangeType: 1, element: 4,
    name: 'Resurrection', icon: 10, index: RESURRECTION_SPELL_INDEX });
}

// Take the snapshot when the player dies, so a call sent for an earlier death is not answered again.
export function rezSnapshot(members) {
  const seen = new Map();
  for (const m of members ?? []) seen.set(m.acct, m?.p?.rz?.at ?? null);
  return seen;
}
export function rezFor(members, myAcct, seen) {
  if (!myAcct || !seen) return null;
  for (const m of members ?? []) {
    const rz = m?.p?.rz;
    if (!rz || rz.to !== myAcct || !Number.isFinite(rz.at)) continue;
    if (seen.get(m.acct) === rz.at) continue;
    return { acct: m.acct, name: m.name ?? null, at: rz.at };
  }
  return null;
}
