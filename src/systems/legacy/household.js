// @ts-check
import { CLASS_CAREERS } from '../../characters/chargen.js';
import { isAlive, personOf, fullNameOf, isCustomCareer } from './family.js';
import { PERSON_TEXTURES, PERSON_FACE_RECORDS } from '../../characters/mobilePerson.js';
import { GENDERS } from '../../characters/nameHelper.js';
import { raceArt } from '../../characters/races.js';
import { classicFaceRecord } from '../../characters/roxArgonians.js';

/**
 * @param {string | number} familyId
 * @param {number} personId
 */
export function familyResId(familyId, personId) {
  return `F${familyId}.${personId}`;
}

/**
 * @param {unknown} id
 */
export function familyResOf(id) {
  const match = /^F(.+)\.(\d+)$/.exec(String(id ?? ''));
  if (!match) return null;
  return {
    familyId: match[1],
    personId: Number(match[2]),
  };
}

/**
 * @param {any} resident
 */
export function isFamilyRes(resident) {
  return Boolean(resident?.legacy) && Number.isInteger(resident.legacy.personId);
}

export const FAMILY_JOB = 'homemaker';
export const FAMILY_ROLL = 'f';
export const FAMILY_SLOT_BASE = 9000;
export const CLASS_MOBILE_BASE = 128;

/**
 * @param {any} house
 */
export function houseKeyOf(house) {
  const mapId = house?.mapId | 0;
  const buildingKey = house?.buildingKey | 0;
  return `${mapId}:${buildingKey}`;
}

/**
 * @param {any} first
 * @param {any} second
 */
export function sameHouse(first, second) {
  return Boolean(first) && Boolean(second) && houseKeyOf(first) === houseKeyOf(second);
}

/**
 * @param {any} family
 * @param {any} house
 */
export function heldByDead(family, house) {
  const holder = personOf(family, house?.by);
  return Boolean(holder?.died);
}

/**
 * @param {any} family
 * @param {number} personId
 * @param {{ regionIndex:number, mapId:number, buildingKey:number, location?:string, layout?:string }[]} held
 * @param {string[]} [taken]
 * @param {{ whole?: boolean }} [opts]
 */
export function syncHouses(family, personId, held, taken = [], { whole = false } = {}) {
  const ownedNow = (held ?? [])
    .filter((house) => (house?.buildingKey | 0) > 0 && (house?.mapId | 0) !== 0)
    .map((house) => {
      /** @type {any} */
      const entry = {
        regionIndex: house.regionIndex | 0,
        mapId: house.mapId | 0,
        buildingKey: house.buildingKey | 0,
        location: String(house.location ?? ''),
      };
      if (typeof house.layout === 'string' && house.layout) {
        entry.layout = house.layout;
      }
      entry.by = personId;
      return entry;
    });

  const playerHolds = (house) => ownedNow.some((owned) => sameHouse(owned, house));
  const playerTookFromDead = (house) => taken.includes(houseKeyOf(house)) && heldByDead(family, house);

  const previousHouses = family.houses ?? [];
  const updatedHouses = [];

  for (const house of previousHouses) {
    if (house.by === personId) {
      if (playerHolds(house)) {
        updatedHouses.push(house);
      } else if (Number.isInteger(house.from) && !taken.includes(houseKeyOf(house))) {
        const { from, ...rest } = house;
        updatedHouses.push({ ...rest, by: from });
      }
    } else if (!playerTookFromDead(house)) {
      if (!whole || playerHolds(house)) {
        updatedHouses.push(house);
      }
    } else if (playerHolds(house)) {
      updatedHouses.push({ ...house, by: personId, from: house.by });
    }
  }

  for (const owned of ownedNow) {
    if (!updatedHouses.some((existing) => sameHouse(existing, owned))) {
      updatedHouses.push(owned);
    }
  }

  if (JSON.stringify(updatedHouses) === JSON.stringify(previousHouses)) {
    return false;
  }
  family.houses = updatedHouses;
  return true;
}

/**
 * @param {any} family
 * @param {any} person
 */
export function deedsDue(family, person) {
  if (!family || !person || !isAlive(person)) return [];
  const alreadyTaken = person.deedsTaken ?? [];
  return (family.houses ?? [])
    .filter((house) => heldByDead(family, house) && !alreadyTaken.includes(houseKeyOf(house)))
    .map((house) => ({ ...house }));
}

/**
 * @param {any} family
 */
export function familyHome(family) {
  const houses = family?.houses ?? [];
  if (!houses.length) return null;
  const markedHome = houses.find((house) => sameHouse(house, family.home));
  if (markedHome) return markedHome;
  if (family.seat?.loc) {
    const seatHome = houses.find((house) => house.location === family.seat.loc);
    if (seatHome) return seatHome;
  }
  return houses[0];
}

/**
 * @param {any} family
 * @param {any} house
 */
export function setFamilyHome(family, house) {
  const found = (family?.houses ?? []).find((candidate) => sameHouse(candidate, house));
  if (!found) return false;
  family.home = {
    mapId: found.mapId,
    buildingKey: found.buildingKey,
  };
  return true;
}

/**
 * @param {any} family
 * @param {any} person
 */
export function homeOf(family, person) {
  if (!family || !person || !isAlive(person) || person.kind !== 'member' || person.id === family.currentId) {
    return null;
  }
  const houses = family.houses ?? [];
  if (person.characterId && person.retired == null) {
    const parkedHouse = person.parked ? houses.find((house) => sameHouse(house, person.parked)) : null;
    if (!parkedHouse) return null;
    return {
      mapId: parkedHouse.mapId,
      buildingKey: parkedHouse.buildingKey,
      lent: false,
    };
  }
  const primaryHome = familyHome(family);
  if (primaryHome) {
    return {
      mapId: primaryHome.mapId,
      buildingKey: primaryHome.buildingKey,
      lent: false,
    };
  }
  const seatMapId = family.seat?.mapId ? family.seat.mapId | 0 : 0;
  if (!seatMapId) return null;
  return {
    mapId: seatMapId,
    buildingKey: 0,
    lent: true,
  };
}

/**
 * @param {any} family
 */
export function householdOf(family) {
  return (family?.people ?? [])
    .map((person) => ({ person, home: homeOf(family, person) }))
    .filter((entry) => Boolean(entry.home));
}

/**
 * @param {string} race
 */
function outfitRaceOf(race) {
  if (race === 'Nord' || race === 'Redguard' || race === 'Breton') return race;
  if (race === 'Khajiit' || race === 'Argonian') return 'Redguard';
  return 'Breton';
}

/**
 * @param {string} label
 */
function stablePickHash(label) {
  let hashValue = 2166136261;
  for (let index = 0; index < label.length; index += 1) {
    const codeUnit = label.charCodeAt(index);
    hashValue = Math.imul(hashValue ^ codeUnit, 16777619);
  }
  return hashValue >>> 0;
}

/**
 * @param {any} family
 * @param {any} person
 * @param {{ mapId:number, buildingKey:number }} home
 */
export function residentOf(family, person, home) {
  const sex = person.gender === 'female' ? 'female' : 'male';
  const outfitRace = outfitRaceOf(person.race);
  const pick = stablePickHash(`${family.id}:${person.id}`);
  const textureSet = PERSON_TEXTURES[outfitRace][sex];
  const variant = pick % textureSet.length;
  const faceSet = PERSON_FACE_RECORDS[outfitRace][sex];
  const validCareerIndex =
    Number.isInteger(person.careerIndex) &&
    person.careerIndex >= 0 &&
    person.careerIndex < CLASS_CAREERS.length;
  const swappedStockCareer =
    person.career?.swapped === true &&
    String(person.career.name ?? '') === CLASS_CAREERS[person.careerIndex];
  const isStockCareer = validCareerIndex && (!isCustomCareer(person) || swappedStockCareer);

  return {
    id: familyResId(family.id, person.id),
    town: home.mapId >>> 0,
    slot: FAMILY_SLOT_BASE + person.id,
    roll: FAMILY_ROLL,
    name: fullNameOf(person.given, person.surname),
    gender: sex === 'female' ? GENDERS.Female : GENDERS.Male,
    sex,
    race: person.race,
    variant,
    archive: textureSet[variant],
    face: faceSet[variant] + Math.floor(pick / 256) % 24,
    guard: false,
    job: FAMILY_JOB,
    home: home.buildingKey | 0,
    work: null,
    temper: 1,
    social: 0.6,
    pious: 0.4,
    drink: 0.2,
    cls: isStockCareer ? CLASS_MOBILE_BASE + person.careerIndex : null,
    level: Math.max(1, person.level | 0),
    faction: 0,
    legacy: { familyId: family.id, personId: person.id },
    household: `F${family.id}`,
    portrait: {
      archive: raceArt(person.race, sex).heads,
      record: classicFaceRecord(person.face),
    },
    look: person.look ?? null,
  };
}

/**
 * @param {any} family
 * @param {any} startPerson
 * @param {number} maxDepth
 */
function ancestorsOf(family, startPerson, maxDepth) {
  const distances = new Map();
  let frontier = [startPerson];
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const nextFrontier = [];
    for (const current of frontier) {
      for (const parentId of current?.parents ?? []) {
        const parent = personOf(family, parentId);
        if (parent && !distances.has(parent.id)) {
          distances.set(parent.id, depth);
          nextFrontier.push(parent);
        }
      }
    }
    frontier = nextFrontier;
  }
  return distances;
}

/**
 * @param {any} family
 * @param {any} viewer
 * @param {any} other
 * @param {number} [depth]
 * @returns {string}
 */
export function kinOf(family, viewer, other, depth = 0) {
  if (!viewer || !other || viewer.id === other.id || depth > 1) {
    return 'kin';
  }
  const isFemale = other.gender === 'female';
  if (viewer.spouse === other.id) {
    return isFemale ? 'wife' : 'husband';
  }
  const viewerAncestors = ancestorsOf(family, viewer, 3);
  const otherAncestors = ancestorsOf(family, other, 3);
  if (viewerAncestors.get(other.id) === 1) return isFemale ? 'mother' : 'father';
  if (viewerAncestors.get(other.id) === 2) return isFemale ? 'grandmother' : 'grandfather';
  if (otherAncestors.get(viewer.id) === 1) return isFemale ? 'daughter' : 'son';
  if (otherAncestors.get(viewer.id) === 2) return isFemale ? 'granddaughter' : 'grandson';
  if ((viewer.kind ?? 'member') !== 'member' || (other.kind ?? 'member') !== 'member') {
    return 'kin';
  }

  const sharesParent = viewer.parents.some((parentId) => other.parents.includes(parentId));
  const bothRootSiblings =
    !viewer.parents.length && !other.parents.length && viewer.gen === other.gen;
  if (sharesParent || bothRootSiblings) {
    return isFemale ? 'sister' : 'brother';
  }

  for (const [ancestorId, dist] of viewerAncestors) {
    if (dist === 1) {
      const rel = kinOf(family, personOf(family, ancestorId), other, depth + 1);
      if (rel === 'brother' || rel === 'sister') {
        return isFemale ? 'aunt' : 'uncle';
      }
    }
  }
  for (const [ancestorId, dist] of otherAncestors) {
    if (dist === 1) {
      const rel = kinOf(family, personOf(family, ancestorId), viewer, depth + 1);
      if (rel === 'brother' || rel === 'sister') {
        return isFemale ? 'niece' : 'nephew';
      }
    }
  }
  if (other.gen === viewer.gen) return 'cousin';
  return 'kin';
}

/**
 * @param {any} family
 * @param {any} viewer
 * @param {any} other
 */
export function kinLine(family, viewer, other) {
  const relation = kinOf(family, viewer, other);
  return relation === 'kin' ? 'One of your house.' : `Your ${relation}.`;
}

/** @type {Record<string, string>} */
const KIN_ADDRESS = {
  father: 'Father',
  mother: 'Mother',
  son: 'my son',
  daughter: 'my daughter',
  brother: 'brother',
  sister: 'sister',
  grandfather: 'Grandfather',
  grandmother: 'Grandmother',
  grandson: 'child',
  granddaughter: 'child',
  uncle: 'Uncle',
  aunt: 'Aunt',
  nephew: 'nephew',
  niece: 'niece',
  husband: 'my love',
  wife: 'my love',
  cousin: 'cousin',
  kin: 'kin',
};

/**
 * @param {any} family
 * @param {any} viewer
 * @param {any} other
 * @param {{ elder?: boolean }} [opts]
 */
export function kinGreeting(family, viewer, other, { elder = false } = {}) {
  const word = kinOf(family, other, viewer);
  const address = KIN_ADDRESS[word] ?? 'kin';
  const fallen = (family.people ?? []).filter((person) => person.died).length;
  const secondLine = elder
    ? '"These old bones are glad of the company."'
    : fallen
      ? '"We remember the ones we lost. The house goes on because of you."'
      : '"The house is well. Tell me of the road."';
  const greetingLead = address[0].toUpperCase() + address.slice(1);
  return {
    word,
    is: kinLine(family, viewer, other),
    lines: [`"${greetingLead}! You're home."`, secondLine],
  };
}
