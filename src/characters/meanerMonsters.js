import { modSetting } from '../mods/modSettings.js';
import { registerBillboardXml } from '../world/billboardXml.js';
import { meanerMonstersAlone } from '../mods/enemyExpansion/dexSwitches.js';

export const MEANER_MONSTERS_VENDOR = 'meanerMonsters';

const row = (id, name, level, minHp, maxHp, armor, minDmg, maxDmg, minDmg2 = -1, maxDmg2 = -1, minDmg3 = -1, maxDmg3 = -1, moveSnd = -1, barkSnd = -1, attackSnd = -1, corpseTex = -1) =>
  Object.freeze({ id, name, level, minHp, maxHp, armor, minDmg, maxDmg, minDmg2, maxDmg2, minDmg3, maxDmg3, moveSnd, barkSnd, attackSnd, corpseTex });
export const MEANER_MONSTERS_ROWS = Object.freeze([
  row(0, '', 1, 15, 25, 8, 1, 4),
  row(3, '', 2, 5, 15, 4, 1, 4),
  row(4, '', -1, 50, 100, 7, 1, 2, 8, 12, 10, 20),
  row(5, '', -1, 40, 80, 2, 8, 15, 8, 20, 10, 25),
  row(6, '', 2, 20, 50, 6, 4, 10),
  row(9, '', 8, 25, 50, 1, 8, 10, 8, 10, 15, 30),
  row(14, '', 8, 80, 120, 7, 5, 8, 5, 8, 10, 25),
  row(16, '', 10, 150, 200, 5, 10, 30),
  row(17, '', 5, 60, 100, 7, 1, 5),
  row(19, '', 15, 120, 190, -2, 5, 15),
  row(20, '', 4, 15, 70, 2, 10, 15),
  row(30, '', 20, 80, 200, -5, 25, 60),
  row(31, '', 21, 100, 240, -10, 40, 100),
  row(32, '', 20, 60, 200, -8, 80, 110),
  row(33, '', 21, 80, 210, -12, 100, 130),
  row(7, '', 6, 30, 60, 5, 8, 15),
  row(12, '', 9, 40, 100, 2, 10, 30),
  row(21, '', 15, 50, 110, 6, 8, 30),
  row(24, '', 19, 80, 150, -5, 15, 50),
  row(35, '', 16, 25, 130, 6, 15, 30),
  row(35, '', 16, 25, 130, -2, 5, 15),
  row(35, '', 16, 150, 350, 6, 55, 15),
  row(35, '', 21, 25, 130, 6, 5, 15),
  row(40, 'Large Dragonling', 21, 140, 250, -12, 50, 150),
]);
export const MEANER_MONSTERS_PCO_ROWS = Object.freeze([
  row(4, '', -1, 55, 110, 8, 1, 2, 8, 12, 10, 20),
  row(5, '', -1, 40, 80, 5, 8, 15, 8, 20, 10, 25),
  row(6, '', 2, 20, 50, 6, 4, 10),
  row(9, '', 8, 25, 50, 3, 8, 10, 8, 10, 15, 30),
  row(14, '', 8, 80, 120, 7, 5, 8, 5, 8, 10, 25),
  row(16, '', 10, 150, 200, 5, 10, 30),
  row(17, '', 5, 60, 100, 7, 1, 5),
  row(19, '', 15, 120, 190, -2, 5, 15),
  row(20, '', 4, 15, 70, 2, 10, 15),
  row(30, '', 20, 80, 200, -5, 25, 60),
  row(31, '', 21, 100, 240, -10, 40, 100),
  row(32, '', 20, 60, 200, -8, 80, 110),
  row(33, '', 21, 80, 210, -12, 100, 130),
  row(7, '', 6, 30, 60, 5, 8, 15),
  row(12, '', 9, 40, 100, 2, 10, 30),
  row(21, '', 15, 50, 110, 6, 8, 30),
  row(24, '', 19, 80, 150, -5, 15, 50),
  row(35, '', 16, 25, 130, 6, 15, 30),
  row(35, '', 16, 25, 130, -2, 5, 15),
  row(35, '', 16, 150, 350, 6, 55, 15),
  row(35, '', 21, 25, 130, 6, 5, 15),
  row(40, 'Large Dragonling', 21, 140, 250, -12, 50, 150),
]);
export const MEANER_MONSTERS_PCO_FLAG = false;

const FIELDS = Object.freeze([
  ['level', 'level'], ['minHp', 'minHealth'], ['maxHp', 'maxHealth'], ['armor', 'armorValue'],
  ['minDmg', 'minDamage'], ['maxDmg', 'maxDamage'], ['minDmg2', 'minDamage2'], ['maxDmg2', 'maxDamage2'],
  ['minDmg3', 'minDamage3'], ['maxDmg3', 'maxDamage3'], ['moveSnd', 'moveSound'], ['barkSnd', 'barkSound'],
  ['attackSnd', 'attackSound'], ['corpseTex', 'corpseTexture'],
]);
export const unpackCorpseTexture = (packed) => ({ archive: packed >> 16, record: packed & 0xffff });
export function foldMeanerMonsters(rows = MEANER_MONSTERS_ROWS) {
  const edit = {};
  for (const r of rows) {
    const e = (edit[r.id] ??= {});
    for (const [from, to] of FIELDS) if (r[from] !== -1) e[to] = to === 'corpseTexture' ? unpackCorpseTexture(r[from]) : r[from];
  }
  for (const k of Object.keys(edit)) Object.freeze(edit[k]);
  return Object.freeze(edit);
}
export const MEANER_MONSTERS_EDIT = foldMeanerMonsters(MEANER_MONSTERS_PCO_FLAG ? MEANER_MONSTERS_PCO_ROWS : MEANER_MONSTERS_ROWS);

export const meanerMonstersEnabled = (read = (k) => modSetting(MEANER_MONSTERS_VENDOR, k)) => !!read('Enabled');

export function applyMeanerMonsters(mobileType, baseRow, on = meanerMonstersAlone(meanerMonstersEnabled())) {
  if (!on || !baseRow) return baseRow;
  const edit = MEANER_MONSTERS_EDIT[mobileType];
  return edit ? { ...baseRow, ...edit } : baseRow;
}

const records = (n, s) => Object.freeze(Object.fromEntries(Array.from({ length: n }, (_, i) => [i, Object.freeze([s, s])])));
export const MEANER_MONSTERS_BILLBOARD_XML = Object.freeze({
  264: records(15, 1.2),
  269: records(15, 1.2),
  295: records(15, 2.5),
  96: Object.freeze({ 0: Object.freeze([2, 2]) }),
});

export function installMeanerMonsters({ read = null } = {}) {
  registerBillboardXml(MEANER_MONSTERS_VENDOR, MEANER_MONSTERS_BILLBOARD_XML, () => meanerMonstersAlone(meanerMonstersEnabled(read ?? undefined)));
  return true;
}
