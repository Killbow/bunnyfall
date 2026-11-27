// Daggerfall Enemy Expansion's combat hooks: the FormulaHelper overrides its Start registers
// and the forced gender in its OnLootSpawned handler.

import { runMonsterHitArm, CLASSIC_HIT_ARM, MONSTER_HIT_ARMS } from '../../afflictions/diseases.js';
import { ENEMY_GROUPS, SKELETAL_WARRIOR_INDEX } from '../../combat/formulas.js';
import { CAREER_SKILLS } from './dexTables.js';

export const DEX_HIT_SPELLS = Object.freeze(new Map([[10, 500], [11, 23], [12, 501], [13, 502]]));

export function createDexMonsterHit(propsOf) {
  return (attacker, target, damage, deps = {}) => {
    const customEffect = propsOf(attacker.mobileType)?.onHitEffect ?? 0;
    const classicArm = CLASSIC_HIT_ARM[attacker.mobileType] ?? 0;
    for (let arm = 1; arm <= MONSTER_HIT_ARMS; arm++) {
      if (classicArm === arm || customEffect === arm) { runMonsterHitArm(arm, attacker, target, damage, deps); return; }
    }
    const spell = DEX_HIT_SPELLS.get(customEffect);
    if (spell != null) deps.readySpell?.(spell);
  };
}

const valueOf = (table, v) => (typeof v === 'number' ? v : table[v]);

export function createDexCombatDoors(enemies, propsOf) {
  return {
    monsterHit: createDexMonsterHit(propsOf),
    skeletal: (target) => target?.mobileType === SKELETAL_WARRIOR_INDEX || propsOf(target?.mobileType)?.isSkeletal === true,
    group: (careerIndex) => { const e = enemies.get(careerIndex); return e ? valueOf(ENEMY_GROUPS, e.props.group) : null; },
    language: (entity) => { const e = enemies.get(entity?.mobileType); return e ? valueOf(CAREER_SKILLS, e.props.language) : null; },
    gender: (mobileType) => { const g = propsOf(mobileType)?.forcedGender; return g === 'Male' ? 'male' : g === 'Female' ? 'female' : null; },
  };
}
