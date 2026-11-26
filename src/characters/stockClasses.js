// The eighteen stock classes, revised from DFU's CLASSnn.CFG careers.

import { SKILLS, SKILL_COUNT, SKILL_NAMES } from './skills.js';
import { ARMOR_BITS, ARMOR_BITS_SHIFT } from './specialAdvantages.js';
import { t } from '../ui/textManager.js';

const S = SKILLS;
const revision = (name, primary, major, minor, extra = {}) => Object.freeze({
  name, primary: Object.freeze(primary), major: Object.freeze(major), minor: Object.freeze(minor), ...extra,
});

export const STOCK_CLASS_REVISIONS = Object.freeze([
  revision('Mage', [S.Destruction, S.Alteration, S.Mysticism], [S.Illusion, S.Thaumaturgy, S.Restoration],
    [S.Medical, S.ShortBlade, S.BluntWeapon, S.Dodging, S.Etiquette, S.Mercantile]),
  revision('Spellsword', [S.LongBlade, S.Restoration, S.Alteration], [S.Axe, S.BluntWeapon, S.Destruction],
    [S.Illusion, S.Thaumaturgy, S.Mysticism, S.ShortBlade, S.Dodging, S.Archery]),
  revision('Battlemage', [S.Destruction, S.LongBlade, S.Axe], [S.Thaumaturgy, S.Alteration, S.Restoration],
    [S.Illusion, S.Mysticism, S.Dodging, S.Archery, S.ShortBlade, S.BluntWeapon]),
  revision('Sorcerer', [S.Destruction, S.Mysticism, S.Alteration], [S.Thaumaturgy, S.Illusion, S.BluntWeapon],
    [S.Restoration, S.ShortBlade, S.Dodging, S.Medical, S.Mercantile, S.Streetwise]),
  revision('Healer', [S.Restoration, S.Medical, S.Dodging], [S.BluntWeapon, S.Alteration, S.Mysticism],
    [S.Thaumaturgy, S.Destruction, S.Illusion, S.Etiquette, S.Streetwise, S.ShortBlade]),
  revision('Nightblade', [S.Illusion, S.Stealth, S.ShortBlade], [S.Destruction, S.Backstabbing, S.Dodging],
    [S.Alteration, S.Thaumaturgy, S.CriticalStrike, S.Lockpicking, S.Restoration, S.Mysticism]),
  revision('Bard', [S.Etiquette, S.Streetwise, S.ShortBlade], [S.Illusion, S.Mercantile, S.Stealth],
    [S.Pickpocket, S.Lockpicking, S.Alteration, S.Restoration, S.Destruction, S.Archery]),
  revision('Burglar', [S.Lockpicking, S.Stealth, S.ShortBlade], [S.Climbing, S.Backstabbing, S.Dodging],
    [S.CriticalStrike, S.Pickpocket, S.Mercantile, S.Streetwise, S.Archery, S.Running],
    { forbiddenArmor: Object.freeze(['chain', 'plate']) }),
  revision('Rogue', [S.LongBlade, S.Stealth, S.Dodging], [S.Pickpocket, S.Backstabbing, S.Streetwise],
    [S.CriticalStrike, S.ShortBlade, S.Lockpicking, S.Archery, S.BluntWeapon, S.Running]),
  revision('Acrobat', [S.Dodging, S.Jumping, S.ShortBlade], [S.Running, S.Archery, S.Stealth],
    [S.Climbing, S.HandToHand, S.CriticalStrike, S.Backstabbing, S.Pickpocket, S.Swimming]),
  revision('Thief', [S.Pickpocket, S.Stealth, S.ShortBlade], [S.Backstabbing, S.Lockpicking, S.Dodging],
    [S.CriticalStrike, S.Climbing, S.Running, S.Streetwise, S.Mercantile, S.Archery]),
  revision('Assassin', [S.ShortBlade, S.CriticalStrike, S.Stealth], [S.Backstabbing, S.LongBlade, S.Archery],
    [S.Dodging, S.Lockpicking, S.Climbing, S.Pickpocket, S.Streetwise, S.BluntWeapon]),
  revision('Monk', [S.HandToHand, S.CriticalStrike, S.Dodging], [S.Medical, S.BluntWeapon, S.Running],
    [S.Archery, S.ShortBlade, S.Stealth, S.Jumping, S.Climbing, S.Swimming]),
  revision('Archer', [S.Archery, S.Dodging, S.CriticalStrike], [S.ShortBlade, S.LongBlade, S.Stealth],
    [S.Axe, S.BluntWeapon, S.HandToHand, S.Running, S.Climbing, S.Swimming]),
  revision('Ranger', [S.Archery, S.LongBlade, S.Stealth], [S.Axe, S.CriticalStrike, S.Dodging],
    [S.Climbing, S.Swimming, S.Running, S.Medical, S.ShortBlade, S.BluntWeapon]),
  revision('Barbarian', [S.Axe, S.BluntWeapon, S.CriticalStrike], [S.LongBlade, S.Dodging, S.Running],
    [S.Medical, S.Climbing, S.Jumping, S.Swimming, S.Archery, S.HandToHand]),
  revision('Warrior', [S.LongBlade, S.Axe, S.CriticalStrike], [S.BluntWeapon, S.Archery, S.Dodging],
    [S.ShortBlade, S.HandToHand, S.Medical, S.Climbing, S.Running, S.Swimming]),
  revision('Knight', [S.LongBlade, S.BluntWeapon, S.Etiquette], [S.Axe, S.CriticalStrike, S.Medical],
    [S.Archery, S.ShortBlade, S.Dodging, S.Mercantile, S.Running, S.Swimming]),
]);

const ARMOR_MASK = 0x7 << ARMOR_BITS_SHIFT;

/**
 * @param {number} index
 * @param {import('../formats/classFile.js').ClassCareer|null} career
 */
export function reviseStockCareer(index, career) {
  const r = STOCK_CLASS_REVISIONS[index];
  if (!r || !career) return career;
  const out = { ...career, primarySkills: [...r.primary], majorSkills: [...r.major], minorSkills: [...r.minor] };
  if (r.forbiddenArmor) {
    const bits = r.forbiddenArmor.reduce((m, k) => m | ARMOR_BITS[k], 0);
    out.weaponArmorShieldsBitfield = ((career.weaponArmorShieldsBitfield & ~ARMOR_MASK) | (bits << ARMOR_BITS_SHIFT)) >>> 0;
  }
  return out;
}

export const revisionSkills = (r) => [...r.primary, ...r.major, ...r.minor];
export const isWholeRevision = (r) => {
  const all = revisionSkills(r);
  return r.primary.length === 3 && r.major.length === 3 && r.minor.length === 6
    && all.every((id) => Number.isInteger(id) && id >= 0 && id < SKILL_COUNT) && new Set(all).size === all.length;
};

const DESCRIPTION_ANCHOR = ':';
let _descriptionWarned = false;

/**
 * @param {number} index
 * @param {Array<{text: string}>|null} rows
 */
export function reviseClassDescription(index, rows) {
  const r = STOCK_CLASS_REVISIONS[index];
  if (!r || !Array.isArray(rows) || !rows.length) return rows;
  const end = rows.length - 1;
  const at = rows.findIndex((row, i) => i < end && typeof row?.text === 'string' && row.text.includes(DESCRIPTION_ANCHOR));
  if (at < 0) {
    if (!_descriptionWarned) console.warn(`[chargen] class description ${index} has no "${DESCRIPTION_ANCHOR}" list to revise; it reads the file's skills`);
    _descriptionWarned = true;
    return rows;
  }
  const anchor = rows[at];
  const head = anchor.text.slice(0, anchor.text.indexOf(DESCRIPTION_ANCHOR) + DESCRIPTION_ANCHOR.length);
  const names = (ids) => ids.map((id) => SKILL_NAMES[id]);
  const [p1, p2, p3] = names(r.primary);
  const [m1, m2, m3] = names(r.major);
  const primaries = t('chargen.class.skills.primary', '{p1}, {p2}, {p3},', { p1, p2, p3 });
  const widest = Math.max(...rows.map((row) => String(row?.text ?? '').length));
  const lead = `${head} ${primaries}`.length <= widest
    ? [{ ...anchor, text: `${head} ${primaries}` }]
    : [{ ...anchor, text: head }, { ...anchor, text: primaries }];
  return [...rows.slice(0, at), ...lead, { ...anchor, text: t('chargen.class.skills.major', '{m1}, {m2}, and {m3}.', { m1, m2, m3 }) }, ...rows.slice(end)];
}
