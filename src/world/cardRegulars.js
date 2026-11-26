// @ts-check
import { BANK_TYPES } from '../characters/nameHelper.js';
import { EQUIP_SLOTS } from '../characters/paperdoll.js';
import { seatTopByte } from '../player/seatPose.js';

const RACE_OF_BANK = Object.freeze({
  [BANK_TYPES.Breton]: 'Breton', [BANK_TYPES.Redguard]: 'Redguard', [BANK_TYPES.Nord]: 'Nord', [BANK_TYPES.DarkElf]: 'DarkElf',
  [BANK_TYPES.HighElf]: 'HighElf', [BANK_TYPES.WoodElf]: 'WoodElf', [BANK_TYPES.Khajiit]: 'Khajiit', [BANK_TYPES.Imperial]: 'Breton',
});
export const REGULAR_CLOTHES = Object.freeze({
  male: Object.freeze({ chest: [165, 167, 158, 173, 180], legs: [151, 152], feet: [147, 149] }),
  female: Object.freeze({ chest: [184, 202, 204], legs: [190, 212], feet: [186, 188], gown: [196, 197] }),
});
export const REGULAR_FACES = 10;

function stream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];

/**
 * @param {number} seed
 * @param {number} bank
 * @param {number} gender
 */
export function regularLook(seed, bank, gender) {
  const r = stream(seed ^ 0x6c6f6f6b);
  const female = gender === 1;
  const kit = female ? REGULAR_CLOTHES.female : REGULAR_CLOTHES.male;
  const group = female ? 'WomensClothing' : 'MensClothing';
  const items = [];
  const put = (templateIndex, equipSlot) => items.push({ templateIndex, group, equipSlot, variant: Math.floor(r() * 2) });
  if (female && r() < 0.35) put(pick(r, REGULAR_CLOTHES.female.gown), EQUIP_SLOTS.ChestClothes);
  else { put(pick(r, kit.chest), EQUIP_SLOTS.ChestClothes); put(pick(r, kit.legs), EQUIP_SLOTS.LegsClothes); }
  put(pick(r, kit.feet), EQUIP_SLOTS.Feet);
  return { race: RACE_OF_BANK[bank] ?? 'Breton', gender: female ? 'female' : 'male', faceIndex: Math.floor(r() * REGULAR_FACES), items };
}

/** @param {{session: any, seats: any[], seatOf: number[], regulars: Map<string, {seed: number, bank: number, gender: number}>, key: string}} p */
export function regularsToStand({ session, seats, seatOf, regulars, key }) {
  const out = [];
  if (!session) return out;
  session.seats.forEach((s, i) => {
    if (s.kind !== 'patron' || s.gone) return;
    const chair = seats[seatOf[i]];
    const who = regulars.get(s.name);
    if (!chair || !who) return;
    out.push({ key: `card:${key}:${i}`, res: { id: `card:${key}:${i}`, name: s.name, look: regularLook(who.seed, who.bank, who.gender) }, feet: chair.feet, yaw: chair.yaw, st: seatTopByte(chair.top) });
  });
  return out;
}

export const BARK_MS = 2600;
export const REGULAR_HEAD_M = 1.35;

/**
 * @param {any} e
 * @param {number} roll
 */
export function regularBark(e, roll = 0) {
  const one = (list) => list[Math.min(list.length - 1, Math.floor(roll * list.length))];
  if (e.t === 'act') {
    if (e.allIn) return one(['All of it.', 'Everything I have.', 'I\'m all in.']);
    if (e.type === 'raise') return e.bet ? one([`${e.to}.`, `Bet ${e.to}.`]) : one([`Raise. ${e.to}.`, `Make it ${e.to}.`]);
    if (e.type === 'call') return one(['I\'ll see that.', 'Call.', 'I\'m in.']);
    if (e.type === 'check') return one(['Check.', 'I\'ll knock.']);
    if (e.type === 'fold') return one(['Not this one.', 'I\'m out.', 'Fold.']);
  }
  if (e.t === 'won') return one(['Mine, I think.', 'Ha! Pay up.', 'Lady luck.']);
  if (e.t === 'leave') return one(['That\'s me cleaned out.', 'Gods. I\'m done for the night.']);
  return null;
}
