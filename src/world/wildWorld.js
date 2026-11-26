// The wilderness zone in the world: its halls, giants, and strangers, and the fights between
// players with their referee, deaths, drops, remains, and rise. It also holds unstuck, the zone's
// journeys and teleport rules, and what the maps show of players there.

import { setMidScreenText } from '../ui/midScreenText.js';
import { areEnemiesNearby, foeAlerted } from '../characters/encounters.js';
import { audio } from '../audio/audio.js';
import { betterAmbience } from '../audio/betterAmbience.js';
import { bloodHit } from '../combat/bloodDecals.js';
import { CAPSULE_HEIGHT } from '../player/motor.js';
import {
  createPartyTruce, GREATER_GIANT_CALL, GREATER_GIANT_CALL_AT, isWildRegion, setWildDeath, setWildHere, setWildMask,
  WILD_DEATH_HOLD_S, WILD_GIANT, WILD_NAME, WILD_RINGS, WILD_STRANGER_M, WILD_STRANGER_RGBA, WILD_STRANGER_SEE_M,
  WILD_TEXT, wildDeath, wildDeathAtHand, wildFallHeard, wildHere, wildInside, wildMask, wildMaskOf, wildNear,
  wildRingAt, wildRingName, wildZoneKind, zoneWord,
} from './wildZone.js';
import { createSiegeHud } from '../ui/siegeHud.js';
import { createWildRejoin } from './wild/wildRejoin.js';
import { CRIMES, deductGoldPieces, setCrimeCommitted } from '../justice/court.js';
import { CROMWARK_ON, cromwarkPeace } from './wild/cromwark.js';
import { DecisionBoxWindow } from '../ui/decisionBox.js';
import { dfuBlowWear, isEquipped, lowerCondition, unequipItem, wearableItem } from '../characters/equip.js';
import { drawWildMarks, WILD_MARK_RANGE } from '../ui/wildMarks.js';
import { SIEGE_HIT as DUEL_REF_KIND } from '../net/siegeRef.js';
import {
  duelAttackerOf, duelStandIn, duelSwingOf, duelWeaponOf, duelWearDamage, resolveDuelStrike,
} from '../combat/duelCombat.js';
import { ENEMY_HIT_VOLUME, hitSoundFor, PLAYER_HIT_VOLUME } from '../audio/soundClips.js';
import { enhancedHudScale } from '../ui/enhancedHud.js';
import { ETHER_KIND, etherInPeace, etherRiseSite, etherWildRingAt } from './wild/etherWild.js';
import { flashPlayerDamage } from '../ui/damageFlash.js';
import { forcePlayerDeath, playerEntity, presentHeardDeath, surfacePlayer } from '../characters/playerEntity.js';
import { giantGroundBlocked, WILD_GIANT_FIELD_M, WILD_GIANT_RESPAWN_MS, WILD_GIANT_STAND_M, wildGiantsAt } from './wildGiants.js';
import { hudFade } from '../ui/fadeLayer.js';
import { inEther } from './ethericSea.js';
import {
  isCellRoom, seaRoomOf, spawnedHallMapId, WDUN_HERE_MS, WDUN_LOCK_MS, WILD_DATA_MAX, WILD_ITEMS_MAX, WILD_REMAINS_MS,
} from '../net/wire.js';
import { itemLongName } from '../items/itemInfo.js';
import { keepMine, keptMine, markRemains, remainsMarkTick } from './wild/wildRemainsWaypoint.js';
import { LOCATION_TYPES } from '../formats/mapsFile.js';
import { locationWorldRect, worldCoordToMapPixel } from './streamingWorld.js';
import { nativeToMapPoint } from '../maps/mapWaypoints.js';
import { nearestSafeLocationAnywhere } from '../player/deathRespawn.js';
import { noteFirstUse } from '../ui/tutorials.js';
import { playerMeleeCanHit } from '../combat/playerWeapon.js';
import { playerPainVoice, playPlayerVoice } from '../combat/hostCombat.js';
import { projectToScreen } from '../player/tapRay.js';
import { QUICK_SAVE_NAME } from '../saves/saveSlots.js';
import { readWildReceipt, wildFallGraceS } from '../net/wildReceipt.js';
import { realmGoldAct } from '../saves/realmSaves.js';
import { reportPlayerAttack } from '../combat/formulas.js';
import { REPOSITION } from '../systems/naval/ship.js';
import { revenantsWithYou } from '../revenants/revenantCompanions.js';
import { sameGuild, WILD_REF, wildKin } from '../net/wildRef.js';
import { setLootMarksLive } from '../items/lootLines.js';
import { setPaceZoneCap, WILD_PACE_CAP } from '../travel/travelPace.js';
import { siegeCastClamp, siegeSpellNumbers } from '../combat/siegeCombat.js';
import { validLootList } from '../items/loot.js';
import { WILD_MARK_S } from '../ai/wildAlert.js';
import { WILD_NO_STORE, WILD_PILE_ICON } from '../net/wildRemains.js';
import {
  wildChunks, wildFallWords, wildPacks, wildRecord, wildRisePicks, wildSpawnSpot, wildTakeTook, wildTookAny,
  wornOffer,
} from '../player/wildDeath.js';
import { wildHallAt } from './wildDungeons.js';
import { withoutFirmament } from '../characters/firmamentPowers.js';
import { worldViewportRect } from '../ui/hudLarge.js';

/** @param {any} shared */
export function createWildWorld(shared) {
  const {
    _crimeResponse, _giantFalls, _giantsDown, _giantsStood, _hiddenPeers, _inAnyLocationRect, _insideSpawn,
    _isPlayerInTownStrict, _mode, _onlineWorldSession, _peerMapPoses, _questRegionIndex, _teleportToPixel, _veils,
    _wdunCrows, _wdunLocks, _wildHallKeys, _wildMarkAt, _wildMarkKeys, cam, campToWire, canvas, checkpointGateOpen,
    cityGuards, collider, droppedLoot, duelBody, duelEnemyNear, duelMgr, duelWorldOf, etherSea, exteriorFoes,
    gamePaused, hccOn, hccRuntime, heightAt, hitEffects, locationIndex, makeInventoryWindow, maps, myGuildTag,
    NO_BODIES, onlineCheckpoint, peerName, player, playerTravelPixel, realmSession, seaVentures, socialLink, state,
    townTalk, tradeSay, wdunDayNow, weaponRig, wildAccount, wildActiveOf, wildHallFree, wildHallStandOf,
    worldMoveBusy, worldQuickSave,
  } = shared;
  let _wildMarkKey = 0;
  function wildMarksFrame(proj, view, eye) {
    if (typeof document === 'undefined') return;
    const covered = townTalk.overlayActive || gamePaused() || !!townTalk.hudHidden || _mode() !== 'exterior' || !!shared.travelView?.active;
    const points = [];
    if (!covered) {
      const { w, h } = shared._canvasSize(), rect = worldViewportRect(w, h), t = performance.now() / 1000;
      for (const f of exteriorFoes.foes) {
        if (f.dead || !f.ai?.feet || !foeAlerted(f)) { _wildMarkAt.delete(f); continue; }
        if (!_wildMarkAt.has(f)) _wildMarkAt.set(f, t);
        if (!shared._wildGate && t - _wildMarkAt.get(f) > WILD_MARK_S) continue;
        if (_inAnyLocationRect(f.ai.feet)) continue;
        const head = [f.ai.feet[0], f.ai.feet[1] + (f.ai.height ?? CAPSULE_HEIGHT) + 0.35, f.ai.feet[2]];
        const d = Math.hypot(head[0] - eye[0], head[1] - eye[1], head[2] - eye[2]);
        if (d > WILD_MARK_RANGE) continue;
        const at = projectToScreen(head, w, h, proj, view, rect);
        if (!at.front || at.x < -60 || at.x > w + 60 || at.y < -60 || at.y > h + 60) continue;
        let key = _wildMarkKeys.get(f);
        if (key == null) { key = `wild:${++_wildMarkKey}`; _wildMarkKeys.set(f, key); }
        points.push({ key, x: at.x, y: at.y, distance: d });
      }
    }
    drawWildMarks(points, { covered, scale: enhancedHudScale() });
  }

  const STRANGER_CAST_SAY_MS = 3000;

  const wildMapMask = () => (_onlineWorldSession() ? wildMaskOf(maps) : null);
  const wildAtWire = (p, near = false) => {
    const m = wildMaskOf(maps);
    if (!p) return false;
    const px = worldCoordToMapPixel(p[0], p[2]);
    if (etherSea && (near ? inEther(px.x, px.y) : etherWildRingAt(px.x, px.y) > 0)) return true;
    return !!m && (near ? wildNear(m, px.x, px.y) : wildInside(m, px.x, px.y));
  };
  const wildOutdoors = () => (shared.modes?.mode ?? 'exterior') === 'exterior';
  let _wdunLink = null, _wdunHiAt = 0, _wdunHeard = false;

  let _giantsAt = 0;
  const _giantHeight = (x, y) => shared.woods.getHeightMapValue(x, y);
  const giantFieldSpot = (at) => {
    let best = null, bestScore = Infinity;
    for (let r = 0; r <= WILD_GIANT_FIELD_M; r += 20) {
      const n = r === 0 ? 1 : Math.max(6, Math.round(r / 10));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, x = at[0] + Math.cos(a) * r, z = at[2] + Math.sin(a) * r;
        const h = heightAt(x, z);
        if (!Number.isFinite(h)) continue;
        let slope = 0, ring = 0, m = 0;
        for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) { const q = heightAt(x + dx, z + dz); if (Number.isFinite(q)) slope = Math.max(slope, Math.abs(q - h)); }
        for (let k = 0; k < 8; k++) { const b = (k / 8) * Math.PI * 2, q = heightAt(x + Math.cos(b) * 30, z + Math.sin(b) * 30); if (Number.isFinite(q)) { ring += q; m++; } }
        const crest = m ? Math.max(0, h - ring / m) : 0;
        if (slope > 1.6 || crest > 4 || giantGroundBlocked(collider, x, h, z)) continue;
        { const c = state.worldCoords([x, h, z]), w = worldCoordToMapPixel(c.x, c.z); if (shared.tvWater(w.x, w.y)) continue; const zm = wildMapMask(); if (zm && !wildInside(zm, w.x, w.y)) continue; }
        const score = slope * 4 + crest * 2 + r * 0.02;
        if (score < bestScore) { bestScore = score; best = [x, h, z]; }
      }
      if (best && bestScore < 1.5) break;
    }
    return best;
  };
  const wildGiantsNow = () => {
    const mask = wildMapMask();
    if (!mask) return [];
    const now = Date.now();
    return wildGiantsAt(mask, wildHallFree, now + shared._wdunSkew, (g) => (_giantsDown.get(g) ?? 0) > now, _giantHeight);
  };

  let _giantNotice = [];
  const giantFallPlace = (g) => {
    const mask = wildMapMask();
    const until = _giantsDown.get(g) ?? Date.now();
    const at = until - WILD_GIANT_RESPAWN_MS + shared._wdunSkew;
    return mask ? (wildGiantsAt(mask, wildHallFree, at, () => false, _giantHeight).find((q) => q.g === g) ?? null) : null;
  };
  const giantFell = (g, where = null) => {
    if (_giantFalls.get(g)?.said) return;
    const p = where ?? giantFallPlace(g);
    _giantFalls.set(g, { x: p?.x ?? null, y: p?.y ?? null, ring: p?.ring ?? Math.floor(g / 2) + 1, said: true });
    if (!wildHere()) return;
    for (let k = 0; k < 6; k++) setTimeout(() => { try { betterAmbience.weaponKick(k === 0 ? 6 : 3.5 - k * 0.5); } catch {} }, k * 220);
    const ring = p?.ring ?? Math.floor(g / 2) + 1;
    _giantNotice.push(['A Greater Giant has fallen!', `${wildRingName(ring)} trembles as it hits the ground.`, 'It will rise again in half an hour.']);
    townTalk.say(`A Greater Giant has fallen in ${wildRingName(ring)}.`);
  };
  const giantNoticeFrame = () => {
    if (!_giantNotice.length || playerEntity.health <= 0) return;
    const fighting = duelEnemyNear() || areEnemiesNearby((shared.modes?.mode ?? 'exterior') === 'exterior' ? [...exteriorFoes.foes, ...cityGuards.guards] : (shared.modes?.insideFoes?.() ?? [])) || shared.wildFight.inFight?.();
    if (fighting || townTalk.overlay) return;
    const rows = _giantNotice.shift();
    townTalk.showOverlay(new DecisionBoxWindow({ rows, ok: true }));
  };
  const wildGiantMarks = () => {
    if (!wildMapMask()) return [];
    const now = Date.now();
    const fallen = [];
    for (const [g, f] of _giantFalls) {
      if (!((_giantsDown.get(g) ?? 0) > now)) { _giantFalls.delete(g); continue; }
      if (f.x != null) fallen.push({ g, ring: f.ring, x: f.x, y: f.y, dead: true });
    }
    return [...fallen, ...wildGiantsNow().map((gi) => {
      const st = _giantsStood.get(gi.g)?.foe ?? exteriorFoes.foes.find((f) => f?.puppet && !f.dead && f.entity?.zoneGiant === gi.g);
      const feet = st && !(st.entity?.health <= 0) ? (st.ai?.feet ?? st.feet) : null;
      if (feet) { const w = campToWire(feet); return { ...gi, x: w[0] / 32768, y: 500 - w[2] / 32768, here: true }; }
      return gi;
    })];
  };
  const HALL_ARRIVE_M = 40;
  const hallArrivalWatch = () => {
    const st = shared.travelOptions?.state;
    if (!st || !shared.travelOptions.isTravelActive) return;
    const summary = st.route?.summary ?? st.destinationSummary ?? null;
    const named = /\((\d{1,3}),(\d{1,3})\)\s*$/.exec(String(st.route?.name ?? st.destinationName ?? summary?.name ?? ''));
    const px = summary?.pixel?.x ?? (named ? Number(named[1]) : null), py = summary?.pixel?.y ?? (named ? Number(named[2]) : null);
    if (px == null || py == null) return;
    const hallLoc = summary?.loc?.wildHall ? summary.loc : (wildHallAt(wildActiveNow(), px, py) ? locationIndex.get(`${px},${py}`) : null);
    if (!hallLoc?.wildHall) return;
    let there = (shared.modes?.mode ?? 'exterior') === 'dungeon';
    if (!there) {
      const at = playerTravelPixel();
      if (at && at.x === px && at.y === py) {
        const r = locationWorldRect(hallLoc, px, py), n = state.worldCoords(player.feetAt()), g = HALL_ARRIVE_M * 40;
        there = ![r?.minX, r?.maxX, r?.minZ, r?.maxZ].every(Number.isFinite) || (n.x >= r.minX - g && n.x <= r.maxX + g && n.z >= r.minZ - g && n.z <= r.maxZ + g);
      }
    }
    if (!there) return;
    shared.travelOptions.interruptTravel?.();
    shared.travelOptions.clearTravelDestination();
    townTalk.say('You have arrived.');
  };
  const greaterGiantCall = (f, mask) => {
    const c = f.ai.feet;
    let stood = 0;
    for (let k = 0; k < GREATER_GIANT_CALL * 2 && stood < GREATER_GIANT_CALL; k++) {
      const a = (k / GREATER_GIANT_CALL) * Math.PI * 2 + (k >= GREATER_GIANT_CALL ? 0.3 : 0), r = 10 + ((k * 7) % 9);
      const x = c[0] + Math.cos(a) * r, z = c[2] + Math.sin(a) * r, h = heightAt(x, z);
      if (!Number.isFinite(h)) continue;
      const [mx, my] = giantMapAt([x, h, z]);
      if (!wildInside(mask, mx, my) || giantGroundBlocked(collider, x, h, z)) continue;
      stood++;
      exteriorFoes.spawnFoe(WILD_GIANT, [x, h, z], { yaw: Math.atan2(c[0] - x, c[2] - z), eliteFoe: false, champion: null, transient: true })
        .then((g) => { if (g) { g.ai.target = f.ai.target ?? g.ai.target; g.ai.makeHostileToPlayer?.(undefined, g.ai.feet); } })
        .catch(() => {});
    }
    try { betterAmbience.weaponKick(5); } catch {}
    const line = 'The Greater Giant bellows, and the giants of the mountains answer its call!';
    setMidScreenText(line, 4); townTalk.say(line);
  };
  const GIANT_RETREAT_M = 200;
  const giantMapAt = (p) => { const w = campToWire(p); return [w[0] / 32768, 500 - w[2] / 32768]; };
  const giantRetreatGoal = (mask, feet) => {
    let best = null, bestDepth = -1;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
      let ok = true;
      for (const r of [50, 100, 150, GIANT_RETREAT_M]) { const [mx, my] = giantMapAt([feet[0] + dx * r, feet[1], feet[2] + dz * r]); if (!wildInside(mask, mx, my)) { ok = false; break; } }
      if (!ok) continue;
      const to = [feet[0] + dx * GIANT_RETREAT_M, feet[1], feet[2] + dz * GIANT_RETREAT_M];
      const [mx, my] = giantMapAt(to);
      const d = mask.depth?.[Math.floor(my) * mask.width + Math.floor(mx)] ?? 0;
      if (d > bestDepth) { bestDepth = d; best = to; }
    }
    if (best) { const h = heightAt(best[0], best[2]); if (Number.isFinite(h)) best[1] = h; }
    return best;
  };
  const giantLeashFrame = () => {
    if (!_giantsStood.size) return;
    const mask = wildMapMask();
    if (!mask) return;
    const now = Date.now();
    const meOut = shared.playerSpawned && (shared.modes?.mode ?? 'exterior') === 'exterior' && (() => { const [mx, my] = giantMapAt(player.feetAt()); return !wildInside(mask, mx, my); })();
    for (const s of _giantsStood.values()) {
      const f = s.foe, feet = f?.ai?.feet;
      if (!feet || f.entity?.health <= 0) continue;
      if (!s.called && f.entity.maxHealth > 0 && f.entity.health <= f.entity.maxHealth * GREATER_GIANT_CALL_AT) { s.called = true; greaterGiantCall(f, mask); }
      const [mx, my] = giantMapAt(feet);
      const inside = wildInside(mask, mx, my);
      if (inside) s.inside = [feet[0], feet[1], feet[2]];
      else if (s.inside) { feet[0] = s.inside[0]; feet[1] = s.inside[1]; feet[2] = s.inside[2]; }
      if (!meOut) s.retreated = false;
      if (s.retreat) {
        const r = s.retreat, d = Math.hypot(r.to[0] - feet[0], r.to[2] - feet[2]);
        if (d < 12 || now > r.until) { f.ai.fleeLeft = 0; s.retreat = null; if (f.entity && f.entity.maxHealth > 0) f.entity.health = f.entity.maxHealth; continue; }
        const ux = (r.to[0] - feet[0]) / d, uz = (r.to[2] - feet[2]) / d;
        f.ai.fleeFrom = [feet[0] - ux * 10, feet[1], feet[2] - uz * 10];
        if (!(f.ai.fleeLeft > 1)) f.ai.fleeLeft = 5;
        continue;
      }
      const pressed = !inside && now - (s.retreatAt ?? 0) > 10_000;
      if (meOut && (!s.retreated || pressed)) {
        const to = giantRetreatGoal(mask, feet);
        s.retreated = true; s.retreatAt = now;
        if (!to) continue;
        s.retreat = { to, until: now + 60_000 };
        f.ai.flee([feet[0] * 2 - to[0], feet[1], feet[2] * 2 - to[2]], 60, 1.4);
      }
    }
  };
  const wildGiantsFrame = () => {
    const now = Date.now();
    if (now - _giantsAt < 500) return;
    _giantsAt = now;
    for (const [g, u] of _giantsDown) if (u <= now) _giantsDown.delete(g);
    for (const [g, s] of [..._giantsStood]) {
      const f = s.foe;
      if (!f) { if (s.at && now - s.at > 15_000) _giantsStood.delete(g); continue; }
      if (f.entity?.health <= 0) {
        _giantsStood.delete(g);
        _giantsDown.set(g, now + WILD_GIANT_RESPAWN_MS);
        { const feetF = f.ai?.feet ?? f.feet; const w = feetF ? campToWire(feetF) : null; giantFell(g, w ? { x: w[0] / 32768, y: 500 - w[2] / 32768, ring: Math.floor(g / 2) + 1 } : null); }
        const link = socialLink();
        if (link?.wdunGiantsOk && link.status === 'open') link.sendWdun({ k: 'gk', g });
        continue;
      }
      if (!exteriorFoes.foes.includes(f)) _giantsStood.delete(g);
    }
    if (!wildOutdoors() || !wildHere() || playerEntity.health <= 0 || shared.modes?.mode !== 'exterior') return;
    const pool = exteriorFoes.foes;
    for (const f of pool) {
      const g = f?.entity?.zoneGiant;
      if (!Number.isInteger(g) || f.puppet || f.dead || _giantsStood.get(g)?.foe === f) continue;
      _giantsStood.set(g, { foe: f, at: now, inside: null });
    }
    const feet = player.feetAt();
    const peers = shared.peersNear() ?? [];
    for (const gi of wildGiantsNow()) {
      if (_giantsStood.has(gi.g)) continue;
      if (pool.some((f) => f?.puppet && !f.dead && f.entity?.zoneGiant === gi.g)) continue;
      const near = shared.tvSceneOf(gi.x * 32768, (500 - gi.y) * 32768, 0);
      if (!near || !Number.isFinite(near[1])) continue;
      if (Math.hypot(near[0] - feet[0], near[2] - feet[2]) > WILD_GIANT_STAND_M) continue;
      // The lowest id among the players near a giant spawns it, so only one client does.
      const me = String(shared.online?.id ?? '');
      if (me && peers.some((p) => p?.id != null && String(p.id) < me && Array.isArray(p.feet) && Math.hypot(p.feet[0] - near[0], p.feet[2] - near[2]) <= WILD_GIANT_STAND_M + 150)) continue;
      const at = giantFieldSpot(near);
      if (!at) continue;
      const rec = { foe: null, at: now };
      _giantsStood.set(gi.g, rec);
      exteriorFoes.spawnFoe(WILD_GIANT, [at[0], at[1], at[2]], { yaw: Math.atan2(feet[0] - at[0], feet[2] - at[2]), zoneGiant: gi.g, transient: true })
        .then((f) => { if (f) rec.foe = f; else _giantsStood.delete(gi.g); })
        .catch(() => { _giantsStood.delete(gi.g); });
    }
  };
  const wdunWord = (w) => {
    const now = Date.now();
    seaVentures.hubWord(w);
    if (w.k === 'st') {
      _wdunHeard = true;
      if (Number.isFinite(w.now)) shared._wdunSkew = w.now - now;
      _wdunLocks.clear(); for (const [h, left] of w.locks) _wdunLocks.set(h, now + left);
      _wdunCrows.clear(); for (const [h, left] of w.crows) _wdunCrows.set(h, now + left);
      _giantsDown.clear(); for (const [g, left] of w.giants ?? []) _giantsDown.set(g, now + left);
      return;
    }
    if (w.k === 'gd') {
      const before = new Set(_giantsDown.keys());
      _giantsDown.clear(); for (const [g, left] of w.giants) _giantsDown.set(g, now + left);
      for (const g of _giantsDown.keys()) if (!before.has(g)) giantFell(g);
      return;
    }
    if (w.k === 'cr') {
      const before = new Set(_wdunCrows.keys());
      _wdunCrows.clear(); for (const [h, left] of w.crows) _wdunCrows.set(h, now + left);
      const kin = !!w.who && (!!shared.social?.inMyParty?.(w.who) || w.who === shared.social?.myAcct?.());
      if (!kin) for (const h of _wdunCrows.keys()) if (!before.has(h)) crowsSay(h);
      return;
    }
    if (w.k === 'lk') { _wdunLocks.set(w.h, now + w.left); return; }
    if ((w.k === 'ok' || w.k === 'no') && shared._wdunWait?.h === w.h) { const d = shared._wdunWait.done; shared._wdunWait = null; d(w); }
  };
  const crowsSay = (h) => {
    const sea = seaVentures.crowLine(h);
    if (!wildHere() || !!sea !== (wildZoneKind() === ETHER_KIND)) return;
    if (shared._wildMine?.dungeon === h && Date.now() - (shared._wildMine.until - WILD_REMAINS_MS) < 30_000) return;
    const [x, y] = h.split(',').map(Number);
    const hall = wildHallAt(wildActiveNow(), x, y);
    const name = locationIndex.get(h)?.name ?? 'an elite hall';
    const line = sea ?? `Crows gather over ${name}${hall ? ` in ${wildRingName(hall.ring)}` : ''}. Someone has fallen there.`;
    setMidScreenText(line, WILD_LINE_HOLD_S, { realTime: true });
    townTalk.say(line);
  };
  const wdunFrame = () => {
    const link = socialLink(), now = Date.now();
    if (link !== _wdunLink) { _wdunLink = link; _wdunHiAt = 0; if (link) link.onWdun = (w) => wdunWord(w); }
    const open = !!link?.wdunOk && link.status === 'open';
    if (!open) _wdunHiAt = 0;
    else if (!_wdunHiAt || now - _wdunHiAt > 10 * 60_000) { if (link.sendWdun({ k: 'hi' })) _wdunHiAt = now; }
    if (shared._wdunInside && open && now - shared._wdunInside.hereAt >= WDUN_HERE_MS) { link.sendWdun({ k: 'here', h: shared._wdunInside.h }); shared._wdunInside.hereAt = now; }
    for (const [h, u] of _wdunCrows) if (u <= now) _wdunCrows.delete(h);
    wildHallsRoll();
  };
  const wildActiveNow = () => wildActiveOf(wildMapMask());
  let _wildHallsDay = null;
  const wildHallsRoll = () => {
    const day = wildMapMask() ? wdunDayNow() : null;
    if (day == null || day === _wildHallsDay) return;
    _wildHallsDay = day;
    for (const key of [..._wildHallKeys]) if (locationIndex.get(key)?.wildHallDay !== day && !_insideSpawn(key)) { locationIndex.delete(key); _wildHallKeys.delete(key); shared._locIndexGen += 1; }
  };
  const wildHallStand = (px, py) => wildHallStandOf(wildMapMask(), px, py);
  const wildHallSummaries = () => (wildActiveNow() ?? []).map((h) => {
    const loc = wildHallStand(h.x, h.y);
    const lt = loc?.mapTableData?.locationType;
    return {
      id: h.y * 1000 + h.x, mapID: spawnedHallMapId(h.x, h.y), mapId: spawnedHallMapId(h.x, h.y), regionIndex: maps.getRegionIndexAt(h.x, h.y), mapIndex: -1,
      locationType: lt === LOCATION_TYPES.DungeonLabyrinth || lt === LOCATION_TYPES.DungeonRuin ? lt : LOCATION_TYPES.DungeonKeep,
      dungeonType: loc?.mapTableData?.dungeonType ?? 0,
      wildHall: { ring: h.ring, key: h.key, name: loc?.name ?? `Elite hall (${h.x},${h.y})`, crows: _wdunCrows.has(h.key) },
    };
  });
  const wildHallHere = () => { const a = wildActiveNow(), p = playerTravelPixel(); return seaVentures.vaultHere() ?? (a && p ? wildHallAt(a, p.x, p.y) : null); };
  const wildDungeonIsOpenHere = () => !!wildHallHere();
  const wdKey = () => { const p = playerTravelPixel(); return seaVentures.vaultHere()?.key ?? `${p.x},${p.y}`; };

  const wdunLeft = (died = false) => {
    const h = shared._wdunInside?.h;
    if (!h) return;
    shared._wdunInside = null;
    _wdunLocks.set(h, Date.now() + WDUN_LOCK_MS);
    if (died) _wdunCrows.set(h, Date.now() + WILD_REMAINS_MS);
    socialLink()?.sendWdun?.({ k: died ? 'die' : 'out', h });
  };
  const wildCan = () => !!shared.online?.wildOk && shared.online.status === 'open' && wildHere() && !cromwarkPeace(wildZoneKind()) &&
 (wildOutdoors() || shared.modes?.mode === 'dungeon') && playerEntity.health > 0 && !shared.modes?.deathUp?.();
  const _wildTruce = createPartyTruce();
  const wildFair = (peerId) => {
    if (!peerId || !wildCan()) return false;
    if (wildKin({ party: !!shared.social?.isPartyPeer(peerId) || _wildTruce.holds(peerId, Date.now()), duel: duelMgr.live && duelMgr.opponent === peerId, guilds: [myGuildTag(), shared.online?.guildTagOf?.(peerId) ?? null] })) return false;
    return shared.modes?.mode === 'dungeon' || wildAtWire(duelWorldOf(peerId));
  };
  const wildWalkRow = (x, y) => { const m = wildMask(); return !shared.online?.wildOk ? null : etherSea && etherWildRingAt(x, y) > 0 ? zoneWord('walkInto', ETHER_KIND) : m && wildNear(m, x, y) ? WILD_TEXT.walkInto : null; };
  const wildBodiesNow = () => {
    if (!wildCan()) return NO_BODIES;
    const out = [];
    for (const b of shared.peersNear() ?? []) if (wildFair(b.id)) out.push(b);
    return out;
  };
  let _wildLastWeapon = null;
  let _zoneWatchAt = -Infinity;
  const zoneWatchCall = () => {
    const mode = shared.modes?.mode ?? 'exterior';
    const inTown = mode === 'interior' || (mode === 'exterior' && _isPlayerInTownStrict());
    if (!inTown || !wildHere()) return;
    const now = performance.now();
    if (now - _zoneWatchAt < 10_000) return;
    _zoneWatchAt = now;
    setCrimeCommitted(playerEntity, CRIMES.Assault);
    _crimeResponse();
    townTalk.say('The town watch saw you strike. The guards are coming!');
  };
  const wildStrikeOut = (to, by, weapon, swing, drawMs = 0, { off = false } = {}) => {
    if (!wildFair(to)) return false;
    const a = withoutFirmament(playerEntity, () => duelAttackerOf(playerEntity, weapon)), w = duelWeaponOf(weapon), sw = duelSwingOf(swing);
    const at = drawMs > 0 ? { at: Math.min(60000, Math.trunc(drawMs)) } : {};
    const r = resolveDuelStrike({ by, a, ...(w ? { w } : {}), ...(sw ? { sw } : {}), ...at, ...(off ? { off } : {}) }, duelStandIn(playerEntity));
    if (!(r.dmg > 0)) { reportPlayerAttack({ hit: false, damage: 0, critical: false, backstab: false, ineffective: false }); zoneWatchCall(); return true; }
    const n = shared.wildFight.blow(to, 'strike', { by, p: campToWire(player.feetAt()), d: Math.trunc(r.dmg), ...(w ? { w } : {}), ...(sw ? { sw } : {}), ...at });
    if (n) { _wildLastWeapon = weapon ?? null; zoneWatchCall(); }
    return !!n;
  };
  const wildSpellOut = (peerId, sp) => {
    if (!wildFair(peerId)) return false;
    const { harm } = withoutFirmament(playerEntity, () => siegeSpellNumbers(sp, Math.max(1, Math.trunc(playerEntity.level || 1)), duelStandIn(), playerEntity));
    if (!(harm > 0)) return false;
    const n = shared.wildFight.blow(peerId, 'spell', { p: campToWire(player.feetAt()), d: siegeCastClamp(harm, false) });
    if (n) zoneWatchCall();
    return !!n;
  };
  const wildMeleeHit = (eye, inViewFn) => {
    let best = null, bestD = Infinity;
    for (const b of wildBodiesNow()) {
      const c = [b.feet[0], b.feet[1] + (b.height ?? CAPSULE_HEIGHT) / 2, b.feet[2]];
      const dx = c[0] - eye[0], dy = c[1] - eye[1], dz = c[2] - eye[2];
      const dist = Math.hypot(dx, dy, dz), l = dist || 1;
      const wall = collider.raycast(eye, [dx / l, dy / l, dz / l], dist);
      if (!playerMeleeCanHit(dist, !!inViewFn?.(c), !Number.isFinite(wall) || wall >= dist - 1e-3)) continue;
      if (dist < bestD) { bestD = dist; best = b.id; }
    }
    return best ? wildStrikeOut(best, 'melee', weaponRig.playerWeapon.strikingWeapon, weaponRig.playerWeapon.machine?.state, 0, { off: weaponRig.playerWeapon.offStrike }) : false;
  };
  const wildArrowTargets = () => {
    const bodies = wildBodiesNow();
    return bodies.length ? bodies.map((b) => ({ feet: b.feet, ref: { duel: true, id: b.id, dead: false, ai: { feet: b.feet, height: b.height ?? CAPSULE_HEIGHT } } })) : NO_BODIES;
  };
  const wildSpellMarks = () => {
    const bodies = wildBodiesNow();
    return bodies.length ? bodies.map((b) => ({ ...b, name: peerName(b.id) ?? 'another player' })) : null;
  };
  let _wildHud = null;
  let _wildVit = null;
  const wildHudSay = () => {
    if (!_wildVit) { _wildHud?.hide(); return; }
    _wildHud ??= createSiegeHud(document);
    const f = _wildVit.foe, name = f ? (peerName(f.id) ?? 'another player') : '';
    _wildHud.update({ bar: [WILD_NAME, f ? `${name}: ${f.hp} / ${f.max}` : ''], sides: '', self: _wildVit.mine ? [`Your vitality: ${_wildVit.mine[0]} / ${_wildVit.mine[1]}`] : [], works: '', arms: null, card: null });
  };
  const wildHudFrame = () => { if (_wildVit && (Date.now() - _wildVit.at > WILD_REF.mendMs || !wildHere())) { _wildVit = null; wildHudSay(); } };
  const wildHpIn = (g) => {
    const me = shared.online?.id ?? '';
    if (g.by !== me && g.to !== me) return;
    const foeId = g.by === me ? g.to : g.by;
    const mine = g.h.find((x) => x[0] === me), theirs = g.h.find((x) => x[0] === foeId);
    _wildVit = { mine: mine ? [mine[1], mine[2]] : (_wildVit?.mine ?? null), foe: theirs ? { id: foeId, hp: theirs[1], max: theirs[2] } : null, at: Date.now() };
    wildHudSay();
    if (g.by === me) {
      reportPlayerAttack({ hit: true, damage: g.d, critical: false, backstab: false, ineffective: false });
      const b = duelBody(g.to);
      if (g.r !== DUEL_REF_KIND.Spell && b) {
        audio.play3d(hitSoundFor(_wildLastWeapon), b.feet, ENEMY_HIT_VOLUME, { maxDistance: 16 });
        (shared.modes?.liveHitEffects?.() ?? hitEffects).showBloodSplash(0, [b.feet[0], b.feet[1] + (b.height ?? CAPSULE_HEIGHT) / 2, b.feet[2]], null, bloodHit(g.d, { maxHealth: theirs?.[2] ?? 1 }, { fromPlayer: true, weapon: _wildLastWeapon }));
      }
      if (g.r !== DUEL_REF_KIND.Spell && _wildLastWeapon) {
        let wear = Math.trunc((10 * duelWearDamage(g.d, _wildLastWeapon, playerEntity) + 50) / 100);
        if (wear === 0 && Math.random() < 0.2) wear = 1;
        if (wear > 0) lowerCondition(_wildLastWeapon, dfuBlowWear(wear), playerEntity, (l) => townTalk.say(l));
      }
      return;
    }
    if (g.d > 0) {
      if (g.r !== DUEL_REF_KIND.Spell) audio.playOneShot(hitSoundFor(null), PLAYER_HIT_VOLUME);
      flashPlayerDamage(g.d);
      playPlayerVoice(audio, playerPainVoice(playerEntity, g.d));
    }
  };
  const _wildSeize = new Map();
  const wildRejoin = createWildRejoin({ present: () => presentHeardDeath(playerEntity), place: () => ({ dungeon: shared.modes?.mode === 'dungeon' ? (shared._wdunInside?.h ?? wdKey()) : null, px: playerTravelPixel() }) });
  const _wildFellAt = new Map();
  const wildFellIn = (g, room) => {
    const me = shared.online?.id ?? '';
    if (g.id === me) {
      wildDeathAtHand({ r: g.r, by: g.by, room, at: Date.now() }, peerName(g.by));
      _wildVit = null; wildHudSay();
      forcePlayerDeath(playerEntity);
      return;
    }
    if (g.by !== me) return;
    shared.wildFight.fell(g.id, g.r, room);
    { const p = duelWorldOf(g.id); if (p) { _wildFellAt.set(g.r, p); if (_wildFellAt.size > 16) _wildFellAt.delete(_wildFellAt.keys().next().value); } }
    if (_wildVit?.foe?.id === g.id) { _wildVit = null; wildHudSay(); }
  };
  const wildRcIn = (g, room) => {
    const c = readWildReceipt(g.rc), me = shared.social?.acct ?? null;
    if (!c || c.r !== g.r || !me) return;
    if (c.f === me) { wildTakeDrop(g.rc, room); return; }
    if (c.k !== me || _wildSeize.has(c.r)) return;
    _wildSeize.set(c.r, { rc: g.rc, room, p: _wildFellAt.get(c.r) ?? null, due: Date.now() + (wildFallGraceS(c) + 5) * 1000, tries: 0 });
    if (_wildSeize.size > 16) _wildSeize.delete(_wildSeize.keys().next().value);
  };
  const wildDownIn = (g, room) => {
    const death = wildRejoin.heard(g, { alive: playerEntity.health > 0 });
    if (death) _wildBody = wildRejoin.bodyAt(death.p ?? campToWire(player.feetAt()), room);
  };
  const wildRefIn = (g, room) => {
    if (g.k === 'hp') wildHpIn(g);
    else if (g.k === 'fell') wildFellIn(g, room);
    else if (g.k === 'down') wildDownIn(g, room);
    else if (g.k === 'rc') wildRcIn(g, room);
    else seaVentures.wref(g, room);
  };

  const _wildBodies = new Map();
  const wildBodyGone = (peer) => { const b = _wildBodies.get(peer); if (b) { droppedLoot.removePile(b.pile); _wildBodies.delete(peer); } };
  const wildBodyArrived = (from, body) => {
    wildBodyGone(from);
    shared.remotePlayers?.holdCorpse?.(from, WILD_DEATH_HOLD_S * 1000);
    // Mint each record alone so a refused one shifts no later pick; offer worn pieces only.
    const minted = (Array.isArray(body.items) ? body.items : []).map((it) => { const r = validLootList([it])?.[0] ?? null; return r && wearableItem(r) ? r : null; });
    const items = minted.filter(Boolean);
    if (!items.length || !wildOutdoors()) return;
    const mark = shared.remotePlayers?.corpseMarks?.(shared.onlineToScene)?.find((c) => c.id === from) ?? null;
    if (!mark) return;
    const name = peerName(from) ?? 'Another player';
    const pile = droppedLoot.seedPile(items, mark.feet, WILD_PILE_ICON, null, null, { unsaved: true, drawn: false, owner: 'wild' });
    pile.noStore = WILD_NO_STORE; pile.wildBody = from; pile.label = `${name}'s body`;
    _wildBodies.set(from, { pile, minted, name });
    tradeSay(`${name} has fallen by your hand. Search the body to take one piece of their gear.`);
  };
  const openWildBody = (pile) => {
    const peer = pile.wildBody, b = _wildBodies.get(peer);
    if (!b || !shared.wildFight.body(peer)) { wildBodyGone(peer); townTalk.say(WILD_TEXT.gone); return; }
    const w = makeInventoryWindow({ chooseOne: { items: pile.items, title: `${b.name} · choose one`, onChoose: (taken) => wildBodyChosen(peer, taken) } });
    if (w) townTalk.showOverlay(w);
  };
  const wildBodyChosen = (peer, taken) => {
    const b = _wildBodies.get(peer);
    const list = playerEntity.items ?? [];
    const at = taken ? list.indexOf(taken) : -1;
    if (at >= 0) { if (isEquipped(taken)) unequipItem(playerEntity, taken); list.splice(at, 1); }
    const i = b && taken ? b.minted.indexOf(taken) : -1;
    wildBodyGone(peer);
    if (i < 0 || !shared.wildFight.pick(peer, i)) { townTalk.say(WILD_TEXT.gone); return; }
    townTalk.say(WILD_TEXT.chosen(b.name, itemLongName(taken)));
  };

  const WILD_GHOST_HOLD_MS = 15_000;

  let _wildBody = null;
  const wildWho = () => (realmSession?.id != null ? `realm:${realmSession.id}` : playerEntity?.name ? `name:${playerEntity.name}` : null);
  let _wildMineRead = false;
  const wildDeathCheckpoint = () => {
    const allowed = checkpointGateOpen();
    if (!allowed) return false;
    const hp = playerEntity.health;
    if (!(hp > 0)) playerEntity.health = 1;
    try {
      shared._checkpointAt = performance.now();
      if (realmSession) {
        if (realmSession.lost) return false;
        return !!(shared.modes ? shared.modes?.quickSaveNow(QUICK_SAVE_NAME, { quiet: true }) : worldQuickSave(QUICK_SAVE_NAME, { quiet: true }));
      }
      return onlineCheckpoint();
    } catch (e) { console.error('[wild] the death checkpoint failed', e); return false; } finally { playerEntity.health = hp; }
  };

  const wildTakeDrop = (rc, room) => {
    const key = readWildReceipt(rc)?.r;
    const body = _wildBody;
    const lay = room ?? body?.room ?? null;
    if (!key || !realmSession || realmSession.lost || !lay || shared._wildTaking.has(key)) return;
    shared._wildTaking.add(key);
    if (shared._wildTaking.size > 32) shared._wildTaking.delete(shared._wildTaking.values().next().value);
    realmGoldAct({
      session: realmSession,
      checkpoint: () => wildDeathCheckpoint(),
      needsAnswer: true,
      call: (at) => wildAccount.fall({ receipt: rc, realm: at, room: lay, ...(shared.online?.wildCollectAt?.(lay) ? { collect: 1 } : {}), ...wildFallWords(hccOn(), hccRuntime.getSaveData(), wildMaskOf(maps)) }),
      apply: (a) => wildDropTaken(a?.data ?? null, body, lay),
    }).catch((e) => console.warn('[wild] the drop failed', e?.message ?? e));
  };
  const wildDropTaken = (d, body, room) => {
    if (!d) return;
    const out = wildTakeTook(playerEntity, d.took, d.gold, (it) => { if (isEquipped(it)) unequipItem(playerEntity, it); }, wildPacks(shared.naval?.companions?.party, revenantsWithYou()));
    const n = Array.isArray(d.items) ? d.items.length : 0;
    const dd = wildDeath();
    const claimed = d.wi === 0 && out.length && d.took?.[0] ? itemLongName(out[0]) : null;
    const held = d.wi === 0 && !!d.escrow?.r;
    if (dd) setWildDeath({ killer: dd.killer, kill: true, dropped: d.order ? n : 0, claimed, held, burnt: d.burnt ? n : 0, letters: out });
    else if (wildTookAny(out, d.gold)) townTalk.say(d.burnt ? zoneWord('burntLate', seaRoomOf(room) ? ETHER_KIND : null)() : zoneWord('dropLate', seaRoomOf(room) ? ETHER_KIND : null));
    if (held) shared.wildEscrow.held(d.escrow, { killer: dd?.killer ?? null, name: claimed });
    if (d.order && n && body) wildDeposit({ r: d.r, items: d.items, o: d.order, p: body.p, room, mine: body });
  };

  const _wildDeposits = [];
  const wildDeposit = (dep) => {
    if (_wildDeposits.some((x) => x.r === dep.r)) return;
    const room = WILD_DATA_MAX - JSON.stringify({ k: 'fall', r: dep.r, p: dep.p, items: [], last: 0, o: dep.o }).length - 16;
    _wildDeposits.push({ ...dep, chunks: wildChunks(dep.items, WILD_ITEMS_MAX, room), k: 0, at: Date.now() });
  };
  const wildDepositFrame = () => {
    for (const dep of [..._wildDeposits]) {
      while (dep.k < dep.chunks.length && shared.online?.sendWild({ k: 'fall', r: dep.r, p: dep.p, items: dep.chunks[dep.k], last: dep.k === dep.chunks.length - 1 ? 1 : 0, o: dep.o }, { room: dep.room })) {
        if (dep.k === 0 && dep.mine) wildMineLies(dep);
        dep.k++;
      }
      if (dep.k >= dep.chunks.length || Date.now() - dep.at > 50_000) {
        _wildDeposits.splice(_wildDeposits.indexOf(dep), 1);
        if (dep.mine && shared._wildGhostEndAt != null) shared._wildGhostEndAt = Math.min(shared._wildGhostEndAt, Date.now());
      }
    }
  };
  const wildMineLies = (dep) => {
    const b = dep.mine;
    shared._wildMine = { r: dep.r, room: dep.room, p: dep.p, until: Date.now() + WILD_REMAINS_MS, dungeon: b.dungeon };
    keepMine(shared._wildMine, wildWho());
    const at = isCellRoom(dep.room) ? nativeToMapPoint(dep.p[0], dep.p[2]) : (b.px ? { mx: b.px.x + 0.5, my: b.px.y + 0.5 } : null);
    if (at) markRemains({ mx: at.mx, my: at.my, until: shared._wildMine.until, r: dep.r });
  };

  const wildDeathBegin = () => {
    if (!wildHere() || !shared.online?.wildOk || shared.online.status !== 'open' || !shared.online.room || !shared._deadMark) return false;
    const fell = wildFallHeard();
    const rejoined = wildRejoin.begin();
    if (!rejoined) _wildBody = wildRejoin.bodyAt([shared._deadMark.x, shared._deadMark.y, shared._deadMark.z], shared.online.room);
    if (shared.modes?.mode === 'dungeon' && shared._wdunInside) wdunLeft(true);
    if (!rejoined) setWildDeath({ killer: fell ? (peerName(fell.by) ?? 'Another player') : null, dropped: 0 });
    _wildVit = null; wildHudSay();
    shared._wildGhost = true;
    shared._wildGhostEndAt = isCellRoom(shared.online.room) ? null : Date.now() + WILD_GHOST_HOLD_MS;
    if (fell) {
      const worn = isCellRoom(shared.online.room) ? wornOffer(playerEntity.items) : [];
      if (worn.length) shared.wildFight.offerWorn(fell.by, fell.r, worn.map(wildRecord));
    }
    return true;
  };
  const wildGhostEnd = () => {
    setWildDeath(null);
    wildGhostLeave();
  };
  const wildGhostLeave = () => {
    shared._wildGhostEndAt = null;
    if (!shared._wildGhost) return;
    shared._wildGhost = false;
    if (shared.online?.room) { shared.online.leave(); exteriorFoes.clearPuppets(); shared.modes?.clearOwnPuppets?.(); shared._foesRoom = null; }
  };
  const wildRiseSite = (px, inDungeon = false, kill = true) => {
    if (etherSea && inEther(px.x, px.y)) return etherRiseSite(px.x, px.y);
    for (const pick of wildRisePicks(wildMaskOf(maps), px, { inDungeon, kill })) { const at = nearestSafeLocationAnywhere(maps, px, pick); if (at) return at; }
    return null;
  };
  const wildClearSpawn = () => {
    const bodies = (shared.peersNear() ?? []).map((b) => b.feet);
    const eye = (pos) => [pos[0], pos[1] + 1, pos[2]];
    const clear = (pos, yaw) => {
      const back = [-Math.sin(yaw), 0, -Math.cos(yaw)];
      const hit = collider.raycast(eye(pos), back, 7);
      return !Number.isFinite(hit) || hit >= 7;
    };
    const spot = wildSpawnSpot(player.feetAt(), { bodies, clear, yaw: cam.yaw });
    if (spot.pos[0] !== player.feetAt()[0] || spot.pos[2] !== player.feetAt()[2]) {
      const y = heightAt(spot.pos[0], spot.pos[2]);
      player.spawn(spot.pos[0], (Number.isFinite(y) ? y : spot.pos[1]) + 0.15, spot.pos[2]);
    }
    cam.yaw = spot.yaw; cam.pos = player.eyeAt();
  };

  let _wildWas = false;
  let _wildRingWas = 0;
  const WILD_LINE_HOLD_S = 7;
  const wildFrame = () => {
    if (!wildMask() && maps) setWildMask(wildMaskOf(maps));
    try { wdunFrame(); } catch (e) { console.warn('[wdun]', e?.message ?? e); }
    const seaRing = _onlineWorldSession() && !!shared.online?.wildOk && etherSea && shared.playerSpawned ? etherWildRingAt(playerTravelPixel()?.x, playerTravelPixel()?.y) : 0;
    const here = seaRing > 0 || (_onlineWorldSession() && !!shared.online?.wildOk && isWildRegion(_questRegionIndex()) && shared.playerSpawned && (() => { const px = playerTravelPixel(); return !!px && wildRingAt(px.x, px.y) > 0; })());
    if (false) void 0;
    if (_wildTruce.frame(shared.social?.partyPeers?.() ?? new Set(), Date.now()).length && here) townTalk.say(zoneWord('truce'));
    if (playerEntity.health > 0 && !shared.modes?.deathUp?.()) {
      let ring = 0;
      if (here) { const px = playerTravelPixel(); ring = seaRing || wildRingAt(px.x, px.y) || WILD_RINGS; }
      setWildHere(here, ring, seaRing ? ETHER_KIND : undefined);
      if ((here && wildZoneKind()) !== _wildWas) {
        const left = _wildWas;
        _wildWas = here && wildZoneKind();
        _wildRingWas = ring;
        const line = here ? `${zoneWord('enter')} ${zoneWord('ring')(ring)}` : zoneWord(left === ETHER_KIND && !etherInPeace(playerTravelPixel()?.x, playerTravelPixel()?.y) ? 'quiet' : 'leave', left || undefined);
        if (here) noteFirstUse('wild-zone');
        setMidScreenText(line, WILD_LINE_HOLD_S, { realTime: true });
        townTalk.say(line);
      } else if (here && ring !== _wildRingWas) {
        const deeper = ring > _wildRingWas;
        _wildRingWas = ring;
        setMidScreenText(zoneWord('ringCross')(ring, deeper), WILD_LINE_HOLD_S, { realTime: true });
        townTalk.say(zoneWord('ringCross')(ring, deeper));
      }
    }
    setPaceZoneCap(wildHere() && wildZoneKind() !== ETHER_KIND ? WILD_PACE_CAP : null);
    wildStrangersFrame();
    try { wildGiantsFrame(); } catch (e) { console.warn('[giants]', e?.message ?? e); }
    try { giantLeashFrame(); } catch (e) { console.warn('[giants] leash', e?.message ?? e); }
    try { hallArrivalWatch(); } catch (e) { console.warn('[halls] arrival', e?.message ?? e); }
    try { giantNoticeFrame(); } catch (e) { console.warn('[giants] notice', e?.message ?? e); }
    shared.wildFight.tick();
    for (const peer of [..._wildBodies.keys()]) if (!shared.wildFight.body(peer)) wildBodyGone(peer);
    shared.online?.setWildZone?.(wildCan() ? 1 : 0, playerEntity.health <= 0);
    wildDepositFrame(); shared.wildSeizeFrame(); wildHudFrame();
    shared.wildEscrow.frame();
    shared.wildRemains.setRooms(shared.online?.status === 'open' ? shared.online.heldRooms() : []);
    shared.wildRemains.setPool(wildOutdoors() ? droppedLoot : (shared.modes?.droppedPool?.() ?? null));
    shared.wildRemains.tick();
    setLootMarksLive(shared.wildRemains.hasMine());
    if (!_wildMineRead) { _wildMineRead = true; shared._wildMine ??= keptMine(Date.now(), wildWho()); }
    if (shared._wildMine && Date.now() > shared._wildMine.until) { shared._wildMine = null; keepMine(null); }
    remainsMarkTick(Date.now());
    seaVentures.guns();
    try { shared.cromwark.frame(); } catch (e) { console.warn('[cromwark]', e?.message ?? e); }
  };

  const wildStrangerWithin = (m) => {
    if (!wildHere()) return false;
    for (const d of shared.online?.drawable?.() ?? []) {
      if (!d?.shown || !wildIsStranger(d.id, d.gt)) continue;
      const f = shared.onlineToScene(_peerMapPoses.get(d.id) ?? d.shown);
      if (Math.hypot(f[0] - player.pos[0], f[2] - player.pos[2]) <= m) return true;
    }
    return false;
  };

  const unstuckNow = () => {
    // Unstuck can run before the modes machine exists, so read it optionally.
    let moved = shared.modes?.unstuck?.();
    if (!moved && (shared.modes?.mode ?? 'exterior') === 'exterior') moved = unstuckOutdoors();
    return moved;
  };
  const unstuckCancel = (why) => {
    const w = shared._unstuckWait;
    if (!w) return;
    clearInterval(w.timer); w.el?.remove?.(); shared._unstuckWait = null;
    if (why) townTalk.say(why);
  };

  const unstuckBegin = (say, waitMs = shared.UNSTUCK_WAIT_MS) => {
    const until = Date.now() + waitMs;
    let el = null;
    if (typeof document !== 'undefined') {
      el = document.createElement('div');
      el.style.cssText = 'position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:30;min-width:260px;padding:8px 12px;background:rgba(10,13,17,0.92);border:1px solid #8f2216;color:#e9e4d9;font:600 13px Georgia,serif;text-align:center;pointer-events:auto';
      const label = document.createElement('div'); label.className = 'unstuck-label';
      const track = document.createElement('div'); track.style.cssText = 'height:6px;margin:6px 0;background:#2a1c12';
      const fill = document.createElement('div'); fill.style.cssText = 'height:100%;width:0;background:#b3261a'; track.append(fill);
      const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'Cancel'; btn.style.cssText = 'padding:3px 14px;cursor:pointer';
      btn.onclick = () => unstuckCancel('You stay where you are.');
      el.append(label, track, btn); el._label = label; el._fill = fill;
      document.body.append(el);
    }
    const tickBar = () => {
      const left = until - Date.now();
      if (playerEntity.health <= 0) { unstuckCancel(null); return; }
      if (left <= 0) {
        unstuckCancel(null);
        if (waitMs === shared.UNSTUCK_WAIT_MS && wildStrangerWithin(shared.UNSTUCK_ENEMY_M)) { townTalk.say(`/unstuck failed: another player is within ${shared.UNSTUCK_ENEMY_M} m.`); return; }
        const moved = unstuckNow();
        if (moved) shared._unstuckAt = Date.now();
        townTalk.say(moved ? 'You find your way free.' : 'There is nowhere to send you from out here.');
        return;
      }
      if (el) { const m = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000); el._label.textContent = `Unsticking in ${m}:${String(sec).padStart(2, '0')}`; el._fill.style.width = `${Math.round(100 * (1 - left / waitMs))}%`; }
    };
    shared._unstuckWait = { until, el, timer: setInterval(tickBar, 250) };
    tickBar();
    say(`You will be free in ${waitMs >= 60_000 ? `${Math.round(waitMs / 60_000)} minutes` : `${Math.round(waitMs / 1000)} seconds`}. Cancel with the bar or /unstuck cancel.`);
  };
  const unstuckOutdoors = () => {
    if (playerEntity.health <= 0 || shared._teleporting || worldMoveBusy()) return false;
    const px = playerTravelPixel();
    const _zm = wildMaskOf(maps);
    const town = etherSea && inEther(px.x, px.y) ? wildRiseSite(px) : nearestSafeLocationAnywhere(maps, px, (hit) => hit.kind === 'city' && !(_zm && wildNear(_zm, hit.mapPixel.x, hit.mapPixel.y)));
    if (!town) return false;
    shared._teleporting = true;
    (async () => {
      try {
        shared.modes?.forceExitToExterior();
        await _teleportToPixel(town.mapPixel.x, town.mapPixel.y, null, { reposition: REPOSITION.RandomStartMarker });
        surfacePlayer();
        hudFade.fadeHUDFromBlack();
        townTalk.say('You find your way to the nearest town.');
      } catch (e) { console.error('[unstuck] the road to town failed:', e?.message ?? e); hudFade.clearFade(); } finally { shared._teleporting = false; }
    })();
    return true;
  };

  let _wildStrangersAt = 0;

  const wildIsStranger = (id, gt) => !!id && wildHere() && !cromwarkPeace(wildZoneKind()) &&
 !shared.social?.isPartyPeer(id) && !sameGuild(gt, myGuildTag());
  const wildStrangersFrame = () => {
    const now = performance.now();
    if (now - _wildStrangersAt < 250) return;
    _wildStrangersAt = now;
    shared._wildStrangers = [];
    shared._wildStrangerIds.clear();
    if (!wildHere() || playerEntity.health <= 0) return;
    for (const d of shared.online?.drawable?.() ?? []) {
      if (!d?.shown || _hiddenPeers.has(d.id) || _veils.has(d.id) || !wildIsStranger(d.id, d.gt)) continue;
      const f = shared.onlineToScene(_peerMapPoses.get(d.id) ?? d.shown);
      const dist = Math.hypot(f[0] - player.pos[0], f[2] - player.pos[2]);
      if (dist > WILD_STRANGER_SEE_M) continue;
      shared._wildStrangers.push({ id: d.id, feet: f, dist });
      if (dist <= 100 && (shared.travelView?.state === 'up' || shared.travelView?.state === 'rising')) { shared.travelView.exit('key'); shared._tvAttack = null; }
      shared._wildStrangerIds.add(d.id);
      const said = shared._wildStrangerSaid.get(d.id) ?? -Infinity;
      if (dist <= WILD_STRANGER_M) {
        if (Date.now() - said > 60_000) { setMidScreenText(WILD_TEXT.strangerNear(dist)); townTalk.say(WILD_TEXT.strangerNear(dist)); }
        shared._wildStrangerSaid.set(d.id, Date.now());
      }
    }
  };
  const wildNameMask = (p) => {
    if (!p?.id || !shared.online?.peers?.has?.(p.id) || !wildIsStranger(p.id, p.gt)) return p;
    shared._wildStrangerIds.add(p.id);
    if (!(shared.travelView?.active)) return null;
    return { ...p, name: WILD_TEXT.stranger, title: null, glyphs: [], lv: null, gt: null, rb: null, house: null, tint: WILD_STRANGER_RGBA };
  };
  const wildRemainsMarks = () => {
    if (!shared._wildMine) return [];
    const m = shared._wildMine;
    if (!isCellRoom(m.room)) return [];
    return [{ x: m.p[0] / 32768, y: 500 - m.p[2] / 32768, minutes: Math.max(1, Math.ceil((m.until - Date.now()) / 60_000)) }];
  };
  const wildHidesPlayer = ({ kin = null, wire = null, pixel = null, party = false } = {}) => {
    if (party || kin === 'guild' || !_onlineWorldSession()) return false;
    const mine = (wildHere() && !cromwarkPeace(wildZoneKind())) || (!CROMWARK_ON && wildOutdoors() && wildAtWire(campToWire(player.feetAt()), true));
    if (mine) return true;
    if (pixel) { const m = wildMaskOf(maps); return (etherSea && inEther(pixel.x, pixel.y)) || (!CROMWARK_ON && !!m && wildNear(m, pixel.x, pixel.y)); }
    if (CROMWARK_ON) { if (!wire || !etherSea) return false; const px = worldCoordToMapPixel(wire[0], wire[2]); return inEther(px.x, px.y); }
    return wildAtWire(wire, true);
  };
  const veilRefused = (to = null) => {
    if (!etherSea) return false;
    const from = playerTravelPixel();
    const here = inEther(from.x, from.y);
    if (to ? here === inEther(to.x, to.y) : !here) return false;
    townTalk.say('The Bay\'s magic does not reach across the Veil. Only the crossing does.');
    return true;
  };

  const wildTravelPaid = (j) => {
    if (!(j?.fee > 0)) return;
    deductGoldPieces(playerEntity, j.fee);
    playerEntity.wildTravelAt = Date.now();
    townTalk.say(WILD_TEXT.travelPaid(j.fee));
  };
  return {
    STRANGER_CAST_SAY_MS, _wildDeposits, _wildSeize, openWildBody, unstuckBegin, unstuckCancel, unstuckNow,
    veilRefused, wdunLeft, wildActiveNow, wildArrowTargets, wildAtWire, wildBodiesNow, wildBodyArrived, wildCan,
    wildClearSpawn, wildDeathBegin, wildDeposit, wildDungeonIsOpenHere, wildFair, wildFrame, wildGhostEnd,
    wildGhostLeave, wildGiantMarks, wildHallHere, wildHallStand, wildHallSummaries, wildHidesPlayer, wildIsStranger,
    wildMapMask, wildMarksFrame, wildMeleeHit, wildNameMask, wildOutdoors, wildRefIn, wildRemainsMarks, wildRiseSite,
    wildSpellMarks, wildSpellOut, wildStrangerWithin, wildStrikeOut, wildTravelPaid, wildWalkRow,
  };
}
