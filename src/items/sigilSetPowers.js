// @ts-check
// Runs awake sigil set tiers through hooks registered at import. Each hook acts only for my own entity.

import { SKILLS, MAGIC_SKILLS } from '../characters/skills.js';
import { registerEntityFold, registerWeaponBlowMod, newMods, EMPTY_MODS, NUMBER_BODY_PARTS } from '../characters/entityMods.js';
import { registerPlayerStruckListener, registerPlayerStrikeListener } from '../combat/formulas.js';
import { registerPlayerDamageMod, registerPlayerDeathSave, registerPlayerHurtListener, registerPlayerDoorOpen, setFoeBlowProbe } from '../characters/playerEntity.js';
import { registerPlayerKillListener } from '../player/playerKills.js';
import { registerSpellCostMod } from '../magic/spellcost.js';
import { healMine, manaMine } from '../player/playerHeal.js';
import { registerPlayerCastListener } from '../magic/playerCasts.js';
import { RESIST_ELEMENTS } from './lootRarity.js';
import { CAST_SETTING_MAX } from '../net/wire.js';
import { registerAbsorptionChance } from '../magic/absorption.js';
import { registerMagicRoundHook } from '../world/worldTick.js';
import { playerDoor, paidBack } from '../player/playerDoor.js';
import { hudText } from '../ui/notify.js';
import { t } from '../ui/textManager.js';
import { weaponSkillUsed } from '../characters/weapons.js';
import { friendlyProtected } from '../combat/playerWeapon.js';
import { careerTolerance, EFFECT_FLAGS } from '../magic/spellcast.js';
import { KNIGHT_CITY_WATCH } from '../characters/mobileTypes.js';
import { hallowedFoe } from '../systems/festival/festivalFoes.js';
import { HARVEST_TEXT } from '../systems/festival/festivalWords.js';
import { healthShare } from '../combat/healthShare.js';
import { wildZoneKind } from '../world/wildZone.js';
import { ETHER_KIND } from '../world/wild/etherWild.js';
import {
  wornSets, setsAwake, RAMPAGE_SECONDS, RAMPAGE_STACKS, CLEAVE_METRES, WRATH_BELOW, NOVA_METRES, WRATH_SECONDS,
  RIPOSTE_SECONDS, MARK_METRES, MARK_SECONDS, BLOOD_SECONDS, BLOOD_STACKS, COIL_STACKS, COIL_SECONDS, SHED_BELOW,
  ROUND_SECONDS, REPRIEVE_BELOW, REPRIEVE_SECONDS, REPRIEVE_METRES, REPRIEVE_ALLY_SHARE,
  STRAND_HITS, STRAND_SECONDS, VEIL_BELOW,
  UNBROKEN_LESS,
} from './sigilSets.js';
import { blowRoom, guardRoom } from '../characters/powerCeiling.js';

// Power timers use real seconds and last only for the session, so a reload starts every power ready.
let _now = () => performance.now() / 1000;
const fresh = () => ({
  unbrokenReady: 0, halvedUntil: 0,
  wrathReady: 0, wrathUntil: 0,
  eventideReady: 0,
  rampage: 0, rampageUntil: 0,
  riposteUntil: 0,
  marked: null, markUntil: 0,
  blood: 0, bloodUntil: 0,
  ward: 0, wardReady: 0,
  coils: new WeakMap(),
  coilFoe: null,
  shedReady: 0,
  gearReady: 0,
  hourReady: 0, hourHeal: 0,
  armed: -1, lastCost: 0,
  reprieve: 0, reprieveUntil: 0, reprieveReady: 0,
  harvestReady: 0,
  strands: new WeakMap(),
  strandFoe: null,
  veilReady: 0,
  spireHeld: new Map(),
  recovering: new Set(),
});
let _s = fresh();
let _say = (line) => { hudText(line); };
let _sound = null;
export function setSetPowersVoice({ say = null, sound = null } = {}) {
  if (typeof say === 'function') _say = say;
  _sound = typeof sound === 'function' ? sound : null;
}
const sound = (name) => { try { _sound?.(name); } catch { } };
// A voice that throws must not turn a death save into a death.
const say = (line) => { try { _say(line); } catch { } };

export function awakeTiersOf(entity) {
  if (!entity?.isPlayer || entity.peer || !setsAwake()) return null;
  const out = new Map();
  for (const st of wornSets(entity, undefined, undefined, { text: false })) out.set(st.id, st.tiers.map((t) => (t.awake ? t.values : null)));
  return out;
}
const tierOf = (entity, id, i) => awakeTiersOf(entity)?.get(id)?.[i] ?? null;

const add = (rec, key, v) => { rec[key] = (rec[key] ?? 0) + v; };
export function setFold(entity) {
  const t = awakeTiersOf(entity);
  if (!t || !t.size) return EMPTY_MODS;
  let mods = null;
  const m = () => (mods ??= newMods());
  const mal = t.get('malacath')?.[0];
  if (mal) { for (let p = 0; p < NUMBER_BODY_PARTS; p++) m().armorParts[p] += mal.armor; add(m().stats, 'endurance', mal.endurance); }
  const dag = t.get('dagon')?.[0];
  if (dag) { add(m().stats, 'strength', dag.strength); add(m().skills, SKILLS.CriticalStrike, dag.critical); }
  const noc = t.get('nocturnal')?.[0];
  if (noc) { add(m().skills, SKILLS.Stealth, noc.stealth); add(m().stats, 'agility', noc.agility); }
  const mor = t.get('mora')?.[0];
  if (mor) { add(m().stats, 'intelligence', mor.intelligence); for (const s of MAGIC_SKILLS) add(m().skills, s, mor.schools); }
  const ruhn = t.get('ruhn')?.[0];
  if (ruhn) add(m().resist, 'fire', ruhn.fire);
  const oath = t.get('oath')?.[0];
  if (oath) { for (let p = 0; p < NUMBER_BODY_PARTS; p++) m().armorParts[p] += oath.armor; add(m().stats, 'willpower', oath.willpower); }
  const keen = t.get('thieftaker')?.[0];
  if (keen) { add(m().stats, 'agility', keen.agility); add(m().skills, SKILLS.Archery, keen.archery); }
  const hide = t.get('orcsbane')?.[0];
  if (hide) { add(m().stats, 'endurance', hide.endurance); add(m().skills, SKILLS.BluntWeapon, hide.blunt); }
  const scale = t.get('coilscale')?.[0];
  if (scale) { add(m().resist, 'frost', scale.frost); add(m().stats, 'endurance', scale.endurance); }
  const brass = t.get('numidium')?.[0];
  if (brass) { add(m().resist, 'magic', brass.magic); add(m().resist, 'shock', brass.shock); }
  const bearing = t.get('panoply')?.[0];
  if (bearing) { for (const el of RESIST_ELEMENTS) add(m().resist, el, bearing.resist); m().magicka += bearing.magicka; }
  const sight = t.get('wyrd')?.[0];
  if (sight) { add(m().stats, 'willpower', sight.willpower); add(m().resist, 'magic', sight.magic); }
  const thread = t.get('starspun')?.[0];
  if (thread) { add(m().resist, 'poison', thread.poison); add(m().stats, 'agility', thread.agility); }
  const wrack = t.get('eltheric')?.[0];
  if (wrack) { add(m().resist, 'shock', wrack.shock); add(m().stats, 'speed', wrack.speed); }
  return mods ?? EMPTY_MODS;
}

export const rampageStacks = (now = _now()) => (now < _s.rampageUntil ? _s.rampage : 0);
export const bloodStacks = (now = _now()) => (now < _s.bloodUntil ? _s.blood : 0);
// A mark, coil, or strand on a dead body counts as none, because a peer's kill of it never reaches setKill here.
export const markedFoe = (now = _now()) => (now < _s.markUntil && !(_s.marked?.health <= 0) ? _s.marked : null);
export const coilStacksAt = (foe, now = _now()) => {
  const c = foe && !(foe.health <= 0) ? _s.coils.get(foe) : null;
  return c && now < c.until ? c.n : 0;
};
export const coiledFoe = (now = _now()) => (coilStacksAt(_s.coilFoe, now) ? _s.coilFoe : null);
export const coilStacks = (now = _now()) => coilStacksAt(_s.coilFoe, now);
export const strandsAt = (foe, now = _now()) => {
  const c = foe && !(foe.health <= 0) ? _s.strands.get(foe) : null;
  return c && now < c.until ? c.n : 0;
};
export const strandCount = (now = _now()) => strandsAt(_s.strandFoe, now);
const belowHalf = (e) => (healthShare(e) ?? 1) < 0.5;
const ranged = (w) => weaponSkillUsed(w?.templateIndex) === SKILLS.Archery;
/** @type {WeakMap<object, number>} */
let _carry = new WeakMap();
export function setBlow(weapon, damage, attacker, target, info) {
  if (!(damage > 0) || !attacker?.isPlayer || attacker.peer || !target || target.isPlayer) return damage;
  // A warded target turns the blow whole, so no window or armed blow is spent on it.
  if (target.warded) return damage;
  const t = awakeTiersOf(attacker);
  if (!t || !t.size) return damage;
  const now = _now();
  let pct = 0, flat = 0;
  const dag = t.get('dagon');
  if (dag?.[1]) pct += dag[1].more * (belowHalf(attacker) ? 2 : 1);
  if (dag?.[2]) pct += dag[2].stack * rampageStacks(now);
  const noc = t.get('nocturnal');
  if (noc?.[1] && info?.unaware) pct += noc[1].more;
  const ruhn = t.get('ruhn');
  if (ruhn?.[0] && !fireProof(target)) flat += ruhn[0].sear;
  if (ruhn?.[2] && now < _s.wrathUntil) pct += ruhn[2].more;
  const oath = t.get('oath');
  const keep = !info?.estimate;
  if (oath?.[1] && now < _s.riposteUntil) { pct += oath[1].more; if (keep) _s.riposteUntil = 0; }
  const taker = t.get('thieftaker');
  if (taker?.[1] && belowHalf(target)) pct += taker[1].more;
  if (taker?.[2] && markedFoe(now) === target) pct += taker[2].more;
  const orcs = t.get('orcsbane');
  if (orcs?.[1]) pct += orcs[1].stack * bloodStacks(now);
  const coil = t.get('coilscale');
  if (coil?.[1]) pct += coil[1].stack * coilStacksAt(target, now);
  const ward = t.get('wyrd')?.[1];
  if (ward && hallowedFoe(target)) pct += ward.more;
  const disc = t.get('panoply')?.[1];
  if (disc && weapon && _s.armed >= 0) { pct += disc.armed * elementShare(target, _s.armed); if (keep) _s.armed = -1; }
  const silk = t.get('starspun')?.[1];
  if (silk && weapon && strandsAt(target, now) >= STRAND_HITS - 1) pct += silk.more;
  const tow = t.get('eltheric')?.[1];
  if (tow && weapon) pct += atSea() ? tow.more : tow.more / 2;
  let out = damage;
  if (pct > 0) pct = blowRoom(pct, 'sets');
  if (pct > 0) {
    const key = weapon ?? attacker;
    const exact = (damage * pct) / 100 + (_carry.get(key) ?? 0);
    const more = Math.floor(exact + 1e-9);
    if (keep) _carry.set(key, Math.max(0, exact - more));
    out += more;
  }
  out += flat;
  return out;
}
// Cleave shares the blow that landed, after crits, materials, and armor, so a neighbor never takes more than the
// struck enemy.
export function setStrike(attacker, target, damage, weapon, info = null) {
  if (!(damage > 0) || !weapon || target?.warded) return;
  if (info?.blow !== false) coiled(attacker, target);
  stranded(attacker, target, info?.blow !== false);
  if (info?.blow !== false) returned(attacker);
  if (ranged(weapon)) return;
  const v = tierOf(attacker, 'ruhn', 1);
  if (v) cleave(target, (damage * v.share) / 100, weapon);
}
function coiled(attacker, target) {
  if (!target || target.isPlayer || !tierOf(attacker, 'coilscale', 1)) return;
  const now = _now();
  _s.coils.set(target, { n: Math.min(COIL_STACKS, coilStacksAt(target, now) + 1), until: now + COIL_SECONDS });
  _s.coilFoe = target;
}

// `whole` decides only whether a strand is laid. The held blow cuts the count whatever its weight.
function stranded(attacker, target, whole = true) {
  if (!target || target.isPlayer || !tierOf(attacker, 'starspun', 1)) return;
  const now = _now(), had = strandsAt(target, now);
  if (had >= STRAND_HITS - 1) _s.strands.delete(target);
  else if (whole) _s.strands.set(target, { n: had + 1, until: now + STRAND_SECONDS });
  else return;
  _s.strandFoe = target;
}

const atSea = () => wildZoneKind() === ETHER_KIND;
export function captainsDue(entity = playerDoor()?.player?.()) {
  const v = tierOf(entity, 'eltheric', 2);
  return v ? { guns: 1 + v.guns / 100, hull: Math.max(0, 1 - v.hull / 100) } : NO_DUE;
}
const NO_DUE = Object.freeze({ guns: 1, hull: 1 });

const ELEMENT_FLAGS = Object.freeze([EFFECT_FLAGS.Fire, EFFECT_FLAGS.Frost, EFFECT_FLAGS.Poison, EFFECT_FLAGS.Shock, EFFECT_FLAGS.Magic]);
// Mirrors elementShare in lootPowers.js, which this file cannot import because lootPowers.js imports this file.
const elementShare = (target, element) => {
  const flag = ELEMENT_FLAGS[element];
  if (!flag) return 1;
  const t = careerTolerance(target?.career ?? {}, flag);
  return t === 'Immune' ? 0 : t === 'Resistant' ? 0.5 : 1;
};
export function setCast(entity, spell, cost) {
  if (!tierOf(entity, 'panoply', 1)) return;
  const el = spell?.element;
  if (Number.isInteger(el) && el >= 0 && el < ELEMENT_FLAGS.length) _s.armed = el;
  _s.lastCost = Number.isFinite(cost) && cost > 0 ? cost : 0;
}
function returned(attacker) {
  const v = _s.lastCost > 0 ? tierOf(attacker, 'panoply', 1) : null;
  if (v) manaMine(attacker, (_s.lastCost * v.refund) / 100);
}

const flat2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
export const REACH_RISE_M = 2.5;
const rise = (a, b) => Math.abs((a[1] ?? 0) - (b[1] ?? 0));
// Cleave and the Nova are not aimed, so they always spare allies and enemies at peace, whatever the setting.
const spared = (f) => friendlyProtected(f, { protection: true });
const fireProof = (entity) => careerTolerance(entity?.career ?? {}, EFFECT_FLAGS.Fire) === 'Immune';
function cleave(targetEntity, amount, weapon) { cleaveNear(targetEntity, amount, weapon); }
export function cleaveNear(targetEntity, amount, weapon, { count = 1, metres = CLEAVE_METRES } = {}) {
  const door = playerDoor();
  if (!door || !(amount > 0)) return;
  const foes = door.foes();
  const struck = foes.find((f) => f.entity === targetEntity);
  if (!struck?.ai?.feet) return;
  const near = [];
  for (const f of foes) {
    if (f === struck || f.dead || !f.ai?.feet || spared(f)) continue;
    if (rise(f.ai.feet, struck.ai.feet) > REACH_RISE_M) continue;
    if ((f.entity?.minMetalToHit ?? -1) > (weapon?.material ?? 0)) continue;
    const d = flat2(f.ai.feet, struck.ai.feet);
    if (d > metres) continue;
    near.push([d, f]);
  }
  near.sort((a, b) => a[0] - b[0]);
  let hit = 0;
  for (const [, f] of near) {
    if (hit >= count) break;
    if (door.clear && !door.clear(struck.ai.feet, f.ai.feet)) continue;
    door.hurtFoe(f, Math.max(1, Math.round(amount)));
    hit++;
  }
}

// The struck tail only marks an enemy's blow. The damage door then decides what it did (a veto, a Shield pool, or
// Unbroken), and Spite and the Wrath answer the hurt, not the mark. The window only bounds a mark nobody took.
export const BLOW_WINDOW_S = 0.1;
let _blow = null;
export function setStruck(attacker, target, damage) {
  if (!target?.isPlayer || target.peer) return;
  _blow = damage > 0 && attacker ? { attacker, at: _now() } : null;
}
// A host that withholds a blow and lands it later keeps the mark here and marks it again as the blow lands.
export const heldPlayerBlow = () => (_blow && _now() - _blow.at <= BLOW_WINDOW_S ? { attacker: _blow.attacker } : null);
export function remarkPlayerBlow(b) { if (b?.attacker) _blow = { attacker: b.attacker, at: _now() }; }
function landedBlow() {
  const b = _blow;
  _blow = null;
  return b && _now() - b.at <= BLOW_WINDOW_S ? b : null;
}
function spite(entity, blow, took) {
  const v = tierOf(entity, 'malacath', 1);
  if (!v || !(took > 0)) return;
  const door = playerDoor();
  const f = door?.foes().find((x) => x.entity === blow.attacker);
  const back = f ? paidBack(f, Math.max(1, Math.round((took * v.back) / 100))) : 0;
  if (back > 0) door.hurtFoe(f, back);
}

// Rounds down to whole points, because fractional health lets a later non-lethal blow spend Unbroken's save.
function unbrokenHalves(entity, dmg) {
  return _now() < _s.halvedUntil && tierOf(entity, 'malacath', 2) ? Math.floor((dmg * (100 - guardRoom(UNBROKEN_LESS, 'sets'))) / 100) : dmg;
}
let _holdOwed = 0;
export function setDamageMod(entity, dmg) {
  let d = unbrokenHalves(entity, dmg);
  const hold = tierOf(entity, 'oath', 2);
  if (hold && d > 0 && belowHalf(entity)) {
    const owed = (d * guardRoom(hold.less, 'sets')) / 100 + _holdOwed;
    const cut = Math.min(d, Math.floor(owed + 1e-9));
    _holdOwed = owed - cut;
    d -= cut;
  }
  if (_s.ward > 0 && d > 0 && tierOf(entity, 'orcsbane', 2)) {
    const took = Math.min(_s.ward, d);
    _s.ward -= took;
    d -= took;
  }
  const gear = d > 0 && (_pending || _pendingBoss) ? tierOf(entity, 'numidium', 1) : null;
  if (gear) {
    const now = _now();
    if (now >= _s.gearReady) {
      const cut = Math.round((d * gear.lighter) / 100);
      if (cut > 0) {
        d -= Math.round((d * guardRoom(gear.lighter, 'sets')) / 100);
        _s.gearReady = now + gear.recover;
        sound('gear');
      }
    }
  }
  if (_s.reprieve > 0 && d > 0 && _now() < _s.reprieveUntil && tierOf(entity, 'panoply', 2)) {
    const took = Math.min(_s.reprieve, d);
    _s.reprieve -= took;
    d -= took;
  }
  return d;
}
export function setDeathSave(entity) {
  const v = tierOf(entity, 'malacath', 2);
  // The Bulwark and Brass 6-piece tiers cannot both be worn, so the Brass save runs only without the Bulwark.
  if (!v) return hourTurns(entity);
  const now = _now();
  if (!recovered('unbroken', now)) return false;
  _s.unbrokenReady = now + v.recover;
  spireHold('unbroken');
  _s.halvedUntil = now + v.halved;
  _s.recovering.add('unbroken');
  say(`Unbroken! Damage halved for ${v.halved} s.`);
  sound('unbroken');
  return true;
}

function hourTurns(entity) {
  const v = tierOf(entity, 'numidium', 2);
  if (!v) return false;
  const now = _now();
  if (!recovered('hour', now)) return false;
  _s.hourReady = now + v.recover;
  spireHold('hour');
  _s.hourHeal = v.heal;
  _s.recovering.add('hour');
  sound('hour');
  return true;
}

// The damage door takes the blow mark as it opens, so a blow it swallows never leaves a mark for the next hurt.
let _pending = null;
// A world boss strikes through its own door, not the struck tail, so it carries no enemy mark. Only Gearward reads
// this boss mark.
let _bossBlowAt = -Infinity, _pendingBoss = false;
export function setBossStruck() { _bossBlowAt = _now(); }
// Spire enemies strike through the dungeon door, not the struck tail. Only Shed Skin and the Reprieve read it.
let _spireBlowAt = -Infinity, _pendingSpire = false;
export function setSpireStruck() { _spireBlowAt = _now(); }
function setDoorOpen(entity) {
  if (!entity?.isPlayer || entity.peer) return;
  _pending = landedBlow();
  _pendingBoss = _now() - _bossBlowAt <= BLOW_WINDOW_S;
  _bossBlowAt = -Infinity;
  _pendingSpire = _now() - _spireBlowAt <= BLOW_WINDOW_S;
  _spireBlowAt = -Infinity;
}
export const pendingPlayerBlow = () => (_pending ? { attacker: _pending.attacker } : null);
const _landed = new Map();
export function registerPlayerBlowLanded(name, fn) { if (typeof fn === 'function') _landed.set(name, fn); else _landed.delete(name); }

export function setHurt(entity, { before, after, saved = false }) {
  if (!entity?.isPlayer || entity.peer) return;
  const blow = _pending, spire = _pendingSpire;
  _pending = null;
  _pendingBoss = false;
  _pendingSpire = false;
  if (saved && _s.hourHeal > 0) {
    const share = _s.hourHeal;
    _s.hourHeal = 0;
    const max = entity?.maxHealth;
    const healed = max > 0 ? healMine(entity, (max * share) / 100) : 0;
    say(healed > 0 ? `The Hour Turns! ${healed} health returns.` : 'The Hour Turns!');
  }
  if (!blow && spire) { shed(entity, before, after, saved); reprieve(entity, before, after, saved); return; }
  if (!blow) return;
  if (before - after > 0) for (const fn of _landed.values()) { try { fn(entity, blow.attacker, before - after); } catch { } }
  spite(entity, blow, before - after);
  if (before - after > 0) bloodied(entity);
  shed(entity, before, after, saved);
  reprieve(entity, before, after, saved);
  veil(entity, before, after, saved);
  const v = tierOf(entity, 'ruhn', 2);
  const max = entity?.maxHealth;
  if (!v || !(max > 0) || !(after > 0)) return;
  const line = max * WRATH_BELOW;
  if (!(before >= line && after < line)) return;
  const now = _now();
  if (now < _s.wrathReady) return;
  _s.wrathReady = now + v.recover;
  _s.wrathUntil = now + WRATH_SECONDS;
  _s.recovering.add('wrath');
  const struck = nova(v.nova);
  say(struck ? `Wrath of the Warden! ${struck} ${struck === 1 ? 'foe' : 'foes'} struck.` : 'Wrath of the Warden!');
  sound('wrath');
}
function bloodied(entity) {
  const t = awakeTiersOf(entity);
  if (!t) return;
  const now = _now();
  if (t.get('oath')?.[1]) _s.riposteUntil = now + RIPOSTE_SECONDS;
  if (t.get('orcsbane')?.[1]) {
    _s.blood = Math.min(BLOOD_STACKS, bloodStacks(now) + 1);
    _s.bloodUntil = now + BLOOD_SECONDS;
  }
}

// A killing blow that a death save turned aside (`saved`) triggers none of the hurt-line powers.
function shed(entity, before, after, saved = false) {
  const v = tierOf(entity, 'coilscale', 2);
  const max = entity?.maxHealth;
  if (!v || !(max > 0) || !(after > 0) || saved) return;
  const line = max * SHED_BELOW;
  if (!(before >= line && after < line)) return;
  const now = _now();
  if (!recovered('shed', now)) return;
  _s.shedReady = now + v.recover;
  spireHold('shed');
  _s.recovering.add('shed');
  const healed = healMine(entity, (max * v.heal) / 100);
  say(healed > 0 ? `Shed Skin! ${healed} health returns.` : 'Shed Skin!');
  sound('shed');
}

export const VEIL_TEXT = Object.freeze({
  spell: () => t('starfall.set.veilSpell', 'Mephala\'s Veil'),
  chip: () => t('starfall.set.veilChip', 'Veil'),
  proc: (/** @type {number} */ s) => t('starfall.set.veil', 'Mephala\'s Veil! Chameleon for {s} s.', { s }),
  ready: () => t('starfall.set.veilReady', 'Mephala\'s Veil is ready again.'),
});
export const veilBundle = (rounds) => ({ ...eventideBundle(rounds), name: VEIL_TEXT.spell() });
function veil(entity, before, after, saved = false) {
  const v = tierOf(entity, 'starspun', 2);
  const max = entity?.maxHealth;
  if (!v || !(max > 0) || !(after > 0) || saved) return;
  const line = max * VEIL_BELOW;
  if (!(before >= line && after < line)) return;
  const now = _now();
  if (now < _s.veilReady) return;
  const door = playerDoor();
  if (!door?.castOnPlayer) return;
  _s.veilReady = now + v.recover;
  _s.recovering.add('veil');
  door.castOnPlayer(veilBundle(v.rounds));
  say(VEIL_TEXT.proc(v.rounds * ROUND_SECONDS));
  sound('veil');
}

function reprieve(entity, before, after, saved = false) {
  const v = tierOf(entity, 'panoply', 2);
  const max = entity?.maxHealth;
  if (!v || !(max > 0) || !(after > 0) || saved) return;
  const line = max * REPRIEVE_BELOW;
  if (!(before >= line && after < line)) return;
  const now = _now();
  if (!recovered('reprieve', now)) return;
  _s.reprieveReady = now + v.recover;
  spireHold('reprieve');
  _s.recovering.add('reprieve');
  const points = Math.max(1, Math.round((max * v.shield) / 100));
  _s.reprieve = points;
  _s.reprieveUntil = now + REPRIEVE_SECONDS;
  const shared = shieldAllies(Math.round(points * REPRIEVE_ALLY_SHARE));
  say(shared ? `Battlemage's Reprieve! A ${points}-point shield, and ${shared} ${shared === 1 ? 'ally' : 'allies'} shielded.` : `Battlemage's Reprieve! A ${points}-point shield.`);
  sound('reprieve');
}
// Each player's own client owns their vitals, so the ally share goes out as a Shield spell cast at that ally.
let _allies = null;
/**
 * @param {{ near?: ((metres: number) => any[]) | null, shield?: ((ally: any, spell: any) => boolean) | null } | null} [door]
 */
export function setSetPowersAllies(door = null) {
  _allies = typeof door?.near === 'function' && typeof door?.shield === 'function' ? { near: door.near, shield: door.shield } : null;
}
// The magnitude is the shield pool and must fit the cast frame's byte. The duration gets one extra round, as with
// Eventide.
export const reprieveBundle = (points) => ({
  name: "Battlemage's Reprieve", rangeType: 0, element: 4, icon: 0,
  effects: [{
    type: 35, subType: 255, durationBase: Math.ceil(REPRIEVE_SECONDS / ROUND_SECONDS) + 1, durationMod: 0, durationPerLevel: 1,
    chanceBase: 0, chanceMod: 0, chancePerLevel: 1,
    magnitudeBaseLow: Math.max(1, Math.min(CAST_SETTING_MAX, Math.round(points) || 0)), magnitudeBaseHigh: Math.max(1, Math.min(CAST_SETTING_MAX, Math.round(points) || 0)),
    magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1,
  }],
});
function shieldAllies(points) {
  if (!_allies || !(points > 0)) return 0;
  let near = [];
  try { near = _allies.near(REPRIEVE_METRES) ?? []; } catch { return 0; }
  let n = 0;
  for (const ally of near) { try { if (_allies.shield(ally, reprieveBundle(points))) n++; } catch { } }
  return n;
}

// In an Elite Breach a spent death save is held until the next Redoubt is taken, not its timer. Outside that
// breach, the power's own timer applies again.
let _spireRoom = () => null;
export function setSpireRecovery(fn) { _spireRoom = typeof fn === 'function' ? fn : () => null; }
const spireRoom = () => { try { const r = _spireRoom(); return r == null || r === false ? null : r; } catch { return null; } };
const SPIRE_SAVES = Object.freeze({ unbroken: 'unbrokenReady', hour: 'hourReady', shed: 'shedReady', reprieve: 'reprieveReady' });
function spireHold(k) { const room = spireRoom(); if (room != null) _s.spireHeld.set(k, room); else _s.spireHeld.delete(k); }
const spireHeld = (k) => { const room = _s.spireHeld.get(k); return room !== undefined && room === spireRoom(); };
const recovered = (k, now) => now >= _s[SPIRE_SAVES[k]] && !spireHeld(k);
// lootPowers.js imports this file, so its death saves recover at a Redoubt through this registry. A test reset
// keeps it.
/** @type {Map<string, () => void>} */
const _spireRedoubts = new Map();
export function registerSpireRedoubt(key, fn) { if (typeof fn === 'function') _spireRedoubts.set(key, fn); else _spireRedoubts.delete(key); }
export const spireRoomNow = () => spireRoom();
export function spireRedoubtTaken() {
  for (const field of Object.values(SPIRE_SAVES)) _s[field] = 0;
  _s.spireHeld.clear();
  for (const fn of _spireRedoubts.values()) { try { fn(); } catch { } }
}

function nova(n) {
  const door = playerDoor();
  const feet = door?.feet();
  if (!door || !feet) return 0;
  let struck = 0;
  for (const f of door.foes()) {
    if (f.dead || !f.ai?.feet || flat2(f.ai.feet, feet) > NOVA_METRES || spared(f)) continue;
    if (rise(f.ai.feet, feet) > REACH_RISE_M || fireProof(f.entity)) continue;
    if (door.clear && !door.clear(feet, f.ai.feet)) continue;
    door.hurtFoe(f, n);
    struck++;
  }
  return struck;
}

// One round more than named, because an effect ends at its Nth round tick on the shared clock and could end early.
export const eventideBundle = (rounds) => ({
  name: 'Eventide', rangeType: 0, element: 4,
  effects: [{
    type: 23, subType: 0, durationBase: Math.max(1, rounds | 0) + 1, durationMod: 0, durationPerLevel: 1,
    chanceBase: 1, chanceMod: 1, chancePerLevel: 1,
    magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1,
  }],
});
// Matches Renown's rule: city watch and my own allies never count as kills.
const neverCounts = (entity) => entity?.mobileType === KNIGHT_CITY_WATCH || entity?.team === 'PlayerAlly' || entity?.mobileTeam === 'PlayerAlly';
export function setKill(entity = null) {
  if (neverCounts(entity)) return;
  const door = playerDoor();
  const me = door?.player?.();
  const t = awakeTiersOf(me);
  if (!t) return;
  const now = _now();
  if (t.get('dagon')?.[2]) {
    const had = rampageStacks(now);
    _s.rampage = Math.min(RAMPAGE_STACKS, had + 1);
    _s.rampageUntil = now + RAMPAGE_SECONDS;
    if (_s.rampage > had) say(`Rampage ${'I'.repeat(_s.rampage)}`);
  }
  const noc = t.get('nocturnal')?.[2];
  if (noc && now >= _s.eventideReady) {
    _s.eventideReady = now + noc.recover;
    _s.recovering.add('eventide');
    door.castOnPlayer(eventideBundle(noc.rounds));
    say('Eventide! Nocturnal\'s shadows take you.');
    sound('eventide');
  }
  if (entity && _s.marked === entity) _s.markUntil = 0;
  if (entity) _s.coils.delete(entity);
  if (entity) _s.strands.delete(entity);
  if (t.get('thieftaker')?.[2]) markNext(door, entity, now);
  const harvest = t.get('wyrd')?.[2];
  if (harvest && me && now >= _s.harvestReady) {
    _s.harvestReady = now + harvest.recover;
    _s.recovering.add('harvest');
    healMine(me, ((me.maxHealth ?? 0) * harvest.heal) / 100);
    manaMine(me, ((me.maxMagicka ?? 0) * harvest.heal) / 100);
    say(HARVEST_TEXT.proc(harvest.heal));
    sound('harvest');
  }
  const hide = t.get('orcsbane')?.[2];
  if (hide && now >= _s.wardReady) {
    _s.ward = hide.ward;
    _s.wardReady = now + hide.recover;
    _s.recovering.add('ward');
    say(`Iron Hide! The next ${hide.ward} damage is blocked.`);
    sound('ward');
  }
}
function markNext(door, killed, now) {
  const feet = door.feet?.();
  if (!feet) return;
  let best = null, reach = MARK_METRES;
  for (const f of door.foes()) {
    if (f.dead || f.entity === killed || !f.entity || !f.ai?.feet || spared(f) || rise(f.ai.feet, feet) > REACH_RISE_M) continue;
    const d = flat2(f.ai.feet, feet);
    if (d > reach || door.clear?.(feet, f.ai.feet) === false) continue;
    reach = d; best = f;
  }
  if (!best) return;
  const had = markedFoe(now);
  _s.marked = best.entity;
  _s.markUntil = now + MARK_SECONDS;
  if (had === best.entity) return;
  say('No Escape! The nearest enemy is marked.');
  sound('mark');
}

export function setCastCost(entity, sp) {
  const v = tierOf(entity, 'mora', 1);
  return v ? (sp * (100 - v.less)) / 100 : sp;
}
export const setAbsorbChance = (target) => tierOf(target, 'mora', 2)?.absorb ?? 0;

const READY = Object.freeze({
  unbroken: { at: () => _s.unbrokenReady, line: 'Unbroken is ready again.', set: 'malacath', tier: 2 },
  wrath: { at: () => _s.wrathReady, line: 'Wrath of the Warden is ready again.', set: 'ruhn', tier: 2 },
  eventide: { at: () => _s.eventideReady, line: 'Eventide is ready again.', set: 'nocturnal', tier: 2 },
  ward: { at: () => _s.wardReady, line: 'Iron Hide is ready again.', set: 'orcsbane', tier: 2, spent: () => !(_s.ward > 0) },
  shed: { at: () => _s.shedReady, line: 'Shed Skin is ready again.', set: 'coilscale', tier: 2 },
  hour: { at: () => _s.hourReady, line: 'The Hour Turns is ready again.', set: 'numidium', tier: 2 },
  reprieve: { at: () => _s.reprieveReady, line: 'Battlemage\'s Reprieve is ready again.', set: 'panoply', tier: 2 },
  harvest: { at: () => _s.harvestReady, get line() { return HARVEST_TEXT.ready(); }, set: 'wyrd', tier: 2 },
  veil: { at: () => _s.veilReady, get line() { return VEIL_TEXT.ready(); }, set: 'starspun', tier: 2 },
});
export function setRound(entity) {
  if (!entity?.isPlayer || entity.peer || !_s.recovering.size) return;
  const now = _now();
  for (const k of [..._s.recovering]) {
    const r = READY[k];
    if (now < r.at() || spireHeld(k)) continue;
    _s.recovering.delete(k);
    if (tierOf(entity, r.set, r.tier) && (!r.spent || r.spent())) say(r.line);
  }
}

export const SIGIL_SETS_POWER = 'sigilSets';
registerEntityFold(SIGIL_SETS_POWER, setFold);
registerWeaponBlowMod(SIGIL_SETS_POWER, setBlow);
registerPlayerStruckListener(SIGIL_SETS_POWER, setStruck);
registerPlayerStrikeListener(SIGIL_SETS_POWER, setStrike);
registerPlayerDamageMod(SIGIL_SETS_POWER, setDamageMod);
registerPlayerDeathSave(SIGIL_SETS_POWER, setDeathSave);
registerPlayerHurtListener(SIGIL_SETS_POWER, setHurt);
registerPlayerDoorOpen(SIGIL_SETS_POWER, setDoorOpen);
setFoeBlowProbe(() => _pending != null);
registerPlayerKillListener(SIGIL_SETS_POWER, setKill);
registerSpellCostMod(SIGIL_SETS_POWER, setCastCost);
registerAbsorptionChance(SIGIL_SETS_POWER, setAbsorbChance);
registerMagicRoundHook(SIGIL_SETS_POWER, setRound);
registerPlayerCastListener(SIGIL_SETS_POWER, setCast);

export function setPowerStates(now = _now()) {
  const left = (t) => Math.max(0, Math.ceil(t - now));
  return {
    rampage: rampageStacks(now), rampageLeft: rampageStacks(now) ? left(_s.rampageUntil) : 0,
    halvedLeft: left(_s.halvedUntil), unbrokenLeft: left(_s.unbrokenReady),
    wrathLeft: left(_s.wrathUntil), wrathRecoverLeft: left(_s.wrathReady),
    eventideLeft: left(_s.eventideReady),
    riposteLeft: left(_s.riposteUntil), blood: bloodStacks(now), bloodLeft: bloodStacks(now) ? left(_s.bloodUntil) : 0,
    markLeft: markedFoe(now) ? left(_s.markUntil) : 0, ward: _s.ward, wardRecoverLeft: left(_s.wardReady),
    coil: coilStacks(now), coilLeft: coilStacks(now) ? left(_s.coils.get(_s.coilFoe).until) : 0, shedRecoverLeft: left(_s.shedReady),
    gearLeft: left(_s.gearReady), hourRecoverLeft: left(_s.hourReady),
    armed: _s.armed, reprieve: now < _s.reprieveUntil ? _s.reprieve : 0, reprieveLeft: now < _s.reprieveUntil && _s.reprieve > 0 ? left(_s.reprieveUntil) : 0,
    reprieveRecoverLeft: left(_s.reprieveReady), redoubt: Object.keys(SPIRE_SAVES).filter(spireHeld),
    harvestRecoverLeft: left(_s.harvestReady),
    strands: strandCount(now), veilRecoverLeft: left(_s.veilReady),
  };
}

export const CHIP_TIER = 2;
export function setHudChips(entity, now = _now()) {
  const t = awakeTiersOf(entity);
  if (!t) return [];
  const st = setPowerStates(now);
  const time = (n) => (n >= 60 ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` : `${n}s`);
  const held = new Set(st.redoubt);
  const wait = (k, n) => (held.has(k) ? 'Redoubt' : time(n));
  const out = [];
  if (t.get('dagon')?.[2] && st.rampage) out.push({ key: 'rampage', set: 'dagon', name: `Rampage ${'I'.repeat(st.rampage)}`, text: time(st.rampageLeft), state: 'active' });
  if (t.get('malacath')?.[2]) {
    if (st.halvedLeft) out.push({ key: 'unbroken', set: 'malacath', name: 'Unbroken', text: time(st.halvedLeft), state: 'active' });
    else if (st.unbrokenLeft || held.has('unbroken')) out.push({ key: 'unbroken', set: 'malacath', name: 'Unbroken', text: wait('unbroken', st.unbrokenLeft), state: 'recovering' });
  }
  if (t.get('ruhn')?.[2]) {
    if (st.wrathLeft) out.push({ key: 'wrath', set: 'ruhn', name: 'Wrath', text: time(st.wrathLeft), state: 'active' });
    else if (st.wrathRecoverLeft) out.push({ key: 'wrath', set: 'ruhn', name: 'Wrath', text: time(st.wrathRecoverLeft), state: 'recovering' });
  }
  if (t.get('nocturnal')?.[2] && st.eventideLeft) out.push({ key: 'eventide', set: 'nocturnal', name: 'Eventide', text: time(st.eventideLeft), state: 'recovering' });
  if (t.get('thieftaker')?.[2] && st.markLeft) out.push({ key: 'mark', set: 'thieftaker', name: 'No Escape', text: time(st.markLeft), state: 'active' });
  if (t.get('orcsbane')?.[2]) {
    if (st.ward) out.push({ key: 'ward', set: 'orcsbane', name: 'Iron Hide', text: String(st.ward), state: 'active' });
    else if (st.wardRecoverLeft) out.push({ key: 'ward', set: 'orcsbane', name: 'Iron Hide', text: time(st.wardRecoverLeft), state: 'recovering' });
  }
  if (t.get('coilscale')?.[2] && (st.shedRecoverLeft || held.has('shed'))) out.push({ key: 'shed', set: 'coilscale', name: 'Shed Skin', text: wait('shed', st.shedRecoverLeft), state: 'recovering' });
  if (t.get('numidium')?.[2] && (st.hourRecoverLeft || held.has('hour'))) out.push({ key: 'hour', set: 'numidium', name: 'The Hour Turns', text: wait('hour', st.hourRecoverLeft), state: 'recovering' });
  if (t.get('panoply')?.[2]) {
    if (st.reprieve) out.push({ key: 'reprieve', set: 'panoply', name: 'Reprieve', text: String(st.reprieve), state: 'active' });
    else if (st.reprieveRecoverLeft || held.has('reprieve')) out.push({ key: 'reprieve', set: 'panoply', name: 'Reprieve', text: wait('reprieve', st.reprieveRecoverLeft), state: 'recovering' });
  }
  if (t.get('wyrd')?.[2] && st.harvestRecoverLeft) out.push({ key: 'harvest', set: 'wyrd', name: HARVEST_TEXT.name(), text: time(st.harvestRecoverLeft), state: 'recovering' });
  if (t.get('starspun')?.[2] && st.veilRecoverLeft) out.push({ key: 'veil', set: 'starspun', name: VEIL_TEXT.chip(), text: time(st.veilRecoverLeft), state: 'recovering' });
  for (const c of out) c.tier = CHIP_TIER;
  return out;
}

export function _setSetPowersClockForTests(fn) { _now = typeof fn === 'function' ? fn : () => performance.now() / 1000; }
export function _resetSetPowersForTests() { _s = fresh(); _carry = new WeakMap(); _blow = null; _bossBlowAt = -Infinity; _pendingBoss = false; _spireBlowAt = -Infinity; _pendingSpire = false; _holdOwed = 0; _say = (line) => { hudText(line); }; _sound = null; _allies = null; _spireRoom = () => null; }
import '../combat/meleeCleave.js';
