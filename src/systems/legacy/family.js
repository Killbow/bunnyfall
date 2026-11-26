// @ts-check
import { CLASS_CAREERS } from '../../characters/chargen.js';
import { RACES, FACES_PER_RACE } from '../../characters/races.js';
import { STAT_KEYS_ORDER } from '../../characters/statMods.js';
import { SKILL_COUNT } from '../../characters/skills.js';
import { firstName, surname as bankSurname, getNameBank, GENDERS } from '../../characters/nameHelper.js';
import { getSeed, setSeed } from '../../formats/dfRandom.js';
import { startAgeOf } from './age.js';
import { readStanding, readNews, readHeard } from './influence.js';
import { BLOOD_MAX, HEARTH_MAX, ESTATE_SHARE, ESTATE_MAX } from './legacyLaw.js';
import { readHouse } from '../../net/houseLaw.js';
import { validLook } from '../../net/wire.js';

export const COURT_DEEDS = Object.freeze(['compliment', 'gift', 'embrace', 'kiss']);

// Saves store the family record under this vendor key in `modData`, so renaming it orphans every saved line.
export const LEGACY_VENDOR = 'ProjectLegacy';
export const LEGACY_MOD = 'project-legacy';
export const FAMILY_VERSION = 1;

export const MODELS = Object.freeze({ bloodline: 'bloodline', enduring: 'enduring' });
export const isModel = (m) => m === MODELS.bloodline || m === MODELS.enduring;

export const NO_LINEAGE = 'none';
export const isLegacyChoice = (c) => isModel(c) || c === NO_LINEAGE;

export const DESCENDANTS = Object.freeze({ random: 0, always: 1 });
export const SIBLINGS_MAX_DEFAULT = 2;
export const SIBLINGS_CHANCE_DEFAULT = 50;
export const HEIR_CHANCE = 0.5;
export const RACE_INHERIT_CHANCE = 0.7;
export const SURNAME_KEEP_CHANCE = 0.9;
export const CAREER_INHERIT_CHANCE = 0.5;
export { BLOOD_MAX, HEARTH_MAX, ESTATE_SHARE, ESTATE_MAX };

const RACE_KEYS = Object.freeze(Object.keys(RACES));

export function familyRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, list) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Name banks share the single DFRandom seed, so it is seeded from the family dice and restored to keep every other
// DFRandom draw on its normal sequence.
function withBankSeed(rng, fn) {
  const was = getSeed();
  setSeed(Math.floor(rng() * 0x7fffffff));
  try { return fn(); } finally { setSeed(was); }
}

const seatOfAt = (parts) => { const i = parts.indexOf('of', 1); return i > 0 && i < parts.length - 1 ? i : -1; };
export function surnameOf(fullName) {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const of = seatOfAt(parts);
  if (of > 0) return parts.slice(of).join(' ');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}
export function givenOf(fullName) {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const of = seatOfAt(parts);
  if (of > 0) return parts.slice(0, of).join(' ');
  return parts.length > 1 ? parts.slice(0, -1).join(' ') : (parts[0] ?? '');
}
export const fullNameOf = (given, sur) => (sur ? `${given} ${sur}` : given);

/**
 * @typedef {{ at:number, cause:string, place:any, by?:string|null }} Death
 * @typedef {{ id:number, gen:number, given:string, surname:string, gender:'male'|'female', race:string, raceId:number, face:number, careerIndex:number, className:string, career:any, level:number, stats:Record<string,number>|null, skills:number[]|null, groups:{primary:number[], major:number[], minor:number[]}, blood:Record<string,number>, hearth:Record<string,number>, estate:number, parents:number[], children:number[], spouse:number|null, born:number, died:Death|null, heir:boolean|null, characterId:string|null, leveling:string|null, kind:'member'|'resident'|'player', residentId:string|null, startAge:number, toll:number, bornOwn:number, lived:number, retired:number|null, bequest?:any[], parked?:{mapId:number, buildingKey:number}|null, courting?:Record<string, any>, wedAt?:number|null, childDay?:number|null, minor?:boolean, residentFace?:number|null, mapId?:number, standing?:import('./influence.js').Standing|null, realm?:{ sid:string, player:string, char:string, house:any }|null, look?:any, deedsTaken?:string[] }} Person
 * @typedef {{ v:number, id:string, surname:string, model:string, seat:{region:string, loc:string, mapId?:number, at?:number}|null, rev:number, nextId:number, currentId:number, founded:number, ended:number|null, people:Person[], remains:any[], settings?:any, pending:Pending|null, houses?:any[], home?:{mapId:number, buildingKey:number}|null, news?:import('./influence.js').News[] }} Family
 * @typedef {{ fallenId:number, at:number, estate:number, bequest:any[] }} Pending
 */

export const newPerson = (id) => blankPerson(id);
function blankPerson(id) {
  return /** @type {Person} */ ({
    id, gen: 0, given: '', surname: '', gender: 'male', race: 'Breton', raceId: RACES.Breton, face: 0,
    careerIndex: 0, className: CLASS_CAREERS[0], career: null, level: 1, stats: null, skills: null,
    groups: { primary: [], major: [], minor: [] }, blood: {}, hearth: {}, estate: 0,
    parents: [], children: [], spouse: null, born: 0, died: null, heir: null, characterId: null, leveling: null,
    kind: 'member', residentId: null, startAge: 20, toll: 0, bornOwn: 0, lived: 0, retired: null, bequest: [], parked: null,
    deedsTaken: [],
  });
}

export const mintFamilyId = (now = Date.now(), rng = Math.random) => `fam-${now.toString(36)}-${Math.floor(rng() * 36 ** 6).toString(36).padStart(6, '0')}`;

export function groupsOf(career) {
  const ids = (a) => (Array.isArray(a) ? a.filter((n) => Number.isInteger(n) && n >= 0 && n < SKILL_COUNT) : []);
  return { primary: ids(career?.primarySkills), major: ids(career?.majorSkills), minor: ids(career?.minorSkills) };
}

// `entity.stats` holds permanent values; live modifiers such as Fortify sit in characters/statMods.js and never
// enter the record.
export function permanentStats(entity) {
  const out = {};
  for (const k of STAT_KEYS_ORDER) out[k] = Math.round(Number(entity?.stats?.[k]) || 0);
  return out;
}
export function permanentSkills(entity) {
  const s = entity?.skills;
  return Array.from({ length: SKILL_COUNT }, (_, i) => Math.round(Number(s?.[i]) || 0));
}

function careerFields(entity) {
  const idx = Number.isInteger(entity?.careerIndex) && entity.careerIndex >= 0 && entity.careerIndex < CLASS_CAREERS.length ? entity.careerIndex : 0;
  const career = entity?.career ?? null;
  return {
    careerIndex: idx,
    className: String(career?.name || CLASS_CAREERS[idx]),
    career: career && (career.swapped === true || String(career.name ?? '') !== CLASS_CAREERS[idx]) ? JSON.parse(JSON.stringify(career)) : null,
    groups: groupsOf(career),
  };
}

export const isCustomCareer = (person) => !!person?.career && (person.career.swapped === true || String(person.career.name ?? '') !== CLASS_CAREERS[person.careerIndex]);

export function writePlayer(person, entity) {
  const name = String(entity?.name ?? '').trim();
  const sur = surnameOf(name);
  person.given = givenOf(name) || person.given;
  if (sur) person.surname = sur;
  person.gender = entity?.gender === 'female' ? 'female' : 'male';
  if (RACE_KEYS.includes(entity?.race)) { person.race = entity.race; person.raceId = RACES[entity.race]; }
  person.face = clamp(Math.floor(Number(entity?.faceIndex) || 0), 0, FACES_PER_RACE - 1);
  Object.assign(person, careerFields(entity));
  person.level = Math.max(1, Math.floor(Number(entity?.level) || 1));
  person.stats = permanentStats(entity);
  person.skills = permanentSkills(entity);
  if (entity?.characterId) person.characterId = String(entity.characterId);
  if (entity?.levelingSystem) person.leveling = String(entity.levelingSystem);
  return person;
}

/**
 * @param {any} entity
 * @param {{ model?:string, seat?:{region:string,loc:string,mapId?:number}|null, at?:number, rng?:() => number, settings?:any, id?:string }} [o]
 * @returns {Family}
 */
export function foundFamily(entity, { model = MODELS.enduring, seat = null, at = 0, rng = Math.random, settings = {}, id } = {}) {
  const founder = writePlayer(blankPerson(1), entity);
  founder.born = at;
  founder.startAge = startAgeOf(founder.race);
  founder.heir = heirAnswer(settings, rng);
  founder.surname = founder.surname || '';
  /** @type {Family} */
  const family = {
    v: FAMILY_VERSION, id: id ?? mintFamilyId(Date.now(), rng), surname: founder.surname, model: isModel(model) ? model : MODELS.enduring,
    seat: seat ? { region: String(seat.region), loc: String(seat.loc), ...(Number.isInteger(seat.mapId) ? { mapId: seat.mapId } : {}) } : null,
    rev: 1, nextId: 2, currentId: 1, founded: at, ended: null, people: [founder], remains: [], pending: null, houses: [], home: null,
  };
  nameAtSeat(family);
  return family;
}

export function nameAtSeat(family) {
  if (!family || String(family.surname ?? '').trim() || !family.seat?.loc) return false;
  nameHouse(family, `of ${family.seat.loc}`);
  return true;
}

export function nameHouse(family, sur) {
  family.surname = sur;
  for (const p of family.people ?? []) if ((p.kind ?? 'member') === 'member' && !String(p.surname ?? '').trim()) p.surname = sur;
}

export function heirAnswer(settings, rng = Math.random) {
  return (settings?.descendants ?? DESCENDANTS.random) === DESCENDANTS.always ? true : rng() > HEIR_CHANCE;
}

export const personOf = (family, id) => family?.people?.find((p) => p.id === id) ?? null;
export const currentOf = (family) => personOf(family, family?.currentId);
export const isAlive = (p) => !!p && !p.died;
export const parentsOf = (family, p) => (p?.parents ?? []).map((id) => personOf(family, id)).filter(Boolean);
export const childrenOf = (family, p) => (p?.children ?? []).map((id) => personOf(family, id)).filter(Boolean);
export function siblingsOf(family, p) {
  if (!p) return [];
  if (!p.parents.length) {
    if ((p.kind ?? 'member') !== 'member') return [];
    return family.people.filter((o) => o.id !== p.id && !o.parents.length && o.kind === 'member' && o.gen === p.gen && o.spouse !== p.id);
  }
  return family.people.filter((o) => o.id !== p.id && o.parents.some((id) => p.parents.includes(id)));
}

export function touch(family) { family.rev = (family.rev | 0) + 1; return family; }

export function leanRecord(family) {
  let n = 0;
  for (const p of family?.people ?? []) {
    if (!p.died || !p.standing || family.pending?.fallenId === p.id) continue;
    if (childrenOf(family, p).some((c) => !c.died && c.characterId == null)) continue;
    p.standing = null;
    n++;
  }
  return n > 0;
}

export function inheritCareer(parent, rng = Math.random) {
  if (parent && rng() < CAREER_INHERIT_CHANCE) {
    return { careerIndex: parent.careerIndex, className: parent.className, career: isCustomCareer(parent) ? parent.career : null };
  }
  const i = Math.min(CLASS_CAREERS.length - 1, Math.floor(rng() * CLASS_CAREERS.length));
  return { careerIndex: i, className: CLASS_CAREERS[i], career: null };
}

export function inheritRace(parent, other, rng = Math.random) {
  if (parent && rng() < RACE_INHERIT_CHANCE) return parent.race;
  if (other && RACE_KEYS.includes(other.race)) return other.race;
  return pick(rng, RACE_KEYS);
}

export function bloodOf(...parents) {
  const out = {};
  for (const k of STAT_KEYS_ORDER) {
    const best = Math.max(0, ...parents.map((p) => Number(p?.stats?.[k]) || 0));
    out[k] = clamp(Math.round((best - 50) / 10), 0, BLOOD_MAX);
  }
  return out;
}

export function hearthOf(parent) {
  const out = {};
  if (!parent?.skills) return out;
  for (const id of [...(parent.groups?.primary ?? []), ...(parent.groups?.major ?? [])]) {
    const v = clamp(Math.floor((Number(parent.skills[id]) || 0) / 20), 0, HEARTH_MAX);
    if (v > 0) out[id] = v;
  }
  return out;
}

export const estateOf = (gold) => Math.min(ESTATE_MAX, Math.max(0, Math.floor((Number(gold) || 0) * ESTATE_SHARE)));

export const lineSurnameOf = (family, parent) => String(((parent?.kind ?? 'member') === 'member' ? parent?.surname : '') || family?.surname || '').trim();

export function nameChild(family, raceKey, gender, rng = Math.random, parent = null) {
  const bank = getNameBank(raceKey);
  const g = gender === 'female' ? GENDERS.Female : GENDERS.Male;
  const line = lineSurnameOf(family, parent);
  return withBankSeed(rng, () => {
    const given = firstName(bank, g) || 'Nameless';
    const keep = rng() < SURNAME_KEEP_CHANCE;
    if (keep || !line) return { given, surname: line, changed: false };
    const fresh = bankSurname(bank);
    return fresh && fresh !== line ? { given, surname: fresh, changed: true } : { given, surname: line, changed: false };
  });
}

/** @returns {{ person: Person, changed: boolean, from: string }} */
export function addChild(family, parentId, { rng = Math.random, at = 0, settings = {} } = {}) {
  const parent = personOf(family, parentId);
  const other = parent?.spouse != null ? personOf(family, parent.spouse) : null;
  const p = blankPerson(family.nextId++);
  p.gen = (parent?.gen ?? 0) + 1;
  p.gender = rng() < 0.5 ? 'male' : 'female';
  p.race = inheritRace(parent, other, rng);
  p.raceId = RACES[p.race];
  p.startAge = startAgeOf(p.race);
  p.face = Math.floor(rng() * FACES_PER_RACE);
  Object.assign(p, inheritCareer(parent, rng));
  const { given, surname, changed } = nameChild(family, p.race, p.gender, rng, parent);
  p.given = given;
  p.surname = surname;
  p.blood = bloodOf(parent, other);
  p.hearth = hearthOf(parent);
  p.leveling = parent?.leveling ?? null;
  p.parents = [parent?.id, other?.id].filter((id) => id != null);
  p.born = at;
  p.heir = heirAnswer(settings, rng);
  family.people.push(p);
  for (const par of [parent, other]) if (par && !par.children.includes(p.id)) par.children.push(p.id);
  touch(family);
  return { person: p, changed, from: lineSurnameOf(family, parent) };
}

/**
 * @param {any} family
 * @param {number} personId
 * @param {{ rng?: () => number, at?: number, settings?: any }} [o]
 */
export function rollSiblings(family, personId, { rng = Math.random, at = 0, settings = {} } = {}) {
  const p = personOf(family, personId);
  const max = clamp(Math.floor(settings?.maxSiblings ?? SIBLINGS_MAX_DEFAULT), 0, 10);
  const chance = clamp(Number(settings?.siblingChance ?? SIBLINGS_CHANCE_DEFAULT), 0, 100) / 100;
  if (!p || max < 1 || !(rng() < chance)) return [];
  const n = 1 + Math.floor(rng() * max);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (p.parents.length) out.push(addChild(family, p.parents[0], { rng, at, settings }).person);
    else out.push(addFounderSibling(family, p, { rng, at, settings }));
  }
  return out;
}

function addFounderSibling(family, of, { rng, at, settings }) {
  const s = blankPerson(family.nextId++);
  s.gen = of.gen;
  s.gender = rng() < 0.5 ? 'male' : 'female';
  s.race = rng() < RACE_INHERIT_CHANCE ? of.race : pick(rng, RACE_KEYS);
  s.raceId = RACES[s.race];
  s.startAge = startAgeOf(s.race);
  s.face = Math.floor(rng() * FACES_PER_RACE);
  Object.assign(s, inheritCareer(null, rng));
  s.given = withBankSeed(rng, () => firstName(getNameBank(s.race), s.gender === 'female' ? GENDERS.Female : GENDERS.Male) || 'Nameless');
  s.surname = family.surname;
  s.leveling = of.leveling;
  s.born = at;
  s.heir = heirAnswer(settings, rng);
  family.people.push(s);
  touch(family);
  return s;
}

/**
 * @param {{ blood:Record<string,number>, hearth:Record<string,number> }} person
 * @param {{ stats:Record<string,number>, skills:number[] }} rolled
 */
export function bornValues(person, rolled) {
  const stats = {};
  for (const k of STAT_KEYS_ORDER) stats[k] = clamp((rolled.stats[k] | 0) + (person.blood?.[k] | 0), 1, 100);
  const skills = rolled.skills.slice();
  for (const [id, v] of Object.entries(person.hearth ?? {})) {
    const i = Number(id);
    if (i >= 0 && i < SKILL_COUNT) skills[i] = clamp((skills[i] | 0) + (v | 0), 0, 100);
  }
  return { stats, skills };
}

export function recordDeath(family, id, { at = 0, cause = 'unknown', place = null, by = null } = {}) {
  const p = personOf(family, id);
  if (!p || p.died) return p;
  p.died = { at, cause: String(cause), place: place ?? null, by: by ?? null };
  delete p.look;
  delete p.heard;
  touch(family);
  return p;
}

export function successors(family) {
  return (family?.people ?? [])
    .filter((p) => isAlive(p) && p.id !== family.currentId && p.kind === 'member' && p.retired == null)
    .sort((a, b) => a.gen - b.gen || a.id - b.id);
}

// The Descendants setting is read at death, as in the original mod, so switching it to Always also covers members
// born earlier.
export const newbornAllowed = (family, fallen, settings = null) => !!fallen
  && (fallen.heir === true || (settings?.descendants ?? DESCENDANTS.random) === DESCENDANTS.always);

export const lineContinues = (family, fallen, settings = null) => successors(family).length > 0 || newbornAllowed(family, fallen, settings);

export function endFamily(family, at = 0) {
  if (family.ended == null) { family.ended = at; family.pending = null; touch(family); }
  return family;
}

export function setCurrent(family, id) {
  if (personOf(family, id) && family.currentId !== id) { family.currentId = id; touch(family); }
  return family;
}

export function readFamily(rec) {
  if (!rec || typeof rec !== 'object' || rec.v !== FAMILY_VERSION || !Array.isArray(rec.people) || !rec.people.length) return null;
  if (typeof rec.id !== 'string' || !rec.id) return null;
  const people = [];
  for (const raw of rec.people) {
    if (!raw || !Number.isInteger(raw.id)) continue;
    const p = Object.assign(blankPerson(raw.id), raw);
    p.parents = Array.isArray(raw.parents) ? raw.parents.filter(Number.isInteger) : [];
    p.children = Array.isArray(raw.children) ? raw.children.filter(Number.isInteger) : [];
    const ids = (a) => (Array.isArray(a) ? a.filter((n) => Number.isInteger(n) && n >= 0 && n < SKILL_COUNT) : []);
    p.groups = { primary: ids(raw.groups?.primary), major: ids(raw.groups?.major), minor: ids(raw.groups?.minor) };
    p.stats = raw.stats && typeof raw.stats === 'object' ? raw.stats : null;
    p.skills = Array.isArray(raw.skills) ? raw.skills.map((v) => Number(v) || 0) : null;
    p.blood = raw.blood && typeof raw.blood === 'object' ? raw.blood : {};
    p.hearth = raw.hearth && typeof raw.hearth === 'object' ? raw.hearth : {};
    p.estate = Math.max(0, Math.floor(Number(raw.estate) || 0));
    p.bequest = Array.isArray(raw.bequest) ? raw.bequest.filter((it) => it && typeof it === 'object') : [];
    p.deedsTaken = Array.isArray(raw.deedsTaken) ? [...new Set(raw.deedsTaken.filter((k) => typeof k === 'string' && /^-?\d+:\d+$/.test(k)))] : [];
    p.died = raw.died && typeof raw.died === 'object' ? { at: Number(raw.died.at) || 0, cause: String(raw.died.cause ?? 'unknown'), place: raw.died.place ?? null, by: raw.died.by ?? null } : null;
    p.revived = Array.isArray(raw.revived) ? raw.revived.filter((n) => Number.isFinite(n)) : [];
    p.courting = raw.courting && typeof raw.courting === 'object' && !Array.isArray(raw.courting)
      ? Object.fromEntries(Object.entries(raw.courting).filter(([k, c]) => typeof k === 'string' && c && typeof c === 'object')
        .map(([k, c]) => [k, {
          name: String(c.name ?? ''), mapId: c.mapId | 0, town: String(c.town ?? ''), affection: Math.max(0, Math.min(100, c.affection | 0)), day: Number.isInteger(c.day) ? c.day : -1, betrothed: !!c.betrothed,
          sex: c.sex === 'female' ? 'female' : 'male', race: RACE_KEYS.includes(c.race) ? c.race : '', face: Number.isInteger(c.face) && c.face >= 0 ? c.face : 0,
          ...(c.deeds && typeof c.deeds === 'object' ? { deeds: Object.fromEntries(Object.entries(c.deeds).filter(([k, d]) => COURT_DEEDS.includes(k) && Number.isInteger(d))) } : {}),
        }]))
      : {};
    p.wedAt = Number.isFinite(raw.wedAt) ? raw.wedAt : null;
    p.childDay = Number.isInteger(raw.childDay) ? raw.childDay : null;
    p.minor = !!raw.minor;
    p.adopted = !!raw.adopted;
    p.residentFace = Number.isInteger(raw.residentFace) ? raw.residentFace : null;
    p.savedAt = Number.isSafeInteger(raw.savedAt) && raw.savedAt > 0 ? raw.savedAt : 0;
    if (p.kind === 'resident') p.mapId = Number.isInteger(raw.mapId) ? raw.mapId : 0;
    p.parked = raw.parked && Number.isInteger(raw.parked.mapId) && (raw.parked.buildingKey | 0) > 0 ? { mapId: raw.parked.mapId, buildingKey: raw.parked.buildingKey | 0 } : null;
    p.standing = readStanding(raw.standing);
    const heard = readHeard(raw.heard);
    if (heard) p.heard = heard; else delete p.heard;
    if (p.kind === 'player') p.realm = readUnion(raw.realm);
    else delete p.realm;
    if (raw.look !== undefined && raw.look !== null) { const look = memberLook(raw.look); if (look) p.look = look; else delete p.look; }
    people.push(p);
  }
  if (!people.length) return null;
  // Parent links that close a cycle are dropped, since ancestor walks such as `kinOf` in household.js assume an
  // acyclic tree.
  const byId = new Map(people.map((p) => [p.id, p]));
  const ancestorOf = (p, id, seen = new Set()) => (p.parents ?? []).some((q) => q === id || (!seen.has(q) && (seen.add(q), byId.has(q)) && ancestorOf(byId.get(q), id, seen)));
  for (const p of people) p.parents = p.parents.filter((q) => q !== p.id && !(byId.has(q) && ancestorOf(byId.get(q), p.id)));
  const maxId = Math.max(...people.map((p) => p.id));
  return {
    v: FAMILY_VERSION, id: rec.id, surname: String(rec.surname ?? ''), model: isModel(rec.model) ? rec.model : MODELS.enduring,
    seat: rec.seat && typeof rec.seat === 'object' ? { region: String(rec.seat.region ?? ''), loc: String(rec.seat.loc ?? ''), ...(Number.isInteger(rec.seat.mapId) ? { mapId: rec.seat.mapId } : {}),
      ...(Number(rec.seat.at) > 0 ? { at: Math.floor(Number(rec.seat.at)) } : {}) } : null,
    rev: Math.max(1, rec.rev | 0), nextId: Math.max(maxId + 1, rec.nextId | 0),
    currentId: people.some((p) => p.id === rec.currentId) ? rec.currentId : people[0].id,
    founded: Number(rec.founded) || 0, ended: rec.ended == null ? null : Number(rec.ended), people,
    remains: Array.isArray(rec.remains) ? rec.remains.map(readRemains).filter(Boolean) : [],
    pending: readPending(rec.pending, people),
    houses: Array.isArray(rec.houses) ? rec.houses.filter((h) => h && Number.isInteger(h.mapId) && (h.buildingKey | 0) > 0)
      .map((h) => ({ regionIndex: h.regionIndex | 0, mapId: h.mapId, buildingKey: h.buildingKey | 0, location: String(h.location ?? ''),
        ...(typeof h.layout === 'string' && h.layout ? { layout: h.layout } : {}),
        by: Number.isInteger(h.by) ? h.by : null,
        ...(Number.isInteger(h.from) ? { from: h.from } : {}) })) : [],
    home: rec.home && Number.isInteger(rec.home.mapId) ? { mapId: rec.home.mapId, buildingKey: rec.home.buildingKey | 0 } : null,
    news: readNews(rec.news),
  };
}

/**
 * Strips `eo`, the look a player chose to show others, because the family record stores the member's own look.
 * @param {any} look
 */
export function memberLook(look) {
  const v = validLook(look);
  if (!v) return null;
  delete v.eo;
  return v;
}

function readUnion(u) {
  if (!u || typeof u !== 'object' || typeof u.sid !== 'string' || !/^[A-Za-z0-9]{6,16}$/.test(u.sid)) return null;
  return { sid: u.sid, player: String(u.player ?? '').slice(0, 40), char: String(u.char ?? '').slice(0, 21), house: readHouse(u.house) };
}

export const REMAINS_STATES = Object.freeze(['lying', 'taken', 'rested']);
function readRemains(r) {
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !Number.isInteger(r.of)) return null;
  return {
    ...r,
    name: String(r.name ?? ''), place: r.place && typeof r.place === 'object' ? r.place : null,
    items: Array.isArray(r.items) ? r.items.filter((it) => it && typeof it === 'object') : [],
    first: Array.isArray(r.first) ? r.first.filter((it) => it && typeof it === 'object') : (Array.isArray(r.items) ? r.items.filter((it) => it && typeof it === 'object') : []),
    state: REMAINS_STATES.includes(r.state) ? r.state : 'lying',
    by: Number.isInteger(r.by) ? r.by : null,
    killer: r.killer == null ? null : String(r.killer),
    at: Number(r.at) || 0,
  };
}
function readPending(p, people) {
  if (!p || typeof p !== 'object' || !people.some((x) => x.id === p.fallenId)) return null;
  return {
    fallenId: p.fallenId, at: Number(p.at) || 0, estate: Math.max(0, Math.floor(Number(p.estate) || 0)),
    bequest: Array.isArray(p.bequest) ? p.bequest.filter((it) => it && typeof it === 'object') : [],
  };
}

