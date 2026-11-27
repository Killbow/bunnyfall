// @ts-check
import { FRIEND_AT } from '../livingWorld/relations.js';
import { RACE_KEYS } from '../../characters/races.js';
import { personOf, isAlive, touch, newPerson, addChild, fullNameOf } from './family.js';
import { readHouse } from '../../net/houseLaw.js';
import { houseWord } from './houseName.js';
import { t } from '../../ui/textManager.js';

export const AFFECTION_MAX = 100;
export const COURT_BASE = 6;
export const COURT_TASTE = 3;
export const CHILD_DAYS = 30;
export const CHILD_CHANCE = 0.25;
export const CHILDREN_MAX = 6;
export const DAY_MINUTES = 1440;

export const TOPIC = Object.freeze({ court: 'court', propose: 'propose', wedding: 'wedding', family: 'family' });
const COUNT_WORDS = Object.freeze(['none', 'one', 'two', 'three', 'four', 'five', 'six']);
const LABEL = Object.freeze({ court: 'Courtship', propose: 'Marriage', wedding: 'Our wedding', family: 'Our family' });

export const dayOf = (minutes) => Math.floor((Number(minutes) || 0) / DAY_MINUTES);

export function splitName(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  return [words[0] ?? 'Someone', words.slice(1).join(' ')];
}

const courtsOf = (member) => (member.courting ??= {});

export const courtable = (res) => !!res && res.roll === 'h' && !res.guard && !res.legacy;

export const residentInHouse = (family, residentId) => (family?.people ?? []).some((p) => p.kind === 'resident' && p.residentId === residentId);
export const betrothedElsewhere = (family, member, residentId) => (family?.people ?? []).some((p) => p !== member && isAlive(p) && p.courting?.[residentId]?.betrothed);

export function spouseOf(family, member) {
  const s = member?.spouse != null ? personOf(family, member.spouse) : null;
  return s && isAlive(s) ? s : null;
}

/**
 * @param {any} family
 * @param {any} member
 * @param {{ id: string, name: string }} res
 * @param {number} regard
 */
export function topicsFor(family, member, res, regard) {
  if (!family || !member || !isAlive(member) || !res?.id) return [];
  if (!courtable(res) && !residentInHouse(family, res.id)) return [];
  const spouse = spouseOf(family, member);
  if (spouse) return spouse.residentId === res.id ? [TOPIC.family] : [];
  if (residentInHouse(family, res.id) || betrothedElsewhere(family, member, res.id)) return [];
  const c = member.courting?.[res.id];
  if (c?.betrothed) return [TOPIC.wedding];
  if (c && c.affection >= AFFECTION_MAX) return [TOPIC.propose];
  if (c || regard >= FRIEND_AT) return [TOPIC.court];
  return [];
}
export const topicLabel = (t) => LABEL[t] ?? t;

export function topicQuestion(t, tone = 1) {
  const i = Math.max(0, Math.min(2, tone | 0));
  if (t === TOPIC.court) return ['Would you let me court you?', 'I would like to spend some time with you.', 'You and me - what do you say?'][i];
  if (t === TOPIC.propose) return ['Will you do me the honor of marrying me?', 'Will you marry me?', 'Marry me.'][i];
  if (t === TOPIC.wedding) return 'When shall we be wed?';
  return 'How is our family?';
}

export function courtGain({ personality = 50, etiquette = 0, taste = 0, roll = 0.5 } = {}) {
  if (taste < 0) return -COURT_TASTE;
  const base = COURT_BASE + Math.floor(Math.max(0, personality) / 20) + Math.floor(Math.max(0, etiquette) / 20) + (taste > 0 ? COURT_TASTE : 0);
  return Math.max(1, Math.round(base * (0.75 + 0.5 * Math.max(0, Math.min(1, roll)))));
}

/**
 * A day pays only when it is later than the last day courted. Loading an older save rewinds the member clock but
 * not the courtship record.
 * @param {any} member
 * @param {{ id: string, name: string, town: number, sex?: string, race?: string, face?: number }} res
 * @param {{ day: number, townName?: string, personality?: number, etiquette?: number, taste?: number, roll?: number }} o
 */
export function court(member, res, o) {
  const courts = courtsOf(member);
  const c = (courts[res.id] ??= { name: String(res.name), mapId: res.town | 0, town: String(o.townName ?? ''), affection: 0, day: -1, betrothed: false,
    sex: res.sex === 'female' ? 'female' : 'male', race: String(res.race ?? ''), face: res.face | 0 });
  if (c.day >= o.day) return { gained: 0, affection: c.affection, again: true };
  const gain = courtGain(o);
  const gained = Math.max(-c.affection, Math.min(AFFECTION_MAX - c.affection, gain));
  c.affection += gained;
  c.day = o.day;
  return { gained, affection: c.affection, again: false, cooled: gain < 0 };
}

/**
 * The deed `day` is stamped on the courtship, so a load that rewinds the regard day cannot grant the same deed
 * affection twice (`deedDoneOn`).
 * @param {any} member
 * @param {string} residentId
 * @param {number} n
 * @param {{ deed?: string | null, day?: number | null }} [o]
 */
export function warmCourtship(member, residentId, n, { deed = null, day = null } = {}) {
  const c = member?.courting?.[residentId];
  if (!c || c.betrothed) return null;
  const warmed = Math.max(0, Math.min(AFFECTION_MAX - c.affection, Math.trunc(Number(n) || 0)));
  c.affection += warmed;
  if (warmed > 0 && deed && Number.isInteger(day)) c.deeds = { ...c.deeds, [deed]: day };
  return { warmed, affection: c.affection };
}

/**
 * @param {any} courtship
 * @param {string} kind
 * @param {number} day
 */
export const deedDoneOn = (courtship, kind, day) => Number.isInteger(courtship?.deeds?.[kind]) && courtship.deeds[kind] >= day;

export function propose(member, residentId) {
  const c = member?.courting?.[residentId];
  if (!c || c.affection < AFFECTION_MAX || c.betrothed) return false;
  c.betrothed = true;
  return true;
}

export function betrothalOf(member) {
  for (const [id, c] of Object.entries(member?.courting ?? {})) if (c?.betrothed) return [id, c];
  return null;
}

export function forgetCourtship(member, residentId) {
  if (member?.courting?.[residentId]) delete member.courting[residentId];
}

/**
 * A wedding ends every courtship of the resident across the house and refuses a resident already in the house, so
 * one census id never has two spouses.
 * @param {any} family
 * @param {any} member
 * @param {{ id: string, name: string, sex?: string, race?: string, face?: number, mapId?: number, town?: number }} res
 * @param {number} at
 */
export function wed(family, member, res, at, { takeName = false } = {}) {
  if (residentInHouse(family, String(res.id))) return null;
  const s = newPerson(family.nextId++);
  const [given, own] = splitName(res.name);
  const surname = takeName ? family.surname : own;
  s.kind = 'resident';
  s.residentId = String(res.id);
  s.given = given;
  s.surname = surname;
  s.gender = res.sex === 'female' ? 'female' : 'male';
  s.race = RACE_KEYS.includes(/** @type {any} */ (res.race)) ? res.race : 'Breton';
  s.residentFace = res.face ?? null;
  s.gen = member.gen | 0;
  s.spouse = member.id;
  s.wedAt = at;
  member.spouse = s.id;
  member.wedAt = at;
  member.courting = {};
  for (const p of family.people) if (p.courting?.[s.residentId]) delete p.courting[s.residentId];
  s.mapId = res.mapId ?? res.town ?? 0;
  family.people.push(s);
  touch(family);
  return s;
}

/**
 * @param {any} family
 * @param {any} member
 * @param {{ player: string, char: string, name?: string, house?: any, gender?: string, race?: string|null, face?: number }} card
 * @param {string} sid
 * @param {number} at
 */
export function wedPlayer(family, member, card, sid, at) {
  const s = newPerson(family.nextId++);
  const [given, own] = splitName(card.name);
  const house = readHouse(card.house);
  s.kind = 'player';
  s.given = house?.hc ?? given;
  s.surname = house?.hn ?? own;
  s.gender = card.gender === 'female' ? 'female' : 'male';
  s.race = RACE_KEYS.includes(/** @type {any} */ (card.race)) ? /** @type {string} */ (card.race) : 'Breton';
  s.face = Number.isInteger(card.face) && /** @type {number} */ (card.face) >= 0 ? /** @type {number} */ (card.face) : 0;
  s.gen = member.gen | 0;
  s.spouse = member.id;
  s.wedAt = at;
  s.realm = { sid: String(sid), player: String(card.player ?? ''), char: String(card.char ?? ''), house };
  member.spouse = s.id;
  member.wedAt = at;
  member.courting = {};
  family.people.push(s);
  touch(family);
  return s;
}

export const unionSpouse = (family, sid) => (family?.people ?? []).find((p) => p.kind === 'player' && p.realm?.sid === sid) ?? null;

export function playerSpouseLost(family, spouse, at, why) {
  if (!spouse || spouse.kind !== 'player' || spouse.died) return false;
  spouse.died = { at, cause: why === 'gone' ? 'gone' : 'fell', place: null, by: null };
  touch(family);
  return true;
}

export const childrenTogether = (family, member, spouse) => (family?.people ?? []).filter((p) => p.parents.includes(member.id) && p.parents.includes(spouse.id)).length;

/**
 * Child days run on the member's own clock, and the count starts on the first played day after the wedding, not at
 * the wedding minute.
 * @param {any} family
 * @param {any} member
 * @param {{ day: number, rng: () => number, at: number, settings?: any }} o
 */
export function childStep(family, member, { day, rng, at, settings = {} }) {
  const spouse = spouseOf(family, member);
  if (!spouse || !isAlive(member)) return null;
  if (member.childDay == null) { member.childDay = day; touch(family); return null; }
  const from = member.childDay;
  if (day - from < CHILD_DAYS) return null;
  member.childDay = from + CHILD_DAYS * Math.floor((day - from) / CHILD_DAYS);
  touch(family);
  if (childrenTogether(family, member, spouse) >= CHILDREN_MAX || !(rng() < CHILD_CHANCE)) return null;
  const { person } = addChild(family, member.id, { rng, at, settings });
  person.minor = true;
  return person;
}

export const MARRIAGE_TEXT = Object.freeze({
  courted: (name, affection) => (affection >= AFFECTION_MAX
    ? `${name} takes your hand. "If you have a question for me, ask it."`
    : affection >= 67 ? `${name} laughs, and walks with you a while. "Come back tomorrow."`
      : affection >= 34 ? `${name} smiles. "I like your company. Come and find me again."`
        : `${name} looks at you a long moment. "You're kind. We'll see."`),
  again: (name) => `${name} smiles. "You've had my day already. Tomorrow."`,
  cooled: (name) => t('legacy.court.cooled', '{name} stiffens. "That is no way to ask me. Another day."', { name }),
  accepted: (name, town) => `${name} says yes. "Meet me at the temple${town ? ` in ${town}` : ''}, and we'll be wed."`,
  wedding: (town) => `"The temple${town ? ` in ${town}` : ''} is waiting on us - walk in, and we'll be wed."`,
  family: (n) => (n ? `"The ${n === 1 ? 'little one is' : `${COUNT_WORDS[n] ?? 'many'} children are`} well. Come home when you can."` : '"All is well at home. Come back to me safe."'),
  ask: (name) => `Be wed to ${name} here, before the gods?`,
  wed: (name, house) => `You and ${name} are wed. ${name} is of the house${houseWord(house) ? ` of ${houseWord(house)}` : ''} now.`,
  child: (name, spouse) => `A child is born to you and ${spouse}: ${name}.`,
  lost: (name) => `Word reaches you: ${name} is dead.`,
  wedPlayer: (name) => `You and ${name} are wed, before the gods. Each of you keeps your own house.`,
  gone: (name) => `Word reaches you: ${name} has gone from the realm.`,
});

export const childLine = (child, spouse) => MARRIAGE_TEXT.child(fullNameOf(child.given, child.surname), spouse.given);
