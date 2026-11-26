// Ports the Warm Ashes Ships mod (encounters on ships and ocean fast travel) from its compiled code.
import { modSetting } from '../../mods/modSettings.js';
import { ActionTemplate } from '../quest/actions.js';
import { setBlockVariant, ANY_LOCATION_KEY } from '../../world/worldDataVariants.js';
import { SHIP_TYPES } from '../../trade/banking.js';
import { registerQuestList } from '../quest/questLists.js';
import { registerModSaveData } from '../../saves/modSaveData.js';

export const WARM_ASHES_VENDOR = 'warm-ashes-ships';
export const warmAshesOn = () => modSetting(WARM_ASHES_VENDOR, 'Enabled') === true;

export const WA_QUEST_LIST = 'WA_Ships';
export const WA_RAID_QUEST = 'WAQ_SHIP_SMALLRAID';
// Raids are named by each quest file's Quest: header, so WAQ_SHIP_ATTACK_PIRATE.txt runs as WAQ_SHIP_PIRATEATTACK.
export const WA_RAID_QUESTS = Object.freeze([WA_RAID_QUEST, 'WAQ_SHIP_PIRATEATTACK']);
export const WA_SHIP_BLOCKS = Object.freeze(['SHIPAA00.RMB', 'SHIPAA01.RMB']);
export const WA_VARIANT_RAID = '_smallraid';
export const WA_VARIANT_BASE = '_base';
export const WA_PEACEFUL_PERCENT = 75;
export const WA_BOARD_DELAY_S = 0.05;
// Region 31 is what the classic GPS reports for any ocean pixel.
export const WA_SEA_REGION = 31;

let hasTraveledbyShip = false;
let tempShip = false;
let _boardIn = null;

// Field names match the mod's own save record, so existing saves keep loading.
export const newSaveData = () => ({ TempShip: false, HasTraveledbyShip: false });
export const getSaveData = () => ({ TempShip: tempShip, HasTraveledbyShip: hasTraveledbyShip });
export function restoreSaveData(data) {
  tempShip = data?.TempShip === true;
  hasTraveledbyShip = data?.HasTraveledbyShip === true;
}
export const isTempShip = () => tempShip;
export const hasArmedAmbush = () => hasTraveledbyShip;
export const boardPending = () => _boardIn !== null;

let _host = null;
export function setWarmAshesHost(host) { _host = host ?? null; }
const host = () => _host ?? {};
const variant = (name, v) => (host().setBlockVariant ?? setBlockVariant)(name, v, ANY_LOCATION_KEY);
const rangeInt = (min, maxExclusive, random) => (maxExclusive <= min ? min : min + Math.floor(random() * (maxExclusive - min)));

export function resetShipVariants() {
  for (const block of WA_SHIP_BLOCKS) variant(block, WA_VARIANT_BASE);
}

export function onPreFastTravel({ oceanPixels = 0, travelShip = false } = {}) {
  if (!(oceanPixels > 0)) return 'no-water';
  const h = host();
  if (rangeInt(0, 100, h.random ?? Math.random) < WA_PEACEFUL_PERCENT || tempShip) return 'peace';
  // Unlike the mod, a running raid blocks a new ambush here.
  if (travelShip) return raidRefusal() === 'busy' ? 'busy' : armRaid();
  for (const block of WA_SHIP_BLOCKS) variant(block, WA_VARIANT_BASE);
  return 'base';
}

function armRaid() {
  const h = host();
  const owns = !!h.ownsShip?.();
  hasTraveledbyShip = true;
  if (!owns) {
    tempShip = true;
    h.assignShip?.(SHIP_TYPES.Large);
  }
  for (const block of WA_SHIP_BLOCKS) variant(block, WA_VARIANT_RAID);
  return owns ? 'raid' : 'raid-lent';
}

export function raidAtSea() {
  const refused = raidRefusal();
  if (refused) return refused;
  const armed = armRaid();
  onPostFastTravel();
  return armed;
}

const raidRunning = () => !!host().raidRunning?.();
// Fast travel, an Overworld raider, and the sea fight's boarders all check this, so one raid runs at a time.
export function raidRefusal() {
  if (hasTraveledbyShip || _boardIn !== null || raidRunning()) return 'busy';
  if (tempShip) return 'lent';
  return null;
}
export function raidUnderWay() {
  return raidRefusal() !== null;
}

export function onPostFastTravel() {
  if (hasTraveledbyShip) _boardIn = WA_BOARD_DELAY_S;
}

// dt is the scaled world delta, so a pause holds the boarding delay as the mod's coroutine does.
export function frame(dt) {
  if (_boardIn === null) return false;
  _boardIn -= dt;
  if (_boardIn > 0) return false;
  _boardIn = null;
  transportToShip();
  return true;
}

function transportToShip() {
  const h = host();
  if (hasTraveledbyShip) {
    const quest = h.getQuest?.(WA_RAID_QUEST, 0) ?? null;
    if (quest != null) {
      h.startQuest?.(quest);
      h.setTransportModeShip?.();
    }
    hasTraveledbyShip = false;
    if (tempShip) h.resetShip?.();
  }
  hasTraveledbyShip = false;
}

export class LeaveShip extends ActionTemplate {
  static typeName = 'LeaveShip';
  // The mod's pattern is literal and unanchored.
  get pattern() { return /Leave Ship/; }
  createNew(source, parentQuest) {
    if (!this.test(source)) return null;
    return new LeaveShip(parentQuest);
  }
  update(_caller) {
    const h = host();
    // The gate returns 'naval' for a raid the sea fight started (done, nothing sails), 'wait' while raiders still
    // hold the ship, or 'proceed' for the mod's own behavior.
    const gate = h.leaveShipGate?.(this.parentQuest) ?? 'proceed';
    if (gate === 'wait') return;
    if (gate === 'naval') { this.setComplete(); return; }
    if (h.currentRegionIndex?.() === WA_SEA_REGION) {
      resetShipVariants();
      if (!h.ownsShip?.()) {
        h.assignShip?.(SHIP_TYPES.Large);
        h.setTransportModeShip?.();
        tempShip = false;
        h.resetShip?.();
        this.setComplete();
      } else {
        h.setTransportModeShip?.();
        this.setComplete();
      }
    } else {
      // Away from the sea the mod does nothing; here the raid ends where the player stands.
      resetShipVariants();
      h.raidAshore?.(this.parentQuest);
      this.parentQuest.questBreak = true;
      this.parentQuest.endQuest();
      this.setComplete();
    }
  }
}

let _installed = false;
// Runs once at scene boot, before the quest bridge is built, as a mod loads before the game.
export function installWarmAshesShips() {
  if (_installed) return false;
  _installed = true;
  registerQuestList(WA_QUEST_LIST, warmAshesOn);
  registerModSaveData(WARM_ASHES_VENDOR, { newSaveData, getSaveData, restoreSaveData });
  return true;
}

export function _resetWarmAshesShips() {
  hasTraveledbyShip = false; tempShip = false; _boardIn = null; _host = null; _installed = false;
}
