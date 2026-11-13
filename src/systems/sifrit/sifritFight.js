// @ts-check
// SIFRIT (2026-11-13; systems/sifrit/sifritLaw.js): THE FIGHT, the game's half: what makes a foe of her kind Sifrit (`makeSifrit`,
// at the foe's stand - hers and every peer's puppet of her), and her SUMMONS (`createSifritFight`: the mummies she calls
// about her, without end, from her owner's machine - the foes ride to every peer as any foe does) and her BOSS BAR's reading
// (`sifritBarOf`: the nearest of her, her name and the health she stands at). The blows are the overworld's own
// telegraphed ones made hers (ai/blowShapes.js bossifyBlow). Not a DFU member.
import { promoteStaffBoss } from '../eliteFoes.js';
import {
  SIFRIT_ID, SIFRIT_NAME, SIFRIT_HP, SIFRIT_SIZE_PCT, SIFRIT_MUMMY, SIFRIT_SUMMON_EVERY_S, SIFRIT_SUMMON_N, SIFRIT_SUMMONS_MAX, SIFRIT_SUMMON_RING,
} from './sifritLaw.js';

/**
 * Make `entity` Sifrit: a staff event's mini boss (an elite - its blows, its drop - hard, unshaken), named hers, at her
 * health (a puppet's maximum is its owner's word), her outline purple. Idempotent.
 * @param {any} entity @param {{ own?: boolean }} [o]
 */
export function makeSifrit(entity, { own = true } = {}) {
  if (!entity) return false;
  promoteStaffBoss(entity, { own, sizePct: SIFRIT_SIZE_PCT, hp: own ? SIFRIT_HP : 0, name: SIFRIT_NAME, purple: true });
  entity.sifrit = true;
  return true;
}

/** Is `f` a living Sifrit of mine to run (mine, not a peer's puppet)? @param {any} f */
const mineAlive = (f) => f && !f.puppet && !f.dead && f.mobileType === SIFRIT_ID && f.entity?.sifrit;

/**
 * HER SUMMONS. `host` - `foes()` the exterior's foes, `stand(mobileType, near)` one stood loose near a point (a promise of
 * the foe or null), `remove(foe)`, `now()` seconds. `frame(dt)` every frame: for each Sifrit of mine in a fight (a target
 * of her own), every SIFRIT_SUMMON_EVERY_S seconds (a quarter faster under half her health) SIFRIT_SUMMON_N mummies stand
 * about her at SIFRIT_SUMMON_RING metres, never more than SIFRIT_SUMMONS_MAX of hers alive; her fall takes them with her.
 * @param {{ foes: () => any[], stand: (mobileType: number, near: number[]) => any, remove: (f: any) => void, now?: () => number }} host
 */
export function createSifritFight(host) {
  const now = host.now ?? (() => performance.now() / 1000);
  /** @type {Map<any, { next: number }>} */
  const clocks = new Map();
  /** @type {Set<any>} the mummies of hers, by foe */
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
        if (!f.ai?.target && !f.ai?.inSight) continue;   // asleep until a fight finds her
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
      if (summons.size && !all.some(mineAlive)) for (const m of [...summons]) { if (!m.dead) host.remove(m); summons.delete(m); }   // she fell: her mummies go back to the grave
    },
    summonsAlive: alive,
  };
}

/**
 * THE BOSS BAR's reading: the nearest Sifrit within `range` metres of `at` (mine or a peer's puppet), as `{ name, frac }` -
 * her health over her maximum - or null. @param {any[]} foes @param {number[]} at @param {number} [range]
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
