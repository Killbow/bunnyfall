// @ts-check
// SIFRIT (2026-11-13; systems/sifrit/sifritLaw.js): HER ROW IN THE TABLES, as the Enemy Expansion's fifty are put there
// (systems/enemyExpansion/dexInstall.js, its pattern, one enemy): the Mummy's row for her body (a monster's, an undead's,
// its corpse and its sounds), her own health, damage and picture; the Mummy's career (its resistances and weaknesses);
// her name; and her one picture on the texture door as a stand-in archive (SIFRIT_ARCHIVE, 25 records of one frame -
// every pose the tables ask of a mobile is the picture the owner gave). Once, before the archives load. Not a DFU member.
import { ENEMY_BASICS, registerEnemyRows } from '../../characters/enemy/enemyBasics.js';
import { registerCustomCareerTemplate, registerCustomEnemyName } from '../../characters/enemy/customEnemies.js';
import { loadMonsterCareer } from '../../characters/enemy/enemyEntity.js';
import { addVendorTextures } from '../textureReplacement.js';
import { APP_ROOT } from '../appRoot.js';
import { SIFRIT_ID, SIFRIT_NAME, SIFRIT_MUMMY, SIFRIT_ARCHIVE, SIFRIT_RECORDS } from './sifritLaw.js';

/** The shipped picture's URL, off the app root as the other shipped art is. */
export const sifritArtUrl = (root = APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/') => new URL('art/bunnyfall-sifrit/sifrit.png', root).href;

/** Her row: the Mummy's, as it stands in the table now (any mod's edits of it are hers too), made hers. */
export function sifritRow(mummy = ENEMY_BASICS[SIFRIT_MUMMY]) {
  const row = { ...structuredClone(mummy) };
  delete row.id;
  return Object.assign(row, {
    maleTexture: SIFRIT_ARCHIVE, femaleTexture: SIFRIT_ARCHIVE,
    minHealth: 8400, maxHealth: 8400,   // a staff event's own health multiplier reads it; her own health is promoteStaffBoss's (SIFRIT_HP)
    level: 30, armorValue: 0,
    minDamage: 20, maxDamage: 45,
    hasIdle: false, primaryAttackAnimFrames: [0, -1, 0],   // one picture: a blow is the picture and its landing
    weight: 0, canOpenDoors: true, seesThroughInvisibility: true,
    soulPts: 30000, mapChance: 0,
  });
}

let _installed = false;
/** Once: her row, her career, her name and her picture. `fetchBytes` is the test seam. Answers whether it installed now. */
export function installSifrit({ fetchBytes = null } = {}) {
  if (_installed) return false;
  _installed = true;
  registerEnemyRows([[SIFRIT_ID, sifritRow()]]);
  registerCustomCareerTemplate(SIFRIT_ID, { name: SIFRIT_NAME, load: (/** @type {any} */ fetch) => loadMonsterCareer(SIFRIT_MUMMY, fetch) });
  registerCustomEnemyName((id) => (id === SIFRIT_ID ? SIFRIT_NAME : null));
  const load = fetchBytes ?? (async () => {
    const r = await fetch(sifritArtUrl());
    if (!r.ok) throw new Error(`[SIFRIT] ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  });
  const entries = [];
  for (let record = 0; record < SIFRIT_RECORDS; record++) entries.push({ archive: SIFRIT_ARCHIVE, record, frame: 0, map: 'Albedo', standIn: true, readOnly: true, fileName: `${SIFRIT_ARCHIVE}_${record}-0`, load });
  addVendorTextures(entries);
  return true;
}
