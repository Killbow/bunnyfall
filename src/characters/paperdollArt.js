import { armorArchive as armorArchiveByMorphology, BODY_MORPHOLOGY } from '../items/armorMaterials.js';
import { raceByKey } from './races.js';

const CLOAK_TEMPLATES = new Set([154, 155, 191, 192]);

const ARROW_TEMPLATE = 131;

export const isCloak = (template) => CLOAK_TEMPLATES.has(template.index);

export function resolvePaperdollRecord(template, variant = 0) {
  if (template.variants > 0) {
    let start = template.playerTextureRecord;
    if (isCloak(template)) start += 1;
    return start + variant;
  }
  return template.playerTextureRecord;
}

export { MATERIAL_FAMILY, armorVariant } from '../items/armorMaterials.js';

export function morphologyOfRace(race) {
  const r = raceByKey(race);
  if (r) return r.morphologyIndex;
  return BODY_MORPHOLOGY.Human;
}

export function armorArchive(gender, race) {
  return armorArchiveByMorphology(gender, morphologyOfRace(race));
}

export function playerArchiveFor(item, template, { gender = 'male', race = 'Breton' } = {}) {
  const morph = morphologyOfRace(race);
  const base = template?.playerTextureArchive ?? 0;
  if (item.group === 'MensClothing' || item.group === 'WomensClothing') {
    return base === 0 ? 0 : base + morph;
  }
  if (item.group === 'Armor') return armorArchiveByMorphology(gender, morph);
  if (item.group === 'Weapons') {
    if (item.templateIndex === ARROW_TEMPLATE) return base;
    if (template?.custom) return base;
    return gender === 'female' ? base - 1 : base;
  }
  return base;
}
