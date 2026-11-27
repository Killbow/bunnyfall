// @ts-check
import { SKILLS } from './skills.js';
import { martialAwake, MARTIAL_NUMBERS, MARTIAL_BY_ID, signatureById, martialWords } from './martialPaths.js';
import './weaponMastery.js';
import { sigilDueling } from '../items/sigil.js';
import { registerEntityFold, registerWeaponBlowMod, newMods, EMPTY_MODS } from './entityMods.js';
import { blowRoom, guardRoom } from './powerCeiling.js';
import { registerPlayerDamageMod, registerPlayerHurtListener, registerPlayerBlowEvasion, playerEntity } from './playerEntity.js';
import { registerPlayerStrikeListener } from '../combat/formulas.js';
import { registerPlayerKillListener } from '../player/playerKills.js';
import { registerMagicRoundHook } from '../world/worldTick.js';
import { registerSwingPaceMod } from './weaponStates.js';
import { registerTechniqueLandedListener, registerTechniqueUsedListener } from '../combat/technique/techniqueBlow.js';
import { foeUnaware } from '../combat/playerWeapon.js';
import { pendingPlayerBlow } from '../items/sigilSetPowers.js';
import { healMine } from '../player/playerHeal.js';
import { playerDoor, oweFoe } from '../player/playerDoor.js';
import { foeGroup, TOLL_REFUND_S } from '../items/lootPowers.js';
import { regenShare } from '../worldEvents/courtRules.js';
import { maxFatigue } from './statMods.js';
import { showFollowUp } from '../ui/hitNumbers.js';
import { KNIGHT_CITY_WATCH } from './mobileTypes.js';
import { healthShare } from '../combat/healthShare.js';
import { hudText } from '../ui/notify.js';
import { t } from '../ui/textManager.js';

const N = MARTIAL_NUMBERS;
export const MARTIAL_BLOW_MOST = 40;

let _now = () => performance.now() / 1000;
let _rand = Math.random;
const fresh = () => ({
  flow: 0, flowUntil: 0,
  rhythmUntil: 0,
  rallyUntil: 0,
  quickUntil: 0,
  evadeUntil: 0,
  guardUntil: 0, guardOwed: 0,
  leechUntil: 0,
  standReady: 0,
  marks: new WeakMap(),
  dazed: new WeakMap(),
  struck: new WeakSet(),
  uses: new WeakMap(),
  felling: new WeakMap(),
});
let _s = fresh();
let _carry = new WeakMap();
let _say = (line) => { hudText(line); };
export function setMartialPowersVoice({ say = null } = {}) { if (typeof say === 'function') _say = say; }
const say = (line) => { try { _say(line); } catch { } };

export function awakeMartialId(entity) {
  if (sigilDueling() || entity?.isInBeastForm) return null;
  return martialAwake(entity)?.id ?? null;
}
const me = () => playerDoor()?.player?.() ?? playerEntity;
const share = (e) => healthShare(e) ?? 1;
const undeadOrDaedra = (e) => { const g = foeGroup(e); return g === 'undead' || g === 'daedra'; };
const neverCounts = (e) => e?.mobileType === KNIGHT_CITY_WATCH || e?.team === 'PlayerAlly' || e?.mobileTeam === 'PlayerAlly';
const foeOf = (target) => !!target && !target.isPlayer && !target.warded;
const flowStacks = (now = _now()) => (now < _s.flowUntil ? _s.flow : 0);

function fatigueMine(entity, pct) {
  if (!entity || !Number.isFinite(entity.fatigue) || !(pct > 0)) return;
  const most = maxFatigue(entity);
  if (most > 0) entity.fatigue = Math.min(most, entity.fatigue + Math.round((most * pct) / 100));
}
function again(entity, amount, word) {
  const n = Math.max(1, Math.round(amount));
  const door = playerDoor();
  const f = door?.foes?.().find((x) => x.entity === entity) ?? null;
  if (!f?.dead) showFollowUp(n, word, entity);
  if (f) { if (!f.dead) door.hurtFoe(f, n); return; }
  oweFoe(entity, n);
}
function castOnMe(name, type, subType, rounds) {
  const bundle = { name, rangeType: 0, element: 4, effects: [{
    type, subType, durationBase: Math.max(1, rounds | 0) + 1, durationMod: 0, durationPerLevel: 1,
    chanceBase: 1, chanceMod: 0, chancePerLevel: 1,
    magnitudeBaseLow: 0, magnitudeBaseHigh: 0, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1,
  }] };
  try { playerDoor()?.castOnPlayer?.(bundle, { power: true }); } catch { }
}

export function martialBlowPct(attacker, target, info = null) {
  const id = awakeMartialId(attacker);
  if (!id) return 0;
  const now = _now();
  let pct = 0;
  switch (id) {
    case 'blademaster': pct += N.flowingSteel.pct * flowStacks(now); break;
    case 'warblade': if (now < _s.rallyUntil) pct += N.rallyingCleave.pct; break;
    case 'ranger':
      if (foeGroup(target) === 'animal') pct += N.huntersInstinct.pct;
      if (now < (_s.marks.get(target) ?? 0)) pct += N.huntersMark.pct;
      break;
    case 'cutthroat': if (info?.unaware) pct += N.cheapShot.pct; break;
    case 'assassin': if (!_s.struck.has(target)) pct += N.openingStrike.pct; break;
    case 'berserker': if (share(attacker) < N.frenzy.below) pct += N.frenzy.pct; break;
    case 'crusader': if (undeadOrDaedra(target)) pct += N.purge.pct; break;
    default: break;
  }
  return Math.min(MARTIAL_BLOW_MOST, pct);
}
export function martialBlow(weapon, damage, attacker, target, info) {
  if (!(damage > 0) || !attacker?.isPlayer || attacker.peer || !foeOf(target)) return damage;
  const pct = blowRoom(martialBlowPct(attacker, target, info), 'martial');
  if (!(pct > 0)) return damage;
  const key = weapon ?? attacker;
  const exact = (damage * pct) / 100 + (_carry.get(key) ?? 0);
  const more = Math.floor(exact + 1e-9);
  if (!info?.estimate) _carry.set(key, Math.max(0, exact - more));
  return damage + more;
}
export function martialStrike(attacker, target, damage, weapon = null, info = null) {
  if (!(damage > 0) || !attacker?.isPlayer || attacker.peer || !foeOf(target)) return;
  const id = awakeMartialId(attacker);
  const now = _now();
  if (id === 'blademaster' && info?.blow !== false) { _s.flow = Math.min(N.flowingSteel.stacks, flowStacks(now) + 1); _s.flowUntil = now + N.flowingSteel.seconds; }
  if (id === 'berserker' && now < _s.leechUntil) healMine(attacker, ((Number.isFinite(target.health) ? Math.min(damage, Math.max(0, target.health)) : damage) * N.savageWhirl.leech) / 100);
  _s.struck.add(target);
}

export function martialPace(ctx) {
  const e = ctx?.entity;
  const id = awakeMartialId(e);
  if (!id) return 0;
  const now = _now();
  switch (id) {
    case 'warblade': return now < _s.rhythmUntil ? N.warRhythm.pct : 0;
    case 'bladedancer': return now < _s.quickUntil ? N.cyclone.pace : 0;
    case 'berserker': return share(e) < N.frenzy.below ? N.frenzy.pace : 0;
    default: return 0;
  }
}

export function martialGuardPct(entity) {
  const id = awakeMartialId(entity);
  const blow = id ? pendingPlayerBlow() : null;
  if (!blow) return 0;
  const now = _now();
  switch (id) {
    case 'vanguard': return N.ironDiscipline.lighter;
    case 'juggernaut': return now < _s.guardUntil ? N.earthsplitter.lighter : 0;
    case 'brawler': return blow.attacker && now < (_s.dazed.get(blow.attacker) ?? 0) ? N.knockout.lighter : 0;
    default: return 0;
  }
}
export function martialDamageMod(entity, dmg) {
  const pct = martialGuardPct(entity);
  if (!(pct > 0) || !(dmg > 0)) return dmg;
  const owed = (dmg * guardRoom(pct, 'martial')) / 100 + _s.guardOwed;
  const cut = Math.floor(owed + 1e-9);
  _s.guardOwed = owed - cut;
  return Math.max(0, dmg - cut);
}
export function martialEvade(entity) {
  const id = awakeMartialId(entity);
  if (!id || !pendingPlayerBlow()) return false;
  const oneIn = id === 'bladedancer' ? N.dancersStep.oneIn : id === 'shadowdancer' && _now() < _s.evadeUntil ? N.phantomStrike.oneIn : 0;
  if (!(oneIn > 0) || !(_rand() < 1 / oneIn)) return false;
  say(t('martial.say.evade', 'You dodge the attack.'));
  return true;
}
/**
 * @param {any} entity
 * @param {{ before?: number, after?: number, saved?: boolean }} [hurt]
 */
export function martialHurt(entity, { before = 0, after = 0, saved = false } = {}) {
  if (awakeMartialId(entity) !== 'juggernaut' || saved || !(after > 0) || !(entity.maxHealth > 0)) return;
  const line = entity.maxHealth * N.standFirm.below;
  const now = _now();
  if (!(after < line && before >= line) || now < _s.standReady) return;
  _s.standReady = now + N.standFirm.recover;
  healMine(entity, (entity.maxHealth * N.standFirm.heal) / 100);
  say(t('martial.say.standFirm', 'Stand Firm: you hold your ground.'));
}
export function martialRound(entity) {
  if (awakeMartialId(entity) !== 'brawler') return;
  if (entity.health > 0 && entity.health < entity.maxHealth) { const held = regenShare((entity.maxHealth * N.grit.health) / 100, 'grit', entity); if (held > 0) healMine(entity, held); }
  fatigueMine(entity, N.grit.fatigue);
}
export function martialKill(foe) {
  if (!foe || neverCounts(foe)) return;
  const m = me();
  const id = awakeMartialId(m);
  if (id === 'warblade') _s.rhythmUntil = _now() + N.warRhythm.seconds;
  else if (id === 'bloodletter') healMine(m, (m.maxHealth * N.bloodlust.health) / 100);
  else if (id === 'woodsman') {
    fatigueMine(m, N.tireless.fatigue);
    const at = _s.felling.get(foe);
    if (at !== undefined && _now() - at <= TOLL_REFUND_S) { healMine(m, (m.maxHealth * N.fellingStrike.heal) / 100); _s.felling.delete(foe); }
  }
}
export function martialFold(entity) {
  const id = awakeMartialId(entity);
  if (id !== 'shadowdancer' && id !== 'windrunner') return EMPTY_MODS;
  const mods = newMods();
  if (id === 'shadowdancer') {
    mods.stats.agility = N.lightStep.agility;
    mods.skills[SKILLS.Dodging] = N.lightStep.dodging;
  } else {
    mods.stats.speed = N.windborne.speed;
    mods.skills[SKILLS.Running] = N.windborne.running;
    mods.skills[SKILLS.Jumping] = N.windborne.jumping;
  }
  return mods;
}

function foeOfUse(use, foe) {
  if (!use || typeof use !== 'object') return 1;
  let u = _s.uses.get(use);
  if (!u) { u = { n: 0, foes: new WeakSet() }; _s.uses.set(use, u); }
  if (u.foes.has(foe)) return 0;
  u.foes.add(foe);
  return ++u.n;
}
/**
 * @param {{ id?: string, entity?: any }} [press]
 */
export function martialUsed({ id = '', entity = null } = {}) {
  const form = signatureById(id);
  const path = awakeMartialId(entity);
  if (!form || !path || form.path !== path) return;
  const now = _now();
  switch (path) {
    case 'warblade': _s.rallyUntil = now + N.rallyingCleave.seconds; break;
    case 'bladedancer': _s.quickUntil = now + N.cyclone.seconds; break;
    case 'shadowdancer': _s.evadeUntil = now + N.phantomStrike.seconds; break;
    case 'juggernaut': _s.guardUntil = now + N.earthsplitter.seconds; break;
    case 'berserker': _s.leechUntil = now + N.savageWhirl.seconds; break;
    default: break;
  }
}
/**
 * @param {{ blow?: any, foe?: any, damage?: number }} [landing]
 */
export function martialLanded({ blow = null, foe = null, damage = 0 } = {}) {
  const form = signatureById(blow?.id);
  const m = me();
  const id = awakeMartialId(m);
  if (!form || !id || form.path !== id) return;
  const target = foe?.entity;
  if (!foeOf(target) || neverCounts(target)) return;
  const landed = Number.isFinite(damage) && damage > 0 ? damage : 0;
  if (!landed) return;
  const now = _now();
  const name = MARTIAL_BY_ID[id].technique.name;
  switch (id) {
    case 'blademaster': again(target, landed * N.thousandCuts.share, name); break;
    case 'vanguard': { const k = foeOfUse(blow.use, target); if (k && k <= N.judgement.foes) healMine(m, (m.maxHealth * N.judgement.heal) / 100); break; }
    case 'ranger': _s.marks.set(target, now + N.huntersMark.seconds); break;
    case 'bloodletter': if (share(target) < N.guttingLunge.below) again(target, landed, name); break;
    case 'cutthroat': if (foeUnaware(foe)) again(target, landed * (N.blackjack.times - 1), name); break;
    case 'assassin': if (foeOfUse(blow.use, target) === 1) castOnMe(name, 23, 0, N.vanishingStrike.rounds); break;
    case 'woodsman': _s.felling.set(target, now); break;
    case 'crusader': if (undeadOrDaedra(target)) again(target, landed * N.hallowedStrike.share, name); break;
    case 'brawler': _s.dazed.set(target, now + N.knockout.seconds); break;
    case 'windrunner': { const k = foeOfUse(blow.use, target); if (k && k <= N.windstrike.foes) fatigueMine(m, N.windstrike.fatigue); break; }
    default: break;
  }
}

export const MARTIAL_POWERS = 'martialPowers';
registerWeaponBlowMod(MARTIAL_POWERS, martialBlow);
registerPlayerStrikeListener(MARTIAL_POWERS, martialStrike);
registerSwingPaceMod(MARTIAL_POWERS, martialPace);
registerPlayerDamageMod(MARTIAL_POWERS, martialDamageMod);
registerPlayerBlowEvasion(MARTIAL_POWERS, martialEvade);
registerPlayerHurtListener(MARTIAL_POWERS, martialHurt);
registerMagicRoundHook(MARTIAL_POWERS, martialRound);
registerPlayerKillListener(MARTIAL_POWERS, martialKill);
registerEntityFold(MARTIAL_POWERS, martialFold);
registerTechniqueLandedListener(MARTIAL_POWERS, martialLanded);
registerTechniqueUsedListener(MARTIAL_POWERS, martialUsed);

const NO_CHIPS = Object.freeze([]);
export function martialHudChips(entity, now = _now()) {
  if (awakeMartialId(entity) !== 'blademaster') return NO_CHIPS;
  const n = flowStacks(now);
  if (!n) return NO_CHIPS;
  const name = martialWords('blademaster')?.passiveName ?? '';
  return [{ key: 'flowing-steel', set: 'martial', name: `${name} ${n}`, text: `${Math.max(0, Math.ceil(_s.flowUntil - now))}s`, state: 'active' }];
}

export function _resetMartialPowersForTests() { _s = fresh(); _carry = new WeakMap(); _say = (line) => { hudText(line); }; _now = () => performance.now() / 1000; _rand = Math.random; }
export function _setMartialPowersClockForTests(fn) { _now = typeof fn === 'function' ? fn : () => performance.now() / 1000; }
export function _setMartialPowersRandForTests(fn) { _rand = typeof fn === 'function' ? fn : Math.random; }
