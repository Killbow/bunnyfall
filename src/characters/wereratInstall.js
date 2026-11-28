// @ts-check
import { ENEMY_BASICS, registerEnemyRows } from './enemyBasics.js';
import { MOBILE_TYPES } from './mobileTypes.js';
import { registerCustomCareerTemplate } from './customEnemies.js';
import { loadMonsterCareer } from './enemyEntity.js';
import { registerForcedGender } from './mobileUnit.js';
import { registerEnemySpellbook } from './enemySpells.js';
import { addVendorTextures } from '../render/textureReplacement.js';
import { registerBillboardXml } from '../world/billboardXml.js';
import { APP_ROOT } from '../platform/appRoot.js';
import { WERERAT, WERERAT_LEVEL, WERERAT_MAX_HEALTH } from './wererat.js';

const ARCHIVE = 9948;
const DEFEAT_RECORD = 20;
const FIREBALL = Object.freeze([14]);

let installed = false;
export function installWererat() {
  if (installed) return;
  installed = true;

  registerEnemyRows([[WERERAT, {
    ...ENEMY_BASICS[MOBILE_TYPES.Rat],
    maleTexture: ARCHIVE,
    femaleTexture: ARCHIVE,
    corpseTexture: { archive: ARCHIVE, record: DEFEAT_RECORD },
    minHealth: 48,
    maxHealth: WERERAT_MAX_HEALTH,
    level: WERERAT_LEVEL,
    armorValue: 4,
    minDamage: 3,
    maxDamage: 7,
    lootTableKey: 'A',
    primaryAttackAnimFrames: [0, 0, -1, 1, 1],
    spellAnimFrames: [0, 0, 1, 1],
  }]]);
  registerCustomCareerTemplate(WERERAT, { name: 'Wererat', load: (fetchBytes) => loadMonsterCareer(MOBILE_TYPES.Rat, fetchBytes) });
  registerForcedGender((type) => type === WERERAT ? 'female' : null);
  registerEnemySpellbook((entity) => entity.mobileType === WERERAT ? FIREBALL : null);

  const entries = [];
  const scales = {};
  const images = new Map();
  const addFrame = (record, frame, name) => {
    const load = async () => {
      if (!images.has(name)) {
        const url = new URL(`art/bunnyfall-wererat/${name}.png`, APP_ROOT);
        images.set(name, fetch(url).then(async (response) => {
          if (!response.ok) throw new Error(`Wererat sprite ${name}: ${response.status}`);
          return new Uint8Array(await response.arrayBuffer());
        }).catch((error) => { images.delete(name); throw error; }));
      }
      return images.get(name);
    };
    entries.push({ archive: ARCHIVE, record, frame, map: 'Albedo', standIn: true, readOnly: true,
      fileName: `${ARCHIVE}_${record}-${frame}`, load });
    scales[record] = [0.53, 0.53];
  };
  for (let facing = 0; facing < 5; facing++) {
    const side = facing < 3 ? 'front' : 'back';
    for (let frame = 0; frame < 3; frame++) addFrame(facing, frame, `walk-${side}-${frame}`);
    for (let frame = 0; frame < 2; frame++) addFrame(5 + facing, frame, `attack-${side}-${frame}`);
    addFrame(10 + facing, 0, `idle-${side}`);
    addFrame(15 + facing, 0, `idle-${side}`);
  }
  addFrame(DEFEAT_RECORD, 0, 'defeat');
  addVendorTextures(entries);
  registerBillboardXml('bunnyfall-wererat', { [ARCHIVE]: scales });
}
