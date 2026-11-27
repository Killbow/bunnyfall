// The Roleplay & Realism: Items install: its template rows and patches merged at boot,
// and its art on the texture-replacement door.

import { registerCustomTemplates, registerTemplateOverrides } from '../items/itemTemplates.js';
import { addVendorTextures, vendorTextureCount } from '../render/textureReplacement.js';
import { registerCustomArmorValue } from '../items/armorMaterials.js';
import { registerSwingSound, SOUND } from '../audio/soundClips.js';
import { APP_ROOT } from '../platform/appRoot.js';
import { RRI_TEMPLATES, RRI_TEMPLATE_PATCHES, RRI_CLASSES, customItemClass, rriEnabled, rriModule, rriSpriteEntries } from './rriItems.js';
import { registerItemUseHandler } from '../items/itemTemplates.js';
import { setEnemyEquipmentAssigner } from '../combat/enemyEquipment.js';
import { assignRriEnemyEquipment } from '../combat/rriEnemyEquipment.js';
import { setStartingEquipmentAssigner } from '../characters/startingGear.js';
import { setStartingSpellsAssigner } from '../characters/chargen.js';
import { registerWeaponDamageOverride } from '../characters/weapons.js';
import { registerMeleeWeaponAnimTime } from '../characters/weaponStates.js';
import { BANDAGE_TEMPLATE, rriWeaponMinDamage, rriWeaponMaxDamage } from './rriRealism.js';
import { useBandage, assignSkillEquipment, assignSkillSpellbook, rriAnimTimeOverride } from './rriKits.js';

export const rriSpriteUrl = (name, root = APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/') =>
  new URL(`art/roleplay-realism-items/${encodeURIComponent(name)}.png`, root).href;

let _installed = false;
export function installRoleplayRealismItems({ fetchBytes = null, enabledAtBoot = rriEnabled() } = {}) {
  if (_installed && vendorTextureCount() > 0) return 0;
  _installed = true;
  registerCustomTemplates(RRI_TEMPLATES);
  registerTemplateOverrides(enabledAtBoot ? RRI_TEMPLATE_PATCHES : []);
  registerCustomArmorValue((item) => { const cls = customItemClass(item?.templateIndex); return cls?.materialArmorValue ? cls.materialArmorValue(item) : null; });
  for (const cls of Object.values(RRI_CLASSES)) if (cls.swingSound) registerSwingSound(cls.index, SOUND[cls.swingSound]);
  installRoleplayRealismModules();
  const load = fetchBytes ?? (async (name) => { const r = await fetch(rriSpriteUrl(name)); if (!r.ok) throw new Error(`${name}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); });
  return addVendorTextures(rriSpriteEntries().map((e) => ({
    archive: e.archive, record: e.record, frame: e.frame, dye: e.dye, map: e.map, fileName: e.name,
    standIn: true, lazy: true, offset: e.rect ? { x: e.rect.x, y: e.rect.y, paperdoll: true } : null,
    load, gate: rriEnabled,
  })));
}

export function installRoleplayRealismModules() {
  registerItemUseHandler(BANDAGE_TEMPLATE, useBandage);
  setEnemyEquipmentAssigner(assignRriEnemyEquipment);
  setStartingEquipmentAssigner((entity, opts) => (rriModule('skillBasedStartingEquipment') ? assignSkillEquipment(entity, opts) : null));
  setStartingSpellsAssigner((career, spellsByIndex) => (rriModule('skillBasedStartingSpells') ? assignSkillSpellbook(career, spellsByIndex) : null));
  registerWeaponDamageOverride({ min: rriWeaponMinDamage, max: rriWeaponMaxDamage });
  registerMeleeWeaponAnimTime(rriAnimTimeOverride);
}

export function _resetRoleplayRealismItems() { _installed = false; }
