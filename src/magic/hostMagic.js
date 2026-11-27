// The player-cast engine every host shares: readied spells, the four range arms, landings, bursts, and missiles.

import { combatAbilityBusy } from '../combat/abilities/rig.js';
import { FlatAnimator, armFlatAnim, MISSILE_FPS } from '../render/flatAnimation.js';
import { effectiveLevel } from '../characters/mentorMode.js';
import { hasSpellbook } from './spellMaker.js';
const NO_SPELLBOOK_TEXT = 'You have no spellbook!';
import {
  missileArchive, MISSILE_SPEED, MISSILE_COLLIDER_RADIUS, missileReach, missileHitsFoe,
  MISSILE_LIFESPAN_S, EXPLOSION_RADIUS, BODY_CAPSULE_RADIUS, pickTouchTarget, sweepFoes, sphereOverlapsCapsule,
  missileHitsCapsule, PLAYER_BODY_RADIUS,
} from './spellcast.js';
import { corpsePrefabStruck } from '../characters/corpseMarker.js';
import { toBoxLocal } from '../systems/naval/navalBallistics.js';
import { silenceBlocksCast, silencedText, pressButtonToFireSpellText, DOOR_SPELL_TEXT, SOUL_TRAP_TEXT } from './mysticism.js';
import { calculateCastCost, castSchool, EFFECT_COST_TABLE } from './spellcost.js';
import { tellSpellLanded } from './spellPower.js';
import '../characters/arcanePowers.js';
import '../characters/firmamentPowers.js';
import { createBunnySpellEngine } from './bunnySpellEngine.js';
import { peerHeard } from '../net/peerFx.js';
import { RESCUE_TYPE, spellHas } from './bunnySpellLaw.js';
import { setClairvoyanceProbe } from './clairvoyance.js';
import { applySpell, spellReflectedText, hasActiveEffect, looksBlending, isSoulTrapEffect, spellSways } from './effects.js';
import { spellToFoeOwner } from './enchantments.js';
import { localizedText } from '../ui/textManager.js';
import { potionBundle } from '../items/potions.js';
import { potentEffect, potentOk, scaleEffect } from '../net/alchemyLaw.js';
import { SPELL_CAST_SOUND } from '../characters/enemySpells.js';
import { tallySkill } from '../characters/skills.js';
import { morphSelf } from '../afflictions/lycanthropy.js';
import { allyCastable, allyReachFor, allyCastFrame, allyCastCasterLine, allyCastCasterLineMany, allyCastSpell, PERSON_RADIUS, ALLY_TOUCH_REACH, ALLY_ARM_RADIUS, ALLY_ARMED_LINE, COMPANION_ARMED_LINE, companionCastable, createGiftLineGate } from './allyCast.js'; import { shownSpellName } from '../items/loot.js';
import { hasResurrect, RESURRECT_REACH, RESURRECT_TEXT, pickFallenBody } from './resurrect.js';
import { billboardSize, centredBase } from '../world/rmbFlats.js';
import { betterAmbience } from '../audio/betterAmbience.js';
import { getPref } from '../ui/uiPrefs.js';
import { SpellImpactFx, SpellImpactPass, SPELL_IMPACT_PROGRAMS, elementFxKind, IMPACT_FX_KINDS } from '../render/spellImpactFx.js';
import { warmPrograms } from '../render/warmPrograms.js';
import { startPrograms } from '../render/glProgram.js';
import { createSpellImpactSounds } from './spellImpactSound.js';
import { createMagicCandle } from './magicCandle.js';
import { CAPSULE_HEIGHT } from '../player/motor.js';
import { setPlayerDoor } from '../player/playerDoor.js';
import { tellPlayerCast } from './playerCasts.js';
import { createHitEffects } from '../combat/hitEffects.js';
import { duelSpellOf } from '../combat/duelCombat.js';
import { markPlayerHarm } from '../combat/harmMark.js';
import { knockedDown } from '../combat/blowEffects.js';
import { showFoeWord, broadcastFoeIndicator, STATUS_WORDS, showFoeDamage } from '../ui/spellFeedbackIndicators.js';
import { sparedByPlayer, isShipmate, boutTeammates } from '../combat/friendlyFire.js';
import { coverDistance, coverStep } from '../ai/cover.js';
import { groundAt, groundHit, rayHit } from '../player/groundRay.js';
import { blowTaken } from '../combat/blowTaken.js';
import { noteFeudHarm, elementFeudClass } from '../revenants/feudLedger.js';
import { noteSkillChallenge } from '../characters/skillSoftcap.js';
import { sandSpellRefusal } from '../arena/arenaKit.js';
import { mwViewThirdPerson } from '../player/mwView.js';
import { spellVisualIntensity } from './spellVisualSettings.js';
import { createMwMagicFx } from './mwMagicFx.js';
import { egAllyLook } from '../ui/eliteGates/egAccess.js';
import { CONCEAL_MODE } from '../combat/combatVisuals.js';
import { fpsSpellCasting } from '../combat/fpsSpellCasting.js';
import { spellHandUp, spellHandBusy, tellCastPending, CAST_PRESS } from '../combat/twoHands/spellHand.js';
export { CAST_PRESS };

export const SKY_FIRE_SCALE = 3;
export const SKY_FIRE_HEARD_M = 48;

// Outdoors the ground is not a mesh, so this proxy forwards the ground queries as well as the mesh ray.
/** @param {() => any} live */
export function liveCollider(live) {
  return {
    raycast: (o, d, m) => live().raycast(o, d, m),
    raycastHit: (o, d, m) => live().raycastHit(o, d, m),
    surfaceHit: (o, d, m) => live().surfaceHit(o, d, m),
    groundNormal: (x, z) => live().groundNormal(x, z),
    get heightAt() { return live().heightAt; },
    get surfaceAt() { return live().surfaceAt; },
    get cover() { return live().cover; },
    target: () => live(),
  };
}

export const GROUND_TOUCH_M = 0.02;

function missileSpriteColour(color32) {
  const d = color32?.colors;
  if (!d || !d.length) return null;
  let r = 0, g = 0, b = 0, w = 0;
  let pr = 0, pg = 0, pb = 0, pw = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (!a) continue;
    const R = d[i], G = d[i + 1], B = d[i + 2];
    pr += R * a; pg += G * a; pb += B * a; pw += a;
    const chroma = Math.max(R, G, B) - Math.min(R, G, B);
    if (!chroma) continue;
    const k = a * chroma;
    r += R * k; g += G * k; b += B * k; w += k;
  }
  if (!w) { r = pr; g = pg; b = pb; w = pw; }
  if (!w) return null;
  const peak = Math.max(r, g, b);
  if (peak <= 0) return null;
  return [r / peak, g / peak, b / peak];
}

export function flightStop(collider, pos, unit, reach, stepLen) {
  const radius = reach - stepLen;
  const cs = coverStep(coverDistance(collider, pos, unit, reach), collider.raycast(pos, unit, reach), reach, radius, stepLen);
  const g = groundHit(pos, unit, Math.min(reach, cs.stop), collider);
  if (!(g < cs.stop)) return cs;
  if (g <= radius + GROUND_TOUCH_M) return { stop: g, advance: 1 };
  return { stop: Infinity, advance: Math.min(cs.advance, stepLen > 1e-9 ? Math.min(1, (g - radius) / stepLen) : 1) };
}

/**
 * @param {any} collider
 * @param {number[]} pos
 */
export function impactGround(collider, pos) {
  let ground = pos[1] - 1.2;
  try { const h = collider?.surfaceHit?.(pos, [0, -1, 0], 30) ?? null; if (h && Number.isFinite(h.dist)) ground = pos[1] - h.dist + 0.05; } catch {}
  const t = groundAt(collider, pos[0], pos[2]);
  if (Number.isFinite(t) && t < pos[1] + 0.05 && t + 0.05 > ground) ground = t + 0.05;
  return ground > pos[1] ? pos[1] - 0.05 : ground;
}

/**
 * @param {any} collider
 * @param {number[]} pos
 * @param {number[]} u
 */
export function struckSurface(collider, pos, u) {
  const from = [pos[0] - u[0] * 0.6, pos[1] - u[1] * 0.6, pos[2] - u[2] * 0.6];
  let dist = Infinity, n = null;
  const h = collider?.raycastHit ? collider.raycastHit(from, u, 1.3) : collider?.surfaceHit?.(from, u, 1.3);
  if (h && Number.isFinite(h.dist) && Array.isArray(h.normal) && h.normal.every(Number.isFinite)) { dist = h.dist; n = h.normal; }
  const g = groundHit(from, u, Math.min(1.3, dist), collider);
  if (g < dist) { dist = g; n = collider.groundNormal?.(from[0] + u[0] * g, from[2] + u[2] * g) ?? [0, 1, 0]; }
  if (!n) return null;
  const nd = n[0] * u[0] + n[1] * u[1] + n[2] * u[2];
  return { normal: nd > 0 ? [-n[0], -n[1], -n[2]] : [...n], surfaceAt: [from[0] + u[0] * dist, from[1] + u[1] * dist, from[2] + u[2] * dist] };
}

/**
 * @param {any} collider
 * @param {number[]} a
 * @param {number[]} b
 */
export function burstClear(collider, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], d = Math.hypot(dx, dy, dz);
  if (!(d > 0.05)) return true;
  const eye = [a[0], a[1] + 1, a[2]], dir = [dx / d, dy / d, dz / d];
  return !(rayHit(eye, dir, d, collider) < d - 0.25);
}

export function createPlayerMagic({
  renderer, audio, getTexture, uploadRecord, uploadRecordFrame = null, collider,
  playerEntity, playerSinks, say, surfacePlayer,
  foes, foeSinks, absorbCtx,
  onTeleport = null,
  onIdentify = null,
  onDispel = null,
  onDispelMagic = null,
  onCreateItem = null,
  now = null,
  rolls = Math.random,
  lairHere = null,
  isPuppet = null,
  trapToOwner = spellToFoeOwner,
  onNewReadySpell = null,
  onCastReadySpell = null,
  // Answers true when the hands started, so the cast resolves on the release frame; false resolves it now.
  startCastAnim = null,
  castBusy = () => fpsSpellCasting.isPlayingAnim || fpsSpellCasting.releaseHeld || fpsSpellCasting.recovering,
  allyTarget = null,
  castAtAlly = null,
  fallenTarget = null,
  raiseFallen = null,
  rescueTarget = null,
  rescuePeer = null,
  allyMarks = null,
  peerBodies = null,
  duelMark = null,
  castAtDuel = null,
  bossMark = null,
  castAtBoss = null,
  crystalMarks = null,
  castAtCrystal = null,
  hostMarks = null,
  castAtHost = null,
  boxMarks = null,
  castAtBox = null,
  castRefusal = null,
  companionBodies = null,
  spellRefusal = null,
  giftClockMs = undefined,
  mwMagicFx = null,
}) {
  const spellIntensity = () => spellVisualIntensity(mwViewThirdPerson());
  const mwFx = mwMagicFx ?? createMwMagicFx({ renderer });
  // A cast token is minted at the release and carried by every landing, so passives count one cast once.
  const playerCaster = (cast = null) => ({ entity: playerEntity, sinks: playerSinks, cast });
  const tookOf = (r, before) => { const d = Number.isFinite(r?.damage) ? r.damage : 0; return Number.isFinite(before) ? Math.max(0, Math.min(d, before)) : d; };
  const newCast = (cost) => ({ cost: Number.isFinite(cost) && cost > 0 ? cost : 0 });
  const giftGate = createGiftLineGate(giftClockMs);
  function sayGift(line, fresh = false) { if (line && giftGate(line, fresh)) say(line); }
  let _lastArm = null;
  function sayArm(kind, prev, ...lines) { _lastArm = kind; for (const l of lines) sayGift(l, prev !== kind); }
  function barredHere() {
    let why = null;
    try { why = castRefusal?.() ?? null; } catch { why = null; }
    if (!why) return false;
    readiedSpell = null; readiedFree = false; readiedCost = 0;
    say(why);
    return true;
  }
  function wardedHere(sp) {
    let why = null;
    try { why = spellRefusal?.(sp) ?? sandSpellRefusal(sp); } catch { why = null; }
    if (!why) return false;
    readiedSpell = null; readiedFree = false; readiedCost = 0;
    say(why);
    return true;
  }
  let _doorFeet = null;
  let doorForward = null;
  const _door = Object.freeze({
    foes: () => playerTargets().filter((t) => t && !t.dead && t.entity),
    feet: () => _doorFeet,
    facingYaw: () => doorForward ? Math.atan2(doorForward[0], doorForward[2]) : 0,
    hurtFoe: (t, n) => { if (t && !t.dead && n > 0) foeSinks(t, true)?.hurt?.(Math.round(n), { fromPlayer: true }); },
    castOnPlayer: (bundle, { power = false, placement = null, companionRange = 0 } = {}) => {
      if (!bundle) return;
      applySpellToPlayer(bundle, effectiveLevel(playerEntity) ?? 1, null, {
        bypassSavingThrows: true, bypassChance: true, ...(power ? { powerCast: true } : {}),
      });
      if (placement) bunny.cast(bundle, placement.eye, placement.dir);
      if (companionRange > 0 && _doorFeet) {
        const nearby = companionMarksFor(bundle, false).filter(({ ai }) =>
          Math.hypot(ai.feet[0] - _doorFeet[0], ai.feet[1] - _doorFeet[1], ai.feet[2] - _doorFeet[2]) <= companionRange
          && burstClear(collider, _doorFeet, ai.feet));
        giveToCompanions(nearby, bundle);
      }
    },
    utilityTravel: (action) => {
      if (!onTeleport) return false;
      const refusal = spellRefusal?.({ effects: [{ type: 43, subType: 255 }] });
      if (refusal) { say?.(refusal); return false; }
      return onTeleport(action);
    },
    previewUtilityRefusal: bundle => spellRefusal?.(bundle) ?? sandSpellRefusal(bundle),
    player: () => playerEntity,
    clear: (a, b) => burstClear(collider, a, b),
    say: (line) => say?.(line),
    sfx: (id, at) => audio?.play3d?.(id, at, 1, { maxDistance: 16 }),
    lairHere: (at) => { try { return lairHere?.(at) ?? null; } catch { return null; } },
    isPuppet: (f) => !!f?.puppet || (typeof isPuppet === 'function' && !!isPuppet(f)),
    fx: (recipe, at, o) => { try { fx.technique(recipe, at, o); } catch {} },
  });
  function allyMarksFor(sp, free = readiedFree) {
    if (!allyMarks || !castAtAlly || !sp || free || !allyCastable(sp)) return [];
    let list = null;
    try { list = allyMarks(sp) ?? null; } catch { return []; }
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const q of list) {
      if (!q || typeof q.id !== 'string' || !Array.isArray(q.feet) || q.feet.length !== 3 || !q.feet.every(Number.isFinite)) continue;
      out.push({ ally: true, mate: q.mate !== false, id: q.id, name: q.name ?? 'a party member', dead: false, ai: { feet: q.feet, height: Number.isFinite(q.height) && q.height > 0 ? q.height : CAPSULE_HEIGHT } });
    }
    return out;
  }
  function companionMarksFor(sp, free = readiedFree) {
    if (!companionBodies || !sp || free || !companionCastable(sp)) return [];
    let list = null;
    try { list = companionBodies() ?? null; } catch { return []; }
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const rec of list) {
      const f = rec?.ai?.feet;
      if (!rec || rec.dead || rec._knockedOut || !rec.entity || rec.puppet || !Array.isArray(f) || f.length !== 3 || !f.every(Number.isFinite)) continue;
      out.push({ companion: true, rec, name: rec.entity.name || 'your companion', dead: false, ai: { feet: f, height: Number.isFinite(rec.ai.height) && rec.ai.height > 0 ? rec.ai.height : CAPSULE_HEIGHT } });
    }
    return out;
  }
  // A gift runs with no caster, so it never meets the absorption and reflection chain a cast meets.
  function giveToCompanion(mark, sp, { quiet = false } = {}) {
    const rec = mark?.rec;
    if (!rec || rec.dead || rec._knockedOut || !rec.entity) return false;
    const gift = allyCastSpell({ name: sp?.name, element: sp?.element, effects: sp?.effects, icon: sp?.icon }, { companion: true });
    if (!gift) return false;
    applySpellToFoe(gift, effectiveLevel(playerEntity), rec, null, { allyCast: true }, foeSinks(rec, false));
    if (!quiet) sayGift(allyCastCasterLine(sp.name, mark.name));
    return true;
  }
  function giveToCompanions(marks, sp) {
    const names = [];
    for (const t of marks) if (giveToCompanion(t, sp, { quiet: true })) names.push(t.name);
    const line = allyCastCasterLineMany(sp.name, names);
    if (line) sayGift(line);
    return names.length;
  }
  function companionInReach(eye, dir, reach, sp = readiedSpell) {
    if (!eye || !dir || !(reach > 0)) return null;
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1, ux = dir[0] / l, uy = dir[1] / l, uz = dir[2] / l;
    let best = null, bestT = Infinity;
    for (const m of companionMarksFor(sp)) {
      const [x, y, z] = m.ai.feet;
      const t = (x - eye[0]) * ux + (z - eye[2]) * uz;
      const flat = Math.hypot(ux, uz);
      if (!(flat > 1e-6)) continue;
      const along = t / (flat * flat);
      if (!(along > 0) || along > reach) continue;
      const px = eye[0] + ux * along, py = eye[1] + uy * along, pz = eye[2] + uz * along;
      if (Math.hypot(px - x, pz - z) > PERSON_RADIUS + 0.15 || py < y - 0.2 || py > y + m.ai.height + 0.2) continue;
      if (along >= bestT) continue;
      const hit = collider.raycast(eye, [ux, uy, uz], along);
      if (Number.isFinite(hit) && hit < along - 1e-3) continue;
      if (groundHit(eye, [ux, uy, uz], along, collider) < along - PERSON_RADIUS) continue;
      best = m; bestT = along;
    }
    return best;
  }
  function companionNear(eye, sp) {
    if (!eye) return false;
    for (const m of companionMarksFor(sp)) {
      const [x, y, z] = m.ai.feet;
      const cy = Math.min(Math.max(eye[1], y), y + m.ai.height);
      const off = Math.hypot(eye[0] - x, eye[1] - cy, eye[2] - z);
      if (off <= ALLY_ARM_RADIUS) return true;
    }
    return false;
  }
  function duelMarksFor(sp) {
    if (!duelMark || !castAtDuel || !sp || !duelSpellOf(sp)) return [];
    let q = null;
    try { q = duelMark() ?? null; } catch { return []; }
    const out = [];
    for (const m of Array.isArray(q) ? q : [q]) {
      if (!m || typeof m.id !== 'string' || !Array.isArray(m.feet) || m.feet.length !== 3 || !m.feet.every(Number.isFinite)) continue;
      out.push({ duel: true, id: m.id, name: m.name ?? 'your opponent', dead: false, ai: { feet: m.feet, height: Number.isFinite(m.height) && m.height > 0 ? m.height : CAPSULE_HEIGHT } });
    }
    return out;
  }
  function bossMarksFor(sp) {
    if (!bossMark || !castAtBoss || !sp || !(duelSpellOf(sp) || (sp.effects ?? []).some((e) => e && isSoulTrapEffect(e)) || spellSways(sp))) return [];
    const crystals = [...crystalMarksFor(sp), ...hostMarksFor(sp)];
    let q = null;
    try { q = bossMark() ?? null; } catch { return crystals; }
    if (!q || !Array.isArray(q.feet) || q.feet.length !== 3 || !q.feet.every(Number.isFinite) || !(q.height > 0) || !(q.radius > 0)) return crystals;
    return [{ boss: true, name: q.name ?? '', dead: false, ai: { feet: q.feet, height: q.height, radius: q.radius } }, ...crystals];
  }
  function crystalMarksFor(sp) {
    if (!crystalMarks || !castAtCrystal || !sp || !duelSpellOf(sp)) return [];
    let list = null;
    try { list = crystalMarks() ?? null; } catch { return []; }
    if (!Array.isArray(list)) return [];
    return list.filter((q) => Number.isInteger(q?.c) && Array.isArray(q.feet) && q.feet.length === 3 && q.feet.every(Number.isFinite) && q.height > 0 && q.radius > 0)
      .map((q) => ({ boss: true, crystal: q.c, name: 'Crystal of Oblivion', dead: false, ai: { feet: q.feet, height: q.height, radius: q.radius } }));
  }
  function hostMarksFor(sp) {
    if (!hostMarks || !castAtHost || !sp || !duelSpellOf(sp)) return [];
    let list = null;
    try { list = hostMarks() ?? null; } catch { return []; }
    if (!Array.isArray(list)) return [];
    return list.filter((q) => Number.isInteger(q?.i) && Array.isArray(q.feet) && q.feet.length === 3 && q.feet.every(Number.isFinite) && q.height > 0 && q.radius > 0)
      .map((q) => ({ boss: true, host: q.i, name: q.name || 'Daedra', dead: false, ai: { feet: q.feet, height: q.height, radius: q.radius } }));
  }
  // Nothing lands here; the relay holds the boss's health.
  function giveToBoss(mark, sp, caster = null) {
    if (mark?.crystal != null) { try { return !!castAtCrystal?.(sp, mark.crystal, caster); } catch { return false; } }
    if (mark?.host != null) { try { return !!castAtHost?.(sp, mark.host, caster); } catch { return false; } }
    try { return !!castAtBoss?.(sp, caster); } catch { return false; }
  }
  function boxMarksFor(sp) {
    if (!boxMarks || !castAtBox || !sp || !duelSpellOf(sp)) return [];
    let list = null;
    try { list = boxMarks() ?? null; } catch { return []; }
    return Array.isArray(list) ? list.filter((q) => q?.box && Array.isArray(q.box.c) && Array.isArray(q.box.h)) : [];
  }
  const missileInBox = (pos, box) => { const l = toBoxLocal(box, pos); return l.every((v, i) => Math.abs(v) <= box.h[i] + MISSILE_COLLIDER_RADIUS); };
  // Nothing lands here; the opponent's client resolves the spell.
  function giveToDuel(mark, sp) {
    try { return !!castAtDuel?.(mark.id, sp); } catch { return false; }
  }
  // Nothing lands here; the mate's own client applies the gift.
  function giveToAlly(mark, sp, { quiet = false } = {}) {
    let sent = false;
    try { sent = !!castAtAlly?.(mark.id, allyCastFrame(sp, effectiveLevel(playerEntity), mark.id)); } catch { sent = false; }
    if (sent && !quiet) sayGift(allyCastCasterLine(shownSpellName(sp), mark.name));
    return sent;
  }
  function giveToAllies(marks, sp) {
    const names = [];
    for (const t of marks) if (giveToAlly(t, sp, { quiet: true })) names.push(t.name);
    const line = allyCastCasterLineMany(sp.name, names);
    if (line) sayGift(line);
    return names.length;
  }
  let pendingClickCast = false;
  const setPending = (on) => { pendingClickCast = !!on; tellCastPending(pendingClickCast); };
  let readiedSpell = null;
  let readiedFree = false;
  // As in DFU, the spell is priced once at the ready; every writer of readiedSpell also sets readiedCost.
  let readiedCost = 0;
  // Read by the absorption refund cap when the player's own spell lands back on them.
  let lastCastCost = 0;
  // True from the magicka spend to the release frame; nothing can be readied or cast in that window.
  let castInProgress = false;
  let lastSpell = null;
  // The missile leaves along the live aim at the release frame, as in DFU; firePending feeds it every frame.
  let lastAim = null;
  const missiles = [];
  const flatAnims = new FlatAnimator();
  const batches = [];
  const candleBatches = new Set();
  const addCandleBatch = (batch) => { batches.push(batch); candleBatches.add(batch); };
  const removeCandleBatch = (batch) => {
    candleBatches.delete(batch);
    const i = batches.indexOf(batch);
    if (i >= 0) batches.splice(i, 1);
  };
  const candle = createMagicCandle({ renderer, getTexture, uploadRecord, onSpawn: addCandleBatch, onRetire: removeCandleBatch });
  const peerCandleMounts = new Map();
  const _peerCandleLights = [];
  const mintPeerCandle = () => createMagicCandle({
    renderer, getTexture, uploadRecord, onSpawn: addCandleBatch, onRetire: removeCandleBatch,
  });

  // The impact flash needs the frame uploader, since hitEffects draws under `record#frame` keys.
  const impacts = createHitEffects({
    renderer,
    getTexture,
    uploadRecordFrame,
    onSpawn: (b) => batches.push(b),
    onRetire: (b) => { const i = batches.indexOf(b); if (i >= 0) batches.splice(i, 1); },
  });
  const SPARK_KINDS = [
    { n: 4, v: 4.5, up: 4.5, g: 12, bounce: 0.35, life: 1.1, s: 0.30, fps: 14 },
    { n: 3, v: 3.5, up: 3.0, g: 20, bounce: 0.15, life: 1.0, s: 0.34, fps: 8 },
    { n: 3, v: 2.0, up: 2.0, g: 9,  bounce: 0.05, life: 1.4, s: 0.32, fps: 7 },
    { n: 4, v: 8.0, up: 2.5, g: 8, bounce: 0.5,  life: 0.7, s: 0.24, fps: 24 },
    { n: 4, v: 4.0, up: 3.5, g: 11, bounce: 0.3,  life: 1.1, s: 0.28, fps: 12 },
  ];
  const sparks = [];
  function spawnSparks(m, pos, sc, ground) {
    const k = SPARK_KINDS[Math.max(0, Math.min(4, m.spell.element | 0))];
    for (let i = 0; i < k.n; i++) {
      const a = Math.random() * Math.PI * 2, sp = k.v * (0.4 + Math.random() * 0.6);
      const h = impacts.showFlyingFlat(missileArchive(m.spell.element), pos, { record: 0, fps: k.fps * (0.8 + Math.random() * 0.4), scale: sc * k.s });
      sparks.push({ h, p: [pos[0], pos[1], pos[2]], v: [Math.cos(a) * sp, k.up * (0.3 + Math.random() * 0.7), Math.sin(a) * sp], k, ground, age: 0, life: k.life * (0.7 + Math.random() * 0.5), bounced: false });
    }
  }
  function stepSparks(dt) {
    const d = Math.min(dt, 0.05);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i];
      sp.age += d;
      if (sp.age >= sp.life) { sp.h.retire(); sparks.splice(i, 1); continue; }
      sp.v[1] -= sp.k.g * d;
      sp.p[0] += sp.v[0] * d; sp.p[1] += sp.v[1] * d; sp.p[2] += sp.v[2] * d;
      if (sp.p[1] <= sp.ground) {
        sp.p[1] = sp.ground;
        if (!sp.bounced && sp.k.bounce > 0.1) { sp.v[1] = Math.abs(sp.v[1]) * sp.k.bounce; sp.v[0] *= 0.5; sp.v[2] *= 0.5; sp.bounced = true; }
        else { sp.v[0] = sp.v[1] = sp.v[2] = 0; }
      }
      sp.h.move(sp.p);
    }
  }
  function shiftSparks(o) { for (const sp of sparks) { sp.p[0] += o[0]; sp.p[1] += o[1]; sp.p[2] += o[2]; sp.ground += o[1]; } }
  function clearSparks() { for (const sp of sparks) sp.h.retire(); sparks.length = 0; }

  const fx = new SpellImpactFx();
  const bunny = createBunnySpellEngine({
    collider, foes: () => foes(), playerEntity, say, companions: () => { try { return companionBodies?.() ?? []; } catch { return []; } },
    burstFx: (kind, pos, o) => { landFx(kind, pos, o); }, glowFx: (kind, pos, o) => { try { fx.burst(kind, pos, { ground: impactGround(collider, pos), body: AREA_FX_BODY, ...o }); } catch {} },
    rescueTarget, rescuePeer, casterLevel: () => effectiveLevel(playerEntity),
    getTexture,
    thud: (pos, { sound, heard, shake = 0, peer = false }) => { try { (peer ? peerHeard : (run) => run())(() => impactSounds.play(sound, pos, { heard })); kickFrom(pos, peer ? shake * peerKickShare({ visual: true, casterId: 0 }) : shake); } catch {} },
    now,
    peerMissileGone: (id) => { for (let i = missiles.length - 1; i >= 0; i--) { const m = missiles[i]; if (m.visual && m.casterId === id && m.spell?.rangeType === 4 && m.age < 1.5) { retireMissile(m); missiles.splice(i, 1); } } },
    flats: { fly: (archive, pos, o) => impacts.showFlyingFlat(archive, pos, o), puff: (archive, record, pos, { alpha, ...o } = {}) => impacts.showMissEffect('spell', pos, { archive, record, ...o, conceal: alpha ? allyConceal({ alpha }) : null }) },
  });
  setClairvoyanceProbe(() => hasActiveEffect(playerEntity, 'clairvoyance'));
  let fxPass = null, fxBroken = false;
  if (renderer?.gl && globalThis.requestIdleCallback) void warmPrograms([{ start: () => startPrograms(renderer.gl, SPELL_IMPACT_PROGRAMS), run: () => { if (!fxPass && !fxBroken) fxPass = new SpellImpactPass(renderer.gl); }, need: () => !fxPass && !fxBroken }], { alive: () => !fxBroken });
  const impactSounds = createSpellImpactSounds(audio);
  const _artAsked = new Set();
  function noteElementArt(el) {
    if (!Number.isInteger(el) || el < 0 || el > 4 || _artAsked.has(el) || typeof getTexture !== 'function') return;
    _artAsked.add(el);
    Promise.resolve().then(() => getTexture(missileArchive(el))).then((t) => {
      if (!t?.getColor32 || !t?.getDFBitmap) return;
      const sample = (rec) => { try { return (t.recordCount == null || rec < t.recordCount) ? missileSpriteColour(t.getColor32(t.getDFBitmap(rec, 0), 0)) : null; } catch { return null; } };
      const c = sample(1) ?? sample(0);
      if (c) fx.setArtColour(elementFxKind(el), c);
    }).catch(() => {});
  }
  const HEAL_FX_TYPES = new Set([10, 18]);
  function fxKindOf(spell) {
    if (!spell) return 'magic';
    try { if (allyCastable(spell) && (spell.effects ?? []).some((e) => e && HEAL_FX_TYPES.has(e.type))) return 'heal'; } catch {}
    return elementFxKind(spell.element);
  }
  const AREA_FX_BODY = Object.freeze({ r: BODY_CAPSULE_RADIUS, h: 1.8 });
  function landFx(kind, pos, { back = null, scale = 1, power = 1, radius = null, minR = 0, heard = 40, shake = 0, ground = null, area = 0, areaFrom = null, normal = null, surfaceAt = null } = {}) {
    try {
      if (kind !== 'heal') noteElementArt(IMPACT_FX_KINDS.indexOf(kind));
      const gy = Number.isFinite(ground) ? ground : impactGround(collider, pos);
      fx.burst(kind, pos, { ground: gy, back, scale, power, radius, minR, area, areaFrom, body: AREA_FX_BODY, normal, surfaceAt });
      impactSounds.play(kind, kind === 'heal' ? [pos[0], gy + 1, pos[2]] : pos, { heard, volume: kind === 'heal' ? 0.8 : Math.min(1, 0.75 + 0.2 * power) });
      if (kind !== 'heal') kickFrom(pos, shake);
      return gy;
    } catch { return null; }
  }
  function kickFrom(pos, shake) {
    const f = _doorFeet;
    if (!(shake > 0) || !f) return;
    const d = Math.hypot(pos[0] - f[0], pos[1] - f[1], pos[2] - f[2]);
    const k = Math.max(0, 1 - d / 14) * shake;
    if (k > 0.15) betterAmbience.weaponKick(k);
  }
  const peerKickShare = (/** @type {any} */ m) => {
    if (!m?.visual || m.casterId == null) return 1;
    const v = Number(getPref('peerSpellShake'));
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;
  };
  const bodyMid = (t) => (t?.ai?.feet ? [t.ai.feet[0], t.ai.feet[1] + (t.ai.height ?? 1.8) * 0.55, t.ai.feet[2]] : null);
  const alongAim = (eye, dir, d) => { const l = Math.hypot(dir[0], dir[1], dir[2]) || 1; return [eye[0] + (dir[0] / l) * d, eye[1] + (dir[1] / l) * d, eye[2] + (dir[2] / l) * d]; };
  function giftFx(sp, at) {
    if (!at || fxKindOf(sp) !== 'heal') return;
    landFx('heal', at, { radius: 0.75, heard: 24 });
  }
  function showImpactFlash(m, pos) {
    if (!m.spell || m.spell.element == null || m.spell.rangeType === 1 || m.unseen) return;
    if (m.quiet) { impacts.showImpactFlash(missileArchive(m.spell.element), pos, m.scale ?? 1, allyConceal(m.quiet)); return; }
    impacts.showImpactFlash(missileArchive(m.spell.element), pos, m.scale ?? 1);
    try {
      const sc = m.scale ?? 1;
      const kind = fxKindOf(m.spell);
      const ground = impactGround(collider, pos);
      if (kind !== 'heal') {
        impacts.showMissEffect('spell', pos, { archive: missileArchive(m.spell.element), record: 1, fps: 12, scale: sc * 1.8 });
        spawnSparks(m, pos, sc, ground);
      }
      const dl = Array.isArray(m.dir) ? Math.hypot(m.dir[0], m.dir[1], m.dir[2]) : 0;
      const back = dl > 1e-6 ? [-m.dir[0] / dl, -m.dir[1] / dl, -m.dir[2] / dl] : null;
      let normal = null, surfaceAt = null;
      if (back) {
        try { const struck = struckSurface(collider, pos, [-back[0], -back[1], -back[2]]); if (struck) ({ normal, surfaceAt } = struck); } catch {}
      }
      const blast = m.spell.rangeType === 4;
      (m.visual && m.casterId != null ? peerHeard : (run) => run())(() => landFx(kind, kind === 'heal' ? [pos[0], ground, pos[2]] : pos, { back, ground, scale: sc, power: blast ? 1.25 : 1, radius: 0.8,
        area: blast ? EXPLOSION_RADIUS : 0, areaFrom: blast ? pos : null, heard: m.sky ? SKY_FIRE_HEARD_M : 40, shake: (blast ? 4.5 : 3) * peerKickShare(m),
        normal: kind === 'heal' ? null : normal, surfaceAt }));
    } catch {}
    if (m.sky) { try { audio.play3dId?.(SPELL_CAST_SOUND[m.spell.element] ?? SPELL_CAST_SOUND[4], pos, 1, { maxDistance: SKY_FIRE_HEARD_M }); } catch {} }
  }

  // Every player spell landing on an enemy comes through here, so the caster's HUD lines are said once.
  function applySpellToFoe(spell, casterLevel, foe, caster = null, ctx = undefined, sinks = foeSinks(foe, !caster || caster.entity === playerEntity)) {
    if (foe?.yielded || foe?.executing || foe?.sparing || foe?.leaving || foe?.roaring) return null;
    const striker = caster?.entity ?? playerEntity;
    const mine = striker === playerEntity;
    // A soul trap my cast puts on an enemy another player runs goes to that player's client; the rest lands here.
    if (mine && typeof ctx?.peerCaster !== 'string' && (spell?.effects ?? []).some((e) => e && isSoulTrapEffect(e))) {
      const trapFx = spell.effects.filter((e) => e && isSoulTrapEffect(e));
      if (trapToOwner?.(foe, { ...spell, effects: trapFx }, casterLevel)) spell = { ...spell, effects: spell.effects.filter((e) => !trapFx.includes(e)) };
    }
    if (mine && foe?.entity && foe.entity.team !== 'PlayerAlly') noteSkillChallenge(playerEntity, foe.entity);
    const landing = sinks?.hurt ? { ...sinks,
      hurt: (n, o) => {
        const d = o?.whole || o?.round ? n : blowTaken(n, striker, foe.entity, null, { kind: 'spell', element: spell?.element ?? null });
        if (mine && !o?.round) noteFeudHarm(foe.entity, elementFeudClass(spell?.element), d);
        if (mine) showFoeDamage(d, 'health');
        return sinks.hurt(d, { ...(o ?? {}), element: spell?.element ?? null });
      },
      drainMagicka: (n) => { if (mine && n > 0) showFoeDamage(n, 'magicka');
        return sinks.drainMagicka ? sinks.drainMagicka(n) : undefined; },
      drainFatigue: (n, a) => { if (mine && n > 0) showFoeDamage(n, 'fatigue');
        return sinks.drainFatigue ? sinks.drainFatigue(n, a) : undefined; },
    } : sinks;
    const healthBefore = foe?.entity?.health;
    const _hadSpellShield = (foe?.entity?.activeEffects ?? []).some((a) => a.kind === 'shield' && !a.ended);
    const r = applySpell(spell, casterLevel, foe.entity, landing, rolls, caster, ctx);
    if (caster?.entity === playerEntity && foe?.entity && r) {
      tellSpellLanded({ caster: playerEntity, target: foe.entity, foe, spell, r, self: false, took: tookOf(r, healthBefore), cast: caster.cast ?? null });
    }
    if (foe?.ai?.feet && !(r?.saved || r?.chanceFailed || r?.reflected)) mwFx.hit(spell, foe.ai.feet, { body: { height: foe.ai.height ?? CAPSULE_HEIGHT, radius: foe.ai.radius ?? PLAYER_BODY_RADIUS } });
    // A new trap from another player's strike is marked with their id, so its soul goes to their pack.
    const peerCaster = typeof ctx?.peerCaster === 'string' ? ctx.peerCaster : null;
    if (r.trapAlert && !peerCaster) say(SOUL_TRAP_TEXT[r.trapAlert]);
    if (peerCaster && r.trapAlert === 'trapActive') {
      const trap = (foe.entity.activeEffects ?? []).find((a) => a.kind === 'soulTrap' && !a.ended);
      if (trap) trap.by = peerCaster;
    }
    // The pacified flag lives on the enemy record, and only an attack restores hostility, as in classic.
    if (r.pacify && foe.ai && !foe.entity?.pacifyImmune) foe.ai.isHostile = false;
    const _foePos = foe?.ai?.feet ? [foe.ai.feet[0], foe.ai.feet[1] + (foe.ai.height ?? CAPSULE_HEIGHT), foe.ai.feet[2]] : null;
    const _foeId = foe?.uid ?? foe?.seq ?? foe?.entity?.id ?? null;
    if (_foePos) {
      if (looksBlending(foe.entity)) { showFoeWord('word', STATUS_WORDS.blending, { position: _foePos }); broadcastFoeIndicator(_foeId, 'word', STATUS_WORDS.blending, _foePos); }
      if (r.silenced || hasActiveEffect(foe.entity, 'silenced')) { showFoeWord('word', STATUS_WORDS.silenced, { position: _foePos }); broadcastFoeIndicator(_foeId, 'word', STATUS_WORDS.silenced, _foePos); }
      if (r.paralyzed || hasActiveEffect(foe.entity, 'paralyze')) { showFoeWord('word', STATUS_WORDS.paralyze, { position: _foePos }); broadcastFoeIndicator(_foeId, 'word', STATUS_WORDS.paralyze, _foePos); }
      if (r.pacify) { showFoeWord('word', STATUS_WORDS.pacify, { position: _foePos }); broadcastFoeIndicator(_foeId, 'word', STATUS_WORDS.pacify, _foePos); }
      if (r.saved) { showFoeWord('saved', 'Saved!', { position: _foePos }); broadcastFoeIndicator(_foeId, 'saved', 'Saved!', _foePos); }
      if (r.damageSaved) { showFoeWord('saved', 'Saved!', { position: _foePos }); broadcastFoeIndicator(_foeId, 'saved', 'Saved!', _foePos); }
      if (r.reflected) { showFoeWord('word', spellReflectedText(), { position: _foePos }); broadcastFoeIndicator(_foeId, 'word', spellReflectedText(), _foePos); }
      const _nowShield = (foe?.entity?.activeEffects ?? []).some((a) => a.kind === 'shield' && !a.ended);
      if (_hadSpellShield && !_nowShield) showFoeWord('broken', 'Shield broken!', { position: _foePos });
      else if (_hadSpellShield && _nowShield) showFoeWord('shielded', 'Shielded!', { position: _foePos });
    }
    // Unlike DFU, an enemy reflects as the player does; this seam holds both parties, so it re-targets the bundle.
    if (r.reflected && caster?.entity && !peerCaster) {
      const back = { ...(ctx ?? {}), reflectedCount: 1 };
      if (caster.entity === playerEntity) applySpellToPlayer(spell, casterLevel, caster, back);
      else applySpell(spell, casterLevel, caster.entity, caster.sinks ?? {}, rolls, caster, back);
    }
    return r;
  }

  function applySpellToPlayer(spell, casterLevel, caster = null, extraCtx = null) {
    const base = absorbCtx();
    base.morphSelf = () => morphSelf(playerEntity, { nowMinutes: now ? Math.floor(now()) : 0, say });
    const ctx = { ...(lastCastCost > 0 ? { ...base, selfCastCost: lastCastCost } : base), ...(extraCtx ?? {}) };
    if (caster?.entity && caster.entity !== playerEntity && !caster.entity.isPlayer) noteSkillChallenge(playerEntity, caster.entity);
    // Mark the harm before the spell lands, since its damage may kill the player.
    if (caster?.entity && caster.entity !== playerEntity && !caster.entity.isPlayer) markPlayerHarm(caster.entity);
    const r = applySpell(spell, casterLevel, playerEntity, playerSinks, rolls, caster, ctx);
    if (caster?.entity === playerEntity && r) tellSpellLanded({ caster: playerEntity, target: playerEntity, spell, r, self: true, reflected: !!extraCtx?.reflectedCount, took: 0, cast: caster.cast ?? null });
    if (_doorFeet && !(r.saved || r.chanceFailed || r.reflected)) mwFx.hit(spell, _doorFeet);
    if (r.paralyzed) showFoeWord('word', STATUS_WORDS.paralyze);
    if (r.chanceFailed) {
      const wasSave = spell.rangeType !== 0;
      if (wasSave) showFoeWord('saved', 'Saved!');
      else say(localizedText('spellEffectFailed', 'Spell effect failed.'));
    }
    if (r.saved) showFoeWord('saved', 'Saved!');
    else if (r.damageSaved) showFoeWord('saved', 'Saved!');
    // As in DFU, only the player hears that Open or Lock is armed, and the line repeats on every recast.
    if (r.armed) say(r.armed === 'openArmed' ? DOOR_SPELL_TEXT.readyToOpen : DOOR_SPELL_TEXT.readyToLock);
    if (r.teleport) onTeleport?.();
    if (r.dispel) onDispel?.(r.dispel);
    // No refund here: DFU charges Dispel Magic even if the picker is canceled.
    if (r.dispelMagic) onDispelMagic?.(r.dispelMagic);
    if (r.identify) {
      // The refund never exceeds what this cast spent, so a free cast gets none; the window charges full price.
      const spent = caster?.entity === playerEntity ? (caster.cast?.cost ?? 0) : 0;
      playerEntity.magicka = Math.min(playerEntity.maxMagicka ?? Infinity,
        (playerEntity.magicka ?? 0) + Math.min(r.identify.refund, spent));
      surfacePlayer();
      onIdentify?.(r.identify);
    }
    if (r.createItem) onCreateItem?.(r.createItem);
    if (r.reflected) {
      showFoeWord('word', spellReflectedText());
      if (caster?.entity && caster.entity !== playerEntity) {
        applySpell(spell, casterLevel, caster.entity, caster.sinks ?? {}, rolls, caster,
          { ...(extraCtx ?? {}), reflectedCount: 1 });
      }
    }
    return r;
  }

  const allyToOwner = (t, casterFoe, spell, level) => !!casterFoe && !casterFoe.puppet && typeof t?.spellFromAlly === 'function' && !!t.spellFromAlly(casterFoe, spell, level);
  const missileCaster = (m) => (m.fromPlayer === false ? (m.casterFoe ? { entity: m.casterFoe.entity, sinks: foeSinks(m.casterFoe), foe: m.casterFoe } : null) : playerCaster(m.cast ?? null));
  const sparedFromPlayer = (t) => sparedByPlayer(t);
  const playerTargets = () => foes().filter((t) => !sparedFromPlayer(t));
  function giveAreaToCaster(sp, cast = null) {
    if (!allyCastable(sp)) return;
    const r = applySpellToPlayer({ ...sp, rangeType: 0 }, effectiveLevel(playerEntity), playerCaster(cast));
    if (r.healed > 0) say(`You are healed ${r.healed} points.`);
  }
  function explodeAt(pos, spell, casterLevel, playerFeet, caster = null, { excludeFoe = null, playerHeight = CAPSULE_HEIGHT, allies = false, duel = false, boss = duel, friendly = false } = {}) {
    mwFx.area(spell, pos, EXPLOSION_RADIUS);
    if (caster?.entity === playerEntity) bunny.burst(pos, spell, EXPLOSION_RADIUS);
    const crewBlast = isShipmate(caster?.foe);
    for (const t of sweepFoes(pos, EXPLOSION_RADIUS, foes())) {
      if (excludeFoe && t === excludeFoe) continue;
      if (caster?.entity === playerEntity && sparedFromPlayer(t)) continue;
      if (crewBlast && isShipmate(t)) continue;
      if (friendly && t.entity?.team === 'PlayerAlly') continue;
      if (caster?.foe && boutTeammates(caster.foe, t)) continue;
      if (t.puppet && caster?.entity && caster.entity !== playerEntity) { if (friendly || caster.foe?.companion != null) allyToOwner(t, caster.foe, spell, casterLevel); continue; }
      applySpellToFoe(spell, casterLevel, t, caster);
    }
    if (allies && caster?.entity === playerEntity) giveToAllies(sweepFoes(pos, EXPLOSION_RADIUS, allyMarksFor(spell, false)), spell);
    if (allies && caster?.entity === playerEntity) giveToCompanions(sweepFoes(pos, EXPLOSION_RADIUS, companionMarksFor(spell, false)), spell);
    if (duel && caster?.entity === playerEntity) for (const t of sweepFoes(pos, EXPLOSION_RADIUS, duelMarksFor(spell))) giveToDuel(t, spell);
    if (boss && caster?.entity === playerEntity) for (const t of sweepFoes(pos, EXPLOSION_RADIUS, bossMarksFor(spell))) giveToBoss(t, spell, caster);
    if (playerFeet && !crewBlast && !friendly && sphereOverlapsCapsule(pos, EXPLOSION_RADIUS, playerFeet, playerHeight, PLAYER_BODY_RADIUS)) {
      // A player's all-gift blast landed on them at the cast (giveAreaToCaster), so the burst passes them by.
      const gift = caster?.entity === playerEntity && allyCastable(spell);
      if (!gift) applySpellToPlayer(spell, casterLevel, caster);
    }
  }

  // Only keys with a cost table row tally a skill, as DFU tallies only effects that have a class.
  function tallyCastSkills(sp) {
    for (const e of sp.effects) {
      if (e.type < 0) continue;
      if (!EFFECT_COST_TABLE[`${e.type},${e.subType & 0xff}`]) continue;
      tallySkill(playerEntity, castSchool(playerEntity, sp, e), 1);
    }
    audio.playOneShotId(SPELL_CAST_SOUND[sp.element] ?? SPELL_CAST_SOUND[4], 1);
  }

  function pickTouch(eye, dir, sp = null) {
    if (!eye || !dir) return null;
    const marks = [...allyMarksFor(sp), ...duelMarksFor(sp), ...bossMarksFor(sp)];
    marks.push(...companionMarksFor(sp));
    return pickTouchTarget(eye, dir, marks.length ? [...playerTargets(), ...marks] : playerTargets(), (c, d) => {
      const l = d || 1, dx = (c[0] - eye[0]) / l, dy = (c[1] - eye[1]) / l, dz = (c[2] - eye[2]) / l;
      const hit = collider.raycast(eye, [dx, dy, dz], d);
      return !Number.isFinite(hit) || hit >= d - 1e-3;
    });
  }

  function fallenInReach(eye, dir) {
    if (!eye || !dir || !fallenTarget) return null;
    let bodies = null;
    try { bodies = fallenTarget(eye, dir, RESURRECT_REACH) ?? null; } catch { return null; }
    if (!Array.isArray(bodies) || !bodies.length) return null;
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const ground = rayHit(eye, [dir[0] / l, dir[1] / l, dir[2] / l], RESURRECT_REACH * 2, collider);
    return pickFallenBody(eye, dir, bodies, Number.isFinite(ground) ? ground : Infinity);
  }
  function allyInReach(eye, dir, reach, sp = readiedSpell) {
    if (!eye || !dir || !allyTarget) return null;
    let ally = null;
    try { ally = allyTarget(eye, dir, reach, sp) ?? null; } catch { return null; }
    if (!ally) return null;
    const d = ally.distance;
    if (Number.isFinite(d) && d > 0) {
      const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      const hit = collider.raycast(eye, [dir[0] / l, dir[1] / l, dir[2] / l], d);
      if (Number.isFinite(hit) && hit < d - 1e-3) return null;
      if (groundHit(eye, [dir[0] / l, dir[1] / l, dir[2] / l], d, collider) < d - PERSON_RADIUS) return null;
    }
    return ally;
  }

  function allyNear(eye, sp) {
    if (!eye) return false;
    for (const m of allyMarksFor(sp)) {
      if (!m.mate) continue;
      const [x, y, z] = m.ai.feet;
      const top = y + (m.ai.height ?? CAPSULE_HEIGHT);
      const cy = Math.min(Math.max(eye[1], y), top);
      if (Math.hypot(eye[0] - x, eye[1] - cy, eye[2] - z) <= ALLY_ARM_RADIUS) return true;
    }
    return false;
  }

  // The magicka was spent at the cast; a spell aborted before the release returns here with no refund, as in DFU.
  function releaseFrame(p) {
    castInProgress = false;
    const sp = readiedSpell;
    if (!sp) return false;
    const cost = p.cost;
    const eye = lastAim ? lastAim.eye : p.eye;
    const dir = lastAim ? lastAim.dir : p.dir;
    // As in DFU, lastSpell is set and the cast event raised before the ready clears.
    const done = (v) => { lastSpell = sp; onCastReadySpell?.(sp); if (v) tellPlayerCast(playerEntity, sp, cost); readiedSpell = null; readiedFree = false; readiedCost = 0; return v; };
    if (hasResurrect(sp) && !readiedFree) {
      const f = fallenInReach(eye, dir);
      lastCastCost = cost;
      tallyCastSkills(sp);
      surfacePlayer();
      let sent = false;
      try { sent = !!(f && !f.gone && raiseFallen?.(f)); } catch { sent = false; }
      say(sent ? RESURRECT_TEXT.cast(f.name) : f?.gone ? RESURRECT_TEXT.forGood(f.name) : RESURRECT_TEXT.noBody);
      return done(true);
    }
    if (spellHas(sp, RESCUE_TYPE) && !readiedFree) {
      lastCastCost = cost;
      tallyCastSkills(sp);
      surfacePlayer();
      bunny.rescue(eye, dir, _doorFeet);
      return done(true);
    }
    const allyReach = allyReachFor(sp.rangeType);
    const ally = !readiedFree && allyReach !== null && allyCastable(sp) ? allyInReach(eye, dir, allyReach) : null;
    if (ally && castAtAlly?.(ally.id, allyCastFrame(sp, effectiveLevel(playerEntity), ally.id))) {
      lastCastCost = cost;
      tallyCastSkills(sp);
      surfacePlayer();
      sayGift(allyCastCasterLine(shownSpellName(sp), ally.name));
      if (Number.isFinite(ally.distance)) giftFx(sp, alongAim(eye, dir, ally.distance));
      return done(true);
    }
    const mine = !readiedFree && allyReach !== null && allyCastable(sp) ? companionInReach(eye, dir, allyReach) : null;
    if (mine) {
      lastCastCost = cost;
      tallyCastSkills(sp);
      surfacePlayer();
      giveToCompanion(mine, sp);
      giftFx(sp, bodyMid(mine));
      return done(true);
    }
    const cast = newCast(cost);
    if (sp.rangeType === 0) {
      tallyCastSkills(sp);
      const r = applySpellToPlayer(sp, effectiveLevel(playerEntity), playerCaster(cast));
      bunny.cast(sp, eye, dir);
      // As in DFU, lastCastCost is set after the self-cast lands, so the absorption cap reads the previous cost.
      lastCastCost = cost;
      if (r.healed > 0) say(`You are healed ${r.healed} points.`);
      if (eye && fxKindOf(sp) === 'heal') landFx('heal', [eye[0], eye[1], eye[2]], { radius: 1.0, minR: 0.45, heard: 24 });
      surfacePlayer();
      return done(true);
    }
    if (sp.rangeType === 1) {
      const t = pickTouch(eye, dir, sp);
      lastCastCost = cost;
      tallyCastSkills(sp);
      surfacePlayer();
      if (t?.ally) giveToAlly(t, sp);
      else if (t?.companion) giveToCompanion(t, sp);
      else if (t?.duel) giveToDuel(t, sp);
      else if (t?.boss) giveToBoss(t, sp, playerCaster(cast));
      else if (t) { const r = applySpellToFoe(sp, effectiveLevel(playerEntity), t, playerCaster(cast)); if (r?.dispel) onDispel?.({ ...r.dispel, targets: [t] }); }
      if (t) {
        const mid = bodyMid(t) ?? alongAim(eye, dir, 1.5), kind = fxKindOf(sp);
        if (kind === 'heal') landFx('heal', mid, { radius: 0.75, heard: 24 });
        else landFx(kind, mid, { scale: 0.75, power: 0.6, heard: 30, shake: 1.5 });
      }
      return done(true);
    }
    if (sp.rangeType === 3) {
      lastCastCost = cost;
      tallyCastSkills(sp);
      surfacePlayer();
      const areaCaster = playerCaster(cast);
      let dispel = null;
      for (const t of sweepFoes(eye, EXPLOSION_RADIUS, playerTargets())) {
        const r = applySpellToFoe(sp, effectiveLevel(playerEntity), t, areaCaster);
        if (r?.dispel) dispel = { ...r.dispel, targets: [...(dispel?.targets ?? []), t] };
      }
      if (dispel) onDispel?.(dispel);
      giveToAllies(sweepFoes(eye, EXPLOSION_RADIUS, allyMarksFor(sp)), sp);
      giveToCompanions(sweepFoes(eye, EXPLOSION_RADIUS, companionMarksFor(sp)), sp);
      for (const t of sweepFoes(eye, EXPLOSION_RADIUS, duelMarksFor(sp))) giveToDuel(t, sp);
      for (const t of sweepFoes(eye, EXPLOSION_RADIUS, bossMarksFor(sp))) giveToBoss(t, sp, areaCaster);
      giveAreaToCaster(sp, cast);
      mwFx.area(sp, _doorFeet ?? [eye[0], eye[1] - 1, eye[2]], EXPLOSION_RADIUS);
      { const kind = fxKindOf(sp), at = [eye[0], eye[1] - 1, eye[2]];
        if (kind === 'heal') landFx('heal', at, { area: EXPLOSION_RADIUS, areaFrom: eye, minR: 0.5, heard: 30 });
        else landFx(kind, at, { power: 1.2, area: EXPLOSION_RADIUS, areaFrom: eye, heard: 40, shake: 3 }); }
      return done(true);
    }
    if (sp.rangeType !== 2 && sp.rangeType !== 4) return done(false);
    lastCastCost = cost;
    tallyCastSkills(sp);
    surfacePlayer();
    const meteor = bunny.meteorStart(sp, eye, dir);
    missiles.push({ spell: sp, cast, pos: meteor ? meteor.pos : [eye[0], eye[1], eye[2]], dir: meteor ? meteor.dir : [...dir], unseen: !!meteor, age: 0, batch: null, fromPlayer: true, ally: !readiedFree && allyCastable(sp), duel: !!duelSpellOf(sp), boss: !!duelSpellOf(sp) || (sp.effects ?? []).some((e) => e && isSoulTrapEffect(e)) || spellSways(sp) });
    if (!meteor) withBolt(missiles[missiles.length - 1]);
    if (sp.rangeType === 4) giveAreaToCaster(sp, cast);
    return done(true);
  }

  // As in DFU CastReadySpell: silence, ready, and touch gates, then the spend, then the hands.
  function castInput(eye, dir) {
    if (combatAbilityBusy(playerEntity)) return false;
    const sp = readiedSpell;
    if (!sp) return false;
    if (knockedDown()) return false;
    if (barredHere()) return false;
    if (wardedHere(sp)) return false;
    // A free ready (a trap's payload) bypasses the silence gate, as in DFU.
    if (!readiedFree && silenceBlocksCast(playerEntity)) {
      readiedSpell = null;
      readiedCost = 0;
      say(silencedText());
      return false;
    }
    if (castInProgress) return false;
    // The click also waits while the hands still move after the release, so no spell resolves without motion.
    if (castBusy()) return false;
    // As in DFU, the price captured at the ready is spent with no magicka test, and magicka clamps at 0.
    const cost = readiedFree ? 0 : readiedCost;
    const raising = hasResurrect(sp) && !readiedFree;
    const fallen = raising ? fallenInReach(eye, dir) : null;
    if (raising && !fallen) { say(RESURRECT_TEXT.noBody); return false; }
    if (fallen?.gone) { say(RESURRECT_TEXT.forGood(fallen.name)); return false; }
    if (sp.rangeType === 1 && !raising) {
      // As in DFU, a touch with no target in reach aborts before the spend.
      if (!pickTouch(eye, dir, sp) && !(!readiedFree && allyCastable(sp) && (allyInReach(eye, dir, ALLY_TOUCH_REACH) || companionInReach(eye, dir, ALLY_TOUCH_REACH)))) return false;
    }
    playerEntity.magicka = Math.max(0, (playerEntity.magicka ?? 0) - cost);
    const parked = { cost, eye: eye ? [...eye] : null, dir: dir ? [...dir] : null };
    if (startCastAnim && startCastAnim(sp, () => releaseFrame(parked))) {
      castInProgress = true;
      mwFx.cast(sp, _doorFeet, { player: true });
      return true;
    }
    mwFx.cast(sp, _doorFeet, { player: true });
    return releaseFrame(parked);
  }

  function readySpell(sp, { free = false } = {}) {
    if (combatAbilityBusy(playerEntity)) { say(localizedText('finishCombatSkill', 'Finish your combat skill before readying a spell.')); return false; }
    const prevArm = _lastArm; _lastArm = null;
    if (pendingClickCast) setPending(false);
    if (barredHere()) return false;
    if (wardedHere(sp)) return false;
    if (!free && silenceBlocksCast(playerEntity)) { readiedSpell = null; readiedCost = 0; say(silencedText()); return false; }
    // Unlike the silence gate, a cast in progress keeps the spell already readied, as in DFU.
    if (castInProgress) return false;
    const spellPointCost = free ? 0 : calculateCastCost(sp, playerEntity).sp;
    if (!free && (playerEntity.magicka ?? 0) < spellPointCost) {
      readiedSpell = null;
      readiedCost = 0;
      say(localizedText('youDontHaveTheSpellPoints', "You don't have the spell points."));
      return false;
    }
    readiedSpell = sp;
    readiedFree = free;
    readiedCost = spellPointCost;
    mwFx.prepare(sp);
    // As in DFU, the new-ready event raises after the assignment and before the CasterOnly instant cast.
    onNewReadySpell?.(sp);
    if (sp.rangeType === 0) {
      // With a party mate under the crosshair, a CasterOnly gift arms so the click picks the target.
      if (!free && allyCastable(sp) && allyInReach(lastAim?.eye ?? null, lastAim?.dir ?? null, ALLY_TOUCH_REACH, sp)) { sayArm('mate-aim', prevArm, pressButtonToFireSpellText()); return true; }
      // The arms follow the click's order: both crosshair arms (mate, then companion) before either near arm.
      if (companionInReach(lastAim?.eye ?? null, lastAim?.dir ?? null, ALLY_TOUCH_REACH, sp)) { sayArm('mine-aim', prevArm, pressButtonToFireSpellText()); return true; }
      if (!free && allyCastable(sp) && allyNear(lastAim?.eye ?? null, sp)) { sayArm('mate-near', prevArm, pressButtonToFireSpellText(), ALLY_ARMED_LINE); return true; }
      if (companionNear(lastAim?.eye ?? null, sp)) { sayArm('mine-near', prevArm, pressButtonToFireSpellText(), COMPANION_ARMED_LINE); return true; }
      if (!free && hasResurrect(sp)) { const f = fallenInReach(lastAim?.eye ?? null, lastAim?.dir ?? null); say(f?.gone ? RESURRECT_TEXT.forGood(f.name) : f ? pressButtonToFireSpellText() : RESURRECT_TEXT.aim); return true; }
      if (spellHandBusy()) { setPending(true); return true; }
      return castInput(null, null) !== false;
    }
    say(pressButtonToFireSpellText());
    return true;
  }

  const allyConceal = (q) => (q ? { mode: CONCEAL_MODE.reveal, alpha: q.alpha, t: 0, phase: 0 } : null);
  function withBolt(m) {
    m.mwBolt = mwFx.bolt(m.spell, m.quiet ? { alpha: m.quiet.alpha } : undefined);
    m.mwBolt.at(m.pos, m.dir);
    return m;
  }

  async function ensureMissileBatch(m) {
    if (m.batch !== null || m.unseen) return;
    if (m.mwBolt && ['pending', 'live'].includes(m.mwBolt.state())) return;
    m.batch = false;
    const archive = missileArchive(m.spell.element);
    const t = await getTexture(archive);
    if (!t) return;
    // A missile can retire while its texture loads, so check before publishing the batch.
    if (m.dead) { m.batch = null; return; }
    uploadRecord(archive, 0);
    const own = billboardSize(t, 0);
    const size = m.scale ? { ...own, w: own.w * m.scale, h: own.h * m.scale } : own;
    m.firePos = [...m.pos];
    m.batch = renderer.createBillboardBatch(archive, 0, size, [centredBase(m.firePos, size)]);
    if (m.quiet) m.batch.conceal = allyConceal(m.quiet);
    armFlatAnim(m.batch, t, archive, 0, flatAnims, uploadRecordFrame, { fps: MISSILE_FPS });
    batches.push(m.batch);
  }

  function retireMissile(m) {
    m.mwBolt?.end();
    if (m.batch) {
      flatAnims.remove(m.batch);
      const bi = batches.indexOf(m.batch);
      if (bi >= 0) batches.splice(bi, 1);
      renderer.destroyBillboardBatch(m.batch);
    }
    m.dead = true;
  }
  function retireAllMissiles() {
    for (const m of missiles) retireMissile(m);
    missiles.length = 0;
  }

  function update(dt, playerFeet, forward = null, playerHeight = CAPSULE_HEIGHT, renderFeet = null) {
    _doorFeet = playerFeet ?? null;
    doorForward = forward;
    setPlayerDoor(_door);
    stepSparks(dt);
    fx.step(dt);
    bunny.update(dt);
    mwFx.update(dt, spellIntensity());
    for (const m of missiles) if (!m.dead && m.spell && !m._artNoted) { m._artNoted = true; noteElementArt(m.spell.element); }
    flatAnims.tick(dt);
    impacts.tick(dt);
    candle.update(dt, {
      active: hasActiveEffect(playerEntity, 'light'),
      // The candle hangs off the render feet, as the camera does, so it does not slide against the view.
      feet: renderFeet ?? playerFeet ?? [0, 0, 0],
      height: playerHeight,
      forward,
    });
    for (const m of missiles) {
      if (m.dead) continue;
      ensureMissileBatch(m);
      m.age += dt;
      if (m.age > MISSILE_LIFESPAN_S) { retireMissile(m); continue; }
      const step = MISSILE_SPEED * dt;
      const { unit: _unit, reach } = missileReach(m.dir, step);
      const _len = Math.hypot(m.dir[0], m.dir[1], m.dir[2]) || 1;
      const _cs = flightStop(collider, m.pos, _unit, reach, step * _len);
      const hitWall = _cs.stop;
      if (Number.isFinite(hitWall) && hitWall <= reach) {
        // The collider answers in units of `_unit`, so the impact point uses it instead of `m.dir`.
        const impact = [m.pos[0] + _unit[0] * hitWall, m.pos[1] + _unit[1] * hitWall, m.pos[2] + _unit[2] * hitWall];
        if (m.spell.rangeType === 4 && !m.visual) {
          explodeAt(impact, m.spell, m.fromPlayer === false ? (m.casterLevel ?? 1) : effectiveLevel(playerEntity), playerFeet, missileCaster(m), { playerHeight, allies: !!m.ally, duel: !!m.duel, boss: m.boss ?? !!m.duel, friendly: !!m.friendly });
        }
        showImpactFlash(m, impact);
        retireMissile(m);
        continue;
      }
      const _adv = step * _cs.advance;
      m.pos[0] += m.dir[0] * _adv; m.pos[1] += m.dir[1] * _adv; m.pos[2] += m.dir[2] * _adv;
      m.mwBolt?.at(m.pos, m.dir);
      if (m.batch) m.batch.origin = [m.pos[0] - m.firePos[0], m.pos[1] - m.firePos[1], m.pos[2] - m.firePos[2]];
      // Another player's drawn missile applies nothing; their own client decided what it hit.
      if (m.visual) {
        if (m.sky) {
          m.left -= _adv * _len;
          if (m.left <= 0) { showImpactFlash(m, m.to); retireMissile(m); continue; }
        }
        const body = (playerFeet && missileHitsCapsule(m.pos, playerFeet, playerHeight, PLAYER_BODY_RADIUS))
          || foes().some((f) => !f.dead && missileHitsFoe(m.pos, f)) || !!corpsePrefabStruck(m.pos, foes(), MISSILE_COLLIDER_RADIUS)
          || (peerBodies?.() ?? []).some((q) => q && q.id !== m.casterId && Array.isArray(q.feet) && missileHitsCapsule(m.pos, q.feet, q.height ?? CAPSULE_HEIGHT, PLAYER_BODY_RADIUS));
        if (body) { showImpactFlash(m, [m.pos[0], m.pos[1], m.pos[2]]); retireMissile(m); }
        continue;
      }
      if (m.fromPlayer === false) {
        const blockedByMe = !m.friendly && playerFeet && missileHitsCapsule(m.pos, playerFeet, playerHeight, PLAYER_BODY_RADIUS);
        if (m.aimFoe && !m.aimFoe.dead && !blockedByMe) {
          if (missileHitsFoe(m.pos, m.aimFoe)) {
            const fCaster = missileCaster(m);
            if (m.spell.rangeType === 4) explodeAt(m.pos, m.spell, m.casterLevel ?? 1, playerFeet, fCaster, { playerHeight, friendly: !!m.friendly });
            else if (!m.aimFoe.puppet) applySpellToFoe(m.spell, m.casterLevel ?? 1, m.aimFoe, fCaster);
            else if (m.friendly || m.casterFoe?.companion != null) allyToOwner(m.aimFoe, m.casterFoe, m.spell, m.casterLevel ?? 1);
            showImpactFlash(m, [m.pos[0], m.pos[1], m.pos[2]]);
            retireMissile(m);
          }
          continue;
        }
        if (playerFeet && !m.friendly && !isShipmate(m.casterFoe)) {
          if (missileHitsCapsule(m.pos, playerFeet, playerHeight, PLAYER_BODY_RADIUS)) {
            const mCaster = missileCaster(m);
            if (m.spell.rangeType === 4) explodeAt(m.pos, m.spell, m.casterLevel ?? 1, playerFeet, mCaster, { playerHeight });
            else applySpellToPlayer(m.spell, m.casterLevel ?? 1, mCaster);
            showImpactFlash(m, [m.pos[0], m.pos[1], m.pos[2]]);
            retireMissile(m);
          }
        }
        continue;
      }
      if (m.ally) {
        const hitMate = [...allyMarksFor(m.spell, false), ...companionMarksFor(m.spell, false)].find((p) => missileHitsCapsule(m.pos, p.ai.feet, p.ai.height, PLAYER_BODY_RADIUS));
        if (hitMate) {
          const at = [m.pos[0], m.pos[1], m.pos[2]];
          if (m.spell.rangeType === 4) explodeAt(at, m.spell, effectiveLevel(playerEntity), playerFeet, playerCaster(m.cast ?? null), { playerHeight, allies: true, duel: !!m.duel, boss: m.boss ?? !!m.duel });
          else if (hitMate.companion) giveToCompanion(hitMate, m.spell);
          else giveToAlly(hitMate, m.spell);
          showImpactFlash(m, at);
          retireMissile(m);
          continue;
        }
      }
      if (m.duel) {
        const hitFoe = duelMarksFor(m.spell).find((p) => missileHitsCapsule(m.pos, p.ai.feet, p.ai.height, PLAYER_BODY_RADIUS));
        if (hitFoe) {
          const at = [m.pos[0], m.pos[1], m.pos[2]];
          if (m.spell.rangeType === 4) explodeAt(at, m.spell, effectiveLevel(playerEntity), playerFeet, playerCaster(m.cast ?? null), { playerHeight, allies: !!m.ally, duel: true, boss: m.boss ?? true });
          else giveToDuel(hitFoe, m.spell);
          showImpactFlash(m, at);
          retireMissile(m);
          continue;
        }
      }
      if (m.boss ?? m.duel) {
        const hitBoss = bossMarksFor(m.spell).find((p) => missileHitsCapsule(m.pos, p.ai.feet, p.ai.height, p.ai.radius));
        if (hitBoss) {
          const at = [m.pos[0], m.pos[1], m.pos[2]];
          if (m.spell.rangeType === 4) explodeAt(at, m.spell, effectiveLevel(playerEntity), playerFeet, playerCaster(m.cast ?? null), { playerHeight, allies: !!m.ally, duel: !!m.duel, boss: true });
          else giveToBoss(hitBoss, m.spell, playerCaster(m.cast ?? null));
          showImpactFlash(m, at);
          retireMissile(m);
          continue;
        }
      }
      if (m.duel) {
        const hitBox = boxMarksFor(m.spell).find((q) => missileInBox(m.pos, q.box));
        if (hitBox) {
          try { castAtBox(m.spell, hitBox, playerCaster(m.cast ?? null)); } catch {}
          showImpactFlash(m, [m.pos[0], m.pos[1], m.pos[2]]);
          retireMissile(m);
          continue;
        }
      }
      for (const f of playerTargets()) {
        if (f.dead) continue;
        if (missileHitsFoe(m.pos, f)) {
          if (m.spell.rangeType === 4) explodeAt(m.pos, m.spell, effectiveLevel(playerEntity), playerFeet, playerCaster(m.cast ?? null), { playerHeight, allies: !!m.ally, duel: !!m.duel, boss: m.boss ?? !!m.duel });
          else applySpellToFoe(m.spell, effectiveLevel(playerEntity), f, playerCaster(m.cast ?? null));
          showImpactFlash(m, [m.pos[0], m.pos[1], m.pos[2]]);
          retireMissile(m);
          break;
        }
      }
      const hitBody = m.dead ? null : corpsePrefabStruck(m.pos, foes(), MISSILE_COLLIDER_RADIUS);
      if (hitBody) {
        hitBody.corpsePrefab.struck(m.spell, effectiveLevel(playerEntity), playerCaster(m.cast ?? null));
        if (m.spell.rangeType === 4) explodeAt(m.pos, m.spell, effectiveLevel(playerEntity), playerFeet, playerCaster(m.cast ?? null), { playerHeight, allies: !!m.ally, duel: !!m.duel, boss: m.boss ?? !!m.duel });
        showImpactFlash(m, [m.pos[0], m.pos[1], m.pos[2]]);
        retireMissile(m);
      }
    }
    for (let i = missiles.length - 1; i >= 0; i--) if (missiles[i].dead) missiles.splice(i, 1);
  }

  // An item's spell spends no magicka and leaves lastCastCost, which the absorption cap reads, unchanged.
  function castByItemSelf(spell, item = null) {
    if (barredHere()) return null;
    if (wardedHere(spell)) return null;
    // castByItem carries the source item, which Open reads for the Skeleton's Key.
    const r = applySpellToPlayer(spell, effectiveLevel(playerEntity), playerCaster(), { bypassSavingThrows: true, bypassChance: true, castByItem: item });
    if (r.healed > 0) say(`You are healed ${r.healed} points.`);
    surfacePlayer();
    return r;
  }

  return {
    readySpell,
    recastSpell() {
      if (!lastSpell || castInProgress || castBusy()) return false;
      if (!hasSpellbook(playerEntity)) { say(localizedText('noSpellbook', NO_SPELLBOOK_TEXT)); return false; }
      readySpell(lastSpell);
      return readiedSpell === lastSpell;
    },
    abortReadySpell() {
      if (!readiedSpell) return false;
      readiedSpell = null; readiedFree = false; readiedCost = 0;
      if (pendingClickCast) setPending(false);
      return true;
    },
    castInput,
    update,
    castByItemSelf,
    barCast: () => barredHere(),
    explodeAt,
    applySpellToPlayer,
    strikePlayerFrom: (spell, casterLevel, foe) => applySpellToPlayer(spell, casterLevel, foe?.entity ? { entity: foe.entity, sinks: foeSinks(foe), foe } : null),
    applySpellToFoe,
    drinkPotion(recipeKey, potent = 0) {
      const plain = potionBundle(recipeKey);
      if (!plain) return null;
      const bundle = potent ? { ...plain, effects: plain.effects.map((e) => (potentOk(potent) ? potentEffect : scaleEffect)(e, potent, effectiveLevel(playerEntity))) } : plain;
      applySpellToPlayer(bundle, effectiveLevel(playerEntity), null,
        { bypassSavingThrows: true, bypassChance: true });
      audio.playOneShotId(SPELL_CAST_SOUND[bundle.element] ?? SPELL_CAST_SOUND[4], 1);
      return bundle.name;
    },
    spellArmed: () => readiedSpell != null || pendingClickCast,
    // With a spell in the free hand beside a drawn weapon, only a cast's own press fires the spell.
    interceptAttack(held, { cast = false } = {}) {
      if (!cast && spellHandUp()) return false;
      if (held && readiedSpell != null && !pendingClickCast) { setPending(true); return true; }
      return false;
    },
    firePending(eye, dir, held = false) {
      if (eye && dir) lastAim = { eye: [eye[0], eye[1], eye[2]], dir: [dir[0], dir[1], dir[2]] };
      if (!pendingClickCast) return false;
      if (spellHandBusy()) return false;
      if (held) return false;
      setPending(false);
      return castInput(eye, dir);
    },
    castInProgress: () => castInProgress,
    offsetAll(offset) {
      candle.offsetAll(offset);
      for (const m of peerCandleMounts.values()) m.offsetAll(offset);
      impacts.offsetAll(offset);
      shiftSparks(offset); fx.shift(offset);
      bunny.shift(offset);
      for (const m of missiles) {
        if (m.dead) continue;
        for (let a = 0; a < 3; a++) {
          m.pos[a] += offset[a];
          if (m.firePos) m.firePos[a] += offset[a];
        }
      }
    },
    batches() {
      const intensity = spellIntensity();
      if (intensity === 1) return batches;
      if (!intensity) return batches.filter((batch) => candleBatches.has(batch));
      return batches.map((batch) => candleBatches.has(batch) ? batch : {
        ...batch,
        conceal: batch.conceal ? { ...batch.conceal, alpha: batch.conceal.alpha * intensity } : allyConceal({ alpha: intensity }),
      });
    },
    peerCandles(list, dt) {
      if (egAllyLook()?.glow === 0) list = null;
      const want = new Set();
      _peerCandleLights.length = 0;
      for (const c of list ?? []) {
        if (!c || c.id == null || !c.feet) continue;
        want.add(c.id);
        let m = peerCandleMounts.get(c.id);
        if (!m) { m = mintPeerCandle(); peerCandleMounts.set(c.id, m); }
        m.update(dt, { active: true, feet: c.feet, height: c.height, forward: c.forward });
        const l = m.light();
        if (l) _peerCandleLights.push(l);
      }
      for (const [id, m] of peerCandleMounts) if (!want.has(id)) { m.clear(); peerCandleMounts.delete(id); }
      return _peerCandleLights;
    },
    destroy() {
      for (const m of missiles) retireMissile(m);
      missiles.length = 0;
      candle.clear();
      for (const m of peerCandleMounts.values()) m.clear();
      peerCandleMounts.clear();
      clearSparks(); fx.clear();
      bunny.clearAll();
      mwFx.destroy();
      if (fxPass) { const p = fxPass; fxPass = null; fxBroken = true; p.destroy(); }
      impacts.clear();
      for (const b of batches) { flatAnims.remove(b); renderer.destroyBillboardBatch(b); }
      batches.length = 0;
      candleBatches.clear();
    },
    // Interior teardown does not end its missiles, so the street retires every missile still in flight.
    clearFlyingMissiles: retireAllMissiles,
    clearMissiles() {
      retireAllMissiles();
      clearSparks(); fx.clear();
      bunny.clearAll();
      mwFx.clear();
    },
    fxColours: () => fx.artColours(),
    candleLight: () => candle.light() ?? fx.light(spellIntensity()),
    techniqueFx: (recipe, at, o) => fx.weaponTechnique(recipe, at, o),
    // Hosts call this right after this engine's billboards, in their world pass.
    drawFx() {
      const intensity = spellIntensity();
      try { bunny.draw(renderer, intensity); } catch (e) { console.warn('[spells] Failed to draw conjured spell effects', e?.message ?? e); }
      const mw = intensity > 0 && mwFx.draw();
      if (!fx.live || fxBroken || !renderer?.gl || !renderer._proj || !renderer._view) return mw;
      const n = fx.build(intensity);
      if (!n) return mw;
      if (!fxPass) { try { fxPass = new SpellImpactPass(renderer.gl); } catch (e) { fxBroken = true; console.warn('[magic] the impact pass would not build', e?.message ?? e); return mw; } }
      renderer.endUiRun?.();
      const eye = renderer._camPos;
      fxPass.draw(fx.buf, n, renderer._proj, renderer._view, eye, { mode: renderer._fogMode, density: renderer._fogDensity, range: renderer._fogRange, camPos: eye, focus: renderer._focus, haze: renderer._haze });
      renderer.markForeignPass?.();
      return true;
    },
    missileCount: () => missiles.length,
    readied: () => readiedSpell,
    readiedIndex: () => readiedSpell?.index ?? null,
    readiedCost: () => (readiedSpell ? readiedCost : 0),
    // A mode flip hands the ready, its freeness, and its price to the engine where the player now stands.
    handReadyTo(other) {
      if (!readiedSpell || !other?.takeReady) return false;
      other.takeReady({ sp: readiedSpell, free: readiedFree, cost: readiedCost, pending: pendingClickCast });
      readiedSpell = null; readiedFree = false; readiedCost = 0; pendingClickCast = false;
      return true;
    },
    takeReady({ sp = null, free = false, cost = 0, pending = false } = {}) { readiedSpell = sp; readiedFree = !!sp && !!free; readiedCost = sp ? cost : 0; setPending(!!sp && !!pending); },
    allyInReach,
    setReadiedByIndex(index, spellsByIndex) {
      readiedSpell = index != null
        ? (spellsByIndex?.get(index) ?? (playerEntity?.spells ?? []).find((sp) => sp?.index === index) ?? null)
        : null;
      readiedFree = false;
      readiedCost = readiedSpell ? calculateCastCost(readiedSpell, playerEntity).sp : 0;
    },
    setReadied(sp) {
      readiedSpell = sp ?? null;
      readiedFree = false;
      readiedCost = readiedSpell ? calculateCastCost(readiedSpell, playerEntity).sp : 0;
    },
    // Visual only: another player's cast applies, spends, and tallies nothing here.
    spellVisual({ from, dir, element = 4, rangeType = 2, casterId = null }) {
      if (!Array.isArray(from) || from.length !== 3 || !from.every(Number.isFinite)) return false;
      const el = Number.isInteger(element) && element >= 0 && element <= 4 ? element : 4;
      try { peerHeard(() => audio.play3dId?.(SPELL_CAST_SOUND[el] ?? SPELL_CAST_SOUND[4], from, 1, { maxDistance: 16 })); } catch {}
      const look = { element: el, rangeType };
      const q = casterId != null ? (peerBodies?.() ?? []).find((b) => b && b.id === casterId && Array.isArray(b.feet)) : null;
      const feet = q ? q.feet : [from[0], from[1] - CAPSULE_HEIGHT * 0.9, from[2]];
      const quiet = egAllyLook();
      mwFx.cast(look, feet, quiet ? { alpha: quiet.alpha } : undefined);
      if (rangeType === 2 || rangeType === 4) {
        if (!Array.isArray(dir) || dir.length !== 3 || !dir.every(Number.isFinite)) return false;
        // Another player's Meteor comes from their pose (net/peerConjured.js), so skip its ordinary missile.
        if (rangeType === 4 && bunny.conjured.peerMeteorJust(casterId)) return true;
        missiles.push(withBolt({ spell: look, pos: [...from], dir: [...dir], age: 0, batch: null, fromPlayer: null, visual: true, casterId, quiet }));
        return true;
      }
      const at = rangeType === 1 && Array.isArray(dir) ? [from[0] + dir[0] * 1.5, from[1] + dir[1] * 1.5, from[2] + dir[2] * 1.5] : [from[0], from[1] - 0.6, from[2]];
      impacts.showImpactFlash(missileArchive(el), at, 1, allyConceal(quiet));
      if (rangeType === 1 && !quiet) landFx(elementFxKind(el), at, { scale: 0.75, power: 0.6, heard: 24 });
      return true;
    },
    skyFire({ from, to }) {
      const ok = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
      if (!ok(from) || !ok(to)) return false;
      const d = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
      if (!(d > 0)) return false;
      missiles.push({ spell: { element: 0, rangeType: 2 }, pos: [...from], dir: [(to[0] - from[0]) / d, (to[1] - from[1]) / d, (to[2] - from[2]) / d], age: 0, batch: null, fromPlayer: null, visual: true, casterId: null, sky: true, to: [...to], left: d, scale: SKY_FIRE_SCALE });
      return true;
    },
    fireEnemyMissile(from, dir, spell, casterLevel, casterFoe) {
      if (casterFoe?.ai?.feet) mwFx.cast(spell, casterFoe.ai.feet, { body: { height: casterFoe.ai.height ?? CAPSULE_HEIGHT, radius: casterFoe.ai.radius ?? PLAYER_BODY_RADIUS } });
      const t = casterFoe?.ai?._armedTargeting ? casterFoe.ai.target : null;
      const aimFoe = t && t.isPlayer !== true && t.ai ? t : null;
      // Latch friendly status at fire time, so the bolt still spares the player if its target or caster dies.
      const friendly = isShipmate(casterFoe) || (aimFoe != null && casterFoe?.entity?.team === 'PlayerAlly');
      missiles.push(withBolt({ spell, casterLevel, casterFoe, aimFoe, friendly, pos: [...from], dir: [...dir], age: 0, batch: null, fromPlayer: false }));
    },
    mwFx,
    conjured: bunny.conjured,
  };
}
