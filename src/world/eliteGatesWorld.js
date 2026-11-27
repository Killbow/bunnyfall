import { claimHauls } from '../ui/haulCards.js';
import { courtSaySeconds } from '../worldEvents/gateCourt.js';
import { EG_ARCH_GATE_NEAR_M, egArchPlace, egArchSite } from '../systems/eliteGates/egArch.js';
import {
  EG_SPOILS_TEXT, egReliquaryGrant, egSpoilsDay, egSpoilsList, egSpoilsSeedOf,
} from '../systems/eliteGates/egSpoils.js';
import { egStartAsk, egStartListDoors, openEgStartWindow } from '../ui/eliteGates/egStartWindow.js';
import { egStartPanelDoors } from '../ui/eliteGates/egStartPanel.js';
import { getWorldClimateSettings } from '../formats/mapsFile.js';
import { INTERIOR_SEASON } from './climateSwaps.js';
import { isEnhancedPlus } from '../ui/uiSkin.js';
import { isOnShip } from '../systems/naval/ship.js';
import { listPickerArtLoaded, ListPickerWindow } from '../ui/listPicker.js';
import { playerEntity } from '../characters/playerEntity.js';
import { setMidScreenText } from '../ui/midScreenText.js';
import { showHaul } from '../ui/pickupFeed.js';
import { spoilsLevel, spoilsLock } from '../worldEvents/spoilsPool.js';
import { YesNoBoxWindow } from '../ui/yesNoBox.js';

/** @param {any} shared */
export function createEliteGatesWorld(shared) {
  const {
    _questRegionIndex, cam, collider, csaBoatUnderMe, maps, marksBook, onlineOn, player, playerTravelPixel,
    portalHoldNow, saveSoon, sdSpoilsPool, state, townTalk, walkMode,
  } = shared;
  const egNow = () => shared.egClient?.breachNow() ?? Date.now() + shared._sharedOffsetMs;
  const egMid = (text) => setMidScreenText(text, courtSaySeconds(text));

  const egSiteNow = () => {
    const px = playerTravelPixel(), ci = maps.getClimateIndex(px.x, px.y), climateType = getWorldClimateSettings(ci).climateType;
    return { climateBase: climateType, season: INTERIOR_SEASON, climate: { worldClimate: ci, climateType }, regionIndex: _questRegionIndex(), regionName: '' };
  };
  const egWireNow = () => {
    const px = playerTravelPixel(), p = player.feetAt(), yaw = Math.atan2(Math.sin(cam.yaw), Math.cos(cam.yaw));
    return Number.isSafeInteger(px?.x) && Number.isSafeInteger(px?.y) ? { px: px.x, py: px.y, x: p[0], y: p[1], z: p[2], yaw } : null;
  };

  const egFeet = () => (walkMode && shared.playerSpawned && (shared.modes?.mode ?? 'exterior') === 'exterior' ? player.feetAt() : null);
  const egProbes = () => ({ ground: (o, d, m) => collider.surfaceHit(o, d, m)?.dist, wall: (o, d, m) => collider.raycastHit(o, d, m)?.dist });

  const egKeyFacts = () => {
    const f = egFeet(), px = playerTravelPixel(), g = shared.gatePool?.place?.() ?? null;
    const at = f ? egArchPlace(f, cam.yaw, egProbes()) : { refused: 'room' };
    return {
      hold: portalHoldNow(), water: !!player.isPlayerSwimming, aboard: !!(csaBoatUnderMe() || isOnShip(playerEntity, playerEntity.boardShipPosition ?? null, px)),
      within: shared._wasInLocationRect ? (shared._musicLoc?.name || 'this place') : null,
      nearGate: !!(g && f && Math.hypot(g.origin[0] - f[0], g.origin[2] - f[2]) <= EG_ARCH_GATE_NEAR_M),
      site: at.at && Number.isSafeInteger(px?.x) ? egArchSite(at.at, at.yaw, px.x, px.y, state.pixelTranslation(px.x, px.y)) : null,
    };
  };
  const egWindowSlot = { top: () => shared.modes?.topWindow?.() ?? null, mount: (w) => shared.modes?.mountWindow?.(w), close: (w) => shared.modes?.closeWindow?.(w) };

  const egStartWindow = (o) => openEgStartWindow({
    ...o,
    board: (onClosed) => shared.egBoardDoor(onClosed),
    ...egStartListDoors({ ready: listPickerArtLoaded, slot: egWindowSlot, makeList: (items, onPick, onCancel) => new ListPickerWindow({ items, backdrop: 'none', onPick: (i) => onPick(i), onCancel: () => onCancel() }) }),
    ask: egStartAsk((w) => townTalk.showOverlay(w), (o) => new YesNoBoxWindow(o)),
    panel: isEnhancedPlus() ? egStartPanelDoors({ slot: egWindowSlot }) : null,
  });

  function egPeers() {
    const out = [];
    for (const [id, p] of shared.online?.peers ?? []) {
      const sub = shared.social?.accountOfPeer?.(id) ?? null;
      if (sub && p?.shown && Number.isFinite(p.shown.x)) out.push({ sub, pos: shared.onlineToScene(p.shown) });
    }
    return out;
  }

  let _egSpoilsIn = false;
  const egFrame = () => {
    try { shared.egClient?.frame(); } catch (e) { console.warn('[eg] frame', e?.message ?? e); }
    const inSpire = shared.modes?.egHallBreach?.() != null;
    try { if (inSpire) sdSpoilsPool?.frame(); else if (_egSpoilsIn) { sdSpoilsPool?.gather(); saveSoon.changed(); } } catch (e) { console.warn('[eg] spoils', e?.message ?? e); }
    _egSpoilsIn = inSpire;
  };
  function egSpoilsPaid(c, d) {
    if (c?.q === 'x') {
      const g = egReliquaryGrant(c, d, spoilsLevel(playerEntity.level ?? 1, c.l));
      if (g) spoilsLock(() => sdSpoilsPool.grant({ day: g.day, acct: c.s, roll: g.roll, text: g.text })).catch((e) => console.warn('[eg] reliquaries', e?.message ?? e));
      return;
    }
    if (!c || !Number.isSafeInteger(c.c) || !Number.isSafeInteger(c.w)) return;
    if (d?.marks || d?.deed) { showHaul(claimHauls(d, 'eg')); for (const line of marksBook?.claimLines(d, 'eg') ?? []) shared.chatNotice(line); }
    const guest = d?.why === 'guest', goldOnly = guest || d?.paid === false;
    const level = spoilsLevel(playerEntity.level ?? 1, c.l);
    const o = { lord: typeof c.lk === 'string' ? c.lk : '', pity: Array.isArray(d?.pity) ? d.pity.filter((p) => p === 0 || p === 1) : [], goldOnly, embers: Number.isSafeInteger(d?.embers) ? d.embers : 0 };
    const seed = egSpoilsSeedOf(c, d), day = egSpoilsDay(c.b, c.w), roll = () => egSpoilsList(seed, level, c.w, o);
    const text = guest ? EG_SPOILS_TEXT.guest : goldOnly ? EG_SPOILS_TEXT.goldOnly(c.w) : EG_SPOILS_TEXT.granted(c.w);
    const at = shared.egClient?.beaconAt?.(c.h) ?? null;
    if (at) {
      const f = player.feetAt(), bearing = Math.atan2(f[0] - at.at[0], f[2] - at.at[2]);
      if (sdSpoilsPool.spew({ day, seed, level, at: at.at, bearing, acct: c.s, keep: at.keep, roll })) shared.chatNotice(goldOnly ? text : EG_SPOILS_TEXT.spilled);
      return;
    }
    spoilsLock(() => sdSpoilsPool.grant({ day, acct: c.s, roll, text })).catch((e) => console.warn('[eg] spoils', e?.message ?? e));
  }
  const egCourtFrame = () => {
    if (!(onlineOn && shared.playerSpawned)) shared.egClient?.away();
  };
  const egWitnessEye = (/** @type {{ eye: any }} */ v, dt = 0, cast = null) => { if (shared.egClient?.witnessing()) { const c = { pos: v.eye }; if (shared.egClient.witnessEye(c, cam.yaw, { dt, cast })) v.eye = c.pos; } };
  return {
    egCourtFrame, egFeet, egFrame, egKeyFacts, egMid, egNow, egPeers, egProbes, egSiteNow, egSpoilsPaid,
    egStartWindow, egWindowSlot, egWireNow, egWitnessEye,
  };
}
