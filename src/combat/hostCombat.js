// Combat and spawn rules shared by the four scene hosts, ported from DFU, with no scene state of their own.
import { plainFoeLootRule, capFoeLoot, plainFoeRarityWeights, capLootList } from '../items/foeLootCap.js';
import { renownLootQuarters, lootEased } from '../items/renownLoot.js';
import { SKILLS, tallySkill, skillValue, SKILL_NAMES } from '../characters/skills.js';
import { effectiveLevel } from '../characters/mentorMode.js';
import { vampireAttackVoice } from '../afflictions/vampirism.js';
import { liveLycanthropy } from '../afflictions/lycanthropy.js';
import {
  ENEMY_GROUPS, dice100,
  enemyKnockbackApplies, weaponKnockbackSpeed, enemyWeightClassicUnits,
} from './formulas.js';
import { combatVoicesEnabled, ATTACK_VOICE_CHANCE, PAIN_VOICE_CHANCE, combatVoice, playerVoice, rollVoiceRace, isHeavyDamage } from './combatVoices.js';
import { RACES } from '../characters/races.js';
import { assignEnemyStartingEquipment, equipmentVariantFor, equipmentItems } from './enemyEquipment.js';
import { rollEnemyWeaponPoison } from '../afflictions/poisons.js';
import { EQUIP_SLOTS, equipTableOf, getEquipSlot } from '../characters/equip.js';
import { generateItems, addEnemyLootExtras, enemyLootTableKey, createRandomWeapon, createRandomArmor, isLootKept } from '../items/loot.js';
import { isAmmunition } from '../items/itemTemplates.js';
import { enemyLootSpawned } from '../characters/enemyEntity.js';
import { conditionBasedPricesOn, randomConditionLootItems } from '../mods/rriRealism.js';
import { isHumanoid } from '../systems/survival/loot.js';
import { rollCorpseLoot, lootRarityOn, rarityRank, RARITIES, rarityEligible, applyRarity, lastPass, stampWonWeapons } from '../items/lootRarity.js';
import { championOf } from '../characters/champions.js';
import { isGoldPieces, ARROW_TEMPLATE } from '../items/inventory.js';
import { bonusShare, rollBonusSupplies, ROOM_BASE_QUARTERS } from '../items/roomLoot.js';
import { wildFoeLoot } from '../world/wildZone.js';
import { liveStat, FATIGUE_DRAIN_SCALE } from '../characters/statMods.js';
import { GLOBAL_SCALE } from '../world/meshReader.js';
import { swingSoundFor, hitSoundFor, ENEMY_HIT_VOLUME, SOUND } from '../audio/soundClips.js';
import { bloodCentre } from './hitEffects.js';
import { bloodHit } from './bloodDecals.js';
import { KNIGHT_CITY_WATCH } from '../characters/mobileTypes.js';
import { ATTRACT_RADIUS, ignoreHumanSounds, attractStep } from '../characters/enemySounds.js';
import { enemyDisplayName, ENEMY_BASICS, isClassEnemyId } from '../characters/enemyBasics.js';
import { getLocalizedEnemyName } from '../ui/textManager.js';
import { windupHolds, windupStruck, tacticsNow, overreachOpen, poiseTrack, LOCAL_TARGET } from '../ai/tactics.js';
import { blowK, blowWeight, behind, poiseOf, TELL } from '../ai/tells.js';
import { noteFeud, feudWeakBlow } from '../revenants/feudLedger.js';
import { BLOW } from '../ai/blowShapes.js';
import { blowEffectOf, queueBlowEffect, drainBlowEffects, tickBleed } from './blowEffects.js';
import { BLOW_VERDICT_LIFE } from '../ai/foeBlows.js';
import { markFoeThreat, setFoePoiseReader } from '../ui/hudFoeTarget.js';
import { HIT_TAGS, tagHit, showWord } from '../ui/hitNumbers.js';
import { comprehendLanguagesChance } from '../magic/effects.js';

export { weaponSkillUsed } from '../characters/weapons.js';
import { weaponSkillUsed } from '../characters/weapons.js';
import { monsterVolume, companionVolume } from '../audio/monsterVolume.js';

// The attack skill comes from the weapon template, never the display name, which magic items rename.
export function attackSkillOf(weapon) {
  return weaponSkillUsed(weapon?.templateIndex) ?? SKILLS.HandToHand;
}

export const isBowWeapon = (weapon) => attackSkillOf(weapon) === SKILLS.Archery;

// From the mobile's flags only (EnemyMotor.cs): AssignEnemyStartingEquipment never rolls a bow.
export const hasBowAttack = (basics) =>
  !!basics?.hasRangedAttack1 && (!basics?.castsMagic || !!basics?.hasRangedAttack2);

const HUMANOID_LOOT_ITEM_SCALE = 0.25;
const PLAIN_FOE_LOOT_KEEP = 0.75;
const PLAIN_FOE_LOOT_KEEP_BEFORE = 0.5;
export const plainFoeLootKeep = (quarters = renownLootQuarters()) => lootEased(PLAIN_FOE_LOOT_KEEP_BEFORE, PLAIN_FOE_LOOT_KEEP, quarters);
const eliteLooted = (entity) => !!(entity?.eliteFoe || entity?.elite || championOf(entity));
// SetEnemyCareer's loot chain in DFU's order, rolled on the player's level and gender.
export function spawnEnemyLoot(entity, mobileType, basics, player, { rolls = Math.random, lootDropMult = 1, lootQualityMult = 1, where = null, quarters = renownLootQuarters(), luck = liveStat(player, 'luck'), find = undefined, rejects = null } = {}) {
  const itemChanceScale = (isHumanoid(entity) ? HUMANOID_LOOT_ITEM_SCALE : 1) * lootDropMult;
  const ease = quarters;
  entity.items = generateItems(enemyLootTableKey(mobileType, basics?.lootTableKey ?? '-'), { level: effectiveLevel(player), gender: player.gender }, rolls, { itemChanceScale, mobileType });
  const eq = equipEnemy(entity, mobileType, effectiveLevel(player), rolls, { player });
  addEnemyLootExtras(entity.items, basics, rolls, { quarters: ease, mobileType });
  const keep = plainFoeLootKeep(ease);
  if (!eliteLooted(entity)) entity.items = entity.items.filter((it) => { if (isGoldPieces(it) || isLootKept(it) || rolls() < keep) return true; rejects?.push(it); return false; });
  if (conditionBasedPricesOn()) randomConditionLootItems([...new Set([...entity.items, ...(eq?.worn ?? [])])], rolls);
  // OnLootSpawned fires here, after the trio and with the worn kit already in the items.
  enemyLootSpawned.raise({ mobileType, lootTableKey: enemyLootTableKey(mobileType, basics?.lootTableKey ?? '-'), items: entity.items, worn: eq?.worn ?? [], where, rolls, roller: player });
  const plain = plainFoeLootRule(entity, basics);
  if (plain) entity.lootCap = plain.cap;
  rollCorpseLoot(entity, basics, { rolls, luck, find, qualityMult: lootQualityMult, weights: plain?.plainLadder ? plainFoeRarityWeights(ease) : null, level: effectiveLevel(player) });
  capFoeLoot(entity);
  return entity.items;
}

export function rollRoomBonus({ rolls, player, pile = false, deepPile = false, rejects = [], basics = null, mobileType = null, champion = null, level = 1, lootCap = null, baseItems = [], fighters = 1 }) {
  const own = renownLootQuarters();
  let pieces = [];
  if (!pile) {
    const share = bonusShare(plainFoeLootKeep(ROOM_BASE_QUARTERS), plainFoeLootKeep(own));
    for (const r of rejects) if (rolls() < share) pieces.push(structuredClone(r));
    const key = basics?.lootTableKey;
    if (key && key !== '-') rollBonusSupplies(pieces, 'enemy', ROOM_BASE_QUARTERS, own, rolls);
    if (pieces.length) {
      const body = { items: pieces, level, mobileType, champion };
      rollCorpseLoot(body, basics, { rolls, luck: liveStat(player, 'luck'), weights: Number.isInteger(lootCap) ? plainFoeRarityWeights(own) : null });
      pieces = body.items;
    }
  } else if (deepPile) rollBonusSupplies(pieces, 'pile', ROOM_BASE_QUARTERS, own, rolls);
  stampWonWeapons(pieces, fighters, { rolls });
  if (Number.isInteger(lootCap)) capLootList(pieces, Math.max(0, lootCap - baseItems.filter((it) => !(it?.group === 'Weapons' && it.templateIndex === ARROW_TEMPLATE)).length));
  return pieces;
}

export function wildLootAfter(entity) {
  const m = wildFoeLoot(entity);
  if (m === 1) return;
  for (const it of entity?.items ?? []) if (isGoldPieces(it)) it.stackCount = Math.max(1, Math.round(Math.max(1, it.stackCount ?? 1) * m));
}

// DFU runs the equipment chain by careerIndex before the class arm.
export function equipEnemy(entity, mobileType, playerLevel, rolls = Math.random, { player = null } = {}) {
  const variant = equipmentVariantFor(entity.careerIndex, entity.isClass, rolls);
  if (variant === null) return null;
  const eq = assignEnemyStartingEquipment(entity, variant, playerLevel, { player, rolls });
  entity.armorValues = eq.armorValues;
  entity.weapon = eq.rightHand;
  // The spawn rolls the weapon poison unless the equipment arm already rolled it in its own place.
  if (entity.weapon && !eq.poisonRolled) {
    const pt = rollEnemyWeaponPoison(eq.poisonClass ?? mobileType, playerLevel, rolls);
    if (pt != null) entity.weapon.poisonType = pt;
  }
  entity.items = entity.items ?? [];
  const all = equipmentItems(eq);
  const worn = eq.worn ?? all;
  eq.worn = worn;
  const droppable = isHumanoid(entity) ? all.filter(() => rolls() < HUMANOID_LOOT_ITEM_SCALE) : all;
  entity.items.push(...droppable);
  // Every rolled piece is worn too, because DamageEquipment reads the enemy's equip table.
  const slots = equipTableOf(entity);
  for (const it of worn) {
    const slot = getEquipSlot(entity, it);
    if (slot === EQUIP_SLOTS.None || slots[slot]) continue;
    slots[slot] = it;
  }
  return eq;
}

// Spent on every swing that reaches the hit frame, hit or miss.
export const SWING_WEAPON_FATIGUE_LOSS = 11;
export const SWING_FATIGUE_COST = Math.trunc(SWING_WEAPON_FATIGUE_LOSS * FATIGUE_DRAIN_SCALE);

export function tallySwingSkills(player, weapon, weight = 1) {
  const w = Number.isFinite(weight) ? Math.max(0, Math.min(1, weight)) : 1;
  if (w < 1 && player && typeof player === 'object') {
    const owed = (_swingTallyCarry.get(player) ?? 0) + w;
    _swingTallyCarry.set(player, owed >= 1 - 1e-9 ? Math.max(0, owed - 1) : owed);
    if (owed < 1 - 1e-9) return;
  }
  tallySkill(player, attackSkillOf(weapon), 1);
  tallySkill(player, SKILLS.CriticalStrike, 1);
}
const _swingTallyCarry = new WeakMap();

// DFU tallies inside the chance calculation, so every back-facing swing counts a use whether or not it lands.
export function backstabChanceOf(player, isEnemyFacingAwayFromPlayer, foe = null) {
  if (!isEnemyFacingAwayFromPlayer) return 0;
  if (foe?.entity?.revenant?.edge?.watchful === true) return 0;
  tallySkill(player, SKILLS.Backstabbing, 1);
  return skillValue(player, SKILLS.Backstabbing);
}

export const PARRY_1 = 428;
export const PARRY_SOUND_COUNT = 9;
// A parry plays at 1.1 and a miss at the default 1 (EnemySounds.cs), so the two arms differ in volume.
export const PARRY_VOLUME = 1.1;

/** @returns {{sound:number, at:'player'|'enemy'}|null} */
export function zeroDamageHitSound({ weapon = null, arrowHit = false, parrySounds = false, roll = 0 } = {}) {
  if ((!arrowHit && !parrySounds) || !weapon) return { sound: swingSoundFor(weapon), at: 'player' };
  if (parrySounds) return { sound: PARRY_1 + Math.floor(roll * PARRY_SOUND_COUNT), at: 'enemy' };
  return null;
}

export const enemyMissSound = (weapon) => swingSoundFor(weapon);

export { KNIGHT_CITY_WATCH } from '../characters/mobileTypes.js';

const foeVoiceGender = (f) =>
  (f.gender === 'female' && f.mobileType !== KNIGHT_CITY_WATCH ? 'female' : 'male');

const foeVoiceRace = (f, rolls) => (f.voiceRace ??= rollVoiceRace(rolls));

export function enemyAttackVoice(f, rolls = Math.random) {
  if (!combatVoicesEnabled() || !f.entity?.isClass) return null;
  if (!dice100(ATTACK_VOICE_CHANCE, rolls())) return null;
  return combatVoice({ race: foeVoiceRace(f, rolls), gender: foeVoiceGender(f), isAttack: true, rolls });
}

export function enemyHeavyPainVoice(f, rolls = Math.random) {
  if (!f) return null;
  const gender = (f.gender === 'male' || f.mobileType === KNIGHT_CITY_WATCH) ? 'male' : 'female';
  return combatVoice({ race: foeVoiceRace(f, rolls), gender, isAttack: false, heavyDamage: true, rolls });
}

export function enemyPainVoice(f, damage, rolls = Math.random) {
  if (!combatVoicesEnabled() || !f.entity?.isClass || damage <= 0) return null;
  if (!dice100(PAIN_VOICE_CHANCE, rolls())) return null;
  return combatVoice({
    race: foeVoiceRace(f, rolls), gender: foeVoiceGender(f), isAttack: false,
    heavyDamage: isHeavyDamage(damage, f.entity.maxHealth ?? 0), rolls,
  });
}

export const suppressOptionalCombatVoices = (entity) => !!liveLycanthropy(entity)?.isTransformed;

// The player's grunt reads the race and gender sound directly, so the NPC-only High Elf voice swap does not apply.
export function playerAttackGrunt(playerEntity, isBow, rolls = Math.random) {
  if (!combatVoicesEnabled() || suppressOptionalCombatVoices(playerEntity) || isBow) return null;
  if (!dice100(ATTACK_VOICE_CHANCE, rolls())) return null;
  const vamp = vampireAttackVoice(playerEntity, rolls);
  if (vamp != null) return { clip: vamp, pitchLift: 0 };
  return playerVoice({
    race: RACES[playerEntity.race] ?? 1, gender: playerEntity.gender ?? 'male', isAttack: true, rolls,
  });
}

export function playerClimbStrain(playerEntity, rolls = Math.random) {
  if (!playerEntity || !combatVoicesEnabled() || suppressOptionalCombatVoices(playerEntity)) return null;
  const vamp = vampireAttackVoice(playerEntity, rolls);
  if (vamp != null) return { clip: vamp, pitchLift: 0 };
  return playerVoice({
    race: RACES[playerEntity.race] ?? 1, gender: playerEntity.gender ?? 'male', isAttack: true, rolls,
  });
}

export function playerPainVoice(playerEntity, damage, rolls = Math.random) {
  if (!combatVoicesEnabled() || suppressOptionalCombatVoices(playerEntity) || !(damage > 0)) return null;
  if (!dice100(PAIN_VOICE_CHANCE, rolls())) return null;
  return playerVoice({
    race: RACES[playerEntity.race] ?? 1,
    gender: playerEntity.gender ?? 'male',
    isAttack: false,
    heavyDamage: isHeavyDamage(damage, playerEntity.maxHealth ?? 0),
    rolls,
  });
}

export function playPlayerVoice(audio, voice) {
  if (!voice || !(voice.clip >= 0)) return null;
  audio?.playOneShot?.(voice.clip, 1, 1 + (voice.pitchLift ?? 0));
  return voice.clip;
}

export { CORPSE_ACTIVATION_DISTANCE } from '../player/activate.js';

export function enemySoundOccluded(collider, feet, playerFeet) {
  if (!collider?.raycast || !playerFeet) return false;
  const dx = playerFeet[0] - feet[0], dy = playerFeet[1] - feet[1], dz = playerFeet[2] - feet[2];
  const d = Math.hypot(dx, dy, dz);
  if (!(d > 1e-6)) return false;
  const hit = collider.raycast(feet, [dx / d, dy / d, dz / d], d);
  return Number.isFinite(hit) && hit < d - 1e-3;
}

export function tickEnemySound(source, feet, playerFeet, dt, { audio = null, collider = null, hearing = 1, companion = false } = {}) {
  if (!source || !feet) return null;
  const dx = (playerFeet?.[0] ?? 0) - feet[0];
  const dy = (playerFeet?.[1] ?? 0) - feet[1];
  const dz = (playerFeet?.[2] ?? 0) - feet[2];
  const dist = playerFeet ? Math.hypot(dx, dy, dz) : Infinity;
  const out = source.tick(attractStep(source, dt, companion), dist, () => enemySoundOccluded(collider, feet, playerFeet), { companion });
  if (out) playEnemyClip(audio, out, feet, hearing, companion ? companionVolume() : 1);
  return out;
}

export function playEnemyClip(audio, out, feet, hearing = 1, scale = 1) {
  if (!out || out.clip == null) return null;
  if (!(scale > 0)) return null;
  audio?.play3d?.(out.clip, [feet[0], feet[1] + 1, feet[2]], out.volume * monsterVolume() * scale,
    { maxDistance: ATTRACT_RADIUS * hearing, distanceModel: 'linear' });
  return out.clip;
}

export function applyDamageToNonPlayer(attacker, target, {
  weapon = null, direction = null, bowAttack = false,
  dealDamage, calculateAttackDamage, audio = null, rolls = Math.random,
  hitEffects = null,
  // The formula clears the weapon's poison either way, so a caller without onInflictPoison loses the dose.
  onInflictPoison = null, say = null,
} = {}) {
  if (!target || !attacker) return 0;
  const aEnt = attacker.entity, tEnt = target.entity;
  // The monster multi-attack gate reads the player's Reflexes setting even in a strike between two enemies.
  const damage = calculateAttackDamage(aEnt, tEnt, { weapon, rolls, playerReflexes: attacker.attack?.reflexes ?? null, onInflictPoison, say });
  if (damage > 0 && attacker.breakConcealment) attacker.breakConcealment();
  const at = target.ai?.feet ?? [0, 0, 0];
  const mid = [at[0], at[1] + (target.ai?.height ?? 1.8) / 2, at[2]];
  if (damage > 0) {
    audio?.play3d?.(hitSoundFor(weapon), at, ENEMY_HIT_VOLUME, { maxDistance: 16 });
    hitEffects?.showBloodSplash?.(tEnt?.basics?.bloodIndex ?? 0, bloodCentre(at, target.ai?.height ?? 1.8), null, bloodHit(damage, tEnt));
    if (target.ai && !tEnt?.staffBoss && !windupHolds(target.ai) && enemyKnockbackApplies(target.ai.knockbackSpeed ?? 0, aEnt?.isClass,
      tEnt?.basics?.weight)) {
      const w = enemyWeightClassicUnits(tEnt?.isClass, tEnt?.gender, tEnt?.basics?.weight, tEnt?.items);
      if (w > 0) {
        target.ai.knockbackSpeed = weaponKnockbackSpeed(damage, w);
        target.ai.knockbackDir = direction ?? target.ai.knockbackDir;
      }
    }
    const v = enemyPainVoice(target, damage, rolls);
    if (v && v.clip >= 0) audio?.play3d?.(v.clip, mid, 1, { maxDistance: 16 });
  } else {
    const parries = !!tEnt?.basics?.parrySounds;
    const z = zeroDamageHitSound({ weapon, arrowHit: bowAttack, parrySounds: parries, roll: rolls() });
    if (z) {
      const where = z.at === 'enemy' ? at : (attacker.ai?.feet ?? at);
      audio?.play3d?.(z.sound, where, z.at === 'enemy' ? PARRY_VOLUME : 1, { maxDistance: 16 });
    }
  }
  dealDamage?.(target, damage);
  target.ai?.makeEnemyHostileToAttacker?.(attacker, attacker.ai?.feet ?? null);
  return damage;
}

// One rule for the three damage doors, asked where each one writes DFU's knockback.
export function windupDoor(f, damage, { kind = 'melee', weapon = null, round = false, peer = false, striker = null, from = null, claws = false, weight = 0, wc = null, fromPlayer = true, element = null, abilityControl = null } = {}, fx = {}) {
  const mine = fromPlayer && !peer && !striker;
  if (f?.ai && overreachOpen(f.ai)) {
    const word = windupStruck(f.ai, f.entity, typeof weight === 'function' ? weight() : weight, 0);
    windupFeedback(word, f, fx);
    if (mine) { windupTag(word, f, true); feudNoteWord(word, f, false); }
    return word;
  }
  if (!f?.ai || !windupHolds(f.ai)) return null;
  const blow = f.ai._tac.blow;
  const k = peer ? (wc ? wc.k : blowK({ kind, round, peer }))
    : striker
      ? blowK({ kind, weapon: striker.entity?.weapon ?? null, claws: !isClassEnemyId(striker.mobileType ?? 0), round, peer })
      : blowK({ kind, weapon, claws, round, peer });
  const back = peer ? !!wc?.back : behind(blow.origin, blow.yaw, from);
  const watchful = f.entity?.revenant?.edge?.watchful === true;
  const weak = peer ? !!wc?.weak : !round && feudWeakBlow(f.entity, { kind, weapon: striker ? (striker.entity?.weapon ?? null) : weapon, element, attacker: striker?.entity ?? (fromPlayer ? { isPlayer: true } : null) });
  const v = blowWeight(damage, k, { back: back && !watchful, weak });
  const w = typeof weight === 'function' ? weight() : weight;
  const extra = mine && damage > 0 && abilityControl?.poiseShare
    ? (Number.isFinite(blow.poise) ? blow.poise : poiseOf(f.entity, w)) * abilityControl.poiseShare : 0;
  const word = windupStruck(f.ai, f.entity, w, v + extra);
  windupFeedback(word, f, fx);
  if (mine) { windupTag(word, f, false); feudNoteWord(word, f, back); }
  return word;
}
function feudNoteWord(word, f, back) {
  if (word === 'stagger') noteFeud(f?.entity, 'staggers');
  if (back) noteFeud(f?.entity, 'backHits');
}
export function windupTag(word, f, open) {
  const tag = word === 'stagger' ? HIT_TAGS.stagger : word === 'hold' ? HIT_TAGS.hold : (open && !word) ? HIT_TAGS.open : null;
  if (tag) tagHit(f?.entity ?? null, tag);
  return tag;
}
setFoePoiseReader((f) => poiseTrack(f?.ai));
export function windupFeedback(word, f, { audio = null, hitEffects = null, shake = null, rolls = Math.random } = {}) {
  if (!word || !f?.ai) return;
  const at = bloodCentre(f.ai.feet, f.ai.height ?? 1.8);
  const basics = ENEMY_BASICS[f.mobileType];
  if (word === 'stagger') {
    hitEffects?.showMissEffect?.('clang', at, { scale: 2.5 });
    audio?.play3d?.(SOUND.Hit2, at, 1, { maxDistance: 16 });
    if (basics?.barkSound != null && (!isClassEnemyId(f.mobileType) || (f.mobileType === KNIGHT_CITY_WATCH && !f.quietVoice))) audio?.play3d?.(basics.barkSound, at, 1, { maxDistance: 16, pitch: 0.7 });
    shake?.(0.6);
  } else if (word === 'hold' && basics?.parrySounds) {
    audio?.play3d?.(PARRY_1 + Math.floor(rolls() * PARRY_SOUND_COUNT), at, PARRY_VOLUME, { maxDistance: 16 });
  }
}

const NO_CUES = Object.freeze([]);
let _windupAtMe = null;
export function setWindupAtMeListener(fn) { _windupAtMe = typeof fn === 'function' ? fn : null; }
export function tellCues(f, audio, hearing = 1, now = tacticsNow()) {
  const ai = f?.ai;
  if (!ai) return null;
  const s = ai._tac, b = s?.state === 'windup' ? s.blow : s?.state === 'dash' ? s.dash?.blow ?? null : null;
  const c = f._tellCue ?? (f._tellCue = { blow: null, released: false, land: false, seq: 0 });
  if (!b && !c.blow && !c.land) return NO_CUES;
  const played = [];
  const at = [ai.feet[0], ai.feet[1] + 1, ai.feet[2]];
  const play = (clip, pitch, volume = 1) => {
    if (clip == null) return;
    audio?.play3d?.(clip, at, volume, { maxDistance: ATTRACT_RADIUS * hearing, distanceModel: 'linear', pitch });
    played.push(clip);
  };
  const row = ENEMY_BASICS[f.mobileType];
  if (b && c.blow !== b) {
    c.blow = b; c.released = false; c.land = false;
    if (s.key === LOCAL_TARGET) { markFoeThreat(f); try { _windupAtMe?.(f, b); } catch { } }
    if (!b.feint) {
      if (ignoreHumanSounds(f.mobileType) || f.quietVoice) play(SOUND.SwingMediumPitch, b.windPitch ? TELL.WIND_CLASS_PITCH * (b.windPitch / TELL.WIND_PITCH) : TELL.WIND_CLASS_PITCH, TELL.WIND_CLASS_VOLUME);
      else play(row?.barkSound, b.windPitch ?? TELL.WIND_PITCH);
    }
  }
  if (b && !c.released && now >= b.land - TELL.RELEASE_LEAD) { c.released = true; play(SOUND.SwingLowPitch, TELL.RELEASE_PITCH); }
  if (b) c.seq = f.mobile?.meleeSeq ?? 0;
  else if (c.blow) {
    const landed = ai._blowLandedAt != null && ai._blowLandedAt >= c.blow.land - 1e-6;
    c.land = (landed && c.blow.kind !== 'aimed' && c.blow.kind !== 'pyre' && (ai._blowHold === false || ai._blowHold === 'spent'))
      || c.blow.cut != null;
    if (landed && ai._perfectAt != null && ai._perfectAt >= c.blow.land - 1e-6) { play(SOUND.Parry6, TELL.PERFECT_PITCH); showWord(HIT_TAGS.perfect, 'perfect'); }
    c.blow = null;
  }
  if (c.land && (f.mobile?.meleeSeq ?? 0) !== c.seq) {
    c.land = false;
    if (!ignoreHumanSounds(f.mobileType)) play(row?.attackSound, 1);
  }
  return played;
}

export function landBlowEffect(f, dmg, playerFeet, now = tacticsNow()) {
  const w = f?.ai?._blowFx;
  if (!w) return null;
  f.ai._blowFx = null;
  if (!(dmg > 0) || now - w.at > BLOW_VERDICT_LIFE || !playerFeet) return null;
  const fx = blowEffectOf(w.kind, w.iron);
  queueBlowEffect(fx, dmg, [playerFeet[0] - f.ai.feet[0], playerFeet[2] - f.ai.feet[2]], f.entity ?? null);
  return fx;
}

export function playerBlowFrame({ motor = null, entity = null, shake = null, hurt = null } = {}) {
  drainBlowEffects({ motor, entity, shake });
  if (entity && hurt) tickBleed(entity, hurt);
}

export function takeAimedShot(ai) {
  const shot = ai?._blowShot;
  if (!shot?.fired) return null;
  ai._blowShot = null;
  return shot;
}
export function aimedDirection(dir, shot) {
  if (!shot || !Number.isFinite(shot.yaw)) return dir;
  const h = Math.hypot(dir[0], dir[2]);
  return [Math.sin(shot.yaw) * h, dir[1], Math.cos(shot.yaw) * h];
}
export function aimedArrowMeta(shot) {
  return shot ? { aimed: true, speedScale: BLOW.aimed.speed } : null;
}
export function aimedBlowInfo(m) { return m?.aimed ? AIMED_INFO : null; }
const AIMED_INFO = Object.freeze({ aimed: true });

/**
 * @param {Iterable} foes
 * @returns {number}
 */
export function makeEnemiesHostile(foes) {
  let flipped = 0;
  for (const f of foes ?? []) {
    if (!f || f.dead || !f.ai) continue;
    if (!f.ai.isHostile) flipped++;
    f.ai.isHostile = true;
  }
  return flipped;
}

export function tryLanguagePacification(ai, entity, mobileType, playerEntity, {
  sheathed = false, enemyLanguageSkill, calculateEnemyPacification, say = () => {}, isQuestFoe = false,
} = {}) {
  if (!ai?.justEncountered) return null;
  // The first-encounter edge is spent whatever happens next.
  ai.justEncountered = false;
  if (isQuestFoe) return null;
  if (entity?.pacifyImmune) return null;
  const lang = enemyLanguageSkill(entity);
  if (lang === -1) return null;
  // Handed in because formulas.js cannot import effects.js without a cycle.
  const comprehend = comprehendLanguagesChance(playerEntity);
  if (calculateEnemyPacification(playerEntity, lang, sheathed, undefined, comprehend)) {
    ai.isHostile = false;
    say(`${getLocalizedEnemyName(mobileType, enemyDisplayName(mobileType) ?? 'The enemy')} is pacified by your ${SKILL_NAMES[lang]} skill.`);
    tallySkill(playerEntity, lang, 3);
    return { pacified: true, lang };
  }
  // A failed roll still tallies a monster tongue; Etiquette and Streetwise get nothing for being ignored.
  if (lang !== SKILLS.Etiquette && lang !== SKILLS.Streetwise) tallySkill(playerEntity, lang, 1);
  return { pacified: false, lang };
}

