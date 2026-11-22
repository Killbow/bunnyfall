// Online homes in the world: the registry, home looks with the painter preview, and layout pins.
// The pins keep each town in the layout that its homes, deeds, and quests were made in.
import {
  admitPinnedPacks, HOME_LAYOUTS_RETRIES, HOME_LAYOUTS_WAIT_MS, layoutRecordsOf, PINS_DROPPED_LINE, pinsFrom,
  setLayoutPins,
} from '../world/layoutPins.js';
import { characterIdOf } from '../characters/characterId.js';
import { createOnlineHomes } from './onlineHomes.js';
import { ensureWorldDataPack, worldDataPacksMissing } from '../mods/modWorldData.js';
import { homeDecorShown } from '../net/homeVoteLaw.js';
import { homeLookRemap } from '../world/homeLook.js';
import { homeLookSig } from '../net/homeLaw.js';
import { playerEntity } from '../characters/playerEntity.js';
import { pruneDiscoveryLayouts } from '../maps/discovery.js';

/** @param {any} shared */
export function createHomesWorld(shared) {
  const {
    _layoutKeyOfMapId, _layoutKeyPixel, _reskin, _townOfMapId, destroyPixel, homesApi, homesLearned, locationIndex,
    maps, moveArenaDeed, moveArenaHomesOnline, realmSession,
  } = shared;
  const onlineHomes = homesApi ? createOnlineHomes({ api: homesApi, character: () => characterIdOf(playerEntity), onWrote: () => legacyOnlineHomesRead(), onHomes: () => homesLearned() }) : null;

  let _legacyHomesGen = 0;
  function legacyOnlineHomesRead() {
    if (!homesApi || !realmSession) return;
    const gen = ++_legacyHomesGen;
    homesApi.mine().then((r) => {
      if (gen !== _legacyHomesGen || !r?.ok || !Array.isArray(r.data?.homes)) return;
      shared._legacyOnlineHomes = r.data.homes.filter((h) => h && typeof h === 'object').map((h) => ({
        regionIndex: h.region | 0, mapId: h.mapId >>> 0, buildingKey: h.buildingKey | 0,
        location: _townOfMapId.get(h.mapId >>> 0)?.name ?? '',
      }));
    }).catch(() => {});
  }

  let _pinsGen = 0;
  let _pinsDroppedSaid = false;

  const lookOfHome = (mapId, bk, row) => (shared._lookPreview.has(`${mapId}:${bk}`) ? shared._lookPreview.get(`${mapId}:${bk}`) : homeDecorShown(row) ? row?.look ?? null : null);

  function refreshHomeLooks() {
    if (!onlineHomes) return;
    const v = onlineHomes.version() * 1024 + shared._lookPreviewGen;
    if (v === shared._homeLookV) return;
    shared._homeLookV = v;
    for (const [key, p] of shared.built) {
      if (!p.homeTown || p._lookV === v) continue;
      const homes = onlineHomes.homesIn(p.homeTown);
      if (!homes) continue;
      p._lookV = v;
      let merged = false;
      // A merged home rebuilds its pixel for a saved look only, not for the painter preview.
      for (const [bk, row] of homes) if (!p.ruinKeys?.has(bk) && !p.homeKeys.has(bk) && p.buildingKeys.has(bk) && ((row?.look && homeDecorShown(row)) || row?.mine || row?.keeper)) merged = true;
      if (merged) { _reskin.mark(key); continue; }
      for (const m of p.models) {
        if (!m._home) continue;
        const look = lookOfHome(p.homeTown, m._home.bk, homes.get(m._home.bk));
        const sig = homeLookSig(look);
        if (sig === m._home.sig) continue;
        m._home.sig = sig;
        const seq = ++m._home.seq;
        if (!look) { m.texRemap = null; continue; }
        homeLookRemap(m.gpu.subMeshes, p.texRemap, look, p.season, shared.pipeline).then((map) => { if (m._home.seq === seq) m.texRemap = map; }, () => {});
      }
    }
  }
  function previewHomeLook(mapId, bk, look) {
    const k = `${mapId}:${bk}`;
    if (look === undefined) { if (shared._lookPreview.delete(k)) shared._lookPreviewGen++; return; }
    shared._lookPreview.set(k, look);
    shared._lookPreviewGen++;
  }

  function takeHomeLayouts(heard) {
    const towns = heard?.ok ? heard.data?.towns : null;
    if (!Array.isArray(towns)) return null;
    onlineHomes?.hearEveryTown(heard.data?.homes);
    shared._serverLayoutRecords = towns.filter((t) => Array.isArray(t)).map(([mapId, layout]) => ({
      locationKey: _layoutKeyOfMapId.get(Number(mapId) >>> 0) ?? null, stamp: typeof layout === 'string' ? layout : undefined, kind: 'house',
    }));
    return applyLayoutPins().then((set) => {
      if (!set) return;
      shared._homeLayoutsApplied = true;
      shared.modes?.homeLayoutsLanded?.();
      void moveArenaHomesOnline();
      void shared.homesBoot.holdDeeds();
      void shared.homesBoot.sweepGone();
    }).catch((e) => {
      console.warn('[layout] the homes\' towns:', e?.message ?? e);
      shared._serverLayoutRecords = null;
      askHomeLayoutsAgain(1);
    });
  }
  function askHomeLayoutsAgain(attempt) {
    if (!homesApi || shared._serverLayoutRecords !== null) return;
    if (attempt === HOME_LAYOUTS_RETRIES + 1) console.warn('[layout] the homes\' towns are not heard yet - no home is bought or furnished until they are; still asking');
    setTimeout(() => {
      if (shared._serverLayoutRecords !== null) return;
      homesApi.layouts().catch(() => null).then((heard) => { if (!takeHomeLayouts(heard)) askHomeLayoutsAgain(attempt + 1); });
    }, HOME_LAYOUTS_WAIT_MS * Math.min(attempt, HOME_LAYOUTS_RETRIES));
  }

  function hearHomeLayouts() {
    if (!homesApi) return Promise.resolve(null);
    if (shared._hearing) return shared._hearing;
    if (Date.now() - shared._heardAskedAt < HOME_LAYOUTS_WAIT_MS) return Promise.resolve(null);
    shared._heardAskedAt = Date.now();
    shared._hearing = homesApi.layouts().catch(() => null).then((heard) => takeHomeLayouts(heard)).finally(() => { shared._hearing = null; });
    return shared._hearing;
  }

  async function applyLayoutPins(extras = null) {
    if (!shared.homeLayoutsOnline) moveArenaDeed();
    const gen = ++_pinsGen;
    // Online only the service's records pin towns, so every client builds the same layouts.
    const records = shared.homeLayoutsOnline ? (shared._serverLayoutRecords ?? []) : layoutRecordsOf({
      houses: playerEntity.houses, rooms: playerEntity.rentedRooms,
      sites: shared.questBridge?.machine?.getAllActiveQuestSites?.() ?? [],
      questors: shared.questBridge?.machine?.getAllActiveQuestors?.() ?? [],
      repairs: (playerEntity.otherItems ?? []).map((it) => it?.repairData).filter(Boolean),
      anchor: playerEntity.anchorPosition,
      inside: extras?.interior && extras?.world?.pixel ? { pixel: extras.world.pixel, layout: extras.interior.layout } : null,
    });
    const pins = pinsFrom(records);
    const { dropped, heldBack } = await admitPinnedPacks(pins, ensureWorldDataPack);
    if (dropped && !_pinsDroppedSaid) {
      _pinsDroppedSaid = true;
      // The boot's first pins land before the town talk exists, so the line retries.
      const say = () => { try { shared.townTalk.say(PINS_DROPPED_LINE); } catch { setTimeout(say, 500); } };
      say();
      console.warn(`[layout] ${dropped} town(s) could not be kept in a save's layout - their packs did not load`);
    }
    for (const [k, pin] of [...pins]) if (!pin.in.size && !pin.out.size) pins.delete(k);
    if (gen !== _pinsGen) return false;
    const changed = setLayoutPins(pins, { heldBack, missing: worldDataPacksMissing() });
    let rebuilt = 0;
    for (const key of changed) {
      const pixelKey = _layoutKeyPixel.get(key);
      if (!pixelKey) continue;
      const loc = maps.getLocation(key % 100, Math.floor(key / 100));
      if (!loc?.exterior?.exteriorData) continue;
      locationIndex.set(pixelKey, loc);
      shared._locIndexGen += 1;
      if (shared.built.has(pixelKey)) {
        const [px, py] = pixelKey.split(',').map(Number);
        destroyPixel(px, py, { collectLoose: false });
        shared.queue.push({ px, py });
        rebuilt++;
      }
    }
    const forgotten = shared.homeLayoutsOnline && shared._serverLayoutRecords === null ? 0 : pruneDiscoveryLayouts();
    const reseated = shared.homeLayoutsOnline && shared._serverLayoutRecords === null ? 0 : (shared.questBridge?.machine?.reseatMovedSites?.() ?? 0);
    if (reseated) console.log(`[layout] ${reseated} quest site(s) chosen again where their town's layout moved`);
    homesLearned();
    if (pins.size || changed.size) console.log(`[layout] ${pins.size} town(s) kept in a save's layout (${[...pins.values()].map((p) => p.why).join(', ') || 'none'}); ${changed.size} read again, ${rebuilt} rebuilt${forgotten ? `; ${forgotten} discovered building(s) forgotten where a layout moved` : ''}`);
    else if (forgotten) console.log(`[layout] ${forgotten} discovered building(s) forgotten where a layout moved`);
    return true;
  }
  return {
    applyLayoutPins, askHomeLayoutsAgain, hearHomeLayouts, legacyOnlineHomesRead, lookOfHome, onlineHomes,
    previewHomeLook, refreshHomeLooks, takeHomeLayouts,
  };
}
