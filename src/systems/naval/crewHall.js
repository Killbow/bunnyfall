// @ts-check
import { hash32 } from '../../world/spawnedDungeons.js';
import { mulberry32 } from '../../combat/bloodArt.js';
import { residentName } from '../livingWorld/census.js';
import { getNameBankOfRegion, GENDERS } from '../../characters/nameHelper.js';
import { PLAYER_CREW, playerCrewCount, CREW_SHOWN } from './crewLife.js';
import { CREW_PER_HAND, MOBILE } from './navalBoarding.js';
import { CREW_ROLES, FIRST_MATE } from './shipCrew.js';
import { REPAIR_PRICE } from './navalDamage.js';
import { t } from '../../ui/textManager.js';

export const RECRUITS_A_DAY = 6;
export const CREW_HALL_SALT = 0xc4e7;
export const HAND_PRICE = REPAIR_PRICE.crew * CREW_PER_HAND;

export const RECRUIT_GRADES = Object.freeze([
  Object.freeze({ key: 'green', label: 'Green', fee: 180, fights: Object.freeze([0, 0]), boardings: Object.freeze([0, 0]), lift: 0, weight: 4 }),
  Object.freeze({ key: 'able', label: 'Able', fee: 260, fights: Object.freeze([1, 4]), boardings: Object.freeze([0, 2]), lift: 2, weight: 4 }),
  Object.freeze({ key: 'seasoned', label: 'Seasoned', fee: 420, fights: Object.freeze([5, 12]), boardings: Object.freeze([2, 5]), lift: 4, weight: 2 }),
  Object.freeze({ key: 'veteran', label: 'Veteran', fee: 700, fights: Object.freeze([13, 30]), boardings: Object.freeze([6, 14]), lift: 6, weight: 1 }),
]);
export const gradeOf = (key) => RECRUIT_GRADES.find((g) => g.key === key) ?? null;
export const RECRUIT_TRADES = Object.freeze({
  [FIRST_MATE]: Object.freeze({ premium: 1.6, least: 2, weight: 1 }),
  Bosun: Object.freeze({ premium: 1.3, least: 1, weight: 1 }),
  Gunner: Object.freeze({ premium: 1.2, least: 0, weight: 3 }),
  Carpenter: Object.freeze({ premium: 1.2, least: 0, weight: 2 }),
  Lookout: Object.freeze({ premium: 1, least: 0, weight: 2 }),
  Cook: Object.freeze({ premium: 1, least: 0, weight: 1 }),
  Deckhand: Object.freeze({ premium: 1, least: 0, weight: 3 }),
  Bard: Object.freeze({ premium: 1.1, least: 0, weight: 0 }),
});
export const CLASS_WORDS = Object.freeze({
  [MOBILE.Warrior]: 'Warrior', [MOBILE.Barbarian]: 'Barbarian', [MOBILE.Bard]: 'Bard', [MOBILE.Archer]: 'Archer',
  [MOBILE.Monk]: 'Monk', [MOBILE.Rogue]: 'Rogue',
});

export const RECRUIT_LINES = Object.freeze({
  green: Object.freeze(['Never been to sea, but I learn quick.', 'I can haul a line as well as any man.', 'My da fished the bay. I want more than nets.', 'Give me a chance, Captain.']),
  able: Object.freeze(['A few voyages behind me, and no complaints.', 'I know my knots and I keep my watch.', 'Served on a coaster out of Wayrest.', 'Steady hands, steady stomach.']),
  seasoned: Object.freeze(['Twelve years before the mast.', 'I\'ve stood off pirates more than once.', 'Name the port, I\'ve weathered it.', 'I know what a ship needs before the captain does.']),
  veteran: Object.freeze(['I sailed with the Sentinel fleet in the war.', 'Boarded more decks than you\'ve walked, Captain.', 'Old salt, but there\'s a fight in me yet.', 'Every storm on the Iliac Bay knows my name.']),
});

/** @param {() => number} r */
function drawGrade(r) {
  const total = RECRUIT_GRADES.reduce((n, g) => n + g.weight, 0);
  let x = r() * total;
  for (const g of RECRUIT_GRADES) { x -= g.weight; if (x < 0) return g; }
  return RECRUIT_GRADES[0];
}
/** @param {() => number} r @param {number} gradeIndex */
function drawTrade(r, gradeIndex) {
  const open = Object.entries(RECRUIT_TRADES).filter(([, t]) => t.weight > 0 && t.least <= gradeIndex);
  const total = open.reduce((n, [, t]) => n + t.weight, 0);
  let x = r() * total;
  for (const [k, t] of open) { x -= t.weight; if (x < 0) return k; }
  return 'Deckhand';
}
/** @param {() => number} r @param {readonly number[]} range */
const between = (r, [lo, hi]) => lo + Math.floor(r() * (hi - lo + 1));

// A hire that raises the crew pays the shipwright's price for every man it adds, so a recruit is never the cheaper
// way to fill a ship.
export const hireCharge = (fee, raise = 0) => Math.max(Math.max(0, fee | 0), Math.max(0, raise | 0) * REPAIR_PRICE.crew);
export const recruitDay = (id) => Number(String(id ?? '').split(':')[1] ?? NaN);

export function recruitFee(grade, trade) {
  const g = typeof grade === 'string' ? gradeOf(grade) : grade;
  const p = RECRUIT_TRADES[trade]?.premium ?? 1;
  return Math.max(HAND_PRICE, Math.round(((g?.fee ?? HAND_PRICE) * p) / 10) * 10);
}

/** @param {{ mapId: number, day: number, regionIndex?: number, serving?: Iterable<string>|null }} o */
export function recruitsOf({ mapId, day, regionIndex = -1, serving = null }) {
  // Seeded by town and day, so every client in the town sees the same roster. `serving` holds hall ids, not
  // names, so a hand who shares a recruit's name hides nobody.
  const r = mulberry32(hash32(mapId >>> 0, Math.max(0, Math.floor(Number(day) || 0)) >>> 0, CREW_HALL_SALT));
  const bank = getNameBankOfRegion(Number.isInteger(regionIndex) ? regionIndex : -1);
  const taken = new Set(serving ?? []);
  const out = [];
  for (let i = 0; i < RECRUITS_A_DAY; i++) {
    const mobile = PLAYER_CREW[Math.floor(r() * PLAYER_CREW.length)];
    const female = r() < 0.35;
    const gi = RECRUIT_GRADES.indexOf(drawGrade(r));
    const grade = RECRUIT_GRADES[gi];
    const trade = mobile === MOBILE.Bard ? 'Bard' : drawTrade(r, gi);
    const name = residentName(Math.floor(r() * 0xffffffff) >>> 0, bank, female ? GENDERS.Female : GENDERS.Male);
    const lines = RECRUIT_LINES[grade.key];
    const rec = {
      id: `${mapId >>> 0}:${Math.floor(Number(day) || 0)}:${i}`, name, gender: female ? GENDERS.Female : GENDERS.Male, sex: female ? 'female' : 'male', mobile,
      className: CLASS_WORDS[mobile] ?? 'Sailor', grade: grade.key, gradeLabel: grade.label, trade,
      fights: between(r, grade.fights), boardings: between(r, grade.boardings), fee: recruitFee(grade, trade), lift: grade.lift,
      line: lines[Math.floor(r() * lines.length)],
    };
    if (!taken.has(rec.id)) out.push(rec);
  }
  return out;
}

/** @param {{ hull: number, crew: number, maxCrew: number, hands: number }} o */
export function enlistPlan({ hull, crew, maxCrew, hands }) {
  if (!((CREW_SHOWN[hull] ?? 0) > 0) || !(maxCrew > 0)) return { ok: false, full: false, why: CREW_HALL_TEXT.noCrew };
  const n = Math.max(0, hands | 0);
  if (n >= playerCrewCount(hull, maxCrew)) return { ok: false, full: true, why: CREW_HALL_TEXT.full };
  const now = Math.max(0, Number(crew) || 0);
  const next = Math.min(maxCrew, Math.max(now, (n + 1) * CREW_PER_HAND));
  if (playerCrewCount(hull, next) !== n + 1) return { ok: false, full: false, why: CREW_HALL_TEXT.noPlace };
  return { ok: true, full: false, crew: next, raise: next - now };
}
// The last of the crew is never paid off: a ship with nobody aboard strikes.
/** @param {{ crew: number }} o */
export const releasePlan = ({ crew }) => (crew > CREW_PER_HAND ? { ok: true, crew: crew - CREW_PER_HAND } : { ok: false, crew: Math.max(0, crew), why: CREW_HALL_TEXT.lastMan });

export const isRecruitTrade = (t) => /** @type {readonly string[]} */ (CREW_ROLES).includes(t) || t === 'Bard';

export const CREW_HALL_TEXT = Object.freeze({
  signed: (who, trade, ship) => `${who} signs on to ${ship} as ${trade}.`,
  swapped: (who, trade, ship, out) => `${who} signs on to ${ship} as ${trade}, replacing ${out}. ${out} is paid off.`,
  short: (fee) => `Hiring costs ${fee.toLocaleString('en-US')} gold. You don't have enough.`,
  gone: 'That sailor has signed on elsewhere.',
  newDay: 'The crewmaster has a new day\'s roster.',
  paidOff: (who, ship) => `${who} is paid off and leaves ${ship}.`,
  steppedUp: (who, ship, next) => `${who} is paid off and leaves ${ship}. ${next} takes the open place on deck.`,
  lastMan: 'That\'s your last crew member. The ship would have nobody aboard.',
  full: 'The crew is full. Sign a recruit on in place of someone already aboard.',
  noPlace: 'There\'s no room on deck for another named crew member.',
  noCrew: 'This ship has no crew to sign anyone on to.',
  sameName: (who) => `The crew already has someone named ${who}.`,
  fighting: 'Not while the ship is in combat.',
  ashore: (who) => `${who} is ashore with you. Send them back aboard first.`,
  noShip: 'You have no crewed ship here. Bring it to this port, or lay it up.',
  noSea: 'Turn on Naval Combat to hire crew at the crew halls.',
});
export const CREW_SIGN_TEXT = Object.freeze({
  get unread() { return t('crewHall.unread', 'The crewmaster cannot check the roster now. Try again.'); },
  get many() { return t('crewHall.many', 'You have signed on as many sailors as one day allows. Come back tomorrow.'); },
  get asking() { return t('crewHall.asking', 'The crewmaster checks the roster.'); },
});
