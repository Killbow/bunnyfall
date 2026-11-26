// @ts-check
import { ENEMY_BASICS, registerEnemyRows } from '../../characters/enemyBasics.js';
import { registerCustomCareerTemplate, registerCustomEnemyName } from '../../characters/customEnemies.js';
import { loadMonsterCareer } from '../../characters/enemyEntity.js';
import { addVendorTextures } from '../../render/textureReplacement.js';
import { APP_ROOT } from '../../platform/appRoot.js';
import { SIFRIT_ID, SIFRIT_NAME, SIFRIT_MUMMY, SIFRIT_ARCHIVE, SIFRIT_RECORDS } from './sifritLaw.js';

export const sifritArtUrl = (root = APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/') => new URL('art/bunnyfall-sifrit/sifrit.png', root).href;

export function sifritRow(mummy = ENEMY_BASICS[SIFRIT_MUMMY]) {
  const row = { ...structuredClone(mummy) };
  delete /** @type {any} */ (row).id;
  return Object.assign(row, {
    maleTexture: SIFRIT_ARCHIVE, femaleTexture: SIFRIT_ARCHIVE,
    // A staff event's health multiplier reads this row; her real health is SIFRIT_HP, set by promoteStaffBoss.
    minHealth: 8400, maxHealth: 8400,
    level: 30, armorValue: 0,
    minDamage: 20, maxDamage: 45,
    hasIdle: false, primaryAttackAnimFrames: [0, -1, 0],
    weight: 0, canOpenDoors: true, seesThroughInvisibility: true,
    soulPts: 30000, mapChance: 0,
  });
}

// Runs once, before the archives load.
let _installed = false;
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
