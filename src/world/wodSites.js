// World of Daggerfall sites: marker spawners, their piles and captives carried across rebuilds,
// springs shared with peers, the Privateers' Hold, city gates at night, and the mod's lights.

import { addPileLootExtras, DUNGEON_LOOT_KEYS, generateItems as generateLootItems } from '../items/loot.js';
import { adoptLight } from '../render/lightId.js';
import { alignBillboardToGround } from './groundAlign.js';
import { armFlatAnim } from '../render/flatAnimation.js';
import { basicRoadsPathsPoint } from './roadsProducer.js';
import { billboardSize, centredBase } from './rmbFlats.js';
import { capFadePairs, nearestLights, rangesFor } from './cityLights.js';
import { dungeonRarityTier, pileSource, rollLootRarity, stampWonWeapons } from '../items/lootRarity.js';
import { flatBatchAabb, transformedAabb } from '../render/frustum.js';
import { isNight } from './worldClock.js';
import { isStandFlat, standFlatId, standFlatRecord } from './standFlats.js';
import { liveStat } from '../characters/statMods.js';
import { nearestFirstFrom } from './streamingWorld.js';
import { playerEntity } from '../characters/playerEntity.js';
import { rollHoldFoes } from './wodPrivateersHold.js';
import { raidGatesHeld } from '../worldEvents/raidSitesHost.js';
import { raidsBurning } from '../worldEvents/raidingParties.js';
import { updateCityGate } from './cityGate.js';
import { WOD_LOOT_ALIGN, WOD_LOOT_LOCATION_INDEX } from './wodSpawner.js';
import { wodLightColors } from './worldOfDaggerfall.js';
import { wodSiteId, yieldsTo } from './wodShared.js';

/** @param {any} shared */
export function createWodSites(shared) {
  const { destroyPixel, renderer, terrainGen, wod } = shared;
  const wodOpened = wod
    ? wod.open().then(() => true, (e) => { console.warn(`[wod] World of Daggerfall did not open: ${e?.message ?? e}`); return false; })
    : Promise.resolve(false);
  const _wodLate = new Set();

  function sweepWodLate() {
    const again = [];
    for (const k of _wodLate) {
      const p = shared.built.get(k);
      if (p) { again.push({ px: p.px, py: p.py }); _wodLate.delete(k); }
      else if (!shared.inFlight.has(k)) _wodLate.delete(k);
    }
    if (!again.length) return;
    const under = `${shared.state.current.x},${shared.state.current.y}`;
    if (shared.walkMode && shared.playerSpawned && again.some((k) => `${k.px},${k.py}` === under)) shared._seasonHoldKey = under;
    for (const k of again) destroyPixel(k.px, k.py, { collectLoose: false });
    shared.queue.push(...again.sort(nearestFirstFrom(shared.state.current)));
    console.log(`[wod] ${again.length} pixel(s) named by a region that landed late - built again on the list in its order`);
  }

  const wodPathsPoint = (x, y) => {
    const net = terrainGen.roads();
    return net?.source === 'basic-roads' ? basicRoadsPathsPoint(net, x, y) : 0;
  };

  const _wodT = [0, 0, 0];
  const _DOWN = [0, -1, 0];

  const wodArrivalOf = (list) => ({ keys: new Set(list.map((p) => `${p.px},${p.py}`)), origin: [0, 0, 0], loadAt: null });

  const WOD_PEER_SITES_MAX = 4096;
  const wodSiteOf = (p, w) => wodSiteId(p.px, p.py, w.oid ?? 'x', w.oidN ?? 0);
  const WOD_SPRUNG_MAX = 256;
  function wodSprang(site) {
    if (!shared.online) return;
    shared._wodSprung.delete(site); shared._wodSprung.set(site, performance.now());
    if (shared._wodSprung.size > WOD_SPRUNG_MAX) shared._wodSprung.delete(shared._wodSprung.keys().next().value);
    shared._wodSprungChanged = true;
  }
  const wodSprungList = () => { const now = performance.now(); return [...shared._wodSprung].reverse().map(([s, at]) => [s, now - at]); };
  function wodForgetPeerSites(key) { for (const s of [...shared._wodPeerSprung]) if (s.startsWith(`${key}:`)) shared._wodPeerSprung.delete(s); }

  const wodPeerHeldAgo = (site) => { const at = shared._wodPeerHeard.get(site); return at == null ? Infinity : performance.now() - at; };
  function wodForgetPeer(site) { shared._wodPeerSprung.delete(site); shared._wodPeerHeard.delete(site); }
  function wodUnsprang(site) { if (shared._wodSprung.delete(site)) shared._wodSprungChanged = true; }
  function wodPeerSites(from, sites) {
    for (const [s, age] of sites) {
      const mine = shared._wodSprung.get(s);
      if (mine != null) {
        if (!yieldsTo(shared.online?.id ?? '', from, performance.now() - mine, age)) continue;
        shared._wodSprung.delete(s);
        shared.exteriorFoes.removeSiteFoes(s);
      }
      shared._wodPeerSprung.delete(s); shared._wodPeerSprung.add(s);
      if (shared._wodPeerSprung.size > WOD_PEER_SITES_MAX) shared._wodPeerSprung.delete(shared._wodPeerSprung.values().next().value);
      shared._wodPeerHeard.delete(s); shared._wodPeerHeard.set(s, performance.now());
      if (shared._wodPeerHeard.size > WOD_PEER_SITES_MAX) shared._wodPeerHeard.delete(shared._wodPeerHeard.keys().next().value);
    }
  }
  function wodOnLoad(centre) {
    if (!wod) return;
    shared._wodArrival.loadAt = [centre[0], centre[1], centre[2]];
    for (const p of shared.built.values()) {
      if (!p.wodSpawners) continue;
      const t = shared.state.pixelTranslation(p.px, p.py, _wodT);
      for (const w of p.wodSpawners) {
        if (w.spawner.started) w.spawner.onLoad(Math.hypot(w.centre[0] + t[0] - centre[0], w.centre[1] + t[1] - centre[1], w.centre[2] + t[2] - centre[2]));
      }
    }
  }
  function carryWodSite(p, key, { hold = null, piles = [] } = {}) {
    const spawners = new Map();
    for (const w of p.wodSpawners ?? []) { const k = w.centre.join(','); if (!spawners.has(k)) spawners.set(k, []); spawners.get(k).push({ spawner: w.spawner, flat: w.flat ?? null }); }
    shared.wodCarry.set(key, { spawners, hold, piles, life: p.wodLife });
  }
  function standWodPile(key, life, pile) {
    const b = shared.built.get(key);
    if (b?.wodLife === life) {
      const t = shared.state.pixelTranslation(b.px, b.py, _wodT);
      shared.droppedLoot.seedPile(pile.items, [pile.local[0] + t[0], pile.local[1] + t[1], pile.local[2] + t[2]], { archive: pile.archive, record: pile.record }, null, key, { unsaved: true });
      return;
    }
    const c = shared.wodCarry.get(key);
    if (c?.life === life) c.piles.push(pile);
  }
  function adoptWodCarry(key, wodSpawners, privateersHold) {
    const carried = shared.wodCarry.get(key) ?? null;
    shared.wodCarry.delete(key);
    if (!carried) return {};
    for (const w of wodSpawners ?? []) {
      const kept = carried.spawners.get(w.centre.join(','))?.shift();
      if (!kept) continue;
      w.spawner = kept.spawner;
      w.flat = kept.flat;
      w.restand = !!kept.flat;
    }
    if (privateersHold && carried.hold) privateersHold.state = carried.hold;
    return { life: carried.life, piles: carried.piles };
  }
  const tickWodSpawners = () => {
    if (!wod || shared._wodInside) return;
    // During an arrival the player has not moved yet, so markers measure from the origin.
    const arriving = shared._seasonStraightening || shared._loading || shared._recalling || shared._partyArrivalPending;
    const o = shared._wodArrival.origin;
    const standing = shared.walkMode && shared.playerSpawned;
    const feet = standing ? shared.player.pos : shared.cam.pos;
    const cx = arriving ? o[0] : feet[0], cy = arriving ? o[1] : feet[1] + (standing ? shared.player.height / 2 : 0), cz = arriving ? o[2] : feet[2];
    for (const p of shared.built.values()) {
      if (p.privateersHold && !p.privateersHold.state.rolled) {
        const hs = wodSiteId(p.px, p.py, 'hold');
        if (shared._wodPeerSprung.has(hs)) p.privateersHold.state.rolled = true;
        else { standHold(p, hs); wodSprang(hs); }
      }
      // A pixel is the arrival's until its first frame; later markers measure from the player.
      const init = shared._wodArrival.keys.delete(`${p.px},${p.py}`);
      if (!p.wodSpawners) continue;
      const t = shared.state.pixelTranslation(p.px, p.py, _wodT);
      for (const w of p.wodSpawners) {
        if (w.restand) { w.restand = false; standWodAction(p, w, w.flat); }
        if (!w.spawner.active) continue;
        if (shared._wodPeerSprung.has(wodSiteOf(p, w))) { w.spawner.active = false; continue; }
        const x = w.centre[0] + t[0], y = w.centre[1] + t[1], z = w.centre[2] + t[2];
        const first = init && !w.spawner.started;
        const act = w.spawner.tick(first ? Math.hypot(x - o[0], y - o[1], z - o[2]) : Math.hypot(x - cx, y - cy, z - cz));
        if (act) { standWodAction(p, w, act, x, y, z); if (act.kind === 'foe' || act.kind === 'loot') wodSprang(wodSiteOf(p, w)); }
        const l = shared._wodArrival.loadAt;
        if (first && l) w.spawner.onLoad(Math.hypot(x - l[0], y - l[1], z - l[2]));
      }
    }
  };
  const hitDistance = (hit) => (hit && Number.isFinite(hit.dist) ? hit.dist : null);
  const ORC_RAID_PACE = 1.5;
  function standWodAction(p, w, act, x, y, z) {
    const key = `${p.px},${p.py}`;
    if (act.kind === 'foe') {
      const hit = shared.collider.surfaceHit([x, y + 0.2, z], _DOWN, 3);
      shared.exteriorFoes.spawnFoe(act.mobileType, [x, y, z], { yaw: act.yawDeg * Math.PI / 180, gender: act.gender, allied: act.allied, placed: true, groundAlign: { hitDist: hitDistance(hit) }, site: wodSiteOf(p, w) })
        .then((f) => { if (f && !act.hostile && f.ai) f.ai.isHostile = false; })
        .catch(() => {});
      if (act.hostile && shared.seatEdicts.orcsAt(p.px, p.py)) {
        shared.exteriorFoes.spawnFoe(act.mobileType, [x + ORC_RAID_PACE, y, z + ORC_RAID_PACE], { yaw: act.yawDeg * Math.PI / 180, gender: act.gender, allied: act.allied, placed: true, groundAlign: { hitDist: hitDistance(hit) }, site: wodSiteOf(p, w) }).catch(() => {});
      }
      return;
    }
    if (act.kind === 'loot') {
      const hit = shared.collider.surfaceHit([x, y + 0.2, z], _DOWN, WOD_LOOT_ALIGN.distance);
      const centreY = alignBillboardToGround(y, hitDistance(hit), WOD_LOOT_ALIGN.sizeY, WOD_LOOT_ALIGN.distance);
      const lootKey = DUNGEON_LOOT_KEYS[WOD_LOOT_LOCATION_INDEX];
      const items = generateLootItems(lootKey, { level: playerEntity.level, gender: playerEntity.gender });
      if (shared.seatEdicts.bountyAt(p.px, p.py)) items.push(...generateLootItems(lootKey, { level: playerEntity.level, gender: playerEntity.gender }));
      addPileLootExtras(items, lootKey, Math.random, { locationIndex: WOD_LOOT_LOCATION_INDEX, luck: liveStat(playerEntity, 'luck'), level: playerEntity.level });
      rollLootRarity(items, pileSource(dungeonRarityTier(WOD_LOOT_LOCATION_INDEX)), { luck: liveStat(playerEntity, 'luck') });
      stampWonWeapons(items, 1);
      // The pile stays pixel-local until its art lands: a recenter or rebuild moves the frame.
      const t0 = shared.state.pixelTranslation(p.px, p.py, [0, 0, 0]);
      const local = [x - t0[0], centreY - t0[1], z - t0[2]];
      const life = p.wodLife;
      shared.getTexture(216).then((t) => {
        const h = act.record < t.recordCount ? billboardSize(t, act.record).h : 0;
        standWodPile(key, life, { items, local: [local[0], local[1] - h / 2, local[2]], archive: 216, record: act.record });
      }).catch(() => {});
      return;
    }
    w.flat = { kind: 'billboard', archive: act.archive, record: act.record };
    shared.getTexture(act.archive).then((t) => {
      if (shared.built.get(key) !== p || act.record >= t.recordCount) return;
      (p.placeHold ?? shared.pipeline).uploadRecord(act.archive, act.record);
      const size = billboardSize(t, act.record);
      const base = centredBase(w.centre, size);
      const batch = renderer.createBillboardBatch(act.archive, act.record, size, [base]);
      batch._box = flatBatchAabb([base], size);
      for (let i = 0; i < 3; i++) { p._box[i] = Math.min(p._box[i], batch._box[i]); p._box[3 + i] = Math.max(p._box[3 + i], batch._box[3 + i]); }
      armFlatAnim(batch, t, act.archive, act.record, p.flatAnims, (p.placeHold ?? shared.pipeline).uploadRecordFrame);
      p.batches.push(batch);
      if (isStandFlat(act.archive, act.record)) p.standFlats?.push(standFlatRecord({ archive: act.archive, record: act.record, x: base[0], y: base[1], z: base[2] }, batch, standFlatId(`${p.px},${p.py}`, base[0], base[2])));
    }).catch(() => {});
  }
  function standHold(p, site = null) {
    const st = p.privateersHold.state;
    st.rolled = true;
    const t = shared.state.pixelTranslation(p.px, p.py, _wodT);
    for (const o of p.privateersHold.origins) {
      for (const r of rollHoldFoes()) {
        shared.exteriorFoes.spawnFoe(r.mobileType, [o[0] + r.pos[0] + t[0], o[1] + r.pos[1] + t[1], o[2] + r.pos[2] + t[2]], { yaw: r.yawDeg * Math.PI / 180, gender: r.gender, placed: true, groundAlign: { hitDist: null }, site })
          .then((f) => { if (!f) return; if (st.gone) shared.exteriorFoes.removeFoe(f); else st.foes.push(f); })
          .catch(() => {});
      }
    }
  }
  const tickCityGates = (minute) => {
    const night = isNight(minute), held = raidGatesHeld(raidsBurning());
    for (const [key, p] of shared.built) {
      for (const g of p.cityGates ?? []) {
        if (!updateCityGate(g.gate, night, held.has(key) ? { online: true } : undefined)) continue;
        const m = g.meshes.get(g.gate.modelId);
        if (!m) continue;
        g.entry.gpu = m.gpu;
        g.entry._order = g.gate.modelId;
        g.entry._box = transformedAabb(shared.archAabb(g.gate.modelId, m.cpu.positions), g.local);
        shared.collider.removeBucket(g.bucketKey);
        shared.collider.addMesh(g.bucketKey, m.cpu.positions, m.cpu.indices, g.local, g.translation);
      }
    }
  };

  const _wodLitCount = () => {
    let m = 0;
    for (const p of shared.built.values()) m += p.wodLights?.length ?? 0;
    return m;
  };
  const _wodFill = (from) => {
    let n = from;
    for (const p of shared.built.values()) {
      if (!p.wodLights?.length) continue;
      const t = shared.state.pixelTranslation(p.px, p.py, shared._lightT);
      for (const l of p.wodLights) {
        const e = shared._sceneLights[n] ?? (shared._sceneLights[n] = { x: 0, y: 0, z: 0 });
        e.x = l.x + t[0]; e.y = l.y + t[1]; e.z = l.z + t[2]; e.wodRange = l.range; e.wodColor = l.color;
        adoptLight(e, l);
        n++;
      }
    }
    return n;
  };

  const _wodSelect = (lanterns, total) => {
    shared._litRanges = rangesFor(shared._litRanges, total);
    for (let i = lanterns; i < total; i++) shared._litRanges[i] = shared._sceneLights[i].wodRange;
    return nearestLights(shared._sceneLights, shared.cam.pos, renderer.maxPointLights + (renderer.lightingLane ? 1 : 0), shared._litRanges, (l, i) => (i < lanterns ? shared.CITY_LIGHT_COLOR_F32 : l.wodColor), 0, total);
  };
  const _wodSetLights = (data, sel) => {
    const lead = data.length / 4 - sel.data.length / 4;
    const colors = wodLightColors(data.length / 4, lead, sel.colors, shared.CITY_LIGHT_COLOR_F32);
    renderer.setPointLights(data, shared.CITY_LIGHT_COLOR_F32, (renderer.lightingLane && capFadePairs(data, lead, shared.cam.pos, renderer.maxPointLights, colors)) || colors);
  };
  return {
    _DOWN, _wodFill, _wodLate, _wodLitCount, _wodSelect, _wodSetLights, _wodT, adoptWodCarry, carryWodSite,
    hitDistance, standWodPile, sweepWodLate, tickCityGates, tickWodSpawners, wodArrivalOf, wodForgetPeer,
    wodForgetPeerSites, wodOnLoad, wodOpened, wodPathsPoint, wodPeerHeldAgo, wodPeerSites, wodSprang, wodSprungList,
    wodUnsprang,
  };
}
