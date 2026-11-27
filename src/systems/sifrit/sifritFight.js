// @ts-check
import { promoteStaffBoss } from '../../characters/eliteFoes.js';
import {
  SIFRIT_ID, SIFRIT_NAME, SIFRIT_HP, SIFRIT_SIZE_PCT, SIFRIT_MUMMY, SIFRIT_SUMMON_EVERY_S, SIFRIT_SUMMON_N, SIFRIT_SUMMONS_MAX, SIFRIT_SUMMON_RING,
} from './sifritLaw.js';

/**
 * @param {any} entity
 * @param {{ own?: boolean }} [o]
 */
export function makeSifrit(entity, { own = true } = {}) {
  if (!entity) return false;
  promoteStaffBoss(entity, { own, sizePct: SIFRIT_SIZE_PCT, hp: own ? SIFRIT_HP : 0, name: SIFRIT_NAME, purple: true });
  entity.sifrit = true;
  // Set after promoteStaffBoss, which floors boss size at 1.5, so she stands at player height.
  if (entity.staffBoss) entity.staffBoss.size = SIFRIT_SIZE_PCT / 100;
  return true;
}

/** @param {any} f */
const mineAlive = (f) => f && !f.puppet && !f.dead && f.mobileType === SIFRIT_ID && f.entity?.sifrit;

/**
 * @param {{ foes: () => any[], stand: (mobileType: number, near: number[]) => any, remove: (f: any) => void, now?: () => number }} host
 */
export function createSifritFight(host) {
  const now = host.now ?? (() => performance.now() / 1000);
  /** @type {Map<any, { next: number }>} */
  const clocks = new Map();
  /** @type {Set<any>} */
  const summons = new Set();
  let _pending = 0;
  const alive = () => { for (const m of [...summons]) if (!m || m.dead) summons.delete(m); return summons.size; };
  return {
    /** @param {number} _dt */
    frame(_dt) {
      const t = now();
      const all = host.foes();
      for (const f of all) {
        if (!mineAlive(f)) continue;
        if (!f.ai?.target && !f.ai?.inSight) continue;
        const c = clocks.get(f) ?? { next: t + 3 };
        clocks.set(f, c);
        if (t < c.next || _pending > 0) continue;
        const hurt = (f.entity.health ?? 1) / Math.max(1, f.entity.maxHealth ?? 1) < 0.5;
        c.next = t + SIFRIT_SUMMON_EVERY_S * (hurt ? 0.75 : 1);
        const room = SIFRIT_SUMMONS_MAX - alive();
        for (let i = 0; i < Math.min(SIFRIT_SUMMON_N, room); i++) {
          const [lo, hi] = SIFRIT_SUMMON_RING, a = Math.random() * Math.PI * 2, d = lo + Math.random() * (hi - lo);
          const at = [f.ai.feet[0] + Math.sin(a) * d, f.ai.feet[1], f.ai.feet[2] + Math.cos(a) * d];
          _pending++;
          Promise.resolve(host.stand(SIFRIT_MUMMY, at)).then((m) => { if (m) { m.sifritSummon = true; summons.add(m); } }, () => {}).finally(() => { _pending--; });
        }
      }
      for (const [f] of [...clocks]) if (!all.includes(f) || f.dead) clocks.delete(f);
      if (summons.size && !all.some(mineAlive)) for (const m of [...summons]) { if (!m.dead) host.remove(m); summons.delete(m); }
    },
    summonsAlive: alive,
  };
}

/**
 * @param {any[]} foes
 * @param {number[]} at
 * @param {number} [range]
 */
export function sifritBarOf(foes, at, range = 120) {
  let best = null, bd = range;
  for (const f of foes) {
    if (!f || f.dead || f.mobileType !== SIFRIT_ID || !f.entity?.sifrit || !f.ai?.feet) continue;
    const d = Math.hypot(f.ai.feet[0] - at[0], f.ai.feet[2] - at[2]);
    if (d < bd) { bd = d; best = f; }
  }
  if (!best) return null;
  const mx = Math.max(1, best.entity.maxHealth ?? 1);
  return { name: SIFRIT_NAME, frac: Math.max(0, Math.min(1, (best.entity.health ?? mx) / mx)) };
}
