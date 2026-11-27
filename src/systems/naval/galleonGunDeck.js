// @ts-check
// Opens gunport shutters and runs guns in and out for every ship in play that has Gun and Gunport nodes. It moves
// nothing but those nodes, so a hull without them is left alone.
import { GUN } from '../../world/galleonModel.js';

export const GUN_DECK_SIDES = Object.freeze({ starboard: 'Starboard', port: 'Port' });
export const HOLD_S = 2.5;
export const RUN_IN_X = GUN.runInX;
export const RUN_OUT_X = GUN.runOutX;
export const RUN_SPEED = 0.95;
export const RECOIL = 0.95;
export const KICK_S = 0.12;
export const HAUL_S = 2.2;
const OPENED_STATE = 'Opened';

export function recoilAt(t) {
  if (!(t >= 0)) return 0;
  if (t < KICK_S) return RECOIL * (t / KICK_S);
  const u = Math.min(1, (t - KICK_S) / HAUL_S);
  return RECOIL * (1 - u * u * (3 - 2 * u));
}

export function createGalleonGunDeck() {
  const rigs = new WeakMap();
  // Boats laid or fired keep stepping until at rest, even after the caller stops naming them.
  const settling = new Set();
  let lastNow = 0;
  function rigOf(boat) {
    if (!boat?.GameObject) return null;
    let r = rigs.get(boat);
    if (r && r.root === boat.GameObject) return r.sides ? r : null;
    const found = { starboard: { guns: [], lids: [], laidUntil: -Infinity, firedAt: [], x: [], inX: [], outX: [] }, port: { guns: [], lids: [], laidUntil: -Infinity, firedAt: [], x: [], inX: [], outX: [] } };
    for (const n of boat.GameObject.walk()) {
      const m = /^(Gun|Gunport)(Starboard|Port)(\d+)$/.exec(n.name);
      if (!m) continue;
      const side = m[2] === 'Starboard' ? found.starboard : found.port;
      (m[1] === 'Gun' ? side.guns : side.lids)[Number(m[3])] = n;
    }
    const any = found.starboard.guns.length || found.port.guns.length || found.starboard.lids.length || found.port.lids.length;
    r = { root: boat.GameObject, sides: any ? found : null };
    if (any) for (const s of Object.values(found)) {
      s.firedAt = s.guns.map(() => -Infinity);
      s.inX = s.guns.map((g) => g?.getComponent?.('GunCarriage')?.runInX ?? RUN_IN_X);
      s.outX = s.guns.map((g) => g?.getComponent?.('GunCarriage')?.runOutX ?? RUN_OUT_X);
      s.x = s.guns.map((g, i) => Math.abs(g?.localPosition?.[0] ?? s.inX[i]));
    }
    rigs.set(boat, r);
    return any ? r : null;
  }
  function stand(r, now, dt) {
    let rest = true;
    for (const [side, s] of Object.entries(r.sides)) {
      const laid = now < s.laidUntil;
      if (laid) rest = false;
      for (const lid of s.lids) {
        const a = lid?.getComponent?.('Animator')?.animator;
        if (a && a.GetBool('Opened') !== laid) a.SetBool('Opened', laid);
      }
      s.guns.forEach((g, i) => {
        if (!g) return;
        const want = laid ? s.outX[i] : s.inX[i];
        const x = s.x[i];
        s.x[i] = x < want ? Math.min(want, x + RUN_SPEED * dt) : Math.max(want, x - RUN_SPEED * dt);
        const kick = recoilAt(now - s.firedAt[i]);
        if (s.x[i] !== s.inX[i] || kick > 0) rest = false;
        const sign = side === 'starboard' ? 1 : -1;
        const at = sign * (s.x[i] - kick);
        if (g.localPosition[0] !== at) g.localPosition = [at, g.localPosition[1], g.localPosition[2]];
      });
    }
    return rest;
  }
  return {
    lay(boat, side, now) {
      const s = rigOf(boat)?.sides?.[side];
      if (s) { s.laidUntil = Math.max(s.laidUntil, now + HOLD_S); settling.add(boat); }
    },
    fired(boat, side, index, now) {
      const s = rigOf(boat)?.sides?.[side];
      if (!s) return;
      s.laidUntil = Math.max(s.laidUntil, now + HOLD_S);
      settling.add(boat);
      if (!(index >= 0 && index < s.firedAt.length)) return;
      s.firedAt[index] = now;
      if (s.x[index] < s.outX[index]) s.x[index] = s.outX[index];
      const a = s.lids[index]?.getComponent?.('Animator')?.animator;
      // The shutter's animator already ran this frame before the shot, so it snaps open now, not next update.
      if (a) { a.SetBool('Opened', true); a.Play(OPENED_STATE); a.update(0); }
    },
    step(boats, now) {
      const dt = Math.max(0, now - lastNow);
      lastNow = now;
      const seen = new Set();
      for (const boat of [...boats, ...settling]) {
        if (seen.has(boat)) continue;
        seen.add(boat);
        const r = rigOf(boat);
        if (!r || stand(r, now, dt)) settling.delete(boat);
      }
    },
    clear() {
      for (const boat of settling) {
        const r = rigOf(boat);
        if (!r) continue;
        for (const s of Object.values(r.sides)) { s.laidUntil = -Infinity; s.firedAt.fill(-Infinity); s.x = [...s.inX]; }
        stand(r, lastNow, 0);
      }
      settling.clear();
    },
    read(boat, now = lastNow) {
      const r = rigOf(boat);
      if (!r) return null;
      const out = {};
      for (const [side, s] of Object.entries(r.sides)) out[side] = { laid: now < s.laidUntil, guns: s.guns.map((g) => (g ? Math.abs(g.localPosition[0]) : null)), open: s.lids.map((l) => !!l?.getComponent?.('Animator')?.animator?.GetBool('Opened')) };
      return out;
    },
  };
}
