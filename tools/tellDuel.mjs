#!/usr/bin/env node
// Measures the telegraphed-blow and revenant balance targets with the real enemy AI, motor, and damage roll
// against a scripted player, every fight seeded. Exits 1 when a target is missed.
// Class enemies need ARENA2's CLASS*.CFG files.
// Usage: node tools/tellDuel.mjs [--fights 1000] [--seconds 30] [--json] [--tell | --feud]
import { MOD_SETTINGS, setModSetting, _resetModSettings } from '../src/mods/modSettings.js';
import { setPref, getPref, _resetForTests } from '../src/ui/uiPrefs.js';
import { setTacticsClock, resetTactics, noteLocalPlayer, windupStruck, LOCAL_TARGET } from '../src/ai/tactics.js';
import { resetBlows, inBlow, BLOW_TIER_LEVEL } from '../src/ai/foeBlows.js';
import { blowK, blowWeight, behind, poiseOf, weightClass, TELL } from '../src/ai/tells.js';
import { EnemyAI } from '../src/characters/enemyMotor.js';
import { EnemyAttack } from '../src/characters/enemyAttack.js';
import { Collider } from '../src/player/collider.js';
import { calculateAttackDamage, enemyWeightClassicUnits, chooseEnemyWeapon, weaponKnockbackApplies, weaponKnockbackSpeed } from '../src/combat/formulas.js';
import { makeEnemyEntity } from '../src/characters/enemyEntity.js';
import { ENEMY_BASICS } from '../src/characters/enemyBasics.js';
import { MOBILE_TYPES as M } from '../src/characters/mobileTypes.js';
import { WEAPONS } from '../src/characters/weapons.js';
import { createWeapon } from '../src/combat/enemyEquipment.js';
import { promoteEliteFoe } from '../src/characters/eliteFoes.js';
import { getMeleeWeaponAnimTime, MELEE_NUM_FRAMES, HIT_FRAME_MELEE, CLASSIC_UPDATE_INTERVAL } from '../src/characters/weaponStates.js';
import { liveStat } from '../src/characters/statMods.js';
import { blowEffectOf, BLOW_EFFECT } from '../src/combat/blowEffects.js';
// Imported for its side effect: it registers the reader that lets a swing read the weapon in hand.
import '../src/combat/swingLaw.js';
import { weaponTypeForItem } from '../src/combat/fpsWeapon.js';
import { EQUIP_SLOTS } from '../src/characters/equip.js';
import { getSeed, setSeed } from '../src/formats/dfRandom.js';
import { isMain } from './lib/isMain.mjs';

_resetModSettings();
for (const [vendor, def] of Object.entries(MOD_SETTINGS)) if (def.keys.Enabled) setModSetting(vendor, 'Enabled', false);
_resetForTests(); setPref('survival', false);
setPref('enhancedAI', true);

export const TARGETS = Object.freeze({ LIGHT_MAX: 0.15, HEAVY_MIN: 0.6, FAIR_TO_70: 0.7 });
const DT = 1 / 60;
const REACH = 2.5;
const STATS = (v) => ({ strength: v, intelligence: 50, willpower: 50, agility: v, endurance: 50, personality: 50, speed: 50, luck: 50 });

function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function foeMotor(ent, feet = [0, 0, 4], yaw = Math.PI) {
  const ai = new EnemyAI(new Collider(() => 0), feet, yaw, { vitals: () => ent, liveSpeed: () => liveStat(ent, 'speed') });
  const atk = new EnemyAttack({ liveSpeed: () => liveStat(ent, 'speed'), playerLevel: () => 10, reflexes: 2 });
  return { ai, atk };
}
export function landOnMe(ai, ent, type, player, T, down) {
  const w = ai._blowFx;
  ai._blowFx = null;
  const dmg = Math.round(calculateAttackDamage(ent, player.entity, { weapon: chooseEnemyWeapon(ent.weapon, ENEMY_BASICS[type]) }) * (Number(ai._blowMult) > 0 ? ai._blowMult : 1));
  if (dmg > 0 && blowEffectOf(w.kind, w.iron).knockdown && T >= down.guardUntil) return { downUntil: T + BLOW_EFFECT.KNOCKDOWN_S, guardUntil: T + BLOW_EFFECT.KNOCKDOWN_S + BLOW_EFFECT.KNOCKDOWN_GUARD };
  return down;
}
export function knockFoe(ai, type, weight, dmg, word, p) {
  if (word === 'hold' || !weaponKnockbackApplies(ai.knockbackSpeed, false, ENEMY_BASICS[type]?.weight ?? 0)) return;
  const dx = ai.feet[0] - p[0], dz = ai.feet[2] - p[2], d = Math.hypot(dx, dz) || 1;
  ai.knockbackSpeed = weaponKnockbackSpeed(dmg, weight) * (word === 'stagger' ? TELL.STAGGER_KNOCK : 1);
  ai.knockbackDir = [dx / d, 0, dz / d];
}

export function makePlayer(weaponName, { level = 10, skill = 50, strength = 50, material = 1 } = {}) {
  const item = createWeapon(WEAPONS[weaponName], material, () => 0.5);
  const slots = []; slots[EQUIP_SLOTS.RightHand] = item;
  const entity = { isPlayer: true, isClass: true, level, skills: new Array(35).fill(skill), stats: STATS(strength), career: { attackModifierFlags: 0 }, items: [item], equip: { slots } };
  const weaponType = weaponTypeForItem(item);
  const frame = getMeleeWeaponAnimTime(50, { entity, weaponType, usingRightHand: true });
  return { entity, item, weaponType, swing: frame * MELEE_NUM_FRAMES.StrikeDown, hitAt: frame * HIT_FRAME_MELEE };
}

export function makeFoe(type, { elite = false } = {}) {
  const basics = ENEMY_BASICS[type];
  const entity = makeEnemyEntity(type, basics, null, 10);
  if (elite) promoteEliteFoe(entity, { checkLevel: false });
  else entity.level = Math.max(entity.level ?? 1, BLOW_TIER_LEVEL);
  const weight = enemyWeightClassicUnits(false, 'male', basics.weight ?? 0, entity.items ?? []);
  return { entity, weight, poise: poiseOf(entity, weight) };
}

export const metalFor = (type) => Math.max(1, ENEMY_BASICS[type]?.minMetalToHit ?? -1);
const METAL = Object.freeze({ 1: 'steel', 2: 'silver', 5: 'mithril' });

export function fight({ type, weapon, elite = false, mode = 'trade', seconds = 30, seed = 1 }) {
  const rand = seeded(seed);
  const was = Math.random, wasDf = getSeed();
  Math.random = rand;
  // Each fight reseeds the shared classic random stream, so its result depends on its seed, not on run order.
  setSeed(seed);
  let T = 0;
  setTacticsClock(() => T);
  resetTactics(); resetBlows();
  try {
    const foe = makeFoe(type, { elite });
    const player = weapon ? makePlayer(weapon, { material: metalFor(type) }) : null;
    const ent = foe.entity;
    const { ai, atk } = foeMotor(ent);
    const p = [0, 0, 0];
    const out = { windups: 0, iron: 0, struck: 0, broken: 0, hitsOnMe: 0, hitsOut70: 0, swings: 0 };
    let down = { downUntil: -Infinity, guardUntil: -Infinity };
    let blow = null, out70 = false, leaveAt = 0, landedOn = false;
    let swingT = rand() * (player?.swing ?? 1), struck = false;
    for (let step = 0; step < Math.round(seconds / DT); step++) {
      T += DT;
      const fx = ai.feet[0] - p[0], fz = ai.feet[2] - p[2];
      noteLocalPlayer(p, [fx, 0, fz]);
      ai.update(DT, p);
      atk.update(DT, ai, p);
      const s = ai._tac;
      const b = s?.state === 'windup' && s.key === LOCAL_TARGET ? s.blow : null;
      if (b && b !== blow) {
        blow = b; out70 = false; landedOn = false;
        if (b.guard === 'iron') out.iron++; else out.windups++;
        leaveAt = b.start + rand() * TARGETS.FAIR_TO_70 * (b.land - b.start);
      }
      if (mode === 'dodge' && blow && T < blow.land) {
        const share = (T - blow.start) / (blow.land - blow.start);
        if (T >= leaveAt && share <= TARGETS.FAIR_TO_70 && inBlow(blow, p[0], p[2])) stepOut(blow, p);
        if (share >= TARGETS.FAIR_TO_70) out70 = !inBlow(blow, p[0], p[2]);
      }
      if (ai._blowFx) {
        out.hitsOnMe++;
        if (mode === 'dodge' && out70) out.hitsOut70++;
        down = player ? landOnMe(ai, ent, type, player, T, down) : (ai._blowFx = null, down);
      }
      if (mode === 'trade' && player) {
        const d = Math.hypot(fx, fz);
        if (T >= down.downUntil) swingT += DT;
        if (swingT >= player.swing) { swingT -= player.swing; struck = false; out.swings++; }
        if (!struck && swingT >= player.hitAt) {
          struck = true;
          const dmg = d <= REACH ? calculateAttackDamage(player.entity, ent, { weapon: player.item }) : 0;
          const live = s?.state === 'windup' ? s.blow : null;
          let word = null;
          if (dmg > 0 && live) {
            if (live === blow && !landedOn && live.guard !== 'iron') { landedOn = true; out.struck++; }
            const v = blowWeight(dmg, blowK({ kind: 'melee', weapon: player.item }), { back: behind(live.origin, live.yaw, p) });
            word = windupStruck(ai, ent, foe.weight, v);
            if ((word === 'stagger' || word === 'break') && live === blow) { out.broken++; blow = null; }
          }
          if (dmg > 0) knockFoe(ai, type, foe.weight, dmg, word, p);
        }
      }
    }
    return out;
  } finally {
    Math.random = was;
    setSeed(wasDf);
    setTacticsClock(null);
  }
}

function stepOut(b, p) {
  const sx = Math.cos(b.yaw), sz = -Math.sin(b.yaw);
  for (let d = 0.1; d < 12; d += 0.1) {
    for (const sg of [1, -1]) {
      const x = p[0] + sx * d * sg, z = p[2] + sz * d * sg;
      if (!inBlow(b, x, z) && !inBlow(b, x + sx * 0.25 * sg, z + sz * 0.25 * sg)) { p[0] = x + sx * 0.25 * sg; p[2] = z + sz * 0.25 * sg; return; }
    }
  }
}

export function cell(opts, fights) {
  const sum = { windups: 0, iron: 0, struck: 0, broken: 0, hitsOnMe: 0, hitsOut70: 0, swings: 0 };
  for (let i = 0; i < fights; i++) { const r = fight({ ...opts, seed: 0x5eed + i * 7919 }); for (const k of Object.keys(sum)) sum[k] += r[k]; }
  return sum;
}

export function massive(rolls = 20000) {
  const g = makeFoe(M.Giant);
  const weakest = { ...g.entity, maxHealth: ENEMY_BASICS[M.Giant].minHealth, health: ENEMY_BASICS[M.Giant].minHealth };
  const P = poiseOf(weakest, g.weight);
  const rows = [];
  for (const weapon of ['Dagger', 'Longsword', 'Dai_Katana', 'Claymore', 'Mace', 'Flail', 'Warhammer', 'War_Axe', 'Battle_Axe']) {
    for (const [material, metal] of [[1, 'steel'], [9, 'daedric']]) {
      for (const [who, o] of [['reference', {}], ['strongest', { level: 30, skill: 100, strength: 100 }]]) {
        const pl = makePlayer(weapon, o);
        pl.item = createWeapon(WEAPONS[weapon], material, () => 0.5); pl.entity.items = [pl.item];
        const rand = seeded(rolls + weapon.length * 31 + material);
        const was = Math.random, wasDf = getSeed(); Math.random = rand; setSeed(rolls + weapon.length * 31 + material);
        let max = 0;
        try { for (let i = 0; i < rolls; i++) max = Math.max(max, calculateAttackDamage(pl.entity, { ...g.entity }, { weapon: pl.item })); } finally { Math.random = was; setSeed(wasDf); }
        const v = blowWeight(max, blowK({ kind: 'melee', weapon: pl.item }));
        rows.push({ weapon, metal, who, maxDamage: max, maxV: +v.toFixed(2), poise: +P.toFixed(2), share: +(v / P).toFixed(3) });
      }
    }
  }
  return { foe: 'Giant', class: weightClass(g.weight), health: ENEMY_BASICS[M.Giant].minHealth, rows };
}

const FOES = [['Orc', M.Orc, false], ['Orc (elite)', M.Orc, true], ['Werewolf', M.Werewolf, false], ['Daedra Lord', M.DaedraLord, false], ['Giant', M.Giant, false]];

export function measureAll({ fights = 1000, seconds = 30 } = {}) {
  const trade = [];
  for (const weapon of ['Dagger', 'Longsword', 'Warhammer']) {
    for (const [name, type, elite] of FOES) {
      const r = cell({ type, weapon, elite, mode: 'trade', seconds }, fights);
      const f = makeFoe(type, { elite });
      trade.push({ weapon, foe: name, class: weightClass(f.weight), metal: METAL[metalFor(type)] ?? String(metalFor(type)), ...r, ofAll: r.windups ? +(r.broken / r.windups).toFixed(3) : null, breakShare: r.struck ? +(r.broken / r.struck).toFixed(3) : null });
    }
  }
  const fair = [];
  for (const [name, type, elite] of FOES) {
    const r = cell({ type, weapon: null, elite, mode: 'dodge', seconds }, fights);
    fair.push({ foe: name, windups: r.windups + r.iron, hitsOnMe: r.hitsOnMe, hitsOut70: r.hitsOut70 });
  }
  const m = massive();
  const light = trade.find((x) => x.weapon === 'Dagger' && x.foe === 'Orc');
  const heavy = trade.find((x) => x.weapon === 'Warhammer' && x.foe === 'Orc');
  const verdict = {
    LIGHT: { share: light.breakShare, held: light.breakShare != null && light.breakShare <= TARGETS.LIGHT_MAX },
    HEAVY: { share: heavy.breakShare, held: heavy.breakShare != null && heavy.breakShare >= TARGETS.HEAVY_MIN },
    MASSIVE: { worst: Math.max(...m.rows.map((x) => x.share)), held: m.rows.every((x) => x.share < 1) },
    FAIR: { hits: fair.reduce((a, x) => a + x.hitsOut70, 0), held: fair.every((x) => x.hitsOut70 === 0) },
  };
  return { fights, seconds, trade, fair, massive: m, verdict };
}

globalThis.localStorage ??= (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; })();
const RV = await import('../src/revenants/revenant.js');
const FATE = await import('../src/revenants/revenantFate.js');
const { windupDoor } = await import('../src/combat/hostCombat.js');
const { beginRoar } = await import('../src/ai/tactics.js');
const { weaponFeudClass, drawSignature, SIG_RANK, bandMembers, RALLY_KIN, BAND_SCATTER_S, BAND_SPACING } = await import('../src/revenants/revenantFeud.js');
const { walkSpeed, runSpeed } = await import('../src/player/motor.js');
const { releaseTactics } = await import('../src/ai/tactics.js');

export const FEUD_TARGETS = Object.freeze({ DODGE_SPARES: 0.1, KNEEL_WEAK: 0.9, KNEEL_DODGE: 0.7, KNEEL_TRADE_MAX: 0.2, RANK_RATIO: Object.freeze([2.5, 3.5]) });
const WALK = walkSpeed(50);
const RUN = runSpeed(50, 50);
const CLOSE = 0.25;
const FEUD_ME = Object.freeze({ isPlayer: true, name: 'Duelist', characterId: 'char-duel', level: 10, items: [] });

export function standKin(m, at, yaw, id, rand) {
  const basics = ENEMY_BASICS[m.mobileType];
  const entity = makeEnemyEntity(m.mobileType, basics, null, m.level ?? FEUD_ME.level);
  entity.retinueOf = id;
  const a = rand() * Math.PI * 2, d = 1 + rand() * (BAND_SPACING - 1);
  const { ai, atk } = foeMotor(entity, [at[0] + Math.sin(a) * d, 0, at[2] + Math.cos(a) * d], yaw);
  const weight = enemyWeightClassicUnits(false, 'male', basics.weight ?? 0, entity.items ?? []);
  return { entity, ai, atk, mobileType: m.mobileType, weight, dead: false, scattering: false, gone: false, blow: null, swings: 0 };
}

export function revenantFight({ type = M.Orc, weapon = 'Longsword', rank = 3, mode = 'trade', weak = false, seconds = 240, seed = 1, band = true, flight = true, order = 'master', chase = true, runner = RUN } = {}) {
  const rand = seeded(seed);
  const was = Math.random, wasOn = getPref('lootRarity'), wasDf = getSeed();
  Math.random = rand;
  setSeed(seed);
  setPref('lootRarity', true);
  let T = 0;
  setTacticsClock(() => T);
  resetTactics(); resetBlows();
  RV._resetRevenantForTests(); globalThis.localStorage.clear();
  try {
    const foe = makeFoe(type);
    const ent = foe.entity;
    ent.level = Math.max(ent.level | 0, RV.REVENANT_MIN_LEVEL);
    const player = makePlayer(weapon, { material: metalFor(type) });
    const r = RV.revenantDeed(FEUD_ME, { mobileType: type, level: ent.level, champion: 'mighty', unquiet: true, health: 1, maxHealth: 50, team: 'Monster', _voiceId: `duel-${seed}` }, 'fled', { mobileType: type, rolls: () => 0, now: 1 });
    Object.assign(r, { rank, learned: [], wrath: 0, weak: weak ? weaponFeudClass(player.item).cls : 'fire', out: false });
    if (rank >= SIG_RANK && !r.sig) r.sig = drawSignature(r.id, r.mobileType);
    RV.applyRevenant(ent, r, { now: 2 });
    const { ai, atk } = foeMotor(ent);
    const f = { entity: ent, ai, mobileType: type, gender: 'male', dead: false };
    const kin = band ? bandMembers(r, FEUD_ME.level).map((m) => standKin(m, ai.feet, ai.yaw, r.id, rand)) : [];
    const p = [0, 0, 0];
    const out = {
      end: 'time', t: seconds, staggers: 0, weak: 0, stood: false, windups: 0, overreach: 0, hitsOnMe: 0, perfect: 0, swings: 0, sig: !!ent.revenant?.sigBlow,
      band: kin.length, bandSwings: 0, bandWindups: 0, bandHits: 0, bandSlain: 0, rallied: 0, portal: 0, scattered: 0, bandGone: 0, flight: false, flightAt: null, cornered: false, caught: false, stoodInFlight: false,
    };
    let lastState = null;
    let blow = null, down = { downUntil: -Infinity, guardUntil: -Infinity };
    let swingT = rand() * player.swing, struck = false;
    const standing = (g) => !g.dead && !g.gone && !g.scattering;
    const done = (end) => { const l = ent._feud ?? {}; Object.assign(out, { end, t: +T.toFixed(3), staggers: l.staggers | 0, weak: l.weak | 0, perfect: l.perfect | 0, caught: end !== 'fled' && !!f.fleeing }); return out; };
    const scatter = () => { for (const g of kin) if (standing(g)) { g.scattering = true; g.ai.flee(ai.feet, BAND_SCATTER_S); out.scattered++; } };
    const rally = () => {
      const live = kin.filter(standing);
      if (live.length) { out.rallied += live.length; return; }
      for (const m of bandMembers(RV.revenantById(r.id), FEUD_ME.level, RALLY_KIN)) { kin.push(standKin(m, ai.feet, ai.yaw, r.id, rand)); out.portal++; }
    };
    for (let step = 0; step < Math.round(seconds / DT); step++) {
      T += DT;
      const prey = order === 'band' ? kin.filter(standing).sort((a, b) => Math.hypot(a.ai.feet[0] - p[0], a.ai.feet[2] - p[2]) - Math.hypot(b.ai.feet[0] - p[0], b.ai.feet[2] - p[2]))[0] ?? null : null;
      const at = prey ? prey.ai.feet : ai.feet;
      const fx = at[0] - p[0], fz = at[2] - p[2];
      noteLocalPlayer(p, [fx, 0, fz]);
      FATE.roarStep(f, T * 1000);
      ai.update(DT, p);
      const run = flight && (f.fleeing || (!f._fleeRolled && RV.revenantFleeHealth(ent))) ? RV.revenantFleeStep(f, p) : null;
      if (run === 'escape') return done('fled');
      if (run === 'start') { out.flight = true; out.flightAt = +T.toFixed(3); scatter(); }
      if (run === 'cornered') out.cornered = true;
      if (run !== 'start' && run !== 'run') atk.update(DT, ai, p);
      const s = ai._tac;
      const b = s?.state === 'windup' && s.key === LOCAL_TARGET ? s.blow : null;
      if (b && b !== blow) { blow = b; out.windups++; }
      if (s?.state === 'overreach' && lastState !== 'overreach') out.overreach++;
      lastState = s?.state ?? null;
      for (const g of kin) {
        if (g.dead || g.gone) continue;
        g.ai.update(DT, p);
        if (g.scattering) { if (!(g.ai.fleeLeft > 0)) { g.gone = true; releaseTactics(g.ai); out.bandGone++; } continue; }
        g.atk.update(DT, g.ai, p);
        if (g.atk.swingSeq !== g.swings) { g.swings = g.atk.swingSeq; if (!g.atk.firedRanged) out.bandSwings++; }
        const gs = g.ai._tac, gb = gs?.state === 'windup' && gs.key === LOCAL_TARGET ? gs.blow : null;
        if (gb && gb !== g.blow) { g.blow = gb; out.bandWindups++; }
        if (g.ai._blowFx) { out.bandHits++; down = landOnMe(g.ai, g.entity, g.mobileType, player, T, down); }
      }
      const blows = [blow, ...kin.map((g) => g.blow)].filter(Boolean);
      if (mode === 'dodge') for (const lb of blows) if (T >= lb.land - TELL.TELL_LATE / 2 && T < lb.land && inBlow(lb, p[0], p[2])) stepOut(lb, p);
      if (ai._blowFx) { out.hitsOnMe++; down = landOnMe(ai, ent, type, player, T, down); }
      const d = Math.hypot(fx, fz);
      const chasing = f.fleeing && !prey;
      if (d > REACH - CLOSE && T >= down.downUntil && (chase || !chasing) && !(mode === 'dodge' && blows.some((lb) => T < lb.land + CLASSIC_UPDATE_INTERVAL))) {
        const k = Math.min((chasing ? runner : WALK) * DT, d - (REACH - CLOSE)) / d;
        p[0] += fx * k; p[2] += fz * k;
      }
      if (T >= down.downUntil) swingT += DT;
      if (swingT >= player.swing) { swingT -= player.swing; struck = false; out.swings++; }
      if (struck || swingT < player.hitAt) continue;
      struck = true;
      if (prey) {
        if (Math.hypot(prey.ai.feet[0] - p[0], prey.ai.feet[2] - p[2]) > REACH) continue;
        const dmg = calculateAttackDamage(player.entity, prey.entity, { weapon: player.item });
        if (!(dmg > 0)) continue;
        prey.entity.health -= dmg;
        if (prey.entity.health <= 0) { prey.dead = true; releaseTactics(prey.ai); out.bandSlain++; continue; }
        const ps = prey.ai._tac;
        const pw = ps?.state === 'windup' || ps?.state === 'overreach' ? windupDoor(prey, dmg, { kind: 'melee', weapon: player.item, from: p, weight: prey.weight }) : null;
        knockFoe(prey.ai, prey.mobileType, prey.weight, dmg, pw, p);
        continue;
      }
      if (Math.hypot(ai.feet[0] - p[0], ai.feet[2] - p[2]) > REACH) continue;
      if (FATE.fateHeld(f) || f.roaring) continue;
      const dmg = calculateAttackDamage(player.entity, ent, { weapon: player.item });
      if (!(dmg > 0)) continue;
      ent.health -= dmg;
      if (ent.health <= 0) {
        if (FATE.revenantLastStandDue(f)) {
          if (f.fleeing) out.stoodInFlight = true;
          const ev = FATE.beginLastStand(FEUD_ME, f, { now: T * 1000, clock: T, roar: (sec) => beginRoar(ai, ent, sec), rolls: rand });
          out.stood = true;
          if (band && ev && (ent.revenant.rank | 0) >= 5) rally();
          continue;
        }
        return done(FATE.revenantWillHolds(f) ? 'tore' : 'knelt');
      }
      const word = s?.state === 'windup' || s?.state === 'overreach' ? windupDoor(f, dmg, { kind: 'melee', weapon: player.item, from: p, weight: foe.weight }) : null;
      knockFoe(ai, type, foe.weight, dmg, word, p);
    }
    return done('time');
  } finally {
    Math.random = was;
    setSeed(wasDf);
    setPref('lootRarity', wasOn);
    setTacticsClock(null);
  }
}

export function revenantCell(opts, fights) {
  const rows = [];
  for (let i = 0; i < fights; i++) rows.push(revenantFight({ ...opts, seed: 0xfe0d + i * 7919 }));
  const ts = rows.map((x) => x.t).sort((a, b) => a - b);
  const n = (end) => rows.filter((x) => x.end === end).length;
  const sum = (k) => rows.reduce((a, x) => a + x[k], 0);
  const ended = rows.filter((x) => x.end === 'knelt' || x.end === 'tore');
  return {
    raw: { mean: sum('t') / fights, hitsOnMe: sum('hitsOnMe') / fights },
    fights, knelt: n('knelt'), tore: n('tore'), time: n('time'),
    kneel: +(n('knelt') / fights).toFixed(3),
    will: ended.length ? +(n('knelt') / ended.length).toFixed(3) : null,
    mean: +(ts.reduce((a, x) => a + x, 0) / fights).toFixed(2), median: ts[Math.floor(fights / 2)],
    stood: rows.filter((x) => x.stood).length, staggers: +(rows.reduce((a, x) => a + x.staggers, 0) / fights).toFixed(2),
    perfect: +(rows.reduce((a, x) => a + x.perfect, 0) / fights).toFixed(2), hitsOnMe: +(rows.reduce((a, x) => a + x.hitsOnMe, 0) / fights).toFixed(2),
    windups: +(rows.reduce((a, x) => a + x.windups, 0) / fights).toFixed(2), overreach: +(rows.reduce((a, x) => a + x.overreach, 0) / fights).toFixed(2),
    twoStaggers: +(rows.filter((x) => x.staggers >= 2).length / fights).toFixed(3),
    fled: n('fled'), flights: rows.filter((x) => x.flight).length, cornered: rows.filter((x) => x.cornered).length,
    caught: rows.filter((x) => x.caught).length, stoodInFlight: rows.filter((x) => x.stoodInFlight).length,
    band: +(sum('band') / fights).toFixed(2), bandSwings: +(sum('bandSwings') / fights).toFixed(2), bandWindups: +(sum('bandWindups') / fights).toFixed(2),
    bandHits: +(sum('bandHits') / fights).toFixed(2), rallied: sum('rallied'), portal: sum('portal'), bandSlain: +(sum('bandSlain') / fights).toFixed(2), scattered: sum('scattered'),
  };
}

export function feudVerdict(duel, ranks, weight = ranks) {
  const at = (weapon, mode, weak) => duel.find((x) => x.weapon === weapon && x.mode === mode && x.weak === weak);
  const T = FEUD_TARGETS;
  const ratio = (mode) => +(weight.find((x) => x.mode === mode && x.rank === 5).raw.mean / weight.find((x) => x.mode === mode && x.rank === 1).raw.mean).toFixed(2);
  const ref = 'Longsword';
  const verdict = {
    DODGE_PAYS: { struck: +(at(ref, 'dodge', false).raw.hitsOnMe / at(ref, 'trade', false).raw.hitsOnMe).toFixed(3), time: +(at(ref, 'dodge', false).raw.mean / at(ref, 'trade', false).raw.mean).toFixed(3), held: at(ref, 'dodge', false).raw.hitsOnMe <= T.DODGE_SPARES * at(ref, 'trade', false).raw.hitsOnMe && at(ref, 'dodge', false).raw.mean <= at(ref, 'trade', false).raw.mean },
    WILL_WEAK: { kneel: at(ref, 'trade', true).will, held: at(ref, 'trade', true).will >= T.KNEEL_WEAK },
    WILL_DODGE: { kneel: at(ref, 'dodge', false).will, held: at(ref, 'dodge', false).will >= T.KNEEL_DODGE },
    WILL_TRADE: { kneel: at(ref, 'trade', false).will, held: at(ref, 'trade', false).will <= T.KNEEL_TRADE_MAX },
    RANKS: { trade: ratio('trade'), dodge: ratio('dodge'), held: ['trade', 'dodge'].every((m) => ratio(m) >= T.RANK_RATIO[0] && ratio(m) <= T.RANK_RATIO[1]) },
  };
  return verdict;
}

export function measureFeud({ fights = 1000, weapons = ['Dagger', 'Longsword', 'Warhammer'] } = {}) {
  const duel = [];
  for (const weapon of weapons) {
    for (const mode of ['trade', 'dodge']) duel.push({ weapon, mode, weak: false, rank: 3, ...revenantCell({ weapon, mode, rank: 3 }, fights) });
    duel.push({ weapon, mode: 'trade', weak: true, rank: 3, ...revenantCell({ weapon, mode: 'trade', rank: 3, weak: true }, fights) });
  }
  const ranks = [];
  for (const mode of ['trade', 'dodge']) for (let rank = 1; rank <= 5; rank++) ranks.push({ weapon: 'Longsword', mode, rank, ...revenantCell({ weapon: 'Longsword', mode, rank }, fights) });
  const beside = [];
  for (const rank of [3, 5]) for (const mode of ['trade', 'dodge']) beside.push({ weapon: 'Longsword', mode, rank, order: 'band', ...revenantCell({ weapon: 'Longsword', mode, rank, order: 'band' }, fights) });
  for (const mode of ['trade', 'dodge']) beside.push({ weapon: 'Longsword', mode, rank: 3, order: 'alone', ...revenantCell({ weapon: 'Longsword', mode, rank: 3, band: false, flight: false }, fights) });
  const weight = [];
  for (const mode of ['trade', 'dodge']) for (const rank of [1, 5]) weight.push({ weapon: 'Longsword', mode, rank, ...revenantCell({ weapon: 'Longsword', mode, rank, flight: false }, fights) });
  const verdict = feudVerdict(duel, ranks, weight);
  return { fights, duel, ranks, beside, weight, verdict };
}

if (isMain(import.meta.url)) {
  const arg = (n, d) => (process.argv.includes(n) ? Number(process.argv[process.argv.indexOf(n) + 1]) : d);
  const t0 = Date.now();
  const wantFeud = process.argv.includes('--feud'), wantTell = process.argv.includes('--tell');
  const onlyFeud = wantFeud && !wantTell, onlyTell = wantTell && !wantFeud;
  const r = onlyFeud ? null : measureAll({ fights: arg('--fights', 1000), seconds: arg('--seconds', 30) });
  const fr = onlyTell ? null : measureFeud({ fights: arg('--fights', 1000) });
  if (process.argv.includes('--json')) console.log(JSON.stringify({ tell: r, feud: fr }, null, 2));
  else if (r) {
    console.log(`THE DUEL HARNESS - ${r.fights} fights a cell, ${r.seconds} s each (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
    console.log('TRADING BLOWS at the foe\'s front: wind-ups at me (poise), those my blows landed on, broken - of those, and of all; iron apart');
    const pct = (v) => (v == null ? '    -' : `${(v * 100).toFixed(1).padStart(5)}%`);
    for (const x of r.trade) console.log(`  ${x.weapon.padEnd(10)} ${x.metal.padEnd(8)} ${x.foe.padEnd(12)} ${x.class.padEnd(8)} wind-ups ${String(x.windups).padStart(6)}  struck ${String(x.struck).padStart(6)}  broken ${String(x.broken).padStart(6)}  ${pct(x.breakShare)} of struck  ${pct(x.ofAll)} of all  iron ${x.iron}`);
    console.log('\nDODGING (out of the shape by 70% of its wind-up): blows that landed on me anyway');
    for (const x of r.fair) console.log(`  ${x.foe.padEnd(12)} wind-ups ${String(x.windups).padStart(6)}  landed out of the shape ${x.hitsOut70}  (landed at all ${x.hitsOnMe})`);
    console.log(`\nMASSIVE (${r.massive.foe}, ${r.massive.class}, the weakest roll: ${r.massive.health} health): each weapon's largest single front blow against its poise`);
    for (const x of r.massive.rows) console.log(`  ${x.weapon.padEnd(10)} ${x.metal.padEnd(8)} ${x.who.padEnd(10)} max ${String(x.maxDamage).padStart(3)}  v ${String(x.maxV).padStart(6)}  P ${x.poise}  ${(x.share * 100).toFixed(1)}%`);
    console.log('\nTARGETS');
    for (const [k, v] of Object.entries(r.verdict)) console.log(`  ${v.held ? 'held  ' : 'MISSED'} ${k} ${JSON.stringify(v)}`);
  }
  if (fr && !process.argv.includes('--json')) {
    const pct = (v) => `${(v * 100).toFixed(1).padStart(5)}%`;
    const runBand = (x) => `ran ${x.flights} (fled ${x.fled}, cornered ${x.cornered}, caught ${x.caught}, stood running ${x.stoodInFlight})  band ${x.band}: swings ${x.bandSwings} wind-ups ${x.bandWindups} landed ${x.bandHits} slain ${x.bandSlain} rallied ${x.rallied} portal ${x.portal}`;
    console.log(`\nTHE REVENANT (an Orc revenant with its band, ${fr.fights} fights a cell, to its end): how it ended, the time to the end, its staggers and my perfect dodges a fight; its flight and its band`);
    for (const x of fr.duel) console.log(`  ${x.weapon.padEnd(10)} rank ${x.rank} ${x.mode.padEnd(6)} ${x.weak ? 'its weakness' : 'plain       '}  knelt ${pct(x.kneel)} (${x.will == null ? '-' : pct(x.will)} of those its will decided)  mean ${String(x.mean).padStart(6)} s  median ${String(x.median).padStart(7)} s  staggers ${x.staggers}  two+ ${pct(x.twoStaggers)}  perfect ${x.perfect}  wind-ups ${x.windups}  blows on me ${x.hitsOnMe}  ${runBand(x)}`);
    console.log('\nTHE RANKS (a Longsword): the time to the end');
    for (const x of fr.ranks) console.log(`  rank ${x.rank} ${x.mode.padEnd(6)} knelt ${pct(x.kneel)}  mean ${String(x.mean).padStart(6)} s  median ${String(x.median).padStart(7)} s  stood ${x.stood}  ${runBand(x)}`);
    console.log('\nTHE RANKS\' WEIGHT (a Longsword, never running - RANKS reads these): the time to the end');
    for (const x of fr.weight) console.log(`  rank ${x.rank} ${x.mode.padEnd(6)} knelt ${pct(x.kneel)}  mean ${String(x.mean).padStart(6)} s  median ${String(x.median).padStart(7)} s`);
    console.log('\nBESIDE THE TARGETS (a Longsword): its band first; alone and never running (as AUDIT FEUD 2 measured)');
    for (const x of fr.beside) console.log(`  rank ${x.rank} ${x.mode.padEnd(6)} ${x.order.padEnd(6)} knelt ${pct(x.kneel)}  mean ${String(x.mean).padStart(6)} s  median ${String(x.median).padStart(7)} s  blows on me ${x.hitsOnMe}  ${runBand(x)}`);
    console.log('\nRVN TARGETS');
    for (const [k, v] of Object.entries(fr.verdict)) console.log(`  ${v.held ? 'held  ' : 'MISSED'} ${k} ${JSON.stringify(v)}`);
  }
  process.exit([...Object.values(r?.verdict ?? {}), ...Object.values(fr?.verdict ?? {})].every((v) => v.held) ? 0 : 1);
}
