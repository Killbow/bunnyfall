// Port of the Daggerfall Unity quest Person; as there, options are scanned over the whole declaration line.
// Without a world the Setup and Assign chain does not run, and npcPending stays true.

import { QuestResource } from './questResource.js';
import { Symbol as QuestSymbol, symbolToSaveData, symbolFromSaveData } from './symbol.js';
import { parseInt as questParseInt } from './parseUtils.js';
import { factionsTable, placesTable } from './tables.js';
import { raceFromFactionRace, factionRaceFromRace, ZERO_NPC_DATA } from '../../characters/staticNpc.js';
import { raceById } from '../../characters/races.js';
import { Place, SITE_TYPES, townBlockGrid } from './place.js';
import { stampLayout, layoutStampOfMapId, recordStands, recordHeldBack } from '../../world/layoutPins.js';
import { questorCandidateBuildings } from '../../talk/talkTopics.js';
import { hasGuildService } from '../../guilds/guildServices.js';
import { FACTION_TYPES } from '../../formats/factionFile.js';
import { getNameBankOfRegion, fullName, GENDERS } from '../../characters/nameHelper.js';
import { srand } from '../../formats/dfRandom.js';
import { ORDERS } from '../../guilds/guildVariants.js';
import { getLocalizedLocationName, getLocalizedRegionName } from '../../ui/textManager.js';
import { getLocalizedFactionName, GrammarManager } from '../../ui/textManager.js';
import { localizedText, TextCollections } from '../../ui/textManager.js';
import { raceDisplayName } from '../../talk/talkSession.js';

const DECL = /(Person|person) (?<symbol>[a-zA-Z0-9'_.-]+)/;
const OPTIONS = /named (?<individualNPCName>[a-zA-Z0-9'_.-]+)|face (?<faceIndex>\d+)|(factionType|factiontype) (?<factionType>[a-zA-Z0-9'_.-]+)|faction (?<factionAlliance>[a-zA-Z0-9'_.-]+)|group (?<careerAlliance>[a-zA-Z0-9'_.-]+)|(?<gender>female|male)|(?<locationScope>local|remote)|(?<atHome>atHome|athome)/g;

const FACE_COUNT = 10;

// A failed lookup leaves every field 0, like the C# default struct, so race 0 reads as Nord.
const ZERO_FACTION = Object.freeze({
  id: 0, parent: 0, type: 0, name: '', rep: 0, summon: 0, region: 0,
  power: 0, flags: 0, ruler: 0,
  ally1: 0, ally2: 0, ally3: 0, enemy1: 0, enemy2: 0, enemy3: 0,
  face: 0, race: 0, flat1: 0, flat2: 0, sgroup: 0, ggroup: 0,
  minf: 0, maxf: 0, vam: 0, rank: 0,
});

export function getFactionDataOrThrow(world, factionID) {
  const record = world?.getFactionData?.(factionID) ?? null;
  if (!record && factionID !== 0) throw new Error(`Could not find faction data for FactionID ${factionID}`);
  return record ?? ZERO_FACTION;
}

const namedByFaction = (fd) => (fd?.type === FACTION_TYPES.Individual || fd?.type === FACTION_TYPES.Daedra) && fd?.id !== 0;

// displayName stays canonical because saves, the questor list, and dialog links key on it.
export const shownPersonName = (person) => (namedByFaction(person?.factionData)
  ? getLocalizedFactionName(person.factionData.id, person.displayName) : person?.displayName);

// Daggerfall Unity redraws a quest NPC name from the region bank, which breaks once questlines rename a Person.
export const personOwnName = (person) => (person?.isPerson === true && !namedByFaction(person.factionData) && person.displayName) || null;

const KNIGHTLY_ORDER_IDS = Object.freeze([...Object.values(ORDERS)].sort((a, b) => a - b));

export class Person extends QuestResource {
  constructor(parentQuest, line = null) {
    super(parentQuest);
    this.individualNPCName = '';
    this.faceIndex = -1;
    this.factionTypeName = '';
    this.factionAllianceName = '';
    this.careerAllianceName = '';
    this.genderName = '';
    this.locationScopeName = '';
    this.atHome = false;
    this.isIndividualNPC = false;
    this.isIndividualAtHome = false;
    this.assignedPlaceSymbol = null;
    this.npcPending = true;
    this.isMuted = false;
    this.isDestroyed = false;
    this.isQuestor = false;
    this.displayName = '';
    this.factionData = null;
    this.factionTableKey = '';
    // Derived from race, because the Races and FactionRaces numbers are not offsets of each other.
    this.race = -1;
    this.factionRace = -1;
    this.nameBank = null;
    this.npcGender = GENDERS.Male;
    this.nameSeed = -1;
    this.homePlaceSymbol = null;
    this.assignedToHome = false;
    // Never null, like the C# struct: an unset questor holds zeros, and several readers use it without a guard.
    this.questorData = { ...ZERO_NPC_DATA };
    if (line !== null) this.setResource(line);
  }

  get isPerson() { return true; }

  get factionId() { return this.factionData?.id ?? 0; }

  setAssignedPlaceSymbol(placeSymbol) { this.assignedPlaceSymbol = placeSymbol?.clone() ?? null; }
  getAssignedPlaceSymbol() { return this.assignedPlaceSymbol; }

  getHomePlace() {
    return this.homePlaceSymbol ? this.parentQuest.getPlace(this.homePlaceSymbol) : null;
  }

  get gender() { return this.npcGender; }

  get homeRegionName() {
    const place = this.getHomePlace();
    return place ? place.siteDetails.regionName : 'BLANK';
  }

  get homeRegionIndex() {
    const place = this.getHomePlace();
    if (!place) return -1;
    const maps = this.parentQuest?.hooks?.world?.maps;
    return maps?.getRegionIndex?.(place.siteDetails.regionName) ?? -1;
  }

  get homeBuildingName() {
    const place = this.getHomePlace();
    return place ? place.siteDetails.buildingName : 'BLANK';
  }

  getDialogPlace() {
    if (this.assignedPlaceSymbol) return this.parentQuest.getPlace(this.assignedPlaceSymbol);
    return this.getHomePlace();
  }

  expandMacro(macroType) {
    const quest = this.parentQuest;
    quest.lastResourceReferenced = this;
    GrammarManager.grammarProcessor.setNPCGenderGetter(() => (quest.lastResourceReferenced?.gender === GENDERS.Female ? 'female' : 'male'));
    const dialogPlace = this.getDialogPlace();
    if (dialogPlace) quest.lastPlaceReferenced = dialogPlace;
    const world = quest.hooks?.world;
    switch (macroType) {
      case 1:
        return shownPersonName(this);
      case 2:
        return dialogPlace ? dialogPlace.siteDetails.buildingName : 'BLANK';
      case 3:
        return dialogPlace ? getLocalizedLocationName(dialogPlace.siteDetails.mapId, dialogPlace.siteDetails.locationName) : 'BLANK';
      case 4: {
        if (!dialogPlace) return 'BLANK';
        const index = dialogPlace.siteDetails.regionIndex;
        const canonical = (i) => world?.maps?.getRegion?.(i)?.name ?? 'BLANK';
        return Number.isInteger(index) ? getLocalizedRegionName(index, canonical) : canonical(index);
      }
      case 5: {
        // As in Daggerfall Unity, the gender branch overrides the individual flat1 rule.
        const flat = (this.npcGender === GENDERS.Male ? this.factionData?.flat1 : this.factionData?.flat2) ?? 0;
        const archive = flat >> 7, record = flat & 0x7f;
        const caption = world?.flatCaption?.(archive, record);
        if (caption != null) return localizedText(String((archive << 7) + record), caption, TextCollections.TextFlats);
        const race = raceById(this.race);
        return race ? raceDisplayName(race.key) : false;
      }
      case 6: {
        if (this.isQuestor) {
          const guild = world?.getFactionData?.(quest.factionId);
          return guild ? getLocalizedFactionName(quest.factionId, guild.name) : false;
        }
        const name = this.factionData?.name;
        return name != null ? getLocalizedFactionName(this.factionData.id, name) : false;
      }
      default:
        return false;
    }
  }

  // A generated home stays dormant until the player enters it, then places the NPC once if nothing else has.
  tick(caller) {
    super.tick(caller);
    if (this.assignedPlaceSymbol === null && this.homePlaceSymbol !== null && !this.assignedToHome) {
      const home = this.parentQuest.getPlace(this.homePlaceSymbol);
      if (!home) return;
      if (home.isPlayerHere()) this.placeAtHome();
    }
  }

  placeAtHome() {
    const homePlace = this.parentQuest.getPlace(this.homePlaceSymbol);
    if (!homePlace || this.isQuestor || this.isIndividualNPC) return false;
    const hooks = this.parentQuest.hooks;
    if (!hooks?.hasSiteLink?.(this.parentQuest, this.homePlaceSymbol)) {
      hooks?.createSiteLink?.(this.parentQuest, this.homePlaceSymbol);
    }
    homePlace.assignQuestResource(this.symbol);
    this.setAssignedPlaceSymbol(homePlace.symbol);
    this.assignedToHome = true;
    return true;
  }

  destroyNPC() { this.isDestroyed = true; }

  setResource(line) {
    super.setResource(line);
    const match = DECL.exec(line);
    if (!match) return;
    this.symbol = new QuestSymbol(match.groups.symbol);

    for (const option of line.matchAll(OPTIONS)) {
      const g = option.groups;
      if (g.individualNPCName != null) this.individualNPCName = g.individualNPCName;
      if (g.faceIndex != null) this.faceIndex = questParseInt(g.faceIndex);
      if (g.factionType != null) this.factionTypeName = g.factionType;
      if (g.factionAlliance != null) this.factionAllianceName = g.factionAlliance;
      if (g.careerAlliance != null) this.careerAllianceName = g.careerAlliance;
      if (g.gender != null) this.genderName = g.gender;
      if (g.locationScope != null) this.locationScopeName = g.locationScope;
      this.atHome = g.atHome != null;
    }

    if (!this.individualNPCName && !this.careerAllianceName && !this.factionTypeName && !this.factionAllianceName) {
      throw new Error(`Person resource could not identify NPC from line ${line}`);
    }

    const world = this.parentQuest?.hooks?.world;
    if (!world) return;

    if (this.individualNPCName) this._setupIndividualNPC(world, this.individualNPCName);
    else if (this.careerAllianceName) this._setupCareerAllianceNPC(world, this.careerAllianceName);
    else if (this.factionTypeName) this._setupFactionTypeNPC(world, this.factionTypeName);
    else this._setupFactionAllianceNPC(world, this.factionAllianceName);

    this._assignRace(world);
    this._assignGender(this.genderName);
    this._assignHUDFace();
    this._assignDisplayName();
    this._assignHomeTown(world, this.locationScopeName);

    this.isIndividualAtHome = this.atHome;
    this.npcPending = false;
  }

  _rolls() { return this.parentQuest?.rolls ?? Math.random; }
  _range(n) { return n > 0 ? Math.floor(this._rolls()() * n) : 0; }

  _getFactionData(world, factionID) {
    return getFactionDataOrThrow(world, factionID);
  }

  _setupIndividualNPC(world, individualNPCName) {
    const factionID = getIndividualFactionID(individualNPCName);
    if (factionID !== -1) {
      const factionData = this._getFactionData(world, factionID);
      if (factionData.type !== FACTION_TYPES.Individual && factionData.type !== FACTION_TYPES.Daedra) {
        throw new Error(`Named NPC ${individualNPCName} with FactionID ${factionID} is not an individual NPC or Daedra`);
      }
      this.isIndividualNPC = true;
      this.factionTableKey = individualNPCName;
      this.factionData = factionData;
    } else {
      console.warn(`[quest] SetupIndividualNPC() failed to setup ${individualNPCName}`);
      this.factionData = ZERO_FACTION;
    }
  }

  _setupFactionAllianceNPC(world, factionAllianceName) {
    const factionID = getIndividualFactionID(factionAllianceName);
    if (factionID !== -1) {
      this.factionTableKey = factionAllianceName;
      this.factionData = this._getFactionData(world, factionID);
    } else {
      console.warn(`[quest] SetupFactionAllianceNPC() failed to setup ${factionAllianceName}`);
      this.factionData = ZERO_FACTION;
    }
  }

  _setupCareerAllianceNPC(world, careerAllianceName) {
    if (/^questor$/i.test(careerAllianceName)) {
      if (this._setupQuestorNPC(world)) return;
    }
    const factionID = this._getCareerFactionID(world, careerAllianceName);
    if (factionID !== -1) {
      this.factionTableKey = careerAllianceName;
      this.factionData = this._getFactionData(world, factionID);
    } else {
      console.warn(`[quest] SetupCareerAllianceNPC() failed to setup ${careerAllianceName}`);
      this.factionData = ZERO_FACTION;
    }
  }

  _setupFactionTypeNPC(world, factionTypeName) {
    const factionID = this._getFactionTypeFactionID(world, factionTypeName);
    if (factionID !== -1) {
      this.factionTableKey = factionTypeName;
      this.factionData = this._getFactionData(world, factionID);
    } else {
      console.warn(`[quest] SetupFactionTypeNPC() failed to setup ${factionTypeName}`);
      this.factionData = ZERO_FACTION;
    }
  }

  _setupQuestorNPC(world) {
    const clicked = this.parentQuest.hooks?.lastNPCClicked?.() ?? null;
    if (!clicked) {
      console.warn(`[quest] Quest Person _${this.symbol.name}_ is expecting a Questor NPC, but one has not been clicked. Proceeding with a virtual NPC so quest will compile.`);
      return false;
    }
    // The building key is valid only in the town layout it was met in, so the record keeps that layout stamp.
    this.questorData = stampLayout({ ...clicked }, clicked.buildingKey > 0 ? layoutStampOfMapId(clicked.mapID) : '');
    this.isQuestor = true;
    this.factionData = this._getFactionData(world, clicked.factionID);
    this.nameSeed = clicked.nameSeed;
    this.npcGender = clicked.gender;
    return true;
  }

  // In another town layout the four questor fields name nobody, so the questor is seated again in the town.
  // There is no roll, so the copies of party members mend alike.
  reseatMovedQuestor(world) {
    const q = this.questorData;
    // The struct field is mapID, while recordStands reads mapId.
    if (!this.isQuestor || !(q?.buildingKey > 0) || recordStands({ mapId: q.mapID, buildingKey: q.buildingKey, layout: q.layout })) return false;
    if (recordHeldBack(q)) return false;
    const hall = this.homePlaceSymbol ? this.parentQuest.getPlace(this.homePlaceSymbol) : null;
    const location = hall?.siteTown(world) ?? null;
    if (!location) return false;
    const buildings = questorCandidateBuildings(location.exterior.buildings, townBlockGrid(world, location).filter((b) => b.dfBlock), {
      locationIndex: location.locationIndex ?? 0, mapId: q.mapID,
      nameOpts: { ...(world.buildingNameOpts?.() ?? {}), locationName: location.name, regionName: location.regionName },
      getFaction: (id) => world.getFactionData?.(id) ?? null,
      raceOfCurrentRegion: () => q.race,
    });
    const sameLook = (n) => n.factionID === q.factionID && n.billboardArchiveIndex === q.billboardArchiveIndex && n.billboardRecordIndex === q.billboardRecordIndex;
    // The person on the record's own building key is the questor, whatever the town layout stamp says.
    const ownself = (n) => n.hash === q.hash && n.nameSeed === q.nameSeed && n.buildingKey === q.buildingKey && n.mapID === q.mapID;
    // A guild questor is found by guild service, and only in a hall of the quest's own guild.
    const guild = hasGuildService(q.factionID);
    const halls = guild ? buildings.filter((b) => this._ofQuestGuild(world, b.factionId)) : buildings;
    const to = buildings.find((b) => b.buildingKey === q.buildingKey && b.npcs.some(ownself))
      ?? buildings.find((b) => b.isNamedBuilding && b.buildingName === hall.siteDetails.buildingName && b.npcs.length)
      ?? halls.find((b) => b.isNamedBuilding && b.npcs.some(sameLook))
      ?? (guild ? halls.find((b) => b.npcs.some(sameLook)) ?? halls.find((b) => b.npcs.some((n) => n.factionID === q.factionID)) : null);
    if (!to) return false;
    const npc = { ...(to.npcs.find(ownself) ?? to.npcs.find(sameLook) ?? to.npcs.find((n) => n.factionID === q.factionID) ?? to.npcs[0]) };
    delete npc.isChild;
    this.questorData = stampLayout(npc, layoutStampOfMapId(q.mapID));
    if (hall.siteDetails.siteType === SITE_TYPES.Building) {
      // The hall is no longer unseated, or its old record would seat it back when the old layout returns.
      const { unseated: _was, ...site } = hall.siteDetails;
      hall.siteDetails = stampLayout({ ...site, buildingKey: to.buildingKey, buildingName: to.buildingName }, layoutStampOfMapId(site.mapId));
    }
    return true;
  }

  _ofQuestGuild(world, factionId) {
    const own = this.parentQuest?.factionId ?? 0;
    if (!(own > 0) || factionId === own) return true;
    const parentOf = (id) => world.getFactionData?.(id)?.parent ?? null;
    return factionId > 0 && (parentOf(factionId) === own || parentOf(own) === factionId);
  }

  _getCareerFactionID(world, careerAllianceName) {
    const MAGES_GUILD = 40, NOBLES = 242, GENERIC_TEMPLE = 450, MERCHANTS = 510;
    const table = factionsTable();
    if (!table.hasValue(careerAllianceName)) {
      console.warn(`[quest] Could not find careerAllianceName ${careerAllianceName}`);
      return -1;
    }
    let careerID = questParseInt(table.getValue('p2', careerAllianceName));
    if (careerID < 0) careerID = questParseInt(table.getValue('p3', careerAllianceName));
    if (careerID === 10000) careerID = 0;
    switch (careerID) {
      case 0: case 1: case 2: case 3: case 5: case 6: case 7: case 8:
      case 9: case 10: case 12: case 13: case 15:
        return MERCHANTS;
      case 11: return MAGES_GUILD;
      case 14: return GENERIC_TEMPLE;
      case 16: return NOBLES;
      case 17: case 18: case 19: case 20:
      default:
        return world.currentRegionPeople?.() ?? -1;
    }
  }

  _getFactionTypeFactionID(world, factionTypeName) {
    const table = factionsTable();
    if (!table.hasValue(factionTypeName)) {
      console.warn(`[quest] Could not find factionTypeName ${factionTypeName}`);
      return -1;
    }
    let factionType = questParseInt(table.getValue('p3', factionTypeName));
    if (factionType === -1) {
      // As in Daggerfall Unity, the raw 0 to 3 roll becomes the type: Daedra, God, Group, or Subgroup.
      factionType = this._range(4);
    }
    switch (factionType) {
      case FACTION_TYPES.Daedra:
      case FACTION_TYPES.Group:
      case FACTION_TYPES.Subgroup:
      case FACTION_TYPES.Official:
      case FACTION_TYPES.Temple:
      case FACTION_TYPES.God:
      case FACTION_TYPES.Individual:
      case FACTION_TYPES.WitchesCoven:
        return this._getRandomFactionOfType(world, factionType);
      case FACTION_TYPES.VampireClan:
        if (this.parentQuest.questName.startsWith('P0') || this.parentQuest.questName.startsWith('$CUREVAM')) {
          return world.playerVampireClan?.() ?? -1;
        }
        return world.currentRegionVampireClan?.() ?? -1;
      case FACTION_TYPES.Province:
        return world.currentRegionFaction?.() ?? -1;
      case FACTION_TYPES.KnightlyGuard:
        return KNIGHTLY_ORDER_IDS[this._range(KNIGHTLY_ORDER_IDS.length)];
      case FACTION_TYPES.MagicUser:
        return 40;
      case FACTION_TYPES.Generic:
        return this._rolls()() < 0.5 ? 450 : 844;
      case FACTION_TYPES.Thieves:
        return 42;
      case FACTION_TYPES.Courts:
        return world.currentRegionCourt?.() ?? -1;
      case FACTION_TYPES.People:
        return world.currentRegionPeople?.() ?? -1;
      default:
        return -1;
    }
  }

  _getRandomFactionOfType(world, factionType) {
    let factions = world.findFactionsOfType?.(factionType) ?? [];
    if (factionType === FACTION_TYPES.Temple) factions = factions.filter((f) => f.id !== 450);
    if (!factions.length) throw new Error('GetRandomFactionOfType() found 0 matches.');
    return factions[this._range(factions.length)].id;
  }

  _assignRace(world) {
    const raw = this.factionData?.race ?? -1;
    this.race = raceFromFactionRace(raw) ?? (world.currentRegionRace?.() ?? -1);
    this.factionRace = factionRaceFromRace(this.race);
    this.nameBank = getNameBankOfRegion(world.currentRegionIndex());
  }

  _assignGender(genderName) {
    if (this.isQuestor) return;
    if (genderName === 'female') this.npcGender = GENDERS.Female;
    else if (genderName === 'male') this.npcGender = GENDERS.Male;
    else this.npcGender = this._rolls()() < 0.5 ? GENDERS.Male : GENDERS.Female;
  }

  _assignHUDFace() {
    // As in Daggerfall Unity, the parsed face index is ignored and the face always rolls.
    this.faceIndex = this._range(FACE_COUNT);
  }

  _assignDisplayName() {
    if (this.factionData?.type === FACTION_TYPES.WitchesCoven || this.factionData?.id === 512) {
      this.npcGender = GENDERS.Female;
    }
    if (namedByFaction(this.factionData)) {
      this.displayName = this.factionData.name;
      return;
    }
    if (this.nameSeed === -1) this.nameSeed = this._range(1000);
    srand(this.nameSeed);
    this.displayName = fullName(this.nameBank, this.npcGender);
  }

  // As in Daggerfall Unity, isIndividualAtHome is set only after this returns, so the individual arm never runs.
  _assignHomeTown(world, scopeString) {
    const HOUSE = 'house';
    const symbolName = `_${this.symbol.name}_home_`;

    if (this.isQuestor || (this.isIndividualNPC && this.isIndividualAtHome)) {
      const homePlace = new Place(this.parentQuest);
      if (world.currentLocation?.()?.loaded) {
        if (!homePlace.configureFromPlayerLocation(world, symbolName)) {
          throw new Error('AssignHomeTown() could not configure questor/individual home from current player location.');
        }
        this.homePlaceSymbol = homePlace.symbol;
        this.parentQuest.addResource(homePlace);
        return;
      }
    }
    if (this.isIndividualNPC) return;

    if (!scopeString) {
      const loc = world.currentLocation?.();
      if (loc?.loaded && (loc.exterior?.buildings?.length ?? 0) > 0) {
        scopeString = this._rolls()() < 0.5 ? 'local' : 'remote';
      } else {
        scopeString = 'remote';
      }
    }

    let buildingTypeString = HOUSE;
    if (this.factionTableKey) {
      const fTable = factionsTable();
      const p1 = questParseInt(fTable.getValue('p1', this.factionTableKey));
      const p2 = questParseInt(fTable.getValue('p2', this.factionTableKey));
      const p3 = questParseInt(fTable.getValue('p3', this.factionTableKey));
      if (p1 === 0 && p2 >= 0 && p2 <= 20 && p3 === 0) {
        buildingTypeString = placesTable().getKeyForValue('p2', String(p2));
      }
    }

    let homePlace;
    try {
      // The first try takes no other town, so the house fallback comes before a nearby town.
      homePlace = new Place(this.parentQuest, `Place ${symbolName} ${scopeString} ${buildingTypeString}`, { nearTowns: false });
    } catch {
      homePlace = new Place(this.parentQuest, `Place ${symbolName} ${scopeString} ${HOUSE}`);
    }
    this.homePlaceSymbol = homePlace.symbol.clone();
    this.parentQuest.addResource(homePlace);
  }

  getSaveData() {
    return {
      race: this.race ?? -1,
      nameBank: this.nameBank,
      npcGender: this.npcGender,
      faceIndex: this.faceIndex,
      nameSeed: this.nameSeed,
      isQuestor: this.isQuestor,
      isIndividualNPC: this.isIndividualNPC,
      isIndividualAtHome: this.isIndividualAtHome,
      displayName: this.displayName,
      homePlaceSymbol: symbolToSaveData(this.homePlaceSymbol),
      lastAssignedPlaceSymbol: symbolToSaveData(this.assignedPlaceSymbol),
      assignedToHome: this.assignedToHome,
      factionID: this.factionData?.id ?? 0,
      factionTableKey: this.factionTableKey,
      questorData: { ...this.questorData },
      discoveredThroughTalkManager: this.discoveredThroughTalkManager ?? false,
      isMuted: this.isMuted,
      isDestroyed: this.isDestroyed,
    };
  }

  restoreSaveData(dataIn) {
    if (dataIn == null) return;
    const world = this.parentQuest.hooks?.world;
    const record = world?.getFactionData?.(dataIn.factionID) ?? null;
    if (!record && dataIn.factionID !== 0) {
      throw new Error('Could not deserialize Person resource FactionID to FactionData');
    }
    this.race = dataIn.race;
    this.factionRace = factionRaceFromRace(this.race);
    this.nameBank = dataIn.nameBank;
    this.npcGender = dataIn.npcGender;
    this.faceIndex = dataIn.faceIndex;
    this.nameSeed = dataIn.nameSeed;
    this.isQuestor = dataIn.isQuestor;
    this.isIndividualNPC = dataIn.isIndividualNPC;
    this.isIndividualAtHome = dataIn.isIndividualAtHome;
    this.displayName = dataIn.displayName;
    this.homePlaceSymbol = symbolFromSaveData(dataIn.homePlaceSymbol);
    this.assignedPlaceSymbol = symbolFromSaveData(dataIn.lastAssignedPlaceSymbol);
    this.assignedToHome = dataIn.assignedToHome;
    this.factionData = record ?? ZERO_FACTION;
    this.factionTableKey = dataIn.factionTableKey;
    this.questorData = { ...ZERO_NPC_DATA, ...(dataIn.questorData ?? {}) };
    this.discoveredThroughTalkManager = dataIn.discoveredThroughTalkManager;
    this.isMuted = dataIn.isMuted;
    this.isDestroyed = dataIn.isDestroyed;
  }
}

export function getIndividualFactionID(individualNPCName) {
  const table = factionsTable();
  if (table.hasValue(individualNPCName)) {
    return questParseInt(table.getValue('p3', individualNPCName));
  }
  console.warn(`[quest] Could not find individualNPCName ${individualNPCName}`);
  return -1;
}
