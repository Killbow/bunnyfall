// @ts-check
// BUNNYFALL (2026-11-18, daily elite dungeons - net/eliteDungeonLaw.js): THE FIGHT IN AN ELITE DUNGEON, the game's half.
//   - THE SERIES: the dungeon's Cromwark foes (systems/eliteDungeons/edFoes.js marks them `edFoe`) fallen, by anyone - the
//     room's foes are every client's - counted against edKillsNeeded. Met, the service is asked for the summon
//     (server-account/src/eliteDungeons.js): it names one summoner, whose game stands SIFRIT near its player; the others
//     wait for her (and ask again while none stands - a summoner who left is replaced after ED_RESUMMON_S).
//   - SIFRIT, ELITE: boosted at her build (edFoes.js); on her owner's machine a Grave Ring of her own every
//     ED_SIFRIT_RING_EVERY_S besides the blows she throws (ai/tactics.js beginRoar, made hers by ai/blowShapes.js
//     bossifyBlow), and Cromwark's foes - never mummies - called about her.
//   - THE CLEANSE: her fall, seen here, is claimed; the first claim of the instance pays ED_REWARD_NYX Dusk Tokens. The
//     dungeon's purple lifts at once (its mark taken off), the book drops it, and the chat says so.
// A module the world host wires (HOST-SPLIT): it hands its doors; this file stands foes only through them. Not a DFU member.
import { eliteDungeonSummon, eliteDungeonClear } from '../../net/accountClient.js';
import {
  edKillsNeeded, ED_FOE_RING, ED_SIFRIT_RING_EVERY_S, ED_SIFRIT_RING_WINDUP_S, ED_SIFRIT_SUMMON_EVERY_S, ED_SIFRIT_SUMMON_N,
  ED_SIFRIT_SUMMONS_MAX, ED_SIFRIT_SUMMON_RING,
} from '../../net/eliteDungeonLaw.js';
import { SIFRIT_ID } from '../sifrit/sifritLaw.js';
import { sifritBarOf } from '../sifrit/sifritFight.js';
import { WILD_HALL_FOES } from '../../world/wildDungeons.js';
import { setEliteDungeonInside } from '../../world/wild/cromwark.js';
import { beginRoar } from '../../ai/tactics.js';
import { bossifyBlow } from '../../ai/blowShapes.js';
import { t } from '../../ui/textManager.js';

/** How often a game waiting on a summon asks again while no Sifrit stands (ms). */
const ASK_AGAIN_MS = 60_000;
/** A cleanse refused as too soon is asked again this often, this many times. */
const CLAIM_RETRY_MS = 15_000;
const CLAIM_TRIES = 30;

/**
 * @param {{ io: () => any, book: () => any, loc: () => any, foes: () => any[], standNear: (mobileType: number) => any,
 *   standAt: (mobileType: number, at: number[]) => any, feet: () => number[] | null, say: (text: string) => void,
 *   bar: (b: { name: string, frac: number } | null) => void, now?: () => number, nowMs?: () => number }} deps
 */
export function createEliteDungeonFight(deps) {
  const now = deps.now ?? (() => performance.now() / 1000);
  const nowMs = deps.nowMs ?? Date.now;
  /** The run in the dungeon now: reset at each entry. */
  let run = null;
  let barUp = false;

  function begin(loc) {
    const e = loc.eliteDungeon;
    run = { loc, key: e.key, name: e.name, asked: false, askAt: 0, standing: false, seen: false, claimed: false, claimTries: 0, claimAt: 0, told: false, met: false, ringAt: 0, summonAt: 0, summons: new Set(), pending: 0 };
    deps.say(t('ed.enter', 'An elite dungeon. Cromwark\'s creatures hold it - fell them to call out its keeper.'));
  }

  function tally(foes) {
    let total = 0, dead = 0;
    for (const f of foes) {
      if (!f?.entity?.edFoe || f.entity.edSummon || f.entity.allied) continue;
      total++;
      if (f.dead) dead++;
    }
    return { total, dead };
  }

  async function ask(r) {
    r.asked = true; r.askAt = nowMs();
    const door = deps.io?.();
    if (!door) return;
    const res = await eliteDungeonSummon(door, r.key).catch(() => null);
    if (run !== r) return;
    if (res?.ok && res.data?.summon) {
      const live = (deps.foes() ?? []).some((f) => f && !f.dead && f.entity?.edSifrit);
      if (live) return;
      r.standing = true;
      const f = await Promise.resolve(deps.standNear(SIFRIT_ID)).catch(() => null);
      if (run !== r) return;
      if (f) deps.say(t('ed.sifrit', 'Sifrit the Forbidden One rises to defend the dungeon!'));
      else r.askAt = 0;   // no floor found for her: ask again at once
    } else if (res?.ok && !r.told) {
      r.told = true;
      deps.say(t('ed.stirs', 'The Forbidden One stirs. She answers another\'s call.'));
    } else if (res && !res.ok && res.error === 'ed-cleansed') {
      cleansed(r, 0);
    }
  }

  function cleansed(r, nyx) {
    r.claimed = true;
    deps.book()?.drop?.(r.key);
    if (r.loc) delete r.loc.eliteDungeon;   // the dungeon's purple lifts at once
    setEliteDungeonInside(false);
    deps.say(nyx > 0
      ? t('ed.cleansedPaid', 'Sifrit falls and {name} is cleansed. +{nyx} Dusk Tokens.', { name: r.name || t('ed.theDungeon', 'the dungeon'), nyx })
      : t('ed.cleansed', 'Sifrit falls and {name} is cleansed.', { name: r.name || t('ed.theDungeon', 'the dungeon') }));
  }

  async function claim(r) {
    r.claimAt = nowMs() + CLAIM_RETRY_MS; r.claimTries++;
    const door = deps.io?.();
    if (!door) return;
    const res = await eliteDungeonClear(door, r.key).catch(() => null);
    if (run !== r || r.claimed) return;
    if (res?.ok && res.data?.cleansed) cleansed(r, Number(res.data.nyx) || 0);
    else if (res && !res.ok && (res.error === 'ed-unknown' || res.error === 'ed-not-present')) r.claimTries = CLAIM_TRIES;   // not ours to claim: no more asking
  }

  /** Her own machine's extras: the rings and the summons. */
  function hers(f, t0) {
    if (!f.ai?.target && !f.ai?.inSight) return;
    const hurt = (f.entity.health ?? 1) / Math.max(1, f.entity.maxHealth ?? 1) < 0.5;
    const r = run;
    if (!r.ringAt) r.ringAt = t0 + ED_SIFRIT_RING_EVERY_S / 2;
    if (t0 >= r.ringAt && f.ai._tac?.state !== 'windup') {
      r.ringAt = t0 + ED_SIFRIT_RING_EVERY_S * (hurt ? 2 / 3 : 1);
      try { if (beginRoar(f.ai, f.entity, ED_SIFRIT_RING_WINDUP_S)) { const b = f.ai._tac?.blow; if (b) { bossifyBlow(b, SIFRIT_ID, true); b.roar = false; } } } catch (e) { console.warn('[elite dungeon] ring', /** @type {any} */ (e)?.message ?? e); }
    }
    if (!r.summonAt) r.summonAt = t0 + 3;
    for (const m of [...r.summons]) if (!m || m.dead) r.summons.delete(m);
    if (t0 < r.summonAt || r.pending > 0) return;
    r.summonAt = t0 + ED_SIFRIT_SUMMON_EVERY_S * (hurt ? 0.75 : 1);
    const pool = WILD_HALL_FOES[ED_FOE_RING];
    const room = ED_SIFRIT_SUMMONS_MAX - r.summons.size;
    for (let i = 0; i < Math.min(ED_SIFRIT_SUMMON_N, room); i++) {
      const [lo, hi] = ED_SIFRIT_SUMMON_RING, a = Math.random() * Math.PI * 2, d = lo + Math.random() * (hi - lo);
      const at = [f.ai.feet[0] + Math.sin(a) * d, f.ai.feet[1], f.ai.feet[2] + Math.cos(a) * d];
      r.pending++;
      Promise.resolve(deps.standAt(pool[Math.floor(Math.random() * pool.length)], at))
        .then((m) => { if (m?.entity) { m.entity.edSummon = true; if (run === r) r.summons.add(m); } }, () => {})
        .finally(() => { r.pending--; });
    }
  }

  return {
    /** Every frame. */
    frame() {
      const loc = deps.loc?.();
      const on = !!loc?.eliteDungeon?.key;
      setEliteDungeonInside(on);
      if (!loc) { run = null; } else if (on && run?.loc !== loc) begin(loc);
      const r = run;
      let b = null;
      if (r && run.loc === loc) {
        const foes = deps.foes() ?? [];
        const t0 = now();
        if (!r.claimed) {
          const { total, dead } = tally(foes);
          const need = edKillsNeeded(total);
          if (!r.met && total > 0 && dead >= need) { r.met = true; deps.say(t('ed.met', 'The last of the series falls. Something answers from the dark...')); }
          let sifrit = null;
          for (const f of foes) if (f?.entity?.edSifrit) { if (!f.dead) { sifrit = f; break; } sifrit ??= f; }
          if (sifrit && !sifrit.dead) {
            r.seen = true;
            if (!r.asked) void ask(r);   // come in on her fight: the service keeps that I was here (the claim asks it)
            if (!sifrit.puppet) hers(sifrit, t0);
          } else if (sifrit?.dead && r.seen) {
            if (r.claimTries < CLAIM_TRIES && nowMs() >= r.claimAt) void claim(r);
          } else if (r.met && (!r.asked || nowMs() - r.askAt >= ASK_AGAIN_MS)) {
            void ask(r);
          }
        }
        const at = deps.feet?.();
        b = at ? sifritBarOf(foes, at) : null;
      }
      if (b || barUp) { deps.bar(b); barUp = !!b; }
    },
    /** For the probes: the run's state. */
    state: () => (run ? { key: run.key, met: run.met, seen: run.seen, claimed: run.claimed } : null),
  };
}

