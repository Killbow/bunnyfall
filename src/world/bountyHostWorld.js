import { createBountyHost } from '../guilds/bountyHost.js';
import { createBountyOverlay } from '../ui/bountyDoor.js';
import { gateSeaPixel } from '../worldEvents/gateSite.js';
import { huntOnline } from '../guilds/huntersMark.js';
import { longitudeLatitudeToMapPixel } from '../formats/mapsFile.js';
import { playerEntity } from '../characters/playerEntity.js';
import { spawnsDungeon } from './spawnedDungeons.js';
import { TV_MOUNTAIN_CLIMATE } from '../travel/travelRoute.js';

/** @param {any} shared */
export function createBountyHostWorld(shared) {
  const {
    _bountyDungeonPixels, _bountyGraveyardPixels, _bountyLocPixels, _spawnSalt, _standBountyDungeonPack,
    _standBountyPack, exteriorFoes, gamePaused, locationIndex, maps, params, player, playerAfloat, playerTicker,
    playerTravelPixel, saveSoon, townTalk, walkMode,
  } = shared;
  shared.bountyHost = createBountyHost({
    now: () => Math.floor(playerTicker.classicMinutes),
    level: () => playerEntity.level | 0 || 1,
    entity: () => playerEntity,
    townName: (px, py) => String(locationIndex.get(`${px},${py}`)?.name ?? ''),
    regionAt: (px, py) => maps.getRegionIndexAt(px, py),
    // Reads only map file data so every client accepts the same ground.
    siteOk: (x, y) => x > 0 && y > 0 && x < 999 && y < 499 && !_bountyLocPixels.has(`${x},${y}`) && !spawnsDungeon(_spawnSalt, x, y)
      && !gateSeaPixel(maps.getClimateIndex(x, y), shared.woods.getHeightMapValue(x, y))
      && maps.getClimateIndex(x, y) !== TV_MOUNTAIN_CLIMATE,
    dungeonAt: (x, y) => _bountyDungeonPixels.get(`${x},${y}`) || null,
    graveyardAt: (x, y) => _bountyGraveyardPixels.has(`${x},${y}`),
    playerPixel: () => ((shared.modes?.mode ?? 'exterior') === 'exterior' ? playerTravelPixel() : null),
    // Underground, use the map-table pixel of the dungeon, not the last streamed pixel, which is where the player
    // crossed in.
    dungeonPixel: () => {
      if ((shared.modes?.mode ?? 'exterior') !== 'dungeon') return null;
      const mt = shared.modes?.dungeonLocation?.mapTableData;
      if (mt && Number.isFinite(mt.longitude) && Number.isFinite(mt.latitude)) return longitudeLatitudeToMapPixel(mt.longitude, mt.latitude);
      return playerTravelPixel();
    },
    canStandDungeon: () => (shared.modes?.mode ?? 'exterior') === 'dungeon' && !!shared.modes?.dungeonCtx && !gamePaused() && !playerEntity.isResting,
    standDungeonPack: (o) => _standBountyDungeonPack(o),
    canStand: () => (shared.modes?.mode ?? 'exterior') === 'exterior' && shared.playerSpawned && !gamePaused() && !playerEntity.isResting
      && !shared.travelOptions?.isTravelActive && !(walkMode && player.isPlayerSwimming) && !playerAfloat(),
    standPack: (o) => _standBountyPack(o),
    foePool: () => ((shared.modes?.mode ?? 'exterior') === 'dungeon' ? (shared.modes?.dungeonCtx?.foes ?? []) : exteriorFoes.foes),
    say: (line) => townTalk.say(line),
    showNotice: (notice) => {
      if ((townTalk.overlayActive && !townTalk.overlayDone) || (shared.modes?.overlayHeld ?? false) || (shared.modes?.deathUp?.() ?? false)) return false;
      const ov = createBountyOverlay('notice', { notice, onClose: (read) => { if (!read) shared.bountyHost?.requeue(notice); } });
      if (!ov) return true;
      townTalk.showOverlay(ov);
      return true;
    },
    openBoardWindow: (deps) => { const ov = createBountyOverlay('board', deps); if (ov) townTalk.showOverlay(ov); },
    social: () => (shared.social?.party ? {
      acct: shared.social.acct ?? null, inParty: true,
      mates: (shared.social.others() ?? []).filter((m) => !!m.p).map((m) => ({ acct: m.acct, name: m.name, p: m.p, online: m.online !== false })),
    } : null),
    posePixel: () => playerTravelPixel(),
    hunt: huntOnline(params.has('online'), saveSoon),
  });
}
