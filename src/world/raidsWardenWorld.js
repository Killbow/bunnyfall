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
  const raidSites = createRaidSites({ townAt: wardenTownAt, townAtPixel: (px, py) => wardenTownOfPixel(built.values(), (x, y) => state.pixelTranslation(x, y, _wardenT), px, py), feet: enchantFeet, groundAt: surfaceAt, gatesAt: (px, py) => pixelGates(built.get(`${px},${py}`)), standGuard: cityGuards.standBearer, spawnFoe: exteriorFoes.spawnFoe });
  const raidSmoke = createRaidSmoke({ gl: renderer.gl, raids: raidsBurning, keyOf: raidKeyOf, sites: () => raidSites, built: () => built.values(), translation: (px, py) => state.pixelTranslation(px, py), now: () => performance.now() / 1000 });
  const eventPillar = createEventPillar({ gl: renderer.gl, events: staffEventRaids, built: () => built.values(), translation: (px, py) => state.pixelTranslation(px, py), heightAt: (x, z) => heightAt(x, z), pixel: () => playerTravelPixel(), now: () => performance.now() / 1000 });
  const WARDEN_CLIPS = { heave: SOUND.AnimalHorse, throw: SOUND.SwingHighPitch, land: SOUND.BodyFall };
  shared.wardenShows = createWardenShows({
    renderer, getTexture, uploadRecordFrame,
    toScene: campToScene, groundAt: (x, z) => surfaceAt(x, z),
    showWagon: (r, texRemap, position, rotation, kind, look, tier, turn, hitched) => hcc.drawShowWagon(r, texRemap, position, rotation, kind, look, tier, turn, hitched),
    wagonBox: (kind) => hcc.partsOf(kind)?.box ?? null,
    horseArt: (look = 0) => !!hcc.presentation.horseArt.ensureLook(look),
    hold: (owner, on, lone) => hcc.holdTeam(owner, on, lone),
    sound: (what, at) => { const d = Math.hypot(cam.pos[0] - at[0], cam.pos[2] - at[2]); if (d < 120) audio.playOneShot(WARDEN_CLIPS[what], 0.7 * (1 - d / 120) * (what === 'heave' ? horseVolume() : 1)); },
    now: () => performance.now() / 1000,
  });
  shared.wagonWarden = createWagonWarden({
    hcc, runtime: () => hccRuntime, shows: shared.wardenShows, online: () => shared.online,
    toWire: campToWire, toScene: campToScene, townAt: wardenTownAt,
    townName: (id) => _townOfMapId.get(id >>> 0)?.name ?? '',
    eye: () => cam.pos, street: () => _mode() === 'exterior' && !shared._loading,
    notify: (lines) => { for (const l of lines) townTalk.say(l); },
    myKey: () => myParkKey(),
    thrown: () => upkeep.thrown(),
  });
  hcc.setWardenWord((a) => shared.wagonWarden?.word(a) ?? null);
  registerModSaveData(WARDEN_VENDOR, {
    newSaveData: () => null,
    getSaveData: () => shared.wagonWarden?.getSaveData() ?? null,
    restoreSaveData: (rec) => shared.wagonWarden?.restoreSaveData(rec),
  });
  const partyLayerAt = (key) => {
    const at = layerCellOf(key), party = shared.social?.party;
    if (!at || !party) return 0;
    const near = (m) => m.acct !== shared.social.acct && m.p?.in === 0 && Number.isInteger(m.p.ly) && (() => { const c = layerCellOf(layerCellAt(m.p.px, m.p.py)); return !!c && c[0] === at[0] && c[1] === at[1]; })();
    const mate = party.members.find((m) => m.acct === party.leader && near(m)) ?? party.members.find(near);
    return mate?.p.ly ?? 0;
  };
  const nodeGlintPass = createNodeGlintPass(renderer);
  return { eventPillar, nodeGlintPass, partyLayerAt, raidSites, raidSmoke };
}
