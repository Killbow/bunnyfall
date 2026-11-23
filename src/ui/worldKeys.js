// World input: the keyboard, mouse, touch, and gamepad listeners, the HUD action context and its
// dial, and the pause door with its save, load, timers, and mailbox. It also runs the pixel build
// pump the stream feeds.
import { attachGamepad } from './gamepadInput.js';
import { attachTouch } from './touch.js';
import { canFindPlace } from './travelMapDoor.js';
import { createUseMagicItemWindow, noItemToActivateText } from './useMagicItemWindow.js';
import { exitToTitleMenu } from '../scenes/shared.js';
import { getInteractionMode, MODE_ACTIONS } from '../player/interactionMode.js';
import { glassLookScale, nextGlassZoom } from './spyglassView.js';
import { helmPadGesture, helmPadPrompts } from './enhancedHelm.js';
import { hudLargeNextMode, hudLargePrevMode, worldViewportRect } from './hudLarge.js';
import { inventoryDoorReady } from './inventoryDoor.js';
import { isEnhanced, isEnhancedPlus } from './uiSkin.js';
import { isSwingButton, mouseCode, noteKeyDown, noteKeyUp } from './input.js';
import { levelOwed } from './levelNotice.js';
import { liveStat } from '../characters/statMods.js';
import { liveVampirism } from '../afflictions/racialLive.js';
import { lookInvert, lookScale } from './lookSettings.js';
import { mastersHelm } from '../systems/naval/passageHelm.js';
import { navalPadPrompts } from './navalHud.js';
import { ndcFromScreen } from '../player/tapRay.js';
import { openPauseFlow, pauseDoorReady, pauseOpts } from './pauseDoor.js';
import { openPixelDial } from './pixelDial.js';
import { ownMinutes } from '../world/worldTick.js';
import { playerEntity } from '../characters/playerEntity.js';
import { releaseHeldOnFocusLoss } from './focusRelease.js';
import { releaseLook, requestLook, setCursorActive } from '../player/pointerLock.js';
import { survivalOn } from '../systems/survival/switch.js';
import { toggleStatusReadout } from './statusBox.js';

/** @param {any} shared */
export function createWorldKeys(shared) {
  const {
    arenaGate, buildPixel, canvas, csaCall, csaHelmHold, csaHelmPress, csaJourneyHelm, csaOn, csaRuntime,
    destroyPixel, exitAutosave, gamePaused, glassDpad, keys, latch, lockOn, lookFilter, magic, makeCharSheetWindow,
    makeInventoryWindow, makeJournalWindow, makeSpellbookWindow, mapDict, maps, mountRig, navalPadCodes, navalRelease,
    pointerSurfaces, queue, quickOffHand, quickSpell, quickSwap, quickUse, seasonBook, showQuestPlace, spyglass,
    state, timersSource, toggleExteriorAutomap, toggleRest, toggleSpellbook, toggleTravelMap, townTalk, travelViewKey,
    useMagicItem, walkMode, weaponRig, worldQuickLoad, worldQuickSave, yards,
  } = shared;
  async function pump() {
    if (shared.building || !state.owes(queue)) return;
    shared.building = true;
    const next = queue.shift();
    shared._streamSince ??= performance.now();
    try {
      await buildPixel(next.px, next.py);
      // The stream can unload the pixel mid-build; free what the finished build published.
      if (!state.loaded.has(`${next.px},${next.py}`)) destroyPixel(next.px, next.py);
      else state.stood(next.px, next.py);
    } catch (e) {
      console.error(`pixel ${next.px},${next.py} failed:`, e);
      destroyPixel(next.px, next.py, { collectLoose: false });
      shared._wodArrival.keys.delete(`${next.px},${next.py}`);
      state.fail(next.px, next.py, performance.now());
    }
    shared.building = false;
    if (!state.owes(queue)) shared._streamSince = null;
  }

  const postSource = () => { try { return shared.online && shared.postBox ? shared.postBox : null; } catch { return null; } };

  const pauseDoorHooks = () => ({
    openPack: () => { const w = makeInventoryWindow(); if (w) townTalk.showOverlay(w); return !!w; },
    openSpellbook: () => { const w = makeSpellbookWindow(); if (w) townTalk.showOverlay(w); return !!w; },
    openChronicle: () => { const w = makeJournalWindow('notebook'); if (w) townTalk.showOverlay(w); return !!w; },
    openArena: () => arenaGate.openWindow(shared.arenaOnline?.inSession?.() ? 'bouts' : 'team'), arenaJoined: () => arenaGate.joined() || !!shared.arenaOnline?.inSession?.(),
    quickSave: worldQuickSave,
    quickLoad: worldQuickLoad,
    relock: () => requestLook(canvas),
    savingPrevented: () => !!shared.naval?.saveRefused?.() || !!shared.modes?.cardTableLive?.() || !!shared.modes?.gambitStaked?.() || !!shared.modes?.iliacStaked?.() || !!shared.poiTest?.active(),
    loadingPrevented: () => !!shared.online,
    timers: timersSource,
    post: postSource,
    season: seasonBook.source,
    playerName: () => playerEntity.name, playerId: () => playerEntity.characterId ?? null,
    saveAs: (saveName) => worldQuickSave(saveName),
    loadKey: (key) => worldQuickLoad({ key }),
    pushWindow: (w) => townTalk.pushOverlay(w),
    exitToMenu: () => { exitAutosave(); exitToTitleMenu(); },
    textLines: (id) => townTalk.lines(id),
    questMessages: () => shared.questBridge?.machine.getAllQuestLogMessages() ?? [],
    questLog: () => shared.questBridge?.questLog() ?? { active: [], finished: [] },
    repairQuests: () => shared.questBridge?.repair?.() ?? null,
    journalClean: () => shared.questBridge?.journalClean ?? null,
    currentLocationName: () => shared._questLoc()?.name ?? '',
    canFindPlace: (regionName, name) => canFindPlace(maps, mapDict, regionName, name),
    showQuestPlace: (find) => showQuestPlace(find),
  });

  // Mouse events fire while loading, before the modes machine exists, so read it lazily.
  const modeNow = () => shared.modes?.mode ?? 'exterior';
  const hudCtx = {
    toggleCharSheet: () => townTalk.showOverlay(makeCharSheetWindow()),
    showStatus: () => {
      toggleStatusReadout({
        mount: (box) => townTalk.showOverlay(box),
        drop: (box) => townTalk.closeOverlay(box),
        lines: (id) => townTalk.lines(id),
        macroContext: shared.questBridge?.machine?.macroContext?.() ?? null,
        entity: playerEntity,
        survival: survivalOn() ? { minutes: Math.floor(ownMinutes()), vampire: !!liveVampirism(playerEntity), endurance: liveStat(playerEntity, 'endurance') } : null,
      });
    },
    toggleLogbook: () => townTalk.showOverlay(makeJournalWindow('activeQuests')),
    toggleNotebook: () => townTalk.showOverlay(makeJournalWindow('notebook')),
    toggleInventory: () => {
      const w = inventoryDoorReady() ? makeInventoryWindow() : null;
      if (w) townTalk.showOverlay(w);
    },
    toggleSpellbook: () => toggleSpellbook(),
    toggleAutomap: () => toggleExteriorAutomap(),
    openTravelMap: () => toggleTravelMap(),
    toggleSheath: () => weaponRig.toggleSheath(),
    quickUse: (n, rig) => quickUse(n, rig),
    quickSwap: (rig) => quickSwap(rig),
    quickOffHand: () => quickOffHand(),
    quickSpell: () => quickSpell(),
    openTransport: () => { if (csaRuntime?.isSailing() && !gamePaused()) csaCall(() => csaRuntime.StopSailingDelayed()); mountRig.open(); },
    openUseMagicItem: () => {
      const win = createUseMagicItemWindow({
        items: playerEntity.items ?? [],
        onUse: (item) => useMagicItem(item),
      });
      if (win) townTalk.showOverlay(win);
      else townTalk.say(noItemToActivateText());
    },
    toggleDial: () => openPixelDial([
      { id: 'skills', label: 'Skills', dir: 'n', open: () => hudCtx.openSheetPage() },
      { id: 'items', label: 'Items', dir: 'e', open: () => hudCtx.toggleInventory() },
      { id: 'map', label: 'Map', dir: 's', open: () => hudCtx.openTravelMap() },
      { id: 'magic', label: 'Magic', dir: 'w', open: () => hudCtx.toggleSpellbook() },
    ]),
    quickSave: () => worldQuickSave(),
    quickLoad: () => worldQuickLoad(),
    toggleRest: () => toggleRest(),
    openSheetPage: () => (levelOwed(playerEntity) ? hudCtx.toggleCharSheet() : hudCtx.togglePause({ at: 'stats' })),
    sailing: () => !!csaRuntime?.isSailing(),
    togglePause: (doorOpts = {}) => {
      if (!pauseDoorReady()) return;
      const { at: pauseAt } = pauseOpts(doorOpts);
      openPauseFlow((w) => townTalk.showOverlay(w), {
        at: pauseAt,
        ...pauseDoorHooks(),
      });
    },
    cycleMode: (dir) => townTalk.setMode(dir > 0 ? hudLargeNextMode(getInteractionMode()) : hudLargePrevMode(getInteractionMode())),
  };

  const surfaceOpen = (name) => { pointerSurfaces.add(name); setCursorActive(false); releaseLook(); };
  const surfaceClose = (name) => { pointerSurfaces.delete(name); if (!pointerSurfaces.size && !gamePaused()) { if (shared.travelView?.active) setCursorActive(true); else requestLook(canvas); } };

  addEventListener('mousedown', (e) => { if (isSwingButton(e.button)) shared.rightHeld = true; const mc = mouseCode(e.button); if (mc) { keys.add(mc); noteKeyDown(latch.edge, mc); } if (isSwingButton(e.button) && !townTalk.overlayActive && walkMode && modeNow() === 'exterior') { if (shared.gatherHost?.acting()) return; if (magic.interceptAttack(true)) return; if (shared.naval?.attackInput(true)) return; weaponRig.attackInput(0, 0, true); } });
  for (const kind of ['mousedown', 'mouseup']) addEventListener(kind, (e) => { if (e.button === 3 || e.button === 4) e.preventDefault(); });
  // A release is never gated, so a window opened mid-swing still lets go.
  addEventListener('mouseup', (e) => { if (isSwingButton(e.button)) shared.rightHeld = false; const mc = mouseCode(e.button); if (mc) { keys.delete(mc); noteKeyUp(latch.edge, mc); } if (isSwingButton(e.button) && walkMode && modeNow() === 'exterior') weaponRig.attackInput(0, 0, false); if (isSwingButton(e.button)) navalRelease(); });
  releaseHeldOnFocusLoss(globalThis, keys);
  const inputHooks = {
    look: (dx, dy) => {
      lookFilter.add(dx * lookScale() * glassLookScale(spyglass.lens), -dy * lookScale() * lookInvert() * glassLookScale(spyglass.lens));
    },
    attack: (dx, dy, held, o = null) => {
      shared.gatherHost?.strike(held, o?.repeat === true);
      if (!walkMode) { shared.swipeHeld = false; return; }
      if (modeNow() === 'exterior') {
        if (yards?.flying()) { shared.swipeHeld = false; return; }
        shared.swipeHeld = held;
        if (held && shared.gatherHost?.acting()) return;
        if (held && magic.interceptAttack(true)) return;
        if (held && shared.naval?.attackInput(true)) return;
        if (!held) navalRelease();
        weaponRig.attackInput(dx, dy, held);
      } else {
        shared.swipeHeld = false;
        shared.modes?.attackInput?.(dx, dy, held);
      }
    },
    tap: (x, y, opts = null) => {
      if (shared.modes?.decorFlying?.() || yards?.flying()) return;
      if (!ndcFromScreen(x, y, canvas.clientWidth, canvas.clientHeight, worldViewportRect(canvas.clientWidth, canvas.clientHeight))) return;
      if (shared.gatherHost?.acting() && !opts?.lockOnly) { shared.gatherHost.strike(true); shared.gatherHost.strike(false); return; }
      shared._tapPoint = [x, y]; shared._tapArmed = 2;
      shared._tapLockOnly = !!opts?.lockOnly;
    },
    locked: () => lockOn.locked,
    dial: isEnhanced(),
    enhanced: isEnhanced(),
    cycleMode: () => townTalk.nextMode(),
    socialInteract: () => shared.socialInteract(),
    overlayActive: () => townTalk.overlayActive || !!shared.travelView?.active || !!shared.modes?.overlayHeld,
    padAction: (act) => {
      if (MODE_ACTIONS[act]) return townTalk.pickMode(MODE_ACTIONS[act]);
      if (act === 'Spyglass') { shared.glassDoorPress = true; return true; }
      if (act !== 'TravelView' || townTalk.overlayActive) return false;
      travelViewKey();
      return true;
    },
    glass: { up: () => spyglass.up, zoom: () => { if (spyglass.up) spyglass.zoom = nextGlassZoom(spyglass.zoom); } },
    aimHold: () => !!shared.naval?.atGuns,
    helm: {
      up: () => !!(csaRuntime?.isSailing() && csaOn() && isEnhancedPlus()),
      gesture: (dir, kind) => { let r = false; csaCall(() => { r = helmPadGesture(dir, kind, csaRuntime?.helmPanelState() ?? null, { press: csaHelmPress, hold: csaHelmHold }); }); return r; },
      prompts: () => { let r = null; csaCall(() => { r = helmPadPrompts(csaRuntime?.helmPanelState() ?? null, { glass: glassDpad(), passenger: mastersHelm(csaRuntime?.state?.CurrentBoat, csaJourneyHelm) }); }); return r && shared.naval?.atGuns ? [...r, ...navalPadPrompts(shared.naval.hudModel(), navalPadCodes())] : r; },
    },
    stickRuns: () => !csaRuntime?.isSailing(),
    paused: () => gamePaused(),
    cardTable: () => !!shared.modes?.cardSeated?.(),
    cardHeld: () => !!shared.modes?.cardPressHeld?.(),
    board: { up: () => !!shared.modes?.gambitBoardUp?.() },
  };
  { const helm = inputHooks.helm, eg = () => { try { return !!shared.egClient?.padUp(); } catch { return false; } }; inputHooks.helm = { up: () => eg() || helm.up(), gesture: (dir, kind) => (eg() ? shared.egClient.padGesture(dir, kind) : helm.gesture(dir, kind)), prompts: () => (eg() ? shared.egClient.padPrompts() : helm.prompts()) }; }
  const touch = attachTouch(canvas, inputHooks);
  const gamepad = attachGamepad(canvas, inputHooks);
  return { gamepad, hudCtx, modeNow, pauseDoorHooks, postSource, pump, surfaceClose, surfaceOpen, touch };
}
