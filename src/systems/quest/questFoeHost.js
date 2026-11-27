// Host half of quest enemy spawning: a handle stays data until placement finds a spot for the pool's async build.

import { QuestResourceBehaviour } from './resourceBehaviour.js';
import { questNameIn } from './machine.js';
import { applySpell } from '../../magic/effects.js';
import { GENDERS } from '../../characters/nameHelper.js';
import { mendedFoeSpot } from './markerCuration.js';
import { placeFoeFreely, PLACE_FOE_DEFAULTS, MARKER_FLOOR_REACH } from './sceneMount.js';
import { bodyFits, lodgedIn } from '../../characters/foeSpacing.js';

export function questFoeGender(foe) { return foe.gender === GENDERS.Female ? 'female' : 'male'; }

// start() waits for placement, as Unity defers Start on an inactive object.
export function mintQuestFoeWave(machine, foe, count) {
  const total = Math.min(Math.max(count, 1), 8);
  const handles = [];
  for (let i = 0; i < total; i++) {
    const behaviour = new QuestResourceBehaviour(machine);
    behaviour.assignResource(foe);
    handles.push({ foe, behaviour });
  }
  return handles;
}

export function bindQuestFoeHost(f, behaviour, pool) {
  const host = {
    // No caller reaches setActive for an enemy; update() removes a hidden one through destroy instead.
    setActive: () => {},
    destroy: () => pool.removeFoe(f),
    enemy: {
      get currentHealth() { return f.entity.health; },
      get maxHealth() { return f.entity.maxHealth; },
      setCurrentHealth: (n) => { if (n <= 0) pool.zeroFoeHealth(f); else f.entity.health = n; },
      setNonHostile: () => { if (f.ai) f.ai.isHostile = false; },
      hasEffectManager: () => true,
      assignSpellBundle: (ref) => {
        if (ref?.customKey) return;
        const record = pool.spellsByIndex?.()?.get?.(ref?.classicId);
        if (!record) return;
        applySpell(record, f.entity.level ?? 1, f.entity, pool.foeSinks(f), pool.rolls ?? Math.random, null, { bypassSavingThrows: true });
      },
      hasCorpseLootContainer: () => false,
      addItemsToEntity: (items) => { if (items) (f.entity.items ??= []).push(...items); },
    },
  };
  f.questBehaviour = behaviour;
  behaviour.bindHost(host);
  behaviour.start();
  return host;
}

// Interiors try the ring first, then a near ring that ignores the view, then the room's markers.
export const ROOM_RING_MISSES = 30;
export const ROOM_NEAR_RING = Object.freeze({ minDistance: 2.5, lineOfSightCheck: false });

export function roomMarkerSpot(env, spots) {
  const C = PLACE_FOE_DEFAULTS, me = env.playerPosition;
  const d2 = (p) => (p[0] - me.x) ** 2 + (p[2] - me.z) ** 2;
  const list = (spots ?? []).filter((p) => d2(p) <= C.maxDistance ** 2).sort((a, b) => d2(b) - d2(a));
  for (const p of list) {
    const floor = env.raycast({ x: p[0], y: p[1] + 0.2, z: p[2] }, { x: 0, y: -1, z: 0 }, MARKER_FLOOR_REACH);
    if (!floor) continue;
    const t = { x: floor.point.x, y: floor.point.y + C.separationDistance, z: floor.point.z };
    if (env.overlapSphere?.(t, C.overlapSphereRadius)) continue;
    if (env.bodyClear && !env.bodyClear(floor.point)) continue;
    return t;
  }
  return null;
}

export function placeRoomQuestFoe(env, handle, spots) {
  const ring = placeFoeFreely(env);
  if (ring) return ring;
  handle.ringMisses = (handle.ringMisses ?? 0) + 1;
  if (handle.ringMisses < ROOM_RING_MISSES) return null;
  return placeFoeFreely(env, ROOM_NEAR_RING) ?? roomMarkerSpot(env, spots);
}

const DUNGEON_GEOMETRY_BUCKET = 'dungeon';

export function placeFoeEnv({ collider, playerFeet, playerYawRad, fovDegrees, rolls = Math.random, isOccupied = null }) {
  const toObj = (p) => ({ x: p[0], y: p[1], z: p[2] });
  return {
    playerPosition: toObj(playerFeet),
    playerYawRadians: playerYawRad,
    fovDegrees,
    rolls,
    raycast: (origin, dir, maxDist) => {
      const o = [origin.x, origin.y, origin.z];
      const d = [dir.x, dir.y, dir.z];
      // Unity's raycast never hits a back face, but this collider is two-sided, so dungeon back faces pass through.
      const pastBack = (r) => r.back === true && r.key === DUNGEON_GEOMETRY_BUCKET;
      let h = collider.raycastHit(o, d, maxDist);
      let travelled = 0;
      for (let k = 0; k < 8 && pastBack(h) && Number.isFinite(h.dist); k++) {
        travelled = h.dist + 0.01;
        if (travelled >= maxDist) { h = { dist: Infinity, normal: null, back: false }; break; }
        const o2 = [o[0] + d[0] * travelled, o[1] + d[1] * travelled, o[2] + d[2] * travelled];
        const h2 = collider.raycastHit(o2, d, maxDist - travelled);
        h = { ...h2, dist: Number.isFinite(h2.dist) ? h2.dist + travelled : Infinity };
      }
      if (pastBack(h)) h = { dist: Infinity, normal: null, back: false };
      let dist = h.dist;
      let normal = h.normal;
      // Exterior terrain lives in heightAt, not in triangles, so a straight-down probe checks it too.
      if (d[1] < -0.999 && Math.abs(d[0]) < 1e-6 && Math.abs(d[2]) < 1e-6) {
        const drop = o[1] - (collider.heightAt?.(o[0], o[2]) ?? -Infinity);
        if (drop >= 0 && drop <= maxDist && drop < dist) { dist = drop; normal = [0, 1, 0]; }
      }
      if (!Number.isFinite(dist) || dist > maxDist) return null;
      return {
        point: { x: o[0] + d[0] * dist, y: o[1] + d[1] * dist, z: o[2] + d[2] * dist },
        normal: normal ? { x: normal[0], y: normal[1], z: normal[2] } : { x: -d[0], y: -d[1], z: -d[2] },
        distance: dist,
      };
    },
    overlapSphere: (p, r) => collider.sphereOverlaps([p.x, p.y, p.z], r) || (isOccupied?.(p, r) ?? false),
    // One sphere 1.25 m over the floor misses low crates and knee-high walls, so the whole body is checked too.
    bodyClear: (p) => { const f = [p.x, p.y, p.z]; return bodyFits(collider, f) && !lodgedIn(collider, f); },
  };
}

export function entityOccupancy(feetOf, liveFoes, playerFeet) {
  const CAPSULE_R = 0.45;
  return (p, r) => {
    const hit = (feet, half = 0.9) => {
      if (!feet) return false;
      const dx = feet[0] - p.x, dy = feet[1] + half - p.y, dz = feet[2] - p.z;
      return dx * dx + dy * dy + dz * dz < (r + CAPSULE_R) * (r + CAPSULE_R);
    };
    if (hit(playerFeet)) return true;
    for (const f of liveFoes()) if (!f.dead && hit(feetOf(f), (f.ai?.height ?? 1.8) / 2)) return true;
    return false;
  };
}

// Pool builds are async, so a placement holds its spot until its enemy joins the pool, or a wave piles up.
const _heldSpots = new WeakMap();
export function heldSpots(collider) {
  let set = _heldSpots.get(collider);
  if (!set) _heldSpots.set(collider, (set = new Set()));
  return set;
}
export function holdSpotWhile(collider, spot, stand) {
  const set = heldSpots(collider);
  const held = { ai: { feet: [spot.x, spot.y - 0.9, spot.z], height: 1.8 } };
  set.add(held);
  const release = () => { set.delete(held); };
  let landing;
  try { landing = stand(); } catch (err) { release(); throw err; }
  return Promise.resolve(landing).finally(release);
}

export const QUEST_SHARE_RADIUS = 100;

export function questShareTag(machine, f, partied) {
  const b = f?.questBehaviour;
  if (!partied || !b || !machine) return null;
  const quest = machine.getQuest?.(b.questUID) ?? null;
  const s = b.targetSymbol?.name;
  if (!quest || quest.questTombstoned || typeof s !== 'string' || !machine.hasSharedQuestNamed?.(quest.questName)) return null;
  return { q: quest.questName, s };
}

// `pv: 1` marks a quest enemy no party shares; world quest enemies travel as encounter enemies instead.
export function questPrivateTag(machine, f) {
  const b = f?.questBehaviour;
  if (!b || !machine || isWorldQuestFoe(f)) return null;
  const quest = machine.getQuest?.(b.questUID) ?? null;
  const s = b.targetSymbol?.name;
  if (!quest || quest.questTombstoned || typeof s !== 'string' || typeof quest.questName !== 'string') return null;
  return { q: quest.questName, s, pv: 1 };
}

// Only party members see, strike, or are hunted by another player's quest enemies; the rest of the seam reads live.
const _partyOnlySeams = new WeakMap();
export function partyOnlyQuestShare(seam) {
  if (!seam) return null;
  let w = _partyOnlySeams.get(seam);
  if (!w) {
    const member = (id) => id != null && !!seam.partyPeer?.(id);
    const accepts = (from, tag) => member(from) && (typeof seam.accepts === 'function' ? !!seam.accepts(from, tag) : true);
    const peerMayHit = (id, f) => member(id) && !!seam.peerMayHit?.(id, f);
    w = new Proxy(seam, { get: (t, k) => (k === 'accepts' ? accepts : k === 'peerMayHit' ? peerMayHit : t[k]) });
    _partyOnlySeams.set(seam, w);
  }
  return w;
}

export function partyQuestFoe(machine, tag) {
  if (!machine || !tag || typeof tag.q !== 'string' || typeof tag.s !== 'string') return null;
  const linked = sharedQuestFoe(machine, tag);
  if (linked) return linked;
  const quest = machine.sharedCandidateNamed?.(tag.q) ?? null;
  if (!quest || quest.questTombstoned || !quest.resources) return null;
  for (const r of quest.resources.values()) if (r.isFoe && r.symbol?.name === tag.s) return countsByName(quest, r) ? r : null;
  return null;
}

// An unlinked copy counts a kill by name only when its own tasks count that target and it carries no quest item.
export function countsByName(quest, foe) {
  if ((foe?.itemQueue?.length ?? 0) > 0) return false;
  const name = foe?.symbol?.name;
  for (const task of quest?.tasks?.values?.() ?? []) {
    for (const a of task.actions ?? []) {
      if (a?.isTriggerCondition && (a.typeName === 'KilledFoe' || a.typeName === 'InjuredFoe') && a.foeSymbol?.name === name) return true;
    }
  }
  return false;
}

// World quest enemies travel as encounter enemies for everyone. Only a quest whose tasks count no kills may join.
export const WORLD_QUESTS = Object.freeze(['S0000977']);

export function questNameOf(f) {
  const b = f?.questBehaviour;
  if (!b) return null;
  const quest = b.targetQuest ?? b.machine?.getQuest?.(b.questUID) ?? null;
  return typeof quest?.questName === 'string' ? quest.questName : null;
}

// Cached per behavior once known, so an enemy's world status cannot flip mid-fight.
const _worldOf = new WeakMap();
export function isWorldQuestFoe(f) {
  const b = f?.questBehaviour;
  if (!b) return false;
  let w = _worldOf.get(b);
  if (w === undefined) {
    const n = questNameOf(f);
    if (n == null) return false;
    w = questNameIn(WORLD_QUESTS, n);
    _worldOf.set(b, w);
  }
  return w;
}

export const isPrivateQuestFoe = (f) => !!f?.questBehaviour && !isWorldQuestFoe(f);

export function sharedQuestFoe(machine, tag) {
  if (!machine || !tag || !machine.hasSharedQuestNamed?.(tag.q)) return null;
  const quest = machine.sharedCandidateNamed?.(tag.q) ?? null;
  if (!quest) return null;
  for (const r of quest.resources.values()) if (r.isFoe && r.symbol?.name === tag.s) return r;
  return null;
}

// Each held kill stays in pose rows for KEPT_KILL_HOLD_MS; a member counts it once, from a row or a puppet fall.
export const KEPT_KILL_HOLD_MS = 5 * 60 * 1000;
export const KEPT_KILL_MEMORY_MS = 2 * KEPT_KILL_HOLD_MS;
export class KeptKillLedger {
  constructor({ max = 8, holdMs = KEPT_KILL_HOLD_MS, memoryMs = KEPT_KILL_MEMORY_MS } = {}) {
    this.max = max; this.holdMs = holdMs; this.memoryMs = memoryMs;
    this._said = [];
    this._counted = new Map();
  }
  said(tag, i, now) {
    if (!tag || typeof tag.q !== 'string' || typeof tag.s !== 'string' || !Number.isInteger(i)) return false;
    this._said.push({ q: tag.q, s: tag.s, i, at: now });
    if (this._said.length > this.max) this._said.splice(0, this._said.length - this.max);
    return true;
  }
  rows(now) {
    this._said = this._said.filter((r) => now - r.at < this.holdMs);
    return this._said.length ? this._said.map(({ q, s, i }) => ({ q, s, i })) : null;
  }
  credit(owner, q, s, i, now) {
    for (const [k, at] of this._counted) if (now - at >= this.memoryMs) this._counted.delete(k);
    const k = `${owner}|${q}|${s}|${i}`;
    if (this._counted.has(k)) return false;
    this._counted.set(k, now);
    return true;
  }
}

// The injury goes before the kill, as the behavior's own update sets it before death.
export function creditKeptKills(machine, ledger, owner, rows, now) {
  if (!machine || !ledger || !owner || !Array.isArray(rows)) return 0;
  let n = 0;
  for (const r of rows) {
    const foe = partyQuestFoe(machine, r);
    if (!foe || !ledger.credit(owner, r.q, r.s, r.i, now)) continue;
    if (!foe.injuredTrigger) foe.setInjured?.();
    foe.creditPartnerKill?.(owner);
    n++;
  }
  return n;
}

// This copy skips its wave only while the sharer is near and their copy shows this wave's enemy here.
export function partnerStandsQuestFoes({ questName, symbol, sharerOf, inMyParty, peers, accountOfPeer, myFeet, foes, radius = QUEST_SHARE_RADIUS }) {
  const sharer = questName ? sharerOf(questName) : null;
  if (!sharer || !inMyParty(sharer) || !myFeet) return false;
  for (const p of peers ?? []) {
    if (!p || accountOfPeer(p.id) !== sharer || !Array.isArray(p.feet)) continue;
    const dx = p.feet[0] - myFeet[0], dz = p.feet[2] - myFeet[2];
    if (dx * dx + dz * dz <= radius * radius) return sharerFoeStands({ foes, sharer, questName, symbol, accountOfPeer });
  }
  return false;
}

function sharerFoeStands({ foes, sharer, questName, symbol, accountOfPeer }) {
  for (const f of foes ?? []) {
    if (f.dead) continue;
    const tag = f._pupQuest;
    if (!tag || tag.q !== questName || tag.s !== symbol) continue;
    if (accountOfPeer(f.puppet ?? f._ownFrom) === sharer) return true;
  }
  return false;
}

export function questBehaviourFor(machine, tag) {
  const foe = sharedQuestFoe(machine, tag);
  if (!foe) return null;
  const b = new QuestResourceBehaviour(machine);
  b.assignResource(foe);
  return b;
}

export function adoptsOrphanQuestFoe({ myId, myFeet, foeFeet, partyPeers, radius = QUEST_SHARE_RADIUS }) {
  if (myId == null || !myFeet || !foeFeet) return false;
  const near = (a) => { const dx = a[0] - foeFeet[0], dz = a[2] - foeFeet[2]; return dx * dx + dz * dz <= radius * radius; };
  if (!near(myFeet)) return false;
  const me = String(myId);
  for (const p of partyPeers ?? []) if (p?.id != null && Array.isArray(p.feet) && near(p.feet) && String(p.id) < me) return false;
  return true;
}

// Offline a quest box on top pauses enemies, as the classic message box pauses the game; online nothing is held.
export const questBoxHoldsFoes = (win, { online, onTop }) => !online && !!win && !win.done && !!onTop(win);

export function reviveQuestBehaviour(machine, data) {
  if (!machine || !data) return null;
  const b = new QuestResourceBehaviour(machine);
  b.restoreSaveData(data);
  if (!b.questUID || b.targetSymbol == null) return null;
  return b;
}

export const SEALED_SAVE_REACH_M = 6, SEALED_SAVE_LEVEL_M = 1.5;
export function restandMendedQuestFoe(machine, ctx, behaviour, feet, lift) {
  const m = ctx ? mendedFoeSpot(machine, behaviour) : null;
  if (!m) return null;
  const was = ctx.parentPt(m.from.x, m.from.y + lift, m.from.z);
  if (Math.abs(feet[1] - was[1]) > SEALED_SAVE_LEVEL_M || Math.hypot(feet[0] - was[0], feet[2] - was[2]) > SEALED_SAVE_REACH_M) return null;
  return ctx.parentPt(m.to.x, m.to.y + lift, m.to.z);
}
