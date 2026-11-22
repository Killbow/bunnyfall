// The world's Elite Breach: the breach clock, the site and feet sent on the wire, the key's facts,
// the board and start windows, and the company's members in a breach. It also holds the breach
// frame, the court frame, a Redoubt's paid spoils, and the witness's eye.
// The breach client stays in the world.
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
  const egNow = () => shared.egClient?.breachNow() ?? Date.now() + shared._sharedOffsetMs;   // EG-ZD (section 10.8): in a breach the corrected clock (scenes/eliteGates/egClient.js breachNow), the welcome's offset elsewhere
  /** A line on the screen for its length (the court's), and a saving throw against a blow's element (the gate's). */
  const egMid = (text) => setMidScreenText(text, courtSaySeconds(text));

  /** Where the member answers from: the climate and region of the pixel underfoot (the circle's sky and its name). */
  const egSiteNow = () => {
    const px = playerTravelPixel(), ci = maps.getClimateIndex(px.x, px.y), climateType = getWorldClimateSettings(ci).climateType;
    return { climateBase: climateType, season: INTERIOR_SEASON, climate: { worldClimate: ci, climateType }, regionIndex: _questRegionIndex(), regionName: '' };
  };
  /** The open's site on the wire (net/wire.js egSite): the pixel, the feet, the facing. */
  const egWireNow = () => {
    const px = playerTravelPixel(), p = player.feetAt(), yaw = Math.atan2(Math.sin(cam.yaw), Math.cos(cam.yaw));
    return Number.isSafeInteger(px?.x) && Number.isSafeInteger(px?.y) ? { px: px.x, py: px.y, x: p[0], y: p[1], z: p[2], yaw } : null;
  };

  // ── EG-F (bible/11-Multiplayer/Elite-Gates.md sections 5, 6.3 and 6.4): THE ARCH AND THE CALL ────────────────────────
  // the arch pool (scenes/eliteGates/egArch.js - drawn through the gate's pool below), the call's portal and its prompt
  // (scenes/eliteGates/egCall.js), the key's facts for its refusals, and the start window (ui/eliteGates/egStartWindow.js - DFU's list picker,
  // the boat variant picker's way, and DFU's YesNo box). Online alone, as the breach is.
  const egFeet = () => (walkMode && shared.playerSpawned && (shared.modes?.mode ?? 'exterior') === 'exterior' ? player.feetAt() : null);
  const egProbes = () => ({ ground: (o, d, m) => collider.surfaceHit(o, d, m)?.dist, wall: (o, d, m) => collider.raycastHit(o, d, m)?.dist });

  /** The key's facts (scenes/eliteGates/egArch.js egKeyRefusal): the Portal Stone's holds, the water, a boat, a location's footprint,
   *  a Dagon's Breach near, and the arch's site where it would stand (null: no room - egArchPlace). */
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
  /** EG-ZM (Elite-Gates.md section 20, THE BOARD WINDOW): THE BOARDS' ONE DOOR (ui/eliteGates/egBoardWindow.js createEgBoardDoor) -
   *  `/breach board`, the Timers row's Elite entries and the start window all open the boards here, in the skin worn (the
   *  enhanced panel, or the classic skin's DFU pickers on the mode's window slot), one at a time. */
  const egWindowSlot = { top: () => shared.modes?.topWindow?.() ?? null, mount: (w) => shared.modes?.mountWindow?.(w), close: (w) => shared.modes?.closeWindow?.(w) };   // AUDIT STAKE-ROW: the boards' and the start list's one slot

  /** THE START WINDOW's three doors: DFU's list picker on the mode machine's window slot (the boat's variant picker's own
   *  way - csaOpenListPicker; AUDIT STAKE-ROW: its doors are the window's own, egStartListDoors), and DFU's YesNo box on the
   *  overlay. EG-ZM: and the boards' door (egBoardDoor). */
  const egStartWindow = (o) => openEgStartWindow({
    ...o,
    board: (onClosed) => shared.egBoardDoor(onClosed),
    ...egStartListDoors({ ready: listPickerArtLoaded, slot: egWindowSlot, makeList: (items, onPick, onCancel) => new ListPickerWindow({ items, backdrop: 'none', onPick: (i) => onPick(i), onCancel: () => onCancel() }) }),
    ask: egStartAsk((w) => townTalk.showOverlay(w), (o) => new YesNoBoxWindow(o)),   // AUDIT EG III (lane4 #12): a box put out of its slot unanswered ends the window
    panel: isEnhancedPlus() ? egStartPanelDoors({ slot: egWindowSlot }) : null,   // EG-PLUS: on Enhanced Plus, a breach window of its own (ui/eliteGates/egStartPanel.js)
  });

  /** EG-FULL: my company's other members where this screen draws them (the room's poses, by account - net/social.js
   *  accountOfPeer: the company is my party). */
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
    // EG-E: a Redoubt's spoils in the Hour's pool (egSpoilsPaid) - flying in the Spire; what the floor still holds gathered
    // as I leave it, the Hour's own way (sdSpoilsBurst.leave)
    const inSpire = shared.modes?.egHallBreach?.() != null;
    try { if (inSpire) sdSpoilsPool?.frame(); else if (_egSpoilsIn) { sdSpoilsPool?.gather(); saveSoon.changed(); } } catch (e) { console.warn('[eg] spoils', e?.message ?? e); }
    _egSpoilsIn = inSpire;
  };
  /** EG-E (Elite-Gates.md section 19): WHAT A REDOUBT PAID - the account service's word on my Redoubt receipt (scenes/
   *  egClient.js `paid`): its Marks and the guild's deed as a haul card; its spoils (systems/eliteGates/egSpoils.js - rolled on the
   *  seed the claim answered - AUDIT EG V: the receipt's mixed with the service's own draw - at the level the breach
   *  admitted, the lord's arm and card by its key, the Panoply's pity as the service forced it, and the Deadlands Embers it
   *  paid), thrown from the Court's heart when I stand in that Redoubt, else straight into the pack - in the
   *  Hour's pool (the Spire is a dungeon's frame as the Hour is, and the two are never stood in at once), once a receipt
   *  and account. A Redoubt taken again this week pays its gold alone, and a guest's (no name the service records) too.
   *  AUDIT EG III (section 16.3): an END's claim (`q` 'x') opens its Reliquaries - those the service answered (`rl`), each a
   *  roll at its Redoubt's depth off the seed the end's claim answered (systems/eliteGates/egSpoils.js egReliquaryGrant), straight into the pack
   *  through the same pool, once an end and account. */
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
    // AUDIT EG V (lane8 L8-2, L8-5; section 19): the embers the claim paid in the spoils, and the seed the claim answered
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
  /** The host frame's breach lines, out of it (PERF-V8): with no online frame the breach's fight and tracker put away (EG-H2:
   *  the court's law in a breach is the made level's - the frame's one setCourtRules). */
  const egCourtFrame = () => {
    if (!(onlineOn && shared.playerSpawned)) shared.egClient?.away();
  };
  /** The witness's eye (section 16.5), behind a living companion - the host frame's view, moved when it is. */
  const egWitnessEye = (/** @type {{ eye: any }} */ v, dt = 0, cast = null) => { if (shared.egClient?.witnessing()) { const c = { pos: v.eye }; if (shared.egClient.witnessEye(c, cam.yaw, { dt, cast })) v.eye = c.pos; } };   // AUDIT EG III (lane6 #1): the frame's dt and the host's sphere cast - damped and colliding (section 16.5)
  return {
    egCourtFrame, egFeet, egFrame, egKeyFacts, egMid, egNow, egPeers, egProbes, egSiteNow, egSpoilsPaid,
    egStartWindow, egWindowSlot, egWireNow, egWitnessEye,
  };
}
