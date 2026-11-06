#!/usr/bin/env node
// BUNNYFALL (2026-11-06, the Discord's balance thread: "two-handers are garbage", "dual is almost twice as fast", "shields
// barely matter"): THE FIGHTING STYLES, MEASURED. Changes nothing in the game; it asks the game's own code.
//
// THE RATE: the real weapon machine (combat/playerWeapon.js PlayerWeapon) with the attack held down for a minute at 60
// frames a second - the swing law, the dual flurry and the off hand's burden, the bow's draw and cooldown, Roleplay &
// Realism: Items' weaponBalance as it ships - counting the blows that land a hit frame, per hand.
// THE BLOW: the game's own formula (combat/formulas.js calculateAttackDamage, PCAAO and RR as they ship), against foes
// drawn from DFU's level band (tools/heroMeasure.mjs bandWeights over the dungeon and wilderness tables), the off hand's
// share and to-hit as resolveHit passes them.
// THE GUARD: the same foes' blows on the player, plate on (seven pieces), a shield in the left hand or not.
// THE KIT: "plain" is every item Common; "rare" rolls each hand item Rare through the loot's own roll
// (systems/loot/lootRarity.js rollAffixes) and folds its lines into the wearer (systems/entityMods.js), so a second item's
// stat and skill lines count the way they do in play. Procs (elemental, leech) are each weapon's own and left out.
//
//   node tools/styleMeasure.mjs            # 600 foes a cell
//   node tools/styleMeasure.mjs --n 200    # quicker
import { isMain } from './lib/isMain.mjs';
import { installRoleplayRealismItems } from '../src/systems/roleplayRealismItems/rriInstall.js';
import { installRoleplayRealism } from '../src/systems/roleplayRealism/rrInstall.js';
import '../src/combat/swingLaw.js';
import { PlayerWeapon } from '../src/combat/playerWeapon.js';
import { calculateAttackDamage, weaponKnockbackSpeed, weaponKnockbackApplies, enemyWeightClassicUnits, KB_UNIT } from '../src/combat/formulas.js';
import { offHandToHit, OFF_HAND_BLOW } from '../src/combat/twoHands/handsLaw.js';
import { makeEnemyEntity, applyProgressionScaling } from '../src/characters/enemy/enemyEntity.js';
import { progressionScaling } from '../src/systems/skillSoftcap.js';
import { heroThreat } from '../src/systems/heroThreat.js';
import { ENEMY_BASICS } from '../src/characters/enemy/enemyBasics.js';
import { assignEnemyEquipment } from '../src/combat/enemyEquipment.js';
import { mintCondition } from '../src/systems/item/itemTemplates.js';
import { EQUIP_SLOTS, equipTableOf, rebuildEquipState } from '../src/systems/equip.js';
import { SKILLS } from '../src/systems/skills.js';
import { ENCOUNTER_TABLES } from '../src/systems/encounters.js';
import { rollAffixes } from '../src/systems/loot/lootRarity.js';
import { computeEntityMods } from '../src/systems/entityMods.js';
import { buildAt, bandWeights, mulberry } from './heroMeasure.mjs';
import { EFFECTIVE_SKILL_MAX } from '../src/systems/skillSoftcap.js';

installRoleplayRealismItems();
installRoleplayRealism();

const T = Object.freeze({ Buckler: 109, Kite: 111, Tower: 112, Dagger: 113, Staff: 115, Shortsword: 116, Saber: 119, Longsword: 120, Katana: 121,
  Claymore: 122, DaiKatana: 123, Mace: 124, Warhammer: 126, BattleAxe: 127, LongBow: 130 });
/** The styles: [name, right hand, left hand]. */
export const STYLES = Object.freeze([
  ['Longsword', T.Longsword, null], ['Longsword + buckler', T.Longsword, T.Buckler], ['Longsword + kite', T.Longsword, T.Kite],
  ['Longsword + tower', T.Longsword, T.Tower], ['Dual longswords', T.Longsword, T.Longsword], ['Shortsword', T.Shortsword, null],
  ['Dual shortswords', T.Shortsword, T.Shortsword], ['Mace', T.Mace, null], ['Dual maces', T.Mace, T.Mace],
  ['Claymore (2H)', T.Claymore, null], ['Dai-katana (2H)', T.DaiKatana, null], ['Warhammer (2H)', T.Warhammer, null],
  ['Battle axe', T.BattleAxe, null], ['War axe (2H)', 128, null], ['Staff (2H)', T.Staff, null], ['Long bow', T.LongBow, null], ['Fists', null, null],
  ['Fists + tower', null, T.Tower],
  ['Fists, Hand-to-Hand 200', null, null, { [SKILLS.HandToHand]: EFFECTIVE_SKILL_MAX }],   // mastered online: what a formula reads at 200 (systems/skillSoftcap.js); level 30 alone
]);
const isShield = (ti) => ti >= 109 && ti <= 112;
const ARMOR = [[102, 'ChestArmor'], [103, 'Gloves'], [104, 'LegsArmor'], [105, 'LeftArm'], [106, 'RightArm'], [107, 'Head'], [108, 'Feet']];
const plateOf = (B) => (B.pmat < 0 ? 0x0100 : 0x0200 + B.pmat);
const TABLES = [...Array(19).keys(), 32, 33, 34];

function mintHand(ti, B, rare, r) {
  if (ti == null) return null;
  const it = mintCondition(isShield(ti) ? { group: 'Armor', templateIndex: ti, material: plateOf(B), name: `s${ti}` } : { group: 'Weapons', templateIndex: ti, material: B.wmat, flags: 0, name: `w${ti}` });
  it.maxCondition = 1e9; it.currentCondition = 1e9;
  if (rare) { it.rarity = 'rare'; it.affixes = rollAffixes(it, 'rare', r); }
  return it;
}

/** The stated player at `B` with `right`/`left` in hand: every weapon skill at the build's Long Blade. */
function mkPlayer(B, right, left, over = null) {
  const skills = Object.fromEntries(Array.from({ length: 35 }, (_, i) => [i, B.other]));
  for (const s of [SKILLS.LongBlade, SKILLS.ShortBlade, SKILLS.BluntWeapon, SKILLS.Axe, SKILLS.Archery, SKILLS.HandToHand]) skills[s] = B.LB;
  skills[SKILLS.CriticalStrike] = B.crit; skills[SKILLS.Dodging] = B.dodge;

  const p = { isPlayer: true, level: B.level, raceId: 1, stats: { strength: B.STR, intelligence: 50, willpower: B.WIL, agility: B.AGI, endurance: B.END, personality: 50, speed: B.SPD, luck: B.LUC },
    skills, career: { weaponArmorShieldsBitfield: 0, abilityFlagsAndSpellPointsBitfield: 0 }, health: 1e6, maxHealth: 1e6, items: [], reflexes: 2, biographyAvoidHitMod: 0 };
  if (over) p.skillOverrides = { ...over };   // skills.js skillValue: the formula's value as given (Master Skills is an online switch)
  const table = equipTableOf(p);
  for (const [ti, slot] of ARMOR) { const it = mintCondition({ group: 'Armor', templateIndex: ti, material: plateOf(B), name: `a${ti}` }); it.currentCondition = it.maxCondition; it.equipSlot = EQUIP_SLOTS[slot]; table[EQUIP_SLOTS[slot]] = it; p.items.push(it); }
  if (right) { right.equipSlot = EQUIP_SLOTS.RightHand; table[EQUIP_SLOTS.RightHand] = right; p.items.push(right); }
  if (left) { left.equipSlot = EQUIP_SLOTS.LeftHand; table[EQUIP_SLOTS.LeftHand] = left; p.items.push(left); }
  rebuildEquipState(p);
  computeEntityMods(p);
  return p;
}

/** Blows a second through the real machine, per hand, and the bow's draw. */
export function blowRate(p, right, left, seconds = 60) {
  const pw = new PlayerWeapon({ liveSpeed: p.stats.speed });
  pw.sheathed = false;
  pw.updateHands(right, left); pw.applyWeapon();
  pw.animCtx = () => pw.swingCtx(p);
  const dt = 1 / 60, rr = mulberry(7), hits = { R: 0, L: 0 }, times = [];
  for (let s = 0; s < seconds / dt; s++) {
    if (pw.machine.state === 'Idle') pw.clickAttack(rr);
    for (const e of pw.update(dt)) if (e === 'hit') { const h = pw.strike?.hand ?? 'R'; hits[h]++; times.push([s * dt, h]); }
  }
  return { R: hits.R / seconds, L: hits.L / seconds, mode: pw.handsMode, drawMs: pw.lastDrawMs, times };
}

/** A foe from the level's band, seeded. */
function foeAt(L, r, hero = null) {
  const w = bandWeights(L), table = ENCOUNTER_TABLES[TABLES[Math.floor(r() * TABLES.length)]];
  let x = r(), i = 0; for (; i < 19; i++) { x -= w[i]; if (x <= 0) break; }
  const id = table[i];
  const e = makeEnemyEntity(id, ENEMY_BASICS[id], id >= 128 ? { attackModifierFlags: 0, hitPointsPerLevel: 12, name: 'foe' } : { attackModifierFlags: 0 }, L, r);
  let weapon = null;
  if (id >= 128) { const eq = assignEnemyEquipment(e, 0, L, r); e.armorValues = eq.armorValues; weapon = eq.rightHand ? { ...eq.rightHand, maxCondition: 1e9, currentCondition: 1e9 } : null; }
  if (hero) applyProgressionScaling(e, progressionScaling(null, 0, 0, 0, hero));
  return { e, weapon };
}

/** One style at one level: blows a second, a blow's mean on the band, damage a second, a foe blow's mean on me. */
export function measure(L, [name, ri, li, over = null], { n = 600, rare = false, seed = 1, renown = null } = {}) {
  const B = buildAt(L);
  const hero = renown ? heroThreat(L, renown) : null;
  let dealtR = 0, dealtL = 0, taken = 0, foeHp = 0, rate = null, landR = 0, landL = 0;
  const blowsR = [], blowsL = [], weights = [];
  for (let s = 0; s < n; s++) {
    const r = mulberry(seed * 100003 + L * 7919 + s);
    const right = mintHand(ri, B, rare, r), left = mintHand(li, B, rare, r);
    const p = mkPlayer(B, right, left, over);
    rate ??= blowRate(p, right, left);
    const { e, weapon } = foeAt(L, r, hero);
    foeHp += e.maxHealth;
    // three streams, so a second hand's rolls never move the foe's blow on me
    const rd = mulberry(seed * 300007 + L * 7919 + s), rt = mulberry(seed * 500009 + L * 7919 + s);
    const dfRand = () => Math.floor(rd() * 32768), dfT = () => Math.floor(rt() * 32768);
    const dR = calculateAttackDamage(p, e, { weapon: right && !isShield(ri) ? right : null, rolls: rd, dfRand, weaponAnimTime: rate.drawMs });
    dealtR += dR; blowsR.push(dR); if (dR > 0) landR++;
    weights.push({ w: enemyWeightClassicUnits(!!e.isClass || foeIsClass(e), e.gender, ENEMY_BASICS[e.mobileType ?? e.id]?.weight ?? 0, e.items), cls: foeIsClass(e) });
    if (rate.mode === 'dual' || rate.mode === 'fists') {
      const off = rate.mode === 'dual';
      const dL = calculateAttackDamage(p, e, { weapon: left, rolls: rd, dfRand, toHitMod: off ? offHandToHit(B.AGI) : 0, ...(off ? OFF_HAND_BLOW : {}) });
      dealtL += dL; blowsL.push(dL); if (dL > 0) landL++;
    }
    const t = calculateAttackDamage(e, p, { weapon, rolls: rt, dfRand: dfT, playerReflexes: 2 });
    taken += t > 0 && Number.isFinite(e.damageScale) && e.damageScale !== 1 ? Math.max(1, Math.round(t * e.damageScale)) : t;
  }
  const blowR = dealtR / n, blowL = dealtL / n;
  const dps = rate.R * blowR + rate.L * blowL;
  return { name, rate: rate.R + rate.L, blow: (rate.R * blowR + rate.L * blowL) / Math.max(1e-9, rate.R + rate.L), dps, taken: taken / n, foeHp: foeHp / n,
    landed: rate.R * (landR / n) + rate.L * (blowsL.length ? landL / blowsL.length : 0), times: rate.times, blowsR, blowsL, weights };
}
const foeIsClass = (e) => (e.mobileType ?? e.id ?? 0) >= 128 || !!e.isClass;

// ── THE SHOVE (formulas.js weaponKnockbackSpeed / weaponKnockbackApplies, characters/enemy/enemyMotor.js _knockbackStep):
// a landed blow writes the foe's knockback speed from its damage and the foe's weight - a monster's on every blow, a
// class foe's only once the last shove has all but stopped - and while it runs the foe moves along the blow and can
// neither walk nor shoot nor cast (CanAct false; DFU's melee roll is not gated, the shove only carries it out of reach).
// Played over the style's own hit times for 30 s fights, a blow's damage drawn from its measured rolls.
const CLASSIC_TICK = 1 / 16;
export function shove(m, { fights = 200, seconds = 30, seed = 9, kind = 'all' } = {}) {
  const r = mulberry(seed);
  const pool = m.weights.map((w, i) => ({ ...w, i })).filter((w) => kind === 'all' || (kind === 'class') === w.cls);
  if (!pool.length) return null;
  let knocked = 0, hurt = 0, metres = 0, total = 0;
  const dt = 1 / 60;
  for (let f = 0; f < fights; f++) {
    const foe = pool[Math.floor(r() * pool.length)];
    let ks = 0, acc = 0, h = 0;
    const times = m.times;
    for (let s = 0; s < seconds / dt; s++) {
      const t = s * dt;
      while (h < times.length && times[h][0] <= t) {
        const list = times[h][1] === 'L' ? m.blowsL : m.blowsR;
        const d = list[Math.floor(r() * list.length)];
        if (d > 0 && weaponKnockbackApplies(ks, foe.cls, foe.cls ? 0 : Math.max(1, foe.w))) ks = weaponKnockbackSpeed(d, Math.max(1, foe.w));
        h++;
      }
      if (ks > 0) {
        knocked += dt;
        if (ks > 5 / KB_UNIT) hurt += dt;
        metres += Math.min(ks, KB_MOTION) * dt;
        acc += dt;
        while (acc >= CLASSIC_TICK) { acc -= CLASSIC_TICK; ks = Math.max(0, Math.min(ks, 40 / KB_UNIT) - 5 / KB_UNIT); }
      } else acc = 0;
      total += dt;
    }
  }
  return { knocked: knocked / total, hurt: hurt / total, metresPerSecond: metres / total };
}
const KB_MOTION = 25 / KB_UNIT;

if (isMain(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
  const n = arg('n', 600);
  if (process.argv.includes('--hits')) {
    // THE PER-HIT TABLE: blows that land a second (what every on-hit effect rides: a Rare elemental line, a leech, a DFU
    // Cast When Strikes, the Echo), the flat 4.5 a Rare elemental line adds a landed blow (each weapon carrying one, the
    // off hand's at its 0.8 share), and the shove against class foes and monsters.
    for (const L of [10, 20, 30]) {
      console.log(`\nLEVEL ${L}`);
      console.log('  style                  landed/s  DPS   +elem  x vs LS | class foe: knocked  shove m/s | monster: knocked  shove m/s');
      const rows = STYLES.filter(([, , li, over]) => !isShield(li ?? 0) && (!over || L >= 30)).map((st) => measure(L, st, { n, rare: true }));
      const elem = (m) => (m.name.startsWith('Dual') ? m.landed * 4.5 * 0.9 : m.name.startsWith('Fists') ? 0 : m.landed * 4.5);
      const base = rows[0].dps + elem(rows[0]);
      for (const m of rows) {
        const c = shove(m, { kind: 'class' }), b = shove(m, { kind: 'monster' });
        const pc = (v) => `${(100 * v).toFixed(0)}%`.padStart(4);
        console.log(`  ${m.name.padEnd(22)} ${m.landed.toFixed(2).padStart(6)} ${m.dps.toFixed(1).padStart(6)} ${(m.dps + elem(m)).toFixed(1).padStart(6)}  x${((m.dps + elem(m)) / base).toFixed(2)}  |   ${c ? pc(c.knocked) : '  - '}      ${c ? c.metresPerSecond.toFixed(2) : '-'}     |   ${b ? pc(b.knocked) : '  - '}      ${b ? b.metresPerSecond.toFixed(2) : '-'}`);
      }
    }
    process.exit(0);
  }
  for (const L of [1, 10, 20, 30]) {
    const B = buildAt(L);
    console.log(`\nLEVEL ${L}  (STR ${B.STR} AGI ${B.AGI} SPD ${B.SPD}, weapon skill ${B.LB}, ${n} foes)`);
    console.log('  style                  blows/s   blow   DPS plain | DPS rare  | foe blow on me  | vs Longsword (plain, rare)');
    const styles = STYLES.filter(([, , , over]) => !over || L >= 30);
    const rows = styles.map((s) => [measure(L, s, { n }), measure(L, s, { n, rare: true })]);
    const [base, baseR] = rows[0];
    const R = Math.round(L * 1.5) || 1;
    const tough = styles.map((st) => measure(L, st, { n, renown: R }));
    rows.forEach((row, i) => row.push(tough[i]));
    console.log(`  (a Renown ${R} player's foes, the hero's threat on them: a blow on me ${tough[0].taken.toFixed(1)} without a shield)`);
    for (const [a, b, c] of rows) {
      console.log(`  ${a.name.padEnd(22)} ${a.rate.toFixed(2).padStart(6)} ${a.blow.toFixed(1).padStart(7)} ${a.dps.toFixed(1).padStart(9)} | ${b.dps.toFixed(1).padStart(8)}  | ${a.taken.toFixed(2).padStart(8)} (${(100 * a.taken / base.taken).toFixed(0)}%) | x${(a.dps / base.dps).toFixed(2)}  x${(b.dps / baseR.dps).toFixed(2)} | threat foe on me ${(100 * c.taken / rows[0][2].taken).toFixed(0)}%`);
    }
  }
}
