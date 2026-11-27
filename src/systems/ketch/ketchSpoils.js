// @ts-check
import { seededRng } from '../../weather/wind.js';
import { spoilsBase } from '../../worldEvents/gateSpoils.js';
import { applyRarity, lastPass, socketPass, weaponSocketPass, techniquePass } from '../../items/lootRarity.js';
import { rareOrBetter } from '../../worldEvents/sdSpoilsRoll.js';
import { RANDOM_TREASURE_ICONS } from '../../items/loot.js';
import { t } from '../../ui/textManager.js';

export const KT_SPOILS_GOLD_PER_LEVEL = 450;
export const KT_SPOILS_LEGENDARY = 0.25;
export const KT_SPOILS_SOURCE = Object.freeze({ boss: true, tier: 22, luck: 65 });
export const KT_SPOILS_KEYS = Object.freeze({ store: 'kt.spoils', day: 'kt.spoilsDay' });
export const KT_SPOILS_RECORDS_MAX = 8;
export const KT_SPOILS_TEXT = Object.freeze({
  get spilled() { return t('ketch.spoils.spilled', 'The chest opens. Your share spills onto the floor.'); },
  get granted() { return t('ketch.spoils.granted', 'Your share of the Ketchmaster\'s hold is in your pack.'); },
  get gathered() { return t('ketch.spoils.gathered', 'The rest of your share is in your pack.'); },
});
// The pool stores this sentinel as its gathered text, and the Ketch client's `say` swaps it for the translated
// `KT_SPOILS_TEXT.gathered`.
export const KT_SPOILS_GATHERED = '\u0000ketch.spoils.gathered';
export const ketchSpoilsDay = (d, o) => `kt:${d}.${o}`;
export function ketchSpoilsOf(day) {
  const m = typeof day === 'string' ? /^kt:(\d{1,10})\.([0-9a-f]{16})$/.exec(day) : null;
  return m ? { d: Number(m[1]), o: m[2] } : null;
}

function graded(item, tier, rolls) {
  applyRarity(item, tier, rolls);
  item.isIdentified = true;
  return { item, tier: item.rarity ?? tier };
}

/**
 * @param {number} seed
 * @param {number} level
 */
export function rollKetchSpoils(seed, level) {
  const rolls = seededRng(seed >>> 0);
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const gold = Math.round(KT_SPOILS_GOLD_PER_LEVEL * lv * (0.8 + 0.4 * rolls()));
  const pieces = [];
  pieces.push(graded(spoilsBase(lv, rolls), rolls() < KT_SPOILS_LEGENDARY ? 'legendary' : 'rare', rolls));
  pieces.push(graded(spoilsBase(lv, rolls), rareOrBetter(rolls, KT_SPOILS_SOURCE), rolls));
  lastPass(pieces.map((p) => p.item), rolls);
  // Retain the reserved draws so existing receipts keep their equipment rolls.
  rolls(); rolls(); rolls();
  socketPass(pieces.map((p) => p.item), rolls);
  weaponSocketPass(pieces.map((p) => p.item), rolls);
  techniquePass(pieces.map((p) => p.item), rolls);
  return { gold, pieces };
}

export function ketchSpoilsList(seed, level) {
  const look = seededRng(((seed >>> 0) ^ 0x6b74) >>> 0);
  const flat = () => RANDOM_TREASURE_ICONS[Math.floor(look() * RANDOM_TREASURE_ICONS.length)];
  const s = rollKetchSpoils(seed, level);
  return [
    ...s.pieces.map((p) => ({ kind: 'item', item: p.item, tier: p.tier, record: flat() })),
    { kind: 'gold', gold: s.gold, tier: 'common', record: flat() },
  ];
}
