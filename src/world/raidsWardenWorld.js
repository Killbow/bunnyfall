// The world's raid sites and smoke, the event pillar, the warden shows and wagon warden with its
// mod save block, the party layer pick, and the node glint pass.
import { audio } from '../audio/audio.js';
import { createEventPillar } from '../worldEvents/eventPillarHost.js';
import { createNodeGlintPass } from '../render/nodeGlint.js';
import { createRaidSites, pixelGates } from '../worldEvents/raidSitesHost.js';
import { createRaidSmoke } from '../worldEvents/raidMusterHost.js';
import { createWagonWarden, wardenTownOfPixel } from '../travel/wagon/wagonWardenHost.js';
import { createWardenShows } from '../travel/wagon/wagonWardenShow.js';
import { horseVolume } from '../audio/animalVolume.js';
import { worldRoom as layerCellAt, cellOfRoom as layerCellOf } from '../net/wire.js';
import { raidKey as raidKeyOf, raidsBurning } from '../worldEvents/raidingParties.js';
import { registerModSaveData } from '../saves/modSaveData.js';
import { SOUND } from '../audio/soundClips.js';
import { staffRaids as staffEventRaids } from '../worldEvents/staffEvents.js';
import { WARDEN_VENDOR } from '../travel/wagonWarden.js';

/** @param {any} shared */
export function createRaidsWardenWorld(shared) {
  const {
    _mode, _townOfMapId, _wardenT, built, cam, campToScene, campToWire, cityGuards, enchantFeet, exteriorFoes,
    getTexture, hcc, hccRuntime, heightAt, myParkKey, playerTravelPixel, renderer, state, surfaceAt, townTalk, upkeep,
    uploadRecordFrame, wardenTownAt,
  } = shared;
  const raidSites = createRaidSites({ townAt: wardenTownAt, townAtPixel: (px, py) => wardenTownOfPixel(built.values(), (x, y) => state.pixelTranslation(x, y, _wardenT), px, py), feet: enchantFeet, groundAt: surfaceAt, gatesAt: (px, py) => pixelGates(built.get(`${px},${py}`)), standGuard: cityGuards.standBearer, spawnFoe: exteriorFoes.spawnFoe });   // RAID5: the town's square and way off its walk grid (the warden's own read)
  const raidSmoke = createRaidSmoke({ gl: renderer.gl, raids: raidsBurning, keyOf: raidKeyOf, sites: () => raidSites, built: () => built.values(), translation: (px, py) => state.pixelTranslation(px, py), now: () => performance.now() / 1000 });   // BUNNYFALL: seen on every machine
  const eventPillar = createEventPillar({ gl: renderer.gl, events: staffEventRaids, built: () => built.values(), translation: (px, py) => state.pixelTranslation(px, py), heightAt: (x, z) => heightAt(x, z), pixel: () => playerTravelPixel(), now: () => performance.now() / 1000 });   // BUNNYFALL: a staff event's purple pillar (scenes/eventPillarHost.js)
  const WARDEN_CLIPS = { heave: SOUND.AnimalHorse, throw: SOUND.SwingHighPitch, land: SOUND.BodyFall };
  shared.wardenShows = createWardenShows({
    renderer, getTexture, uploadRecordFrame,
    toScene: campToScene, groundAt: (x, z) => surfaceAt(x, z),
    showWagon: (r, texRemap, position, rotation, kind, look, tier, turn, hitched) => hcc.drawShowWagon(r, texRemap, position, rotation, kind, look, tier, turn, hitched),
    wagonBox: (kind) => hcc.partsOf(kind)?.box ?? null,
    horseArt: (look = 0) => !!hcc.presentation.horseArt.ensureLook(look),   // COATS1: a thrown team's look's pictures too (the bay's: the art's)
    hold: (owner, on, lone) => hcc.holdTeam(owner, on, lone),
    sound: (what, at) => { const d = Math.hypot(cam.pos[0] - at[0], cam.pos[2] - at[2]); if (d < 120) audio.playOneShot(WARDEN_CLIPS[what], 0.7 * (1 - d / 120) * (what === 'heave' ? horseVolume() : 1)); },   // HORSE-VOL: the heave is the lifted team's neigh
    now: () => performance.now() / 1000,
  });
  shared.wagonWarden = createWagonWarden({
    hcc, runtime: () => hccRuntime, shows: shared.wardenShows, online: () => shared.online,
    toWire: campToWire, toScene: campToScene, townAt: wardenTownAt,
    townName: (id) => _townOfMapId.get(id >>> 0)?.name ?? '',
    eye: () => cam.pos, street: () => _mode() === 'exterior' && !shared._loading,
    notify: (lines) => { for (const l of lines) townTalk.say(l); },
    myKey: () => myParkKey(),   // AUDIT WARDEN1 C6: a throw of another character's team is not mine
    thrown: () => upkeep.thrown(),   // WAGONS4: THROWN_WEAR off it
  });
  hcc.setWardenWord((a) => shared.wagonWarden?.word(a) ?? null);   // WARDEN1: my park word carries the stamp - the cell throws on it
  registerModSaveData(WARDEN_VENDOR, {
    newSaveData: () => null,
    getSaveData: () => shared.wagonWarden?.getSaveData() ?? null,
    restoreSaveData: (rec) => shared.wagonWarden?.restoreSaveData(rec),
  });
  /** SOC2: my party pose - where I stand (the travel pixel: the place's own inside a dungeon), what the place is
   *  called, the six vitals, the portrait's recipe - as net/wire.js validPartyPose admits it.
   *
   *  PARTY-REST1: and, mirrored alongside them, my own building key (inside one) and my own real rest/loiter
   *  session (resting or not) - `bk` and `rest` below. This host owns every party/online seam, so it reads INTO
   *  the other two hosts' own window stacks through the `restState` getter each now exposes (worldModes.js's
   *  interior, dungeonContext.js's own) rather than each of them learning to speak the wire itself. */
  /** SCALE5d: THE LAYER MY PARTY STANDS IN at the cell `key` - my leader's, else any mate's, whose pose is in the open air
   *  in that cell (wire.js validPartyPose `ly`) - asked first when I join it, so a crowd that overflows into layers keeps
   *  a party together; 0 (the place itself) for anything else. The Worker walks on past a full one.
   *  AUDIT SCALE II R3-4: IN THAT CELL, not within one of it. A layer is a number of ONE place's objects (`key#n`): a mate
   *  in layer 3 of the next cell asked `key#3` of mine, an empty copy of it away from its whole crowd (in the place
   *  itself) and from the mate (whose halo of my cell is the place itself) - and a reconnect asked it again. */
  const partyLayerAt = (key) => {
    const at = layerCellOf(key), party = shared.social?.party;
    if (!at || !party) return 0;
    const near = (m) => m.acct !== shared.social.acct && m.p?.in === 0 && Number.isInteger(m.p.ly) && (() => { const c = layerCellOf(layerCellAt(m.p.px, m.p.py)); return !!c && c[0] === at[0] && c[1] === at[1]; })();
    const mate = party.members.find((m) => m.acct === party.leader && near(m)) ?? party.members.find(near);
    return mate?.p.ly ?? 0;
  };
  const nodeGlintPass = createNodeGlintPass(renderer);   // NODE-MARKS: kindled node by node, built at idle; never in a building (nodeMarksAt) nor under the travel view (the hook's own gate); NODE-GLINT: glinting on its own picture - the glow a node with none
  return { eventPillar, nodeGlintPass, partyLayerAt, raidSites, raidSmoke };
}
