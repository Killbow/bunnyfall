// The world's start of a character: a test room preset, a legacy birth, a headless class from the
// address, or the character creation wizard. Each path sets the spell index, the paper doll art,
// and the start of the quests, and the online paths start the realm birth.
import {
  applyHeadlessChargen, createChargenFlow, createChargenWindow, finishChargen, loadSpellIndex,
} from '../characters/chargenSession.js';
import { applyTestCharacter, seedTestLoot, seedTestMount } from '../characters/testRoom.js';
import { artRaceOf } from '../characters/races.js';
import { autoBuildArms, buildArmsFor } from '../combat/weaponRig.js';
import { enumerateSaves } from '../saves/saveSlots.js';
import { exitToTitleMenu, fetchBytes } from '../scenes/shared.js';
import { loadSearch } from '../systems/legacy/places.js';
import { morrowindDataCount } from '../scenes/dataSource.js';
import { newestSaveOf } from '../systems/legacy/store.js';
import { ownMinutes, sharedClockOn } from './worldTick.js';
import { peekPendingClassicSave } from '../saves/classicSave.js';
import { playerEntity, surfacePlayer } from '../characters/playerEntity.js';
import { preloadPaperDollArt } from '../ui/paperDoll.js';
import { releaseUnloadGuard } from '../platform/unloadGuard.js';
import { setLoadingAside } from '../ui/loadingScreen.js';
import { setRealmNotice } from '../saves/realmSaves.js';

/** @param {any} shared */
export function createTestPresetWorld(shared) {
  const {
    getTexture, legacyReady, legacyRealmBirth, palette, params, questInitAtGameStart, realmBirth, realmLost, realmNew,
    renderer, testEntry, testPreset, townTalk,
  } = shared;
  if (testPreset) {
    (async () => {
      const preset = testPreset;
      const sbi = await loadSpellIndex(fetchBytes);
      shared.spellsByIndex = sbi;
      const { added } = await applyTestCharacter(playerEntity, preset, { fetchBytes, spellsByIndex: sbi });
      preloadPaperDollArt({ renderer, fetchBytes, palette, getTexture },
        { race: artRaceOf(playerEntity), gender: playerEntity.gender, faceIndex: playerEntity.faceIndex });
      surfacePlayer();
      questInitAtGameStart();
      console.log(`[testroom] ${preset.label}: ${added} armory items in the pack`);
      if (testEntry.ride) { seedTestMount(playerEntity); shared.rideOutWanted = true; }
      if (testEntry.sea) shared.seaTestWanted = true;
      if (testEntry.loot) console.log(`[testroom] loot ladder: ${seedTestLoot(playerEntity).length} rolled items in the pack`);
      if (morrowindDataCount() > 0) {
        const res = await buildArmsFor(playerEntity);
        if (!res.ok) console.warn(`[testroom] arms refused - ${res.stage}: ${res.error}`);
      }
    })().catch((e) => console.warn('[testroom] boot failed; the wizard stands in', e));
  } else if (!playerEntity.chargenDone && params.has('legacyborn') && !params.has('load')) {
    const legacyBirthFailed = (why) => { console.warn(`[legacy] the birth did not take: ${why}`); setRealmNotice(globalThis.sessionStorage, `The heir could not be born: ${why}. The house waits. ${realmNew ? 'Choose who carries it on from the Online page' : 'Load the fallen\'s save to try again'}.`); releaseUnloadGuard(); exitToTitleMenu(); };
    Promise.all([createChargenFlow(fetchBytes), legacyReady]).then(([{ careers, spellsByIndex: sbi, factionDict }, host]) => {
      shared.spellsByIndex = sbi;
      const r = host?.bornResult({ careers, factionDict });
      if (!r) { legacyBirthFailed('no birth waits for this address'); return; }
      finishChargen(playerEntity, r, sbi);
      if (sharedClockOn()) playerEntity.lastSkillCheckTime = Math.floor(ownMinutes());
      preloadPaperDollArt({ renderer, fetchBytes, palette, getTexture }, { race: artRaceOf(r), gender: r.gender, faceIndex: r.faceIndex });
      surfacePlayer();
      questInitAtGameStart();
      autoBuildArms(playerEntity);
      if (realmNew) { legacyRealmBirth(host).catch((e) => { console.error('[legacy] the online birth failed', e); realmLost('server'); }); return; }
      host.onBorn();
      const key = newestSaveOf(enumerateSaves().info, String(playerEntity.characterId ?? ''));
      if (key >= 0) { try { globalThis.history.replaceState(globalThis.history.state, '', `${location.pathname}${loadSearch(location.search, key)}`); } catch { } }
    }).catch((e) => legacyBirthFailed(e?.message ?? String(e)));
  } else if (!playerEntity.chargenDone && params.has('class')) {
    loadSpellIndex(fetchBytes).then((sbi) => { shared.spellsByIndex = sbi; return applyHeadlessChargen(playerEntity, Number(params.get('class')), { fetchBytes, spellsByIndex: sbi }); })
      .then(() => {
        preloadPaperDollArt({ renderer, fetchBytes, palette, getTexture },
          { race: artRaceOf(playerEntity), gender: playerEntity.gender, faceIndex: playerEntity.faceIndex });
        surfacePlayer();
        questInitAtGameStart();
        shared.legacyHost?.onCharacterMade();
      })
      .catch((e) => console.warn('[chargen] CLASS*.CFG unavailable; the interim entity stands in', e));
  } else if (!playerEntity.chargenDone && !params.has('load')
    && !(params.has('classicload') && peekPendingClassicSave())) {
    // No wizard when a save is about to load: the save carries chargenDone but arrives after the boot walk.
    createChargenFlow(fetchBytes).then(({ flow, spellsByIndex: sbi }) => {
      shared.spellsByIndex = sbi;
      setLoadingAside('window', true);
      townTalk.showOverlay(createChargenWindow(flow, {
        onCancel: () => { releaseUnloadGuard(); location.reload(); },
        onDone: (r) => {
          setLoadingAside('window', false);
          finishChargen(playerEntity, r, sbi);
          // Online, the skill check stamp follows the shared world clock, or the six-hour gate is open at birth.
          if (sharedClockOn()) playerEntity.lastSkillCheckTime = Math.floor(ownMinutes());
          preloadPaperDollArt({ renderer, fetchBytes, palette, getTexture },
            { race: artRaceOf(r), gender: r.gender, faceIndex: r.faceIndex });
          surfacePlayer();
          questInitAtGameStart();
          autoBuildArms(playerEntity);
          shared.legacyHost?.onCharacterMade(r.legacyModel ?? null);
          if (realmNew) realmBirth().catch((e) => { console.error('[realm] the birth failed', e); realmLost('server'); });
        },
      }));
    }).catch((e) => console.warn('[chargen] CLASS*.CFG unavailable; the interim entity stands in', e));
  }
}
