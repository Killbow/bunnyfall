// @ts-check
// Spells on relay-run bodies are counted on a local stand-in and sent as a claim; the relay holds the health and
// decides what lands. The number shown is capped at one blow, since a Disintegrate claims the whole target.
import { applySpell, spellSways, isSoulTrapEffect, tickActiveEffects } from '../magic/effects.js';
import { bossStrike } from '../characters/bossTraits.js';
import { duelSpellOf } from '../combat/duelCombat.js';
import { reportPlayerAttack } from '../combat/formulas.js';
import { tellSpellLanded } from '../magic/spellPower.js';
import { SOUL_TRAP_TEXT } from '../magic/mysticism.js';
import { HIT_KINDS } from '../net/gateBrain.js';
import { ARENA_HIT, arenaBlowCap } from '../net/arenaLaw.js';
import { BOSS_SWAY_TEXT, BOSS_SWAY_TELL_MS, standInBlowCap } from '../world/gateBoss.js';
import { COURT_ROUND_MS } from './gateCourt.js';
import { SERPENT_HIT_CAP_X, SERPENT_HAND_REF } from '../net/serpentBrain.js';

// Only Continuous Damage on health is carried: a relay body has no fatigue or magicka, and other lasting families
// such as Paralyze belong to the relay brain.
export const carriedOnStandIn = (a) => a?.kind === 'continuousDamage' && !a.ended && a.roundsRemaining > 0;
const NO_ROUNDS = Object.freeze([]);
const counting = (got, resist = null) => ({ hurt: (n, o) => { got.n += Math.max(0, resist && n > 0 ? bossStrike(resist, n, { kind: 'spell', element: o?.element ?? null }).damage : n); }, heal() {}, drainFatigue() {}, restoreFatigue() {}, drainMagicka() {}, restoreMagicka() {} });

/**
 * @param {any} harm
 * @param {any} entity
 * @param {number} level
 * @param {any} caster
 * @param {() => number} [rolls]
 * @param {ReadonlyArray<any>} [carried]
 */
export function countOnStandIn(harm, entity, level, caster, rolls = Math.random, carried = NO_ROUNDS) {
  const got = { n: 0 };
  let r = null, kept = NO_ROUNDS;
  entity.activeEffects = carried.map((a) => ({ ...a }));
  try {
    r = applySpell(harm, level, entity, counting(got), rolls, { entity: caster });
    kept = (entity.activeEffects ?? []).filter(carriedOnStandIn);
  } finally { entity.activeEffects = []; }
  return { dealt: got.n, r, kept };
}

/**
 * Carried rounds tick on the shared `COURT_ROUND_MS` clock, not the local magic round, which a rest or wait
 * advances in bursts. Missed rounds run together as one claim.
 * @param {{ now?: () => number, rolls?: () => number }} [o]
 */
export function createStandInRounds({ now = Date.now, rolls = Math.random } = {}) {
  const kept = new Map();
  let round = null;
  return {
    carried: (key) => kept.get(key) ?? NO_ROUNDS,
    keep(key, entries) {
      if (!entries?.length) { kept.delete(key); return; }
      if (!kept.size) round = Math.floor(now() / COURT_ROUND_MS);
      kept.set(key, entries);
    },
    keys: () => [...kept.keys()],
    frame(bodyOf, alive = true) {
      const r = Math.floor(now() / COURT_ROUND_MS);
      if (!alive) kept.clear();
      if (!kept.size || round === null || r < round) { round = r; return; }
      if (r === round) return;
      const due = r - round;
      round = r;
      for (const [key, entries] of [...kept]) {
        const body = bodyOf(key);
        if (!body?.entity) { kept.delete(key); continue; }
        const got = { n: 0 }, e = body.entity;
        let left = NO_ROUNDS;
        e.activeEffects = entries;
        try {
          for (let k = 0; k < due && e.activeEffects.some(carriedOnStandIn); k++) tickActiveEffects(e, counting(got, e), rolls);
          left = e.activeEffects.filter(carriedOnStandIn);
        } finally { e.activeEffects = []; }
        if (left.length) kept.set(key, left); else kept.delete(key);
        if (got.n >= 1) body.land(got.n);
      }
    },
  };
}

/**
 * @param {number} dealt
 * @param {number} cap
 */
export const standInShown = (dealt, cap) => Math.min(Math.max(0, dealt), cap);

/** @param {any} host */
export function createStandInSpell(host) {
  const { player, say, rolls = Math.random, now = Date.now } = host;
  let swayToldAt = -Infinity;
  const rounds = createStandInRounds({ now, rolls });
  function tellStandIn(sp, entity, r, took, caster) {
    tellSpellLanded({ caster: player, target: entity, foe: null, spell: sp, r, self: false, took, cast: caster?.cast ?? null });
  }
  // A cast that deals nothing on its first round still lays its rounds, as DFU pushes the entry regardless; a
  // warded body lays nothing.
  function onBody(sp, body, harm, caster, land, key) {
    const { dealt: counted, r, kept } = countOnStandIn(harm, body.entity, player.level, player, rolls, rounds.carried(key));
    const dealt = counted >= 1 ? bossStrike(body.entity, counted, { kind: 'spell', element: sp.element ?? null }).damage : counted;
    if (!(dealt >= 1)) {
      const laid = kept.length > 0 && !turned(body);
      if (laid) rounds.keep(key, kept);
      return laid;
    }
    const shown = standInShown(dealt, standInBlowCap(body.entity, player.level));
    tellStandIn(sp, body.entity, r, shown, caster);
    reportPlayerAttack({ hit: true, damage: Math.round(shown), target: body.entity });
    const went = land(body, dealt, HIT_KINDS.Spell);
    if (went) rounds.keep(key, kept);
    return went;
  }
  const turned = (body) => !!(body.warded || body.entity?.warded);
  // The fourth `land` argument marks a carried round, which Elite Breach Vestiges treat as no blow: no Momentum and
  // no Arcane Echo.
  function bodyOf(key) {
    const n = Number(key.slice(1));
    const body = key === 'b' ? host.boss() : key[0] === 'h' ? host.host().find((q) => q.host === n) : host.crystals().find((q) => q.crystal === n);
    if (!body) return null;
    const land = key === 'b' ? host.landOnBoss : key[0] === 'h' ? host.landOnHost : host.landOnCrystal;
    return { entity: body.entity, land: (d) => !turned(body) && !!land(body, d, HIT_KINDS.Spell, true) };
  }
  const standInRound = () => rounds.frame(bodyOf, player.health > 0);
  function spellOnCrystal(sp, c, caster = null) {
    const cr = host.crystals().find((q) => q.crystal === c), harm = duelSpellOf(sp);
    if (!cr || !harm) return false;
    return onBody(sp, cr, harm, caster, host.landOnCrystal, `c${c}`);
  }
  function spellOnHost(sp, i, caster = null) {
    const hb = host.host().find((q) => q.host === i), harm = duelSpellOf(sp);
    if (!hb || !harm) return false;
    return onBody(sp, hb, harm, caster, host.landOnHost, `h${i}`);
  }
  function spellOnRival(sp) {
    const rb = host.rival(), harm = duelSpellOf(sp);
    if (!rb || !harm) return false;
    const { dealt } = countOnStandIn(harm, rb.entity, player.level, player, rolls);
    if (!(dealt >= 1)) return false;
    reportPlayerAttack({ hit: true, damage: Math.round(standInShown(dealt, arenaBlowCap({ r: ARENA_HIT.Spell }))) });
    host.nextArenaQ();
    return host.landOnRival(rb, dealt, 'spell');
  }
  function spellOnBoss(sp, caster = null) {
    const boss = host.boss(), harm = duelSpellOf(sp);
    if (!boss) return false;
    const sways = spellSways(sp) && !!boss.entity.pacifyImmune;
    if (sways && now() - swayToldAt >= BOSS_SWAY_TELL_MS) { swayToldAt = now(); say(BOSS_SWAY_TEXT(boss.entity.name)); }
    const trapFx = (sp.effects ?? []).filter((e) => e && isSoulTrapEffect(e));
    let laid = false;
    if (trapFx.length) {
      const noSink = () => {};
      // A trap already running on him is set as the incumbent, so a recast renews its rounds through `renewRounds`
      // instead of rolling a new save.
      const running = host.trapNow();
      if (running) boss.entity.activeEffects = [{ kind: 'soulTrap', chance: running.chance, roundsRemaining: 0 }];
      try {
        const res = applySpell({ ...sp, effects: trapFx }, player.level, boss.entity, { hurt: noSink, heal: noSink, drainFatigue: noSink, restoreFatigue: noSink, drainMagicka: noSink, restoreMagicka: noSink }, rolls, { entity: player });
        const trap = (boss.entity.activeEffects ?? []).find((a) => a.kind === 'soulTrap' && !a.ended);
        if (trap) laid = !!host.onTrap({ chance: trap.chance, rounds: (trap.roundsRemaining ?? 0) + 1 });
        if (res?.trapAlert && SOUL_TRAP_TEXT[res.trapAlert]) say(SOUL_TRAP_TEXT[res.trapAlert]);
      } catch (e) { console.warn('[gate] the trap on him', e?.message ?? e); } finally { boss.entity.activeEffects = []; }
    }
    if (!harm) return laid || sways;
    return onBody(sp, boss, harm, caster, host.landOnBoss, 'b');
  }
  function spellOnStandIn(record, target = null) {
    if (target?.hostI != null) return spellOnHost(record, target.hostI);
    if (target?.crystalC != null) return spellOnCrystal(record, target.crystalC);
    return spellOnBoss(record);
  }
  return { spellOnBoss, spellOnCrystal, spellOnHost, spellOnRival, spellOnStandIn, standInRound };
}

/** @param {{ player: any, standIn: () => any, land: (box: any, d: number) => any, now?: () => number, rolls?: () => number }} o */
export function createSerpentSpell({ player, standIn, land, now = Date.now, rolls = Math.random }) {
  const rounds = createStandInRounds({ now, rolls });
  let met = null;
  return {
    cast(sp, box, caster = null) {
      const harm = duelSpellOf(sp), e = standIn();
      if (!harm) return false;
      const { dealt, r, kept } = countOnStandIn(harm, e, player.level, player, rolls, rounds.carried('s'));
      if (kept.length) met = box;
      rounds.keep('s', kept);
      if (!(dealt >= 1)) return kept.length > 0;
      tellSpellLanded({ caster: player, target: e, foe: null, spell: sp, r, self: false, took: standInShown(dealt, SERPENT_HIT_CAP_X * SERPENT_HAND_REF), cast: caster?.cast ?? null });
      land(box, dealt);
      return true;
    },
    frame(alive) { rounds.frame(() => (met ? { entity: standIn(), land: (d) => land(met, d) } : null), !!alive && player.health > 0); },
  };
}
