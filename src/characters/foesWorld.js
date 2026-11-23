// Enemies in the world: the live enemy database, the street's guard pool, the enchantment hooks and
// per-enemy sinks, and the spawning of loose enemies, encounters, camps, and bounty packs. It also
// holds the harbor quays, the home yards, the hall and seat banners, the festival stage, and the
// enemy senses context.
import { accountRefusalText } from '../net/accountClient.js';
import { actionOf } from '../ui/input.js';
import { ambushNight } from '../systems/survival/restAct.js';
import { applyClimate } from '../world/climateSwaps.js';
import { BANNERS_MAX } from '../render/bannerPass.js';
import { CAMP_ROAD_CLEAR_M } from '../world/roadClearance.js';
import { CAMP_SIGHT_RADIUS, campAnchorSpot, PACK_ALERT_RADIUS, PACK_SPACING } from './campEncounters.js';
import { campPasses } from '../party/partyRestLaw.js';
import { carrySiteFoe, encounterCap, siteFoeSpawn } from './exteriorFoes.js';
import { centreFromFeet } from './enemyAnchor.js';
import { chapterFactionOf } from '../net/npcHallBook.js';
import { characterIdOf } from './characterId.js';
import { concealmentFlags } from '../magic/effects.js';
import { createBountyFarms, farmSpotLocal, pickFarm } from '../guilds/bountyFarms.js';
import { createBunnyHallBanners } from '../guilds/bunnyHallBanners.js';
import { createChapterBanners } from '../guilds/chapterBanners.js';
import { createFestivalStage } from '../guilds/seatFestival.js';
import { createHallBanners } from '../guilds/hallBanners.js';
import { createDecoratorHome } from '../homes/decoratorHome.js';
import { createHomeYards, homeYardWallet } from '../homes/homeYards.js';
import { cromwarkPeace } from '../world/wild/cromwark.js';
import { cromwarkPack } from '../world/wild/cromwarkRoster.js';
import { CROMWARK_WARDKEEPER, cromwarkWardRole } from '../world/wild/cromwarkWards.js';
import { wildHere, wildRing, wildZoneKind } from '../world/wildZone.js';
import { createQuayPool } from '../systems/naval/quayPool.js';
import { createSeatBanners } from '../guilds/seatBanners.js';
import { decorScanDeps } from '../homes/decorScan.js';
import { drawGateBossBar } from '../ui/gateBossBar.js';
import { enchantFoeHost, liveEnchantFoes, liveEnchantFoeSinks, sensesContext } from '../scenes/shared.js';
import { ENEMY_BASICS } from './enemyBasics.js';
import { entityOccupancy, placeFoeEnv } from '../systems/quest/questFoeHost.js';
import { fieldOfView } from '../ui/viewSettings.js';
import { getPref } from '../ui/uiPrefs.js';
import { getWorldClimateSettings } from '../formats/mapsFile.js';
import { inBout } from './enemyTargets.js';
import { isEnhanced } from '../ui/uiSkin.js';
import { isTouchDevice } from '../ui/touchDevice.js';
import { layoutLocation, RMB_SIDE } from '../world/locationLayout.js';
import { loadIcon } from '../ui/textureCanvas.js';
import { LOOSE_FOE_PLACE_ATTEMPTS, standLooseFoe } from '../magic/hostEnchant.js';
import { maxFatigue } from './statMods.js';
import { noticeRoll } from '../ai/wildAlert.js';
import { partyGroupMembers } from '../party/partyScale.js';
import { placeFoeFreely } from '../systems/quest/sceneMount.js';
import { playerEntity } from './playerEntity.js';
import { realmGoldAct } from '../saves/realmSaves.js';
import { remapSubMeshes } from '../world/texRemap.js';
import { renownFoeCarry } from '../net/renownTracker.js';
import { revenantSpawnOptions } from '../revenants/revenant.js';
import { setCursorActive } from '../player/pointerLock.js';
import { sifritBarModel } from '../ui/sifritBar.js';
import { sifritBarOf } from '../systems/sifrit/sifritFight.js';
import { SIGHT_RADIUS } from './enemyMotor.js';
import { wildEncounterLevel } from './wildLevel.js';
import { worldDataPacksMissing } from '../mods/modWorldData.js';

/** @param {any} shared */
export function createFoesWorld(shared) {
  const {
    _bountyFarmLocs, _inAnyLocationRect, _inRock, _livePersons, _lptSway, _lptWindfall, _mode, _nearRoad,
    _overDeepWater, _veils, arch, bannerPass, blocks, built, cam, camps, canvas, chapterSheet, cityGuards, collider,
    cpuModels, csaPixelAt, exteriorFoes, gamePaused, gateCrowd, getGpuMesh, getTexture, harbourBook, homeDecor,
    homeLayoutsOnline, livingQuarry, lowPolyTrees, maps, navalOn, onlineHomes, peerRange, pipeline, player,
    playerTicker, previewHomeLook, realmSession, renderer, rrRiding, seasons, seatBook, seatHere, state, surfaceAt,
    townTalk, tvSeaY, uploadRecord, uploadRecordFrame, walkMode, yardCull,
  } = shared;
  const _liveEnemyDatabase = () => [
    ...exteriorFoes.foes, ...cityGuards.guards, ...(shared.modes?.insideFoes?.() ?? []),
  ];

  const onTheRoad = () => !playerEntity.isResting && (!!(shared.travelOptions?.isTravelActive && shared.travelOptions.state?.autopilot) || !!shared.travelView?.active);

  // Indoors the street list is stale (rebuilt only in the exterior frame), so the pool is empty.
  const _guardPool = () => ((shared.modes?.mode ?? 'exterior') !== 'exterior' ? [] : _livePersons.map(({ person, pos }) => ({
    pos, fwdYaw: person.facingYaw, guard: person.guard, person,
    live: ((living) => () => _streetHolds(person, living))(person.living),
    disable: () => {
      for (const p of built.values()) {
        const it = p.population?.pool.find((i) => i.person === person);
        if (it) { it.person.release(); it.active = false; it.scheduleEnable = false; it.scheduleRecycle = false; it.visible = false; return; }
      }
    },
  })));
  const _streetHolds = (person, living) => {
    for (const p of built.values()) {
      const it = p.population?.pool.find((i) => i.person === person);
      if (it) return !!it.active && (person.living ?? null) === (living ?? null);
    }
    return false;
  };

  function rrRidingContacts() { rrRiding.contacts(); }

  const foeSinks = (g, fromPlayer = true) => ({
    hurt: (n, o) => { const fp = o?.fromPlayer ?? fromPlayer; if (n > 0) (g._encounter ? exteriorFoes.damageFoe(g, n, player.pos, null, { fromPlayer: fp, kind: 'spell', whole: !!o?.whole, round: !!o?.round, element: o?.element ?? null }) : cityGuards.hurtGuard(g, n, player.pos, null, { fromPlayer: fp, kind: 'spell', round: !!o?.round })); },
    heal: (n) => { if (!(n > 0)) return; if (g._encounter) exteriorFoes.healFoe(g, n); else g.entity.health = Math.min(g.entity.maxHealth ?? Infinity, g.entity.health + n); },
    drainMagicka: (n) => { if (n > 0) g.entity.magicka = Math.max(0, (g.entity.magicka ?? 0) - n); },
    restoreMagicka: (n) => { if (n > 0) g.entity.magicka = Math.min(g.entity.maxMagicka ?? Infinity, (g.entity.magicka ?? 0) + n); },
    drainFatigue: (n) => { if (n > 0) g.entity.fatigue = Math.max(0, (g.entity.fatigue ?? 0) - n); },
    restoreFatigue: (n) => { if (n > 0) g.entity.fatigue = Math.min(maxFatigue(g.entity), (g.entity.fatigue ?? 0) + n); },
    say: (l) => townTalk.say(l),
  });

  const veilOf = (id) => _veils.get(id) ?? null;

  const crowdDrawnHere = (p) => gateCrowd.shows(p.id) && peerRange.shows(p.id);

  const enchantFeet = () => (walkMode && shared.playerSpawned ? player.pos : cam.pos);

  const _dungeonPool = () => (_mode() === 'dungeon' ? (shared.modes?.dungeonCtx ?? null) : null);
  const _insidePool = () => shared.modes?.insideFoes?.() ?? [];
  const enchantFoes = () => liveEnchantFoes(_mode(), shared.modes?.dungeonCtx ?? null, () => [...cityGuards.guards, ...exteriorFoes.foes], _insidePool);
  const enchantSpellToOwner = (f, record, level) => {
    const host = enchantFoeHost(f, shared.modes?.dungeonCtx ?? null, _insidePool);
    if (host === 'dungeon') return !!shared.modes?.dungeonCtx?.spellToOwner?.(f, record, level);
    if (host === 'exterior') return exteriorFoes.spellToOwner(f, record, level, enchantFeet());
    return false;
  };
  const enchantFoeSinks = (f, fromPlayer = true) => liveEnchantFoeSinks(f, shared.modes?.dungeonCtx ?? null, foeSinks, _insidePool, (g, fp) => shared.modes?.insideFoeSinksFor(g, fp), fromPlayer);
  const enchantReplaceFoe = (targetEntity, mobileType) => {
    const f = enchantFoes().find((x) => !x.dead && x.entity === targetEntity);
    if (!f || f.puppet) return;
    if (f.questBehaviour && !f.questBehaviour.isFoeDead) return;
    if (inBout(f)) return;
    const feet = f.ai?.feet ? centreFromFeet(f.ai.feet, f.idleH ?? f.ai.height) : enchantFeet();
    const missing = (targetEntity.maxHealth ?? 0) - (targetEntity.health ?? 0);
    const stamp = (nf) => {
      if (!nf?.entity) return;
      nf.entity.wabbajackActive = true;
      nf.entity.health -= missing;
      renownFoeCarry(f, nf);
    };
    const host = enchantFoeHost(f, shared.modes?.dungeonCtx ?? null, _insidePool);
    if (host === 'dungeon') { shared.modes?.dungeonCtx.replaceFoe?.(targetEntity, mobileType); return; }
    if (host === 'inside') { Promise.resolve(shared.modes?.insideReplaceFoe?.(f, mobileType, feet)).then(stamp).catch(() => {}); return; }
    // Remove through the pool that holds the record: each pool tears down its own.
    if (cityGuards.guards.includes(f)) cityGuards.removeGuard(f);
    else exteriorFoes.removeFoe(f);
    // A replacement: removing a guard frees no encounter slot, so the cap must not refuse it.
    exteriorFoes.spawnFoe(mobileType, feet, { replacing: true, ...siteFoeSpawn(f) }).then((nf) => { stamp(nf); carrySiteFoe(f, nf); }).catch(() => {});
  };
  const _standEncounterFoe = (hit, feet) => {
    if ((exteriorFoes.encounterRoom?.() ?? Infinity) <= 0) return null;
    const base = placeFoeEnv({
      collider,
      playerFeet: [feet[0], feet[1] + 0.9, feet[2]],
      playerYawRad: cam.yaw,
      fovDegrees: fieldOfView() * 180 / Math.PI,
      isOccupied: entityOccupancy((f) => f.ai?.feet ?? f.feet, _placingPool, feet),
    });
    let spot = null;
    for (const env of campPasses(base, shared.campFeet(), hit.minDistance)) {
      for (let i = 0; i < LOOSE_FOE_PLACE_ATTEMPTS && !spot; i++) {
        spot = placeFoeFreely(env, {
          minDistance: hit.minDistance, maxDistance: hit.maxDistance,
          lineOfSightCheck: hit.lineOfSightCheck,
        });
      }
      if (spot) break;
    }
    if (!spot) return null;
    ambushNight();
    const fly = (ENEMY_BASICS[hit.mobileType]?.behaviour ?? 'General') === 'Flying';
    const fast = shared.wildTravelling() && !_inAnyLocationRect([spot.x, spot.y, spot.z]);
    const noticed = !fast || noticeRoll(Math.hypot(spot.x - feet[0], spot.z - feet[2]), SIGHT_RADIUS, shared.wildStealth(), { seesThrough: !!ENEMY_BASICS[hit.mobileType]?.seesThroughInvisibility, concealment: concealmentFlags(playerEntity), rng: Math.random });
    const stood = exteriorFoes.spawnFoe(hit.mobileType, [spot.x, fly ? spot.y + 1.5 : spot.y, spot.z], {
      yaw: Math.atan2(feet[0] - spot.x, feet[2] - spot.z), grantKind: hit.revenant ? 'rev' : 'enc',
      ...(hit.revenant ? revenantSpawnOptions(hit.revenant, wildEncounterLevel(playerEntity)) : {}),
    }).then((f) => { if (f && fast) { if (noticed) shared.wildFoes.alert(f, performance.now() / 1000); else shared.wildFoes.checked(f); } return f; }).catch(() => null);
    if (noticed) journeyMet();
    return stood;
  };
  function journeyMet() { return shared.travelOptions?.encounter?.() ?? null; }
  const campMembers = (types, kind = 'camp') => {
    const members = partyGroupMembers(types, shared.partySize());
    return (wildHere() && cromwarkPeace(wildZoneKind()) ? cromwarkPack(members, kind === 'band' ? 20 : 25) : members).slice(0, encounterCap());
  };
  const _standCampEncounter = (hit, feet) => {
    let anchor = null;
    for (let i = 0; i < LOOSE_FOE_PLACE_ATTEMPTS && !anchor; i++) {
      anchor = campAnchorSpot({ feet, yawRad: hit.yawRad ?? cam.yaw, fovDegrees: fieldOfView() * 180 / Math.PI, groundAt: collider.heightAt, minDistance: hit.minDistance, maxDistance: hit.maxDistance, bearingDegrees: hit.bearingDegrees });
      if (anchor && _inAnyLocationRect([anchor.x, anchor.y, anchor.z])) anchor = null;
      if (anchor && !hit.roadOk && _nearRoad([anchor.x, anchor.y, anchor.z], (hit.spacing ?? 0) + CAMP_ROAD_CLEAR_M)) anchor = null;
      if (anchor && _overDeepWater(anchor.x, anchor.z)) anchor = null;
      if (anchor && hit.spotOk && !hit.spotOk(anchor.x, anchor.z)) anchor = null;
      if (anchor && _inRock(anchor.x, anchor.y, anchor.z)) anchor = null;
    }
    if (!anchor) return null;
    const campId = exteriorFoes.newCampId();
    let placed = 0;
    const anchorFeet = [anchor.x, anchor.y, anchor.z];
    const stands = [];
    const members = hit.fixed ? hit.mobileTypes : campMembers(hit.mobileTypes, hit.kind);
    const ring = !hit.fixed && wildHere() && cromwarkPeace(wildZoneKind()) ? wildRing() : 0;
    const wardPack = ring >= 4 || (ring === 3 && Math.random() < 1 / 3);
    for (const [slot, type] of members.entries()) {
      const wardRole = cromwarkWardRole(ring, slot, members.length, wardPack);
      const mobileType = wardRole >= 3 ? CROMWARK_WARDKEEPER : type;
      const memberEnv = placeFoeEnv({
        collider,
        playerFeet: [anchorFeet[0], anchorFeet[1] + 0.9, anchorFeet[2]],
        playerYawRad: Math.random() * Math.PI * 2,
        fovDegrees: 0,
        isOccupied: entityOccupancy((f) => f.ai?.feet ?? f.feet, _placingPool, anchorFeet),
      });
      let spot = null;
      for (let i = 0; i < LOOSE_FOE_PLACE_ATTEMPTS && !spot; i++) {
        spot = placeFoeFreely(memberEnv, { minDistance: 1, maxDistance: hit.spacing, lineOfSightCheck: false });
        if (spot && _inAnyLocationRect([spot.x, spot.y, spot.z])) spot = null;
        if (spot && !hit.roadOk && _nearRoad([spot.x, spot.y, spot.z], CAMP_ROAD_CLEAR_M)) spot = null;
        if (spot && _overDeepWater(spot.x, spot.z)) spot = null;
        if (spot && hit.spotOk && !hit.spotOk(spot.x, spot.z)) spot = null;
        if (spot && _inRock(spot.x, spot.y, spot.z)) spot = null;
      }
      if (!spot) continue;
      placed++;
      const fly = (ENEMY_BASICS[mobileType]?.behaviour ?? 'General') === 'Flying';
      stands.push(exteriorFoes.spawnFoe(mobileType, [spot.x, fly ? spot.y + 1.5 : spot.y, spot.z], {
        yaw: Math.atan2(anchorFeet[0] - spot.x, anchorFeet[2] - spot.z),
        ...(hit.spawnOpts ?? {}), wardRole, grantKind: hit.fixed ? 'bounty' : hit.kind === 'band' ? 'band' : 'camp',
      }).then((f) => {
        if (f) {
          f.campId = campId; f.campAlertRadius = hit.alertRadius;
          f.campKind = hit.kind ?? 'pack';
          if (f.ai) f.ai.sightRadius = CAMP_SIGHT_RADIUS;
          if (f.entity) f.entity.campId = campId;
        }
        return f;
      }).catch(() => null));
    }
    if (!placed) return null;
    return { foes: Promise.all(stands), anchorFeet };
  };
  const _farmBlocks = new Map();
  shared.bountyFarms = createBountyFarms({
    collider: () => collider,
    pixelTranslation: (px, py) => state.pixelTranslation(px, py), floatingFrame: () => state,
    pixelBuilt: (px, py) => built.get(`${px},${py}`) ?? null,
    farmBlockNear: (px, py, key) => {
      const best = pickFarm(_bountyFarmLocs, px, py, key);
      if (!best) return null;
      const k = `${best.px},${best.py}`;
      if (!_farmBlocks.has(k)) {
        let lay = null;
        try { lay = layoutLocation(best.loc, maps, blocks, { enhanced: isEnhanced(), windmills: false }).blocks[0]?.layout ?? null; } catch { lay = null; }
        _farmBlocks.set(k, lay ? { models: lay.models, side: RMB_SIDE } : null);
      }
      return _farmBlocks.get(k);
    },
    getGpuMesh: (id) => getGpuMesh(id),
    cpuModel: (id) => cpuModels.get(id),
    prepare: (gpu, p, c = getWorldClimateSettings(maps.getClimateIndex(p.px, p.py)).climateType) => remapSubMeshes(gpu.subMeshes, p.texRemap,
      (a, r) => applyClimate(a, r, c, p.season), pipeline, c),
    spotOk: (x, z, r) => {
      const y = collider.heightAt?.(x, z) ?? 0;
      return !_inAnyLocationRect([x, y, z]) && !_nearRoad([x, y, z], r) && !_overDeepWater(x, z)
        && !_inRock(x, y, z);
    },
    feet: () => (walkMode && shared.playerSpawned ? player.feetAt() : cam.pos),
    mode: () => _mode(),
    enhanced: () => isEnhanced(),
  });
  shared.quays = createQuayPool({
    renderer,
    prepare: async (model) => { for (const sm of model.subMeshes) { await getTexture(sm.textureArchive); uploadRecord(sm.textureArchive, sm.textureRecord, { opaque: true }); } },
    collider: () => collider,
    harbours: () => harbourBook.list(),
    seaY: () => tvSeaY(),
    groundAt: (x, z) => { const p = csaPixelAt(x, z); return p && (p._stride ?? 1) === 1 ? surfaceAt(x, z) : NaN; },
    feet: () => (walkMode && shared.playerSpawned ? player.feetAt() : cam.pos),
    mode: () => _mode(),
    gangways: () => (navalOn() ? shared.naval?.gangways?.() ?? [] : []),
  });
  const hallBanners = onlineHomes && bannerPass ? createHallBanners({
    built: () => built, homes: onlineHomes, translation: (px, py) => state.pixelTranslation(px, py), eye: () => cam.pos,
  }) : null;
  const seatBanners = seatBook && bannerPass ? createSeatBanners({
    built: () => built, seatAt: (mapId) => seatHere(mapId), translation: (px, py) => state.pixelTranslation(px, py), eye: () => cam.pos,
    version: () => (seatBook.open === true ? 1 : 0),
  }) : null;
  const chapterBanners = chapterSheet && bannerPass ? createChapterBanners({
    built: () => built, regionAt: (px, py) => { try { return maps.getRegionIndexAt(px, py); } catch { return null; } },
    chapterOf: (faction, region) => chapterSheet.chapterOf(chapterFactionOf(faction, townTalk?.factionDict ?? null) ?? faction, region),
    translation: (px, py) => state.pixelTranslation(px, py), eye: () => cam.pos,
  }) : null;
  const bunnyHallBanners = bannerPass ? createBunnyHallBanners({ built: () => built, translation: (px, py) => state.pixelTranslation(px, py), eye: () => cam.pos }) : null;
  const festivalStage = seatBook ? createFestivalStage({ seatAt: (mapId) => seatHere(mapId), version: () => (seatBook.open === true ? 1 : 0) }) : null;
  const _hung = [];
  let _hungEye = null;
  const _hungByEye = (x, y) => Math.hypot(x.top[0] - _hungEye[0], x.top[2] - _hungEye[2]) - Math.hypot(y.top[0] - _hungEye[0], y.top[2] - _hungEye[2]);
  const bannersHung = () => {
    const all = _hung;
    all.length = 0;
    for (const b of hallBanners?.list() ?? []) all.push(b);
    for (const b of seatBanners?.list() ?? []) all.push(b);
    for (const b of chapterBanners?.list() ?? []) all.push(b);
    for (const b of bunnyHallBanners?.list() ?? []) all.push(b);
    if (all.length <= BANNERS_MAX) return all;
    _hungEye = cam.pos;
    all.sort(_hungByEye);
    all.length = BANNERS_MAX;
    return all;
  };
  const yardHere = () => yards?.decoratorHere() ?? null;
  const yardDecorators = homeDecor && onlineHomes ? createDecoratorHome({
    yard: true, homes: () => shared.homesApi, decor: () => homeDecor, poolNow: () => yardHere()?.pool ?? null, scan: () => decorScanDeps({ blocks, arch, getTexture }),
    doc: typeof document !== 'undefined' ? document : null, character: () => characterIdOf(playerEntity), wallet: () => homeYardWallet(playerEntity, yardHere()?.region ?? 0),
    realm: () => (realmSession ? (o) => realmGoldAct({ session: realmSession, checkpoint: () => shared.onlineCheckpoint(), ...o }) : null),
    say: (l) => townTalk.say(l), refusal: (w) => accountRefusalText(w), visit: () => { const h = yardHere(); return h ? `${h.mapId}:${h.buildingKey}` : null; },
    here: () => yardHere(), show: (o) => townTalk.showOverlay(o), kept: (rev) => yards?.keepDraft(rev),
  }) : null;
  const yards = homeDecor && onlineHomes ? createHomeYards({
    api: homeDecor, homes: onlineHomes, built: () => built, translation: (px, py) => state.pixelTranslation(px, py), decorators: yardDecorators,
    feet: () => (walkMode && shared.playerSpawned ? player.feetAt() : null),
    outside: () => _mode() === 'exterior' && shared.playerSpawned && !player.riding,
    eye: () => cam.pos,
    cull: (box) => yardCull(box),
    range: () => getPref('yardRange'),
    collider: () => collider, meshes: { getGpuMesh, cpuModels, hold: (kind, key) => pipeline.holdPlace?.(kind, key) ?? null }, renderer, getTexture, uploadRecord, uploadRecordFrame,
    iconUrl: (a, r) => loadIcon(a, r, { scale: 1 }),
    scanDeps: () => decorScanDeps({ blocks, arch, getTexture }),
    seasonal: () => (shared.seasonsActive ? seasons : null),
    trees: lowPolyTrees ? { door: lowPolyTrees, sway: (proto, share) => _lptSway.set(proto, Math.max(_lptSway.get(proto) ?? 0, share)), windfall: (proto, share) => _lptWindfall.set(proto, Math.max(_lptWindfall.get(proto) ?? 0, share)) } : null,
    character: () => characterIdOf(playerEntity),
    campPool: () => camps,
    realm: () => (realmSession ? (o) => realmGoldAct({ session: realmSession, checkpoint: () => shared.onlineCheckpoint(), ...o }) : null),
    wallet: (region) => homeYardWallet(playerEntity, region), regionOf: (y) => built.get(`${y.px},${y.py}`)?.homeRegion ?? 0,
    doc: typeof document !== 'undefined' ? document : null, win: typeof window !== 'undefined' ? window : null, canvas, touch: isTouchDevice(),
    actionOf: (e) => actionOf(e, shared.keys), locked: () => typeof document !== 'undefined' && document.pointerLockElement === canvas,
    cursorOff: () => setCursorActive(false), stick: () => shared.touch?.axes() ?? shared.gamepad?.axes() ?? null,
    say: (l) => townTalk.say(l), refusal: (w) => accountRefusalText(w), openSlot: (o) => townTalk.showOverlay(o),
    look: { preview: (mapId, bk, look) => previewHomeLook(mapId, bk, look), season: () => shared.season },
    heard: () => !homeLayoutsOnline || (shared._homeLayoutsApplied && !worldDataPacksMissing().length),
    now: () => Date.now(),
  }) : null;

  const FRAME_LIVE_MS = 2500;
  const BOUNTY_GROUP_REACH_M = 150;
  const _bountyTrailSpot = (id, px, py) => {
    const t = state.pixelTranslation(px, py);
    for (let k = 0; k < 8; k++) {
      const [lx, lz] = farmSpotLocal(`${id}:trail`, k);
      const x = t[0] + lx, z = t[2] + lz;
      const y = collider.heightAt?.(x, z);
      if (!Number.isFinite(y)) continue;
      if (_inAnyLocationRect([x, y, z]) || _nearRoad([x, y, z], 8) || _overDeepWater(x, z)) continue;
      if (shared.bountyFarms?.occupied?.(x, z, 8)) continue;
      if (_inRock(x, y, z)) continue;
      return [x, y, z];
    }
    return null;
  };
  const _standBountyPack = ({ id, mobileType, count, stage = 0, farm = false, target = null, farmKey = id, huntKey = id }) => {
    const feet = player.feetAt();
    let spotAt = null;
    if (farm) {
      spotAt = shared.bountyFarms?.anchorFor(farmKey) ?? null;
      if (!spotAt && shared.bountyFarms && !shared.bountyFarms.failed(farmKey)) return null;
    } else if (stage === 1 && target) {
      spotAt = _bountyTrailSpot(huntKey, target.px, target.py);
    }
    if (spotAt) {
      const d = Math.hypot(spotAt[0] - feet[0], spotAt[2] - feet[2]);
      if (d > BOUNTY_GROUP_REACH_M) return { far: true, dx: spotAt[0] - feet[0], dz: spotAt[2] - feet[2] };
    }
    const stood = _standCampEncounter({
      mobileTypes: Array(count).fill(mobileType), fixed: true, spacing: PACK_SPACING, alertRadius: PACK_ALERT_RADIUS,
      minDistance: spotAt ? (farm ? 10 : 0) : 60, maxDistance: spotAt ? (farm ? 24 : 8) : 110,
      bearingDegrees: Math.random() * 360, spawnOpts: { loose: true, transient: true },
      spotOk: (x, z) => !(shared.bountyFarms?.inBuilding?.(x, z) ?? false),
    }, spotAt ?? feet);
    if (!stood) return null;
    return { foes: stood.foes, dx: stood.anchorFeet[0] - feet[0], dz: stood.anchorFeet[2] - feet[2] };
  };
  const _standBountyDungeonPack = ({ mobileType, count }) => {
    const d = _dungeonPool();
    if (!d?.spawnLooseFoe || !d.collider) return null;
    const feet = enchantFeet();
    const dist = (p) => Math.hypot(p[0] - feet[0], p[2] - feet[2]);
    const spots = d.questSpawnSpots?.() ?? [];
    const places = spots.length ? spots : (d.foes ?? []).filter((f) => f?.ai?.feet && !f.puppet && f._ownFrom == null).map((f) => f.ai.feet);
    if (!places.length) return null;
    const band = places.filter((p) => { const m = dist(p); return m >= 25 && m <= 90; });
    const at = band.length ? band[Math.floor(Math.random() * band.length)] : places.reduce((a, b) => (dist(b) > dist(a) ? b : a));
    const anchorFeet = [at[0], at[1], at[2]];
    const campId = exteriorFoes.newCampId();
    const stands = [];
    for (let k = 0; k < count; k++) {
      const env = placeFoeEnv({
        collider: d.collider,
        playerFeet: [anchorFeet[0], anchorFeet[1] + 0.9, anchorFeet[2]],
        playerYawRad: Math.random() * Math.PI * 2,
        fovDegrees: 0,
        isOccupied: entityOccupancy((f) => f.ai?.feet ?? f.feet, () => d.foes ?? [], anchorFeet),
      });
      let spot = null;
      for (let i = 0; i < LOOSE_FOE_PLACE_ATTEMPTS && !spot; i++) spot = placeFoeFreely(env, { minDistance: 1, maxDistance: 6, lineOfSightCheck: false });
      if (!spot) continue;
      const fly = (ENEMY_BASICS[mobileType]?.behaviour ?? 'General') === 'Flying';
      stands.push(Promise.resolve(d.spawnLooseFoe(mobileType, [spot.x, fly ? spot.y + 1.5 : spot.y, spot.z], { yawRad: Math.random() * Math.PI * 2 })).then((f) => {
        if (f) { f.campId = campId; if (f.entity) f.entity.campId = campId; }
        return f;
      }).catch(() => null));
    }
    if (!stands.length) return null;
    return { foes: Promise.all(stands), dx: anchorFeet[0] - feet[0], dz: anchorFeet[2] - feet[2] };
  };

  let _sifritBarUp = false;
  const sifritFrame = (dt, at) => {
    try { shared.sifritFight.frame(dt); } catch (e) { console.warn('[sifrit] frame', e?.message ?? e); }
    const b = shared.playerSpawned && playerEntity.health > 0 ? sifritBarOf(exteriorFoes.foes, at) : null;
    if (b || _sifritBarUp) {
      drawGateBossBar(b ? sifritBarModel(b) : null, { hidden: gamePaused() || !!townTalk.hudHidden });
      _sifritBarUp = !!b;
    }
  };
  const _standLooseFoe = (mobileType, opts = {}) => {
    const mode = _mode();
    if (mode === 'interior') return shared.modes?.insideStandLooseFoe?.(mobileType, opts) ?? null;
    if (mode !== 'exterior' && mode !== 'dungeon') return null;
    const d = _dungeonPool();
    return standLooseFoe({
      collider: d ? d.collider : collider,
      feet: enchantFeet(),
      yawRad: cam.yaw,
      fovDegrees: fieldOfView() * 180 / Math.PI,
      foes: enchantFoes(),
      spawn: (mt, pos, o) => (d
        ? d.spawnLooseFoe(mt, pos, { yawRad: o.yawRad, allied: o.allied })
        : exteriorFoes.spawnFoe(mt, pos, { yaw: o.yawRad, allied: o.allied, loose: true })),
    }, mobileType, opts);
  };
  const exteriorFoePool = () => [...cityGuards.guards, ...exteriorFoes.foes];
  // spawnFoe places after its awaits, so count the spots of spawns still in flight.
  const _placingPool = () => [...exteriorFoePool(), ...exteriorFoes.pendingFeet().map((feet) => ({ feet }))];

  const _foeSenses = () => sensesContext(playerEntity, playerTicker.ownMinutes, {
    movingLessThanHalfSpeed: player.movingLessThanHalfSpeed ?? true, playerHeight: player.height, playerCrouching: !!player.crouching,
    candidates: () => [...cityGuards.guards, ...exteriorFoes.foes, ...livingQuarry(), ...(shared.starfall?.wards() ?? [])].filter((f) => !f.dead && !f.puppet),
    playerEntity,
    wildUnaware: (f) => shared.wildGated(f),
  });
  return {
    FRAME_LIVE_MS, _dungeonPool, _foeSenses, _guardPool, _insidePool, _liveEnemyDatabase, _standBountyDungeonPack,
    _standBountyPack, _standCampEncounter, _standEncounterFoe, _standLooseFoe, bannersHung, campMembers,
    crowdDrawnHere, enchantFeet, enchantFoeSinks, enchantFoes, enchantReplaceFoe, enchantSpellToOwner,
    exteriorFoePool, festivalStage, foeSinks, hallBanners, journeyMet, onTheRoad, rrRidingContacts, seatBanners,
    sifritFrame, veilOf, yards,
  };
}
