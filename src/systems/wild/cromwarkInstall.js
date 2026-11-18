// @ts-check
import { ENEMY_BASICS, registerEnemyRows } from '../../characters/enemy/enemyBasics.js';
import { MOBILE_TYPES } from '../../characters/mobile/mobileTypes.js';
import { registerCustomCareerTemplate, registerCustomEnemyName } from '../../characters/enemy/customEnemies.js';
import { loadMonsterCareer } from '../../characters/enemy/enemyEntity.js';
import { addVendorTextures } from '../textureReplacement.js';
import { APP_ROOT } from '../appRoot.js';
import { CROMWARK_ROSTER, cromwarkProfile } from './cromwarkRoster.js';

let installed = false;
export function installCromwarkRoster() {
  if (installed) return;
  installed = true;
  for (const p of CROMWARK_ROSTER) {
    const row = structuredClone(ENEMY_BASICS[7]); // Orc's ordinary, hittable body; no undead immunity.
    delete row.id;
    Object.assign(row, { maleTexture: p.archive, femaleTexture: p.archive, minHealth: p.hp, maxHealth: p.hp,
      level: 8, armorValue: 6, minDamage: 5, maxDamage: 10, hasIdle: false,
      primaryAttackAnimFrames: [0, -1, 0], minMetalToHit: -1, weight: 0, mapChance: 0 });
    if (p.boneCorpse) {
      row.corpseTexture = { ...ENEMY_BASICS[MOBILE_TYPES.SkeletalWarrior].corpseTexture };
      delete row.femaleCorpseTexture;
    }
    registerEnemyRows([[p.id, row]]);
    registerCustomCareerTemplate(p.id, { name: p.name, load: (fetch) => loadMonsterCareer(7, fetch) });
    let bytes;
    const load = () => (bytes ??= fetch(new URL(`art/bunnyfall-cromwark/${p.key}.png`, APP_ROOT)).then(async (r) => {
      if (!r.ok) throw new Error(`Cromwark ${p.key}: ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    }));
    // The supplied art is one frame. Every requested facing uses that actual frame.
    addVendorTextures(Array.from({ length: 25 }, (_, record) => ({ archive: p.archive, record, frame: 0,
      map: 'Albedo', standIn: true, readOnly: true, fileName: `${p.archive}_${record}-0`, load })));
  }
  const loadOrb = async () => {
    const r = await fetch(new URL('art/bunnyfall-cromwark/judge-orb.png', APP_ROOT));
    if (!r.ok) throw new Error(`Cromwark orb: ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  };
  addVendorTextures([{ archive: 9947, record: 0, frame: 0, map: 'Albedo', standIn: true,
    readOnly: true, fileName: '9947_0-0', load: loadOrb }]);
  registerCustomEnemyName((id) => cromwarkProfile(id)?.name ?? null);
}
