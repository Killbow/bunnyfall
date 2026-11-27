// @ts-check
import { ATTACK_BY_ID, ATTACKS, windupOf } from '../net/gateBrain.js';
import { markedAt, markedMe, markedOf, chainHolds, chainPull, brandOn, tormentShare, gazeHolds, markedVerdict, isMarkedBlow, blowOf } from '../net/gateStrike.js';
import { t } from '../ui/textManager.js';

export const ARSENAL_TEXT = Object.freeze({
  chained: () => t('gate.arsenal.chained', 'Chained! Run from him!'),
  branded: () => t('gate.arsenal.branded', 'Dagon\'s Brand is on you. Keep clear of the others!'),
  nearBrand: () => t('gate.arsenal.nearBrand', 'Dagon\'s Brand! Keep clear!'),
  tormentMe: () => t('gate.arsenal.tormentMe', 'Shared Torment on you. Gather the others!'),
  tormentOther: (name) => t('gate.arsenal.tormentOther', 'Shared Torment! Stand with {name}!', { name }),
  tormentAnon: () => t('gate.arsenal.tormentAnon', 'Shared Torment! Stand in the gold!'),
  gaze: () => t('gate.arsenal.gaze', 'Look away!'),
});
export const GAZE_COLOR = Object.freeze([1.0, 0.97, 0.9]);
export const TORMENT_RIM = Object.freeze([1.0, 0.82, 0.3]);
export const CHAIN_FREE_RIM = Object.freeze([0.72, 0.95, 1.0]);
// Matches `TELEGRAPH_NOW_MS` in `render/gateTelegraph.js`.
const NOW_MS = 180;
const NONE = Object.freeze([]);

// `online` is read on each call because the host creates it after the court.
export function arsenalSeams(motor, online, pullDecay) {
  return { myId: () => online()?.id ?? null, pull: (vx, vz) => motor.blowPush(vx, vz), pullDecay };
}

/** @param {{ me: () => (string|null), placeOf: (id: string) => (number[]|null), nameOf?: (id: string) => (string|null), others: () => ReadonlyArray<number[]>, land: (atk: any, P: any, so: any) => void, pull?: (vx: number, vz: number) => void, pullDecay?: number, sting?: (atk: any) => void, watching?: () => boolean }} deps */
export function createGateArsenal({ me, placeOf, nameOf = () => null, others, land, pull = () => {}, pullDecay = 0, sting = () => {}, watching = () => false }) {
  // An attack is identified by its index and its landing time, because a room restored from a checkpoint reuses
  // attack numbers.
  const judged = { i: -1, at: NaN }, stung = { i: -1, at: NaN };
  const marked = (m, atk) => m.i === atk.i && m.at === atk.at, setMark = (m, atk) => { m.i = atk.i; m.at = atk.at; };
  let blindAt = -Infinity;
  const at = (atk, k, mine) => markedAt(atk, k, me(), mine, placeOf);

  function judge(s, now, P, mine, yaw, standing) {
    const atk = s?.atk, A = atk ? ATTACK_BY_ID[atk.a] : null;
    if (!A || !isMarkedBlow(A) || marked(judged, atk)) return;
    const v = markedVerdict(atk, now);
    if (v === 'wait') return;
    setMark(judged, atk);
    if (v !== 'judge' || !standing || !mine || watching()) return;
    const [px, pz] = mine, L = P.atk[A.key], so = blowOf(atk, P);
    if (A === ATTACKS.chains) {
      if (!markedMe(atk, me()) || !chainHolds(atk, px, pz)) return;
      land(atk, P, so);
      const v2 = chainPull(atk, px, pz, pullDecay);
      if (v2) pull(v2[0], v2[1]);
    } else if (A === ATTACKS.brand) {
      const b = brandOn(atk, me(), px, pz, placeOf, P);
      if (b.self) land(atk, P, { ...so, pct: ATTACKS.brand.selfPct * P.dmgX, base: ATTACKS.brand.selfBase * P.dmgX });
      if (b.burst) land(atk, P, so);
    } else if (A === ATTACKS.torment) {
      const k = tormentShare(atk, me(), px, pz, placeOf, others(), P);
      if (k > 0) land(atk, P, { ...so, pct: L.pct / k, base: L.base / k });
    } else if (A === ATTACKS.gaze) {
      if (gazeHolds(atk.x, atk.z, px, pz, yaw)) { land(atk, P, so); blindAt = now; }
    }
  }

  function order(s, now, P, mine, yaw) {
    const atk = s?.atk, A = atk ? ATTACK_BY_ID[atk.a] : null;
    if (!A || !isMarkedBlow(A) || !mine || !Number.isFinite(atk.at) || s.fell || s.wrath != null || watching()) return null;
    const w = windupOf(A, s.phase);
    if (!(now >= atk.at - w && now < atk.at)) return null;
    const share = w > 0 ? Math.max(0, Math.min(1, (now - (atk.at - w)) / w)) : 1, last = atk.at - now <= NOW_MS;
    const [px, pz] = mine, id = me(), mineMarked = markedMe(atk, id);
    if (mineMarked && !marked(stung, atk)) { setMark(stung, atk); sting(atk); }
    const name = P.atk[A.key].name;
    const from = (x, z) => [px - x, pz - z];
    if (A === ATTACKS.chains) {
      if (!mineMarked) return null;
      const held = chainHolds(atk, px, pz);
      return { name, t: share, now: last, color: held ? null : CHAIN_FREE_RIM, order: ARSENAL_TEXT.chained(), dir: from(atk.x, atk.z), free: !held };
    }
    if (A === ATTACKS.brand) {
      const r = P.atk.brand.r;
      if (mineMarked) {
        let near = null, nd = Infinity;
        for (const o of others() ?? NONE) { const d = Math.hypot(o[0] - px, o[1] - pz); if (d < nd) { nd = d; near = o; } }
        return { name, t: share, now: last, color: null, order: ARSENAL_TEXT.branded(), dir: near && nd <= r + 2 ? from(near[0], near[1]) : null };
      }
      const pk = markedOf(atk), n = Math.max(pk.length, atk.tg?.length ?? 0);
      for (let k = 0; k < n; k++) {
        const p = at(atk, k, null);
        if (p && Math.hypot(px - p[0], pz - p[1]) <= r) return { name, t: share, now: last, color: null, order: ARSENAL_TEXT.nearBrand(), dir: from(p[0], p[1]) };
      }
      return null;
    }
    if (A === ATTACKS.torment) {
      if (mineMarked) return { name, t: share, now: last, color: TORMENT_RIM, order: ARSENAL_TEXT.tormentMe(), dir: null };
      const c = at(atk, 0, null);
      if (!c) return null;
      const who = markedOf(atk)[0] ? nameOf(markedOf(atk)[0]) : null;
      const inside = Math.hypot(px - c[0], pz - c[1]) <= P.atk.torment.r;
      return { name, t: share, now: last, color: TORMENT_RIM, order: who ? ARSENAL_TEXT.tormentOther(who) : ARSENAL_TEXT.tormentAnon(), dir: inside ? null : [c[0] - px, c[1] - pz] };
    }
    if (A === ATTACKS.gaze) {
      const looking = gazeHolds(atk.x, atk.z, px, pz, yaw);
      return { name, t: share, now: last, color: GAZE_COLOR, order: ARSENAL_TEXT.gaze(), dir: looking ? from(atk.x, atk.z) : null };
    }
    return null;
  }

  return {
    judge, order, at,
    blindAt: () => blindAt,
    reset() { judged.i = -1; judged.at = NaN; stung.i = -1; stung.at = NaN; blindAt = -Infinity; },
  };
}
