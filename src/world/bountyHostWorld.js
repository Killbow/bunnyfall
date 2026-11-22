// The bounty host: where a bounty may be sited, the packs it places, and its notice and board
// windows. It also reads the player's pixel on the street or in a dungeon, and the party.
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
  // BOUNTY1 (2026-09-28, Mac: "Cities in this game have always 2 Bulletin Boards can we make it so that one of the two
  // when opened gives a quest screen"): THE TOWNS' BOUNTY BOARDS, in the world - scenes/bountyHost.js. Every read it
  // makes of the world is here; it registers its own save record (systems/modSaveData.js).
  shared.bountyHost = createBountyHost({
    now: () => Math.floor(playerTicker.classicMinutes),
    level: () => playerEntity.level | 0 || 1,
    entity: () => playerEntity,
    townName: (px, py) => String(locationIndex.get(`${px},${py}`)?.name ?? ''),
    regionAt: (px, py) => maps.getRegionIndexAt(px, py),   // REP4: the board's region, for the law's thanks
    // the ground a pack may stand on: land (the height bytes say where the sea is, as the gate's scan reads them), no
    // location of the game's own on the pixel, no spawned dungeon - every client's map files answer alike
    siteOk: (x, y) => x > 0 && y > 0 && x < 999 && y < 499 && !_bountyLocPixels.has(`${x},${y}`) && !spawnsDungeon(_spawnSalt, x, y)
      && !gateSeaPixel(maps.getClimateIndex(x, y), shared.woods.getHeightMapValue(x, y))
      && maps.getClimateIndex(x, y) !== TV_MOUNTAIN_CLIMATE,   // BOUNTY-GROUND: never a mountain pixel - the Overworld cannot walk there
    dungeonAt: (x, y) => _bountyDungeonPixels.get(`${x},${y}`) || null,
    graveyardAt: (x, y) => _bountyGraveyardPixels.has(`${x},${y}`),
    playerPixel: () => ((shared.modes?.mode ?? 'exterior') === 'exterior' ? playerTravelPixel() : null),
    // underground the streamer's pixel is frozen at the entrance - the dungeon's own pixel (playerTravelPixel's A10 note)
    // the dungeon's OWN pixel - its location's map-table position - rather than the streamer's last pixel (which is
    // where the player crossed in from, not necessarily the dungeon's)
    dungeonPixel: () => {
      if ((shared.modes?.mode ?? 'exterior') !== 'dungeon') return null;
      const mt = shared.modes?.dungeonLocation?.mapTableData;
      if (mt && Number.isFinite(mt.longitude) && Number.isFinite(mt.latitude)) return longitudeLatitudeToMapPixel(mt.longitude, mt.latitude);
      return playerTravelPixel();
    },
    canStandDungeon: () => (shared.modes?.mode ?? 'exterior') === 'dungeon' && !!shared.modes?.dungeonCtx && !gamePaused() && !playerEntity.isResting,
    standDungeonPack: (o) => _standBountyDungeonPack(o),
    canStand: () => (shared.modes?.mode ?? 'exterior') === 'exterior' && shared.playerSpawned && !gamePaused() && !playerEntity.isResting
      && !shared.travelOptions?.isTravelActive && !(walkMode && player.isPlayerSwimming) && !playerAfloat(),   // SEA-HUNT: no trail is read, no pack stood, from a deck
    standPack: (o) => _standBountyPack(o),
    foePool: () => ((shared.modes?.mode ?? 'exterior') === 'dungeon' ? (shared.modes?.dungeonCtx?.foes ?? []) : exteriorFoes.foes),
    say: (line) => townTalk.say(line),
    showNotice: (notice) => {
      // the notice waits for the screen - the street's slot, and indoors or below the interior's and the dungeon's own
      // stacks (`modes.overlayHeld`): a mate's clear lands while a shop or the pack is open, and must not stand over it
      if ((townTalk.overlayActive && !townTalk.overlayDone) || (shared.modes?.overlayHeld ?? false) || (shared.modes?.deathUp?.() ?? false)) return false;
      // AUDIT 28 H12: a notice taken down unread (another window took the slot, a death came) goes back in the queue
      const ov = createBountyOverlay('notice', { notice, onClose: (read) => { if (!read) shared.bountyHost?.requeue(notice); } });
      if (!ov) return true;
      townTalk.showOverlay(ov);
      return true;
    },
    openBoardWindow: (deps) => { const ov = createBountyOverlay('board', deps); if (ov) townTalk.showOverlay(ov); },
    social: () => (shared.social?.party ? {
      acct: shared.social.acct ?? null, inParty: true,
      mates: (shared.social.others() ?? []).filter((m) => !!m.p).map((m) => ({ acct: m.acct, name: m.name, p: m.p, online: m.online !== false })),   // AUDIT 28 B3: a mate gone offline stands nothing
    } : null),
    posePixel: () => playerTravelPixel(),   // AUDIT 28 B8: the pixel my pose says (composePartyPose's)
    // HUNTERS-MARK (Bounty-Boards.md 12): the hunt's ledger, online alone - its book and the named marks are the bounty host's
    hunt: huntOnline(params.has('online'), saveSoon),
  });
}
