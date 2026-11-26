
import { WEAPONS, WEAPON_MATERIALS } from '../characters/weapons.js';
import { OWN_MW_ARMOR, ownArmorModelFor, ownArmorParts } from '../characters/ownArmorModels.js';
import { CLOAK_NAMES, CLOAK_PAINTINGS, cloakModel, ownCloakFor, ownOutfitFor } from '../characters/ownClothingModels.js';
import { t } from '../ui/textManager.js';
import { ARMOR_MATERIAL } from '../items/armorMaterials.js';
import { ARMOR_ENUM } from '../combat/enemyEquipment.js';
import templates from '../characters/itemTemplates.json' with { type: 'json' };

const HELM_TEMPLATE = ARMOR_ENUM.Helm;

export const MW_CLOTHING_TYPE = Object.freeze({
  Pants: 0, Shoes: 1, Shirt: 2, Belt: 3, Robe: 4,
  RGlove: 5, LGlove: 6, Skirt: 7, Ring: 8, Amulet: 9,
});

export const CLOTHING_NAME = Object.freeze(Object.fromEntries(
  templates.filter((t) => t.index >= 141 && t.index <= 216).map((t) => [t.index, t.name])));

export const DF_CLOTHING_ROWS = Object.freeze({
  'Straps': { type: MW_CLOTHING_TYPE.Shirt }, 'Challenger Straps': { type: MW_CLOTHING_TYPE.Shirt },
  'Champion Straps': { type: MW_CLOTHING_TYPE.Shirt }, 'Armbands': { type: MW_CLOTHING_TYPE.Shirt },
  'Fancy Armbands': { type: MW_CLOTHING_TYPE.Shirt }, 'Eodoric': { type: MW_CLOTHING_TYPE.Shirt },
  'Formal Eodoric': { type: MW_CLOTHING_TYPE.Shirt }, 'Short Tunic': { type: MW_CLOTHING_TYPE.Shirt },
  'Formal Tunic': { type: MW_CLOTHING_TYPE.Shirt }, 'Reversible Tunic': { type: MW_CLOTHING_TYPE.Shirt },
  'Open Tunic': { type: MW_CLOTHING_TYPE.Shirt }, 'Short Shirt': { type: MW_CLOTHING_TYPE.Shirt },
  'Long Shirt': { type: MW_CLOTHING_TYPE.Shirt }, 'Vest': { type: MW_CLOTHING_TYPE.Shirt },
  'Brassiere': { type: MW_CLOTHING_TYPE.Shirt }, 'Formal Brassiere': { type: MW_CLOTHING_TYPE.Shirt },
  'Peasant Blouse': { type: MW_CLOTHING_TYPE.Shirt }, 'Khajiit Suit': { type: MW_CLOTHING_TYPE.Shirt },
  'Casual Pants': { type: MW_CLOTHING_TYPE.Pants }, 'Breeches': { type: MW_CLOTHING_TYPE.Pants },
  'Loincloth': { type: MW_CLOTHING_TYPE.Pants }, 'Tights': { type: MW_CLOTHING_TYPE.Pants },
  'Shoes': { type: MW_CLOTHING_TYPE.Shoes }, 'Sandals': { type: MW_CLOTHING_TYPE.Shoes },
  'Boots': { type: MW_CLOTHING_TYPE.Shoes }, 'Tall Boots': { type: MW_CLOTHING_TYPE.Shoes },
  'Short Skirt': { type: MW_CLOTHING_TYPE.Skirt, reserve: 'skirt' },
  'Long Skirt': { type: MW_CLOTHING_TYPE.Skirt, reserve: 'skirt' },
  'Wrap': { type: MW_CLOTHING_TYPE.Skirt, reserve: 'skirt' },
  'Sash': { type: MW_CLOTHING_TYPE.Belt },
  'Kimono': { type: MW_CLOTHING_TYPE.Robe, reserve: 'robe' },
  'Toga': { type: MW_CLOTHING_TYPE.Robe, reserve: 'robe' },
  'Plain Robes': { type: MW_CLOTHING_TYPE.Robe, reserve: 'robe' },
  'Priest Robes': { type: MW_CLOTHING_TYPE.Robe, reserve: 'robe' },
  'Priestess Robes': { type: MW_CLOTHING_TYPE.Robe, reserve: 'robe' },
  'Casual Cloak': { type: MW_CLOTHING_TYPE.Robe, reserve: 'robe' },
  'Formal Cloak': { type: MW_CLOTHING_TYPE.Robe, reserve: 'robe' },
  'Dwynnen Surcoat': { type: MW_CLOTHING_TYPE.Robe, reserve: 'robe' },
  'Anticlere Surcoat': { type: MW_CLOTHING_TYPE.Robe, reserve: 'robe' },
  'Casual Dress': { type: MW_CLOTHING_TYPE.Robe, reserve: 'robe' },
  'Strapless Dress': { type: MW_CLOTHING_TYPE.Robe, reserve: 'robe' },
  'Evening Gown': { type: MW_CLOTHING_TYPE.Robe, reserve: 'robe' },
  'Day Gown': { type: MW_CLOTHING_TYPE.Robe, reserve: 'robe' },
});

// Matches OpenMW's robe and skirt reserve lists by part index: the garment occupies these slots with no mesh,
// hiding the skin and any lower-priority garment there.
export const RESERVES = Object.freeze({
  robe: [4, 5, 21, 22, 13, 14, 19, 20, 11, 12, 3],
  skirt: [4, 21, 22],
});
import { DF_TO_MW_WEAPON, DF_TO_MW_MATERIAL, ARM_PARTS, MOD_WEAPON_TO_MW } from './mwFirstPerson.js';
import { drawnPiece } from '../net/appearanceLaw.js';
import { shownEquipTable } from '../characters/lookHidden.js';

// Each value lists id tokens tried in order. Armor ids spell Dwarven as `dwemer` while weapon ids use `dwarven`, so
// armor cannot reuse the weapon material table.
export const DF_TO_MW_ARMOR_MATERIAL = Object.freeze({
  Leather: ['netch'], Chain: ['chain', 'iron'], Chain2: ['chain', 'iron'],
  Iron: ['iron'], Steel: ['steel'], Silver: ['steel'], Elven: ['steel'],
  Dwarven: ['dwemer'], Mithril: ['ebony'], Adamantium: ['adamantium', 'ebony'],
  Ebony: ['ebony'], Orcish: ['orcish'], Daedric: ['daedric'],
});

export const DF_MATERIAL_RGB = Object.freeze({
  Iron: [0x4e, 0x4e, 0x53], Steel: [0x79, 0x79, 0x79], Silver: [0xa3, 0xa3, 0xa7], Elven: [0xa6, 0xa6, 0xa7],
  Dwarven: [0x97, 0x8a, 0x10], Mithril: [0x2a, 0x38, 0x49], Adamantium: [0x2e, 0x2e, 0x30], Ebony: [0x3a, 0x3a, 0x3a],
  Orcish: [0x31, 0x40, 0x26], Daedric: [0x83, 0x2c, 0x10],
  Leather: [0x8e, 0x63, 0x47], Chain: [0x6b, 0x6b, 0x75], Chain2: [0x6b, 0x6b, 0x75],
});
export const DF_CLOTHING_DYE_RGB = Object.freeze([
  [0x4d, 0x6f, 0x9b], [0x6b, 0x6b, 0x75], [0x83, 0x2c, 0x10], [0x8e, 0x63, 0x47], [0x80, 0x59, 0x6f],
  [0x8e, 0x72, 0x4e], [0x79, 0x79, 0x79], [0x4e, 0x7a, 0x7b], [0x97, 0x8a, 0x10], [0x56, 0x70, 0x53],
]);

export const DF_ARMOR_ROWS = Object.freeze({
  [ARMOR_ENUM.Cuirass]: { tokens: ['cuirass'] },
  [ARMOR_ENUM.Greaves]: { tokens: ['greaves'] },
  [ARMOR_ENUM.Helm]: { tokens: ['helmet', 'helm'] },
  [ARMOR_ENUM.Boots]: { tokens: ['boots'] },
  [ARMOR_ENUM.Gauntlets]: { tokens: ['gauntlet', 'bracer'], sides: ['left', 'right'] },
  [ARMOR_ENUM.Left_Pauldron]: { tokens: ['pauldron'], sides: ['left'] },
  [ARMOR_ENUM.Right_Pauldron]: { tokens: ['pauldron'], sides: ['right'] },
  [ARMOR_ENUM.Buckler]: { tokens: ['shield'], not: ['towershield'] },
  [ARMOR_ENUM.Round_Shield]: { tokens: ['shield'], not: ['towershield'] },
  [ARMOR_ENUM.Kite_Shield]: { tokens: ['shield'], not: ['towershield'] },
  [ARMOR_ENUM.Tower_Shield]: { tokens: ['towershield'] },
});

export const MOD_ARMOR_ROWS = Object.freeze({
  515: DF_ARMOR_ROWS[ARMOR_ENUM.Cuirass],
  516: DF_ARMOR_ROWS[ARMOR_ENUM.Greaves],
  517: DF_ARMOR_ROWS[ARMOR_ENUM.Left_Pauldron],
  518: DF_ARMOR_ROWS[ARMOR_ENUM.Right_Pauldron],
  519: DF_ARMOR_ROWS[ARMOR_ENUM.Boots],
  520: DF_ARMOR_ROWS[ARMOR_ENUM.Cuirass],
  521: DF_ARMOR_ROWS[ARMOR_ENUM.Greaves],
  522: DF_ARMOR_ROWS[ARMOR_ENUM.Helm],
  523: DF_ARMOR_ROWS[ARMOR_ENUM.Boots],
  524: DF_ARMOR_ROWS[ARMOR_ENUM.Gauntlets],
  525: Object.freeze({ tokens: ['bracer', 'gauntlet'], sides: ['left'] }),
  526: Object.freeze({ tokens: ['bracer', 'gauntlet'], sides: ['right'] }),
});
export const armorRowOf = (templateIndex) => DF_ARMOR_ROWS[templateIndex] ?? MOD_ARMOR_ROWS[templateIndex] ?? null;

export const DECLARED_SPRITE_WEAPONS = Object.freeze({
  Arrow: 'ammunition - drawn by the bow\u2019s own attachArrow, never in the hand',
});

const matName = (table, v) => Object.entries(table).find(([, x]) => x === v)?.[0] ?? null;

const ownModelsOf = (own) => [...new Set([own.parts, ...Object.values(own.styles ?? {})].flat().map((p) => p.model))];

export function clothingTierOf(id) {
  const m = /^(common|expensive|extravagant|exquisite)_/i.exec(String(id ?? ''));
  return m ? ['common', 'expensive', 'extravagant', 'exquisite'].indexOf(m[1].toLowerCase()) : -1;
}
export const CLOTH_PICK_NEAREST = 3;
// Retail's upper clothing tiers hold only one to three garments per type, so without this band a pick among the
// nearest three can land on a different color.
export const CLOTH_PICK_BAND = Object.freeze([1.5, 32]);

export function mwClothingRecord(clothes, name, { dye = null, colourOf = null, tier = null, pick = null } = {}) {
  const row = DF_CLOTHING_ROWS[name];
  if (!row) return { record: null, row: null, note: `"${name}" is not a garment row` };
  // Skips the werewolf robe, whose parts form the wolf body, and any record without a ground mesh, because the item
  // icon draws from that mesh.
  let pool = (clothes ?? []).filter((c) => c.type === row.type && !c.enchanted && c.id !== WEREWOLF_ROBE_ID && c.model)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!pool.length) return { record: null, row, note: `no MW clothing of type ${row.type} in these archives - the classic sprite stands` };
  const picking = Number.isInteger(pick) && pick >= 0;
  if (Number.isInteger(tier) && tier >= 0 && tier <= 3) {
    for (const d of [0, -1, 1, -2, 2, -3, 3]) {
      const t = tier + d;
      if (t < 0 || t > 3) continue;
      const rung = pool.filter((c) => clothingTierOf(c.id) === t);
      if (rung.length) { pool = rung; break; }
    }
  }
  const want = dye != null ? DF_CLOTHING_DYE_RGB[dye | 0] : null;
  if (want && typeof colourOf === 'function') {
    let best = null; let bestD = Infinity;
    /** @type {{ c: any, d: number }[]} */
    const near = [];
    for (const c of pool) {
      const rgb = colourOf(c);
      if (!rgb) continue;
      const d = Math.hypot(rgb[0] - want[0], rgb[1] - want[1], rgb[2] - want[2]);
      if (picking) near.push({ c, d });
      if (d < bestD) { bestD = d; best = c; }
    }
    if (picking && near.length) {
      near.sort((a, b) => a.d - b.d || (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0));
      const band = near[0].d * CLOTH_PICK_BAND[0] + CLOTH_PICK_BAND[1];
      let k = Math.min(CLOTH_PICK_NEAREST, near.length);
      while (k > 1 && near[k - 1].d > band) k--;
      const chosen = near[pick % k];
      return { record: chosen.c, row, note: `picked by dye (distance ${Math.round(chosen.d)}, ${pick % k + 1} of the ${k} nearest)` };
    }
    if (best) return { record: best, row, note: `resolved by dye (distance ${Math.round(bestD)})` };
  }
  if (picking) return { record: pool[pick % pool.length], row, note: `picked (${pick % pool.length + 1} of ${pool.length})` };
  return { record: pool[0], row, note: 'resolved' };
}

export function mwArmorRecords(armorRecords, templateIndex, material) {
  const row = armorRowOf(templateIndex);
  if (!row) return { records: [], row: null, note: `template ${templateIndex} is not an armor row` };
  const mName = matName(ARMOR_MATERIAL, material);
  const chain = DF_TO_MW_ARMOR_MATERIAL[mName] ?? null;
  if (!chain) return { records: [], row, note: `no MW material for ${mName ?? material}` };
  const byToken = (tok) => (armorRecords ?? []).filter((r) => {
    const id = String(r.id || '').toLowerCase();
    if (!id.includes(tok)) return false;
    if ((row.not ?? []).some((n) => id.includes(n))) return false;
    return true;
  });
  const byPiece = (list) => {
    for (const t of row.tokens) {
      const hit = list.filter((r) => String(r.id || '').toLowerCase().includes(t));
      if (hit.length) return hit;
    }
    return [];
  };
  // Takes the first material token that has records for this piece, not the first token with any records, so
  // imperial chain boots fall back to iron.
  let token = chain[chain.length - 1]; let pool = [];
  for (const tok of chain) { const hit = byPiece(byToken(tok)); if (hit.length) { token = tok; pool = hit; break; } }
  pool.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!pool.length) {
    return { records: [], row, material: token, note: `no ${chain.join('/')} ${row.tokens[0]} in these archives - the classic sprite stands` };
  }
  if (!row.sides) return { records: [pool[0]], row, material: token, note: 'resolved' };
  const records = [];
  const missing = [];
  for (const side of row.sides) {
    const hit = pool.find((r) => String(r.id || '').toLowerCase().includes(side));
    if (hit) records.push(hit); else missing.push(side);
  }
  if (!records.length) {
    return { records: [], row, material: token, note: `no sided ${row.tokens[0]} (${row.sides.join('/')}) - the classic sprite stands` };
  }
  return {
    records, row, material: token,
    note: missing.length ? `resolved, but the ${missing.join(' and ')} side is missing` : 'resolved',
  };
}

export function itemMapCoverage() {
  const out = [];
  for (const [wName] of Object.entries(WEAPONS)) {
    for (const [mName, m] of Object.entries(WEAPON_MATERIALS)) {
      if (m === WEAPON_MATERIALS.None) continue;
      if (wName in DECLARED_SPRITE_WEAPONS) {
        out.push({ kind: 'sprite', item: wName, material: mName, reason: DECLARED_SPRITE_WEAPONS[wName] });
      } else if (wName in DF_TO_MW_WEAPON) {
        out.push({ kind: 'mapped', item: wName, material: mName, via: 'weapon' });
      } else {
        out.push({ kind: 'UNMAPPED', item: wName, material: mName });
      }
    }
  }
  for (const [aName, tmpl] of Object.entries(ARMOR_ENUM)) {
    for (const [mName, m] of Object.entries(ARMOR_MATERIAL)) {
      if (m === ARMOR_MATERIAL.None) continue;
      const own = OWN_MW_ARMOR.find((a) => a.templateIndex === tmpl && a.material === m);
      if (own) { out.push({ kind: 'own', item: aName, material: mName, via: 'armor', own: 'ownArmorModels', index: tmpl, model: ownModelsOf(own).join(' + ') }); continue; }
      const hasRow = tmpl in DF_ARMOR_ROWS;
      const hasMat = mName in DF_TO_MW_ARMOR_MATERIAL;
      if (hasRow && hasMat) out.push({ kind: 'mapped', item: aName, material: mName, via: 'armor' });
      else out.push({ kind: 'UNMAPPED', item: aName, material: mName });
    }
  }
  for (const index of Object.keys(MOD_WEAPON_TO_MW)) {
    for (const [mName, m] of Object.entries(WEAPON_MATERIALS)) {
      if (m === WEAPON_MATERIALS.None) continue;
      out.push({ kind: MOD_WEAPON_TO_MW[index] != null ? 'mapped' : 'UNMAPPED', item: `template ${index}`, material: mName, via: 'mod weapon' });
    }
  }
  for (const index of Object.keys(MOD_ARMOR_ROWS)) {
    for (const [mName, m] of Object.entries(ARMOR_MATERIAL)) {
      if (m === ARMOR_MATERIAL.None) continue;
      const own = OWN_MW_ARMOR.find((a) => a.templateIndex === Number(index) && a.material === m);
      if (own) { out.push({ kind: 'own', item: `template ${index}`, material: mName, via: 'mod armor', own: 'ownArmorModels', index: Number(index), model: ownModelsOf(own).join(' + ') }); continue; }
      const ok = !!MOD_ARMOR_ROWS[index] && mName in DF_TO_MW_ARMOR_MATERIAL;
      out.push({ kind: ok ? 'mapped' : 'UNMAPPED', item: `template ${index}`, material: mName, via: 'mod armor' });
    }
  }
  for (const [idx, name] of Object.entries(CLOTHING_NAME)) {
    if (CLOAK_NAMES.includes(name)) { out.push({ kind: 'own', item: `${name} (${idx})`, material: 'any dye', via: 'clothing', own: 'ownClothingModels', index: Number(idx), model: CLOAK_PAINTINGS.map(cloakModel).join(' + ') }); continue; }
    if (name in DF_CLOTHING_ROWS) out.push({ kind: 'mapped', item: `${name} (${idx})`, material: 'any dye', via: 'clothing' });
    else out.push({ kind: 'UNMAPPED', item: `${name} (${idx})`, material: 'any dye' });
  }
  return out;
}

export function mwItemReport(armorRecords, { weapons = null, clothes = null, colourOf = null, pickWeapon = null } = {}) {
  const rows = [];
  const hex = (c) => (c ? `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}` : null);
  for (const [aName, tmpl] of Object.entries(ARMOR_ENUM)) {
    for (const mName of Object.keys(DF_TO_MW_ARMOR_MATERIAL)) {
      if (mName === 'Chain2') continue;
      const own = ownArmorModelFor({ templateIndex: tmpl, material: ARMOR_MATERIAL[mName] });
      if (own) {
        rows.push({
          family: 'armor', item: `${mName} ${aName.replaceAll('_', ' ')}`, found: ownModelsOf(own),
          note: 'the port\'s own model (characters/ownModels/ownArmorModels.js) - no record of the archives is asked',
          dfColour: hex(DF_MATERIAL_RGB[mName]), mwColour: null,
        });
        continue;
      }
      const res = mwArmorRecords(armorRecords, tmpl, ARMOR_MATERIAL[mName]);
      rows.push({
        family: 'armor',
        item: `${mName} ${aName.replaceAll('_', ' ')}`,
        found: res.records.map((r) => r.id),
        note: res.note,
        dfColour: hex(DF_MATERIAL_RGB[mName]),
        mwColour: colourOf && res.records[0] ? hex(colourOf(res.records[0])) : null,
      });
    }
  }
  if (weapons && pickWeapon) {
    for (const [wName, wType] of Object.entries(DF_TO_MW_WEAPON)) {
      for (const mName of Object.keys(DF_MATERIAL_RGB)) {
        if (mName === 'Leather' || mName === 'Chain' || mName === 'Chain2') continue;
        const rec = pickWeapon(weapons, wType, mName);
        rows.push({
          family: 'weapon',
          item: `${mName} ${wName.replaceAll('_', ' ')}`,
          found: rec ? [rec.id] : [],
          note: rec
            ? ((DF_TO_MW_MATERIAL[mName] ?? []).some((tok) => rec.id.includes(tok)) ? 'resolved' : `resolved to the type's first - no ${(DF_TO_MW_MATERIAL[mName] ?? []).join('/')} of this type`)
            : 'no record of this type - the classic sprite stands',
          dfColour: hex(DF_MATERIAL_RGB[mName]),
          mwColour: colourOf && rec ? hex(colourOf(rec)) : null,
        });
      }
    }
  }
  if (clothes) {
    for (const [name, row] of Object.entries(DF_CLOTHING_ROWS)) {
      for (let dye = 0; dye < DF_CLOTHING_DYE_RGB.length; dye++) {
        const dyeName = ['Blue', 'Grey', 'Red', 'Dark Brown', 'Purple', 'Light Brown', 'White', 'Aquamarine', 'Yellow', 'Green'][dye];
        const cloak = ownCloakFor({ kind: 'clothing', name, dye });
        if (cloak) {
          rows.push({ family: 'clothing', item: `${dyeName} ${name}`, found: [cloak.model],
            note: `the port's own cloak (characters/ownModels/ownClothingModels.js), the ${cloak.painting.replace('_', ' ')} painting - no record of the archives is asked`,
            dfColour: hex(DF_CLOTHING_DYE_RGB[dye]), mwColour: null, reserve: null });
          continue;
        }
        const res = mwClothingRecord(clothes, name, { dye, colourOf });
        rows.push({
          family: 'clothing',
          item: `${dyeName} ${name}`,
          found: res.record ? [res.record.id] : [],
          note: res.note,
          dfColour: hex(DF_CLOTHING_DYE_RGB[dye]),
          mwColour: colourOf && res.record ? hex(colourOf(res.record)) : null,
          reserve: row.reserve ?? null,
        });
      }
    }
  }
  return rows;
}

// Indexed by the 27-entry sided ARMO/CLOT part enum (OpenMW's PartReferenceType), not the 15-entry unsided enum
// that BODY records use.
export const ARMO_PART = Object.freeze([
  { name: 'head', bones: ['head'], shadows: 'head' },
  { name: 'hair', bones: ['head'], shadows: 'hair' },
  { name: 'neck', bones: ['neck'], shadows: 'neck' },
  { name: 'cuirass', bones: ['chest'], shadows: 'chest' },
  { name: 'groin', bones: ['groin'], shadows: 'groin' },
  { name: 'skirt', bones: ['groin'], shadows: null },
  { name: 'right hand', bones: ['right hand'], shadows: 'hand:right' },
  { name: 'left hand', bones: ['left hand'], shadows: 'hand:left' },
  { name: 'right wrist', bones: ['right wrist'], shadows: 'wrist:right' },
  { name: 'left wrist', bones: ['left wrist'], shadows: 'wrist:left' },
  { name: 'shield', bones: ['shield bone'], shadows: null },
  { name: 'right forearm', bones: ['right forearm'], shadows: 'forearm:right' },
  { name: 'left forearm', bones: ['left forearm'], shadows: 'forearm:left' },
  { name: 'right upper arm', bones: ['right upper arm'], shadows: 'upperarm:right' },
  { name: 'left upper arm', bones: ['left upper arm'], shadows: 'upperarm:left' },
  { name: 'right foot', bones: ['right foot'], shadows: 'foot:right' },
  { name: 'left foot', bones: ['left foot'], shadows: 'foot:left' },
  { name: 'right ankle', bones: ['right ankle'], shadows: 'ankle:right' },
  { name: 'left ankle', bones: ['left ankle'], shadows: 'ankle:left' },
  { name: 'right knee', bones: ['right knee'], shadows: 'knee:right' },
  { name: 'left knee', bones: ['left knee'], shadows: 'knee:left' },
  { name: 'right upper leg', bones: ['right upper leg'], shadows: 'upperleg:right' },
  { name: 'left upper leg', bones: ['left upper leg'], shadows: 'upperleg:left' },
  { name: 'right pauldron', bones: ['right clavicle'], shadows: null },
  { name: 'left pauldron', bones: ['left clavicle'], shadows: null },
  { name: 'weapon', bones: [], shadows: null },
  { name: 'tail', bones: ['tail'], shadows: 'tail' },
]);

export function dfWornEquipment(slots, EQUIP_SLOTS, ARMOR_ENUM_) {
  slots = shownEquipTable(slots);
  const worn = dfWornArmor(slots, EQUIP_SLOTS, ARMOR_ENUM_).map((p) => ({ ...p, kind: 'armor' }));
  const S = EQUIP_SLOTS;
  for (const k of ['ChestClothes', 'LegsClothes', 'Feet', 'Cloak1', 'Cloak2']) {
    const it = slots[S[k]];
    if (it && typeof it.templateIndex === 'number' && it.templateIndex in CLOTHING_NAME) {
      worn.push({ kind: 'clothing', templateIndex: it.templateIndex, name: CLOTHING_NAME[it.templateIndex], dye: it.dye ?? 0 });
    }
  }
  return worn;
}

export function dfWornArmor(slots, EQUIP_SLOTS, ARMOR_ENUM) {
  const worn = [];
  const take = (piece) => {
    const item = drawnPiece(piece);
    if (item && typeof item.templateIndex === 'number' && armorRowOf(item.templateIndex)) {
      worn.push({ templateIndex: item.templateIndex, material: item.material ?? 0 });
    }
  };
  const S = EQUIP_SLOTS;
  for (const k of ['Head', 'RightArm', 'LeftArm', 'ChestArmor', 'Gloves', 'LegsArmor', 'Feet']) take(slots[S[k]]);
  for (const k of ['RightHand', 'LeftHand']) {
    const it = slots[S[k]];
    if (it && it.templateIndex >= ARMOR_ENUM.Buckler && it.templateIndex <= ARMOR_ENUM.Tower_Shield) take(it);
  }
  return worn;
}

export function composeWornArmor({ pieces, armors, clothes, bodyPool, female = false, colourOf = null, helmStyle = undefined, beast = false, beastWear = BEAST_WEAR_WORN }) {
  const notes = [];
  const wear = beast ? beastWear : null;
  const bodyById = new Map((bodyPool ?? []).map((b) => [String(b.id || '').toLowerCase(), b]));
  // Matches OpenMW part priority: skin holds each slot at 1 and a piece claims at ((base + 1) << 1) + (armor ? 1 :
  // 0). Only a strictly greater value replaces, so piece order decides ties.
  const slots = Array.from({ length: ARMO_PART.length }, () => ({ prio: 1, add: null, shadow: false, under: null }));
  const claim = (part, prio, add, under = null) => {
    const slot = slots[part];
    if (!slot || prio <= slot.prio) return;
    slot.prio = prio; slot.add = add; slot.shadow = true; slot.under = under;
  };
  const ordered = [...(pieces ?? [])].sort((a, b) => wornOrder(a) - wornOrder(b));
  let hairHidden = 0;
  let cloakAdd = null; let cloakName = null;
  let outfitAdd = null;
  const covers = new Set();
  for (const piece of ordered) {
    if (piece.kind === 'outfit') {
      const o = ownOutfitFor(piece.id);
      // Each note starts with the untranslated piece label, because `wornVerdicts` in fpArm.js matches notes to
      // pieces by that prefix.
      if (!o) { notes.push(`outfit ${piece.id}: ${t('body.outfit.unknown', 'no outfit the port carries')}`); continue; }
      if (outfitAdd) { notes.push(`outfit ${o.id}: ${t('body.outfit.second', 'a second outfit - the first ({first}) is the one drawn', { first: outfitAdd.recordId })}`); continue; }
      const prio = ((0 + 1) << 1) + 0;
      outfitAdd = { slot: `outfit (${o.id})`, partName: 'outfit', bones: [], model: o.model, recordId: o.id, piece, hides: o.hides };
      for (const h of o.hides) claim(ARMO_PART.findIndex((r) => r.name === h), prio, null, outfitAdd);
      for (const c of o.covers) covers.add(c);
      continue;
    }
    if (piece.kind === 'record') {
      const base = piece.reserve === 'robe' ? 11 : piece.reserve === 'skirt' ? 3 : 0;
      const prio = ((base + 1) << 1) + 0;
      // Unlike `composeRefs`, a part reference with no BODY record still claims its slot empty, as OpenMW's
      // reserveIndividualPart does, since the wolf has no skin underneath.
      for (const { ref, row, body } of partGroupPicks(piece.record, bodyById, female, false)) {
        if (!body) {
          notes.push(`${piece.record.id}: ${row.name} wants "${(female && ref.female) || ref.male || ref.female || '(none)'}" and no BODY record answers it - the slot is held empty (reserveIndividualPart)`);
          claim(ref.part, prio, null);
          continue;
        }
        claim(ref.part, prio, { slot: `${row.name} (${piece.record.id})`, partName: row.name, bones: row.bones, model: body.model, recordId: String(body.id || '').toLowerCase(), piece });
      }
      for (const part of RESERVES[piece.reserve] ?? []) claim(part, prio, null);
      continue;
    }
    if (piece.kind === 'clothing') {
      const name = piece.name ?? CLOTHING_NAME[piece.templateIndex];
      const cloak = ownCloakFor({ ...piece, name });
      if (cloak) {
        if (cloakAdd) { notes.push(`${name}: a second cloak - the first (${cloakName}) is the one drawn`); continue; }
        cloakAdd = { slot: `cloak (${cloak.id})`, partName: 'cloak', bones: [], model: cloak.model, recordId: cloak.id, piece };
        cloakName = name;
        continue;
      }
      const res = mwClothingRecord(clothes, name, { dye: piece.dye ?? null, colourOf, tier: piece.tier ?? null, pick: piece.pick ?? null });
      if (!res.record) { notes.push(`${name ?? piece.templateIndex}: ${res.note}`); continue; }
      const cut = wear ? beastCut(res.record, wear) : null;
      if (cut?.refused) { notes.push(`${name}: ${beastRefusal(cut.refused, res.record.id)}`); continue; }
      if (cut?.bared) notes.push(`${name}: ${beastBared(res.record.id)}`);
      const base = res.row.reserve === 'robe' ? 11 : res.row.reserve === 'skirt' ? 3 : 0;
      const prio = ((base + 1) << 1) + 0;
      composeRefs(cut?.rec ?? res.record, prio, female, bodyById, claim, notes, piece);
      for (const part of RESERVES[res.row.reserve] ?? []) claim(part, prio, null);
      continue;
    }
    const prio = ((0 + 1) << 1) + 1;
    if (wear?.helm === 'hidden' && armorRowOf(piece.templateIndex) === DF_ARMOR_ROWS[HELM_TEMPLATE]) { notes.push(`armor ${piece.templateIndex}: ${beastNoHelm()}`); continue; }
    const own = ownArmorModelFor(piece);
    if (own) {
      const ownParts = ownArmorParts(own, { helmStyle });
      const ownHead = wear && wear.helm !== 'worn' && ownParts.some((p) => p.part === 'head' || (p.hides ?? []).includes('head'));
      const ownFeet = wear?.feet === 'hidden' && ownParts.some((p) => BEAST_FEET.has(p.part));
      if (ownHead || ownFeet) {
        notes.push(`armor ${piece.templateIndex}: ${beastRefusal(ownHead ? 'helm' : 'feet', own.id)}`);
        continue;
      }
      for (const p of ownParts) {
        if (wear?.feet === 'shafts' && BEAST_FEET.has(p.part)) { notes.push(`armor ${piece.templateIndex}: ${beastBared(own.id)}`); continue; }
        const at = ARMO_PART.findIndex((r) => r.name === p.part);
        const row = ARMO_PART[at];
        const add = { slot: `${row.name} (${own.id})`, partName: row.name, bones: row.bones, model: p.model, recordId: own.id, piece,
          ...(own.skinFrom ? { skinFrom: own.skinFrom, fitTo: own.fitTo ?? null } : {}) };
        claim(at, prio, add);
        for (const h of p.hides ?? []) claim(ARMO_PART.findIndex((r) => r.name === h), prio, null, add);
      }
      continue;
    }
    const res = mwArmorRecords(armors, piece.templateIndex, piece.material);
    if (!res.records.length) { notes.push(`armor ${piece.templateIndex}: ${res.note}`); continue; }
    // The beast refusal check runs before the helmet hair rule, so a refused helm leaves the hair drawn.
    const refused = wear ? res.records.map((r) => ({ id: r.id, why: beastCut(r, wear).refused })).find((r) => r.why) : null;
    if (refused) { notes.push(`armor ${piece.templateIndex}: ${beastRefusal(refused.why, refused.id)}`); continue; }
    // A helmet hides hair by an OpenMW engine rule rather than a part reference, so the hair slot is claimed
    // separately after every piece.
    if (armorRowOf(piece.templateIndex) === DF_ARMOR_ROWS[HELM_TEMPLATE]) hairHidden = Math.max(hairHidden, prio);
    // A shield follows OpenMW's getShieldMesh: its PRT_Shield body part first, else the ARMO ground mesh, so it
    // skips the no-parts refusal that other armor hits.
    const isShield = piece.templateIndex >= ARMOR_ENUM.Buckler && piece.templateIndex <= ARMOR_ENUM.Tower_Shield;
    for (const armo of res.records) {
      if (isShield) {
        const mesh = shieldMeshOf(armo, female, bodyById, notes);
        if (mesh === null) { claim(PRT_SHIELD, prio, null); continue; }
        claim(PRT_SHIELD, prio, {
          slot: `shield (${armo.id})${mesh.ground ? ' - ground mesh, the reference\'s own fallback' : ''}`,
          bones: ARMO_PART[PRT_SHIELD].bones, model: mesh.model, recordId: mesh.recordId, piece,
        });
        continue;
      }
      if (!armo.parts?.length) { notes.push(`${armo.id}: no worn part references - the ground mesh is not a body`); continue; }
      const cut = wear ? beastCut(armo, wear) : null;
      if (cut?.bared) notes.push(`armor ${piece.templateIndex}: ${beastBared(armo.id)}`);
      composeRefs(cut?.rec ?? armo, prio, female, bodyById, claim, notes, piece);
    }
  }
  if (hairHidden) claim(1, hairHidden, null);
  const adds = [];
  const shadows = new Set();
  const fpShadows = new Set();
  for (let i2 = 0; i2 < slots.length; i2++) {
    if (!slots[i2].shadow) continue;
    if (slots[i2].add) adds.push(slots[i2].add);
    const key = ARMO_PART[i2].shadows;
    if (key) shadows.add(key);
    if (key && !(slots[i2].under && !fpWornAdds([slots[i2].under]).length)) fpShadows.add(key);
  }
  if (outfitAdd) adds.push(outfitAdd);
  if (cloakAdd) adds.push(cloakAdd);
  return { adds, shadows: [...shadows], fpShadows: [...fpShadows], covers: [...covers], notes };
}

// With Show Nudity off, a female figure whose chest skin shows wears the first Short Shirt record, matching
// Daggerfall Unity's paper doll, because Morrowind's female chest mesh is bare.
export const MODESTY_SHIRT = Object.freeze({ kind: 'clothing', name: 'Short Shirt' });
export function composeWornModest(args, show) {
  const worn = composeWornArmor(args);
  if (show || !args.female || worn.shadows.includes('chest') || worn.covers.includes('chest')) return worn;
  return composeWornArmor({ ...args, pieces: [...(args.pieces ?? []), MODESTY_SHIRT] });
}

const PRT_SHIELD = 10;

// Morrowind refuses any item with a head or foot part on a beast race, but Daggerfall equips everything. These
// switches change only what the figure draws, never what is equipped.
export const BEAST_WEAR_WORN = Object.freeze({ feet: 'worn', helm: 'worn' });
const BEAST_FEET = new Set(['right foot', 'left foot']);
const beastRefused = (id) => t('body.beast.helm', '{id} covers the head - a beast race wears no closed helm', { id });
const beastBared = (id) => t('body.beast.feet', '{id} - a beast race\'s feet stay bare', { id });
const beastNoFootwear = (id) => t('body.beast.noFootwear', '{id} - a beast race wears no footwear', { id });
const beastNoHelm = () => t('body.beast.noHelm', 'a beast race wears no helmet');

function beastCut(rec, wear) {
  const name = (r) => ARMO_PART[r.part]?.name;
  const parts = rec.parts ?? [];
  if (wear.helm !== 'worn' && parts.some((r) => name(r) === 'head')) return { refused: 'helm', rec, bared: 0 };
  if (wear.feet === 'hidden' && parts.some((r) => BEAST_FEET.has(name(r)))) return { refused: 'feet', rec, bared: 0 };
  if (wear.feet !== 'shafts') return { refused: null, rec, bared: 0 };
  const kept = parts.filter((r) => !BEAST_FEET.has(name(r)));
  return { refused: null, rec: kept.length === parts.length ? rec : { ...rec, parts: kept }, bared: parts.length - kept.length };
}
const beastRefusal = (refused, id) => (refused === 'helm' ? beastRefused(id) : beastNoFootwear(id));

/** @returns {model, recordId, ground?} */
function shieldMeshOf(armo, female, bodyById, notes) {
  for (const ref of armo.parts ?? []) {
    if (ref.part !== PRT_SHIELD) continue;
    const id = female && ref.female ? ref.female : ref.male;
    if (!id) continue;
    const body = bodyById.get(id);
    if (!body || body.bodyKind !== 2) {
      notes.push(`${armo.id}: shield body "${id}" ${!body ? 'is in no BODY record' : 'is not armor-kind'} - `
        + 'the slot reserves EMPTY (getShieldMesh\'s own refusal)');
      return null;
    }
    if (body.model) return { model: body.model, recordId: id };
  }
  return { model: armo.model, recordId: null, ground: true };
}

function composeRefs(rec, prio, female, bodyById, claim, notes, piece = null) {
  for (const ref of rec.parts ?? []) {
    const row = ARMO_PART[ref.part];
    if (!row) { notes.push(`${rec.id}: INDX ${ref.part} is outside the enum`); continue; }
    if (row.name === 'weapon') continue;
    const id = (female && ref.female) || ref.male || ref.female;
    if (!id) { notes.push(`${rec.id}: ${row.name} names no body part`); continue; }
    const body = bodyById.get(id);
    if (!body) { notes.push(`${rec.id}: ${row.name} wants "${id}" and no BODY record carries it`); continue; }
    claim(ref.part, prio, {
      slot: `${row.name} (${rec.id})`, partName: row.name,
      bones: row.bones, model: body.model, recordId: id, piece,
    });
  }
}

function wornOrder(piece) {
  if (piece.kind === 'outfit') return 0;
  if (piece.kind === 'record') return piece.reserve === 'robe' ? 0 : piece.reserve === 'skirt' ? 1 : 11;
  if (piece.kind === 'clothing') {
    const row = DF_CLOTHING_ROWS[piece.name ?? CLOTHING_NAME[piece.templateIndex]];
    if (row?.reserve === 'robe') return 0;
    if (row?.reserve === 'skirt') return 1;
    if (row?.type === MW_CLOTHING_TYPE.Shirt) return 10;
    return 11;
  }
  const t = piece.templateIndex;
  if (t === ARMOR_ENUM.Helm) return 2;
  if (t === ARMOR_ENUM.Cuirass) return 3;
  if (t === ARMOR_ENUM.Greaves) return 4;
  if (t === ARMOR_ENUM.Left_Pauldron) return 5;
  if (t === ARMOR_ENUM.Right_Pauldron) return 6;
  if (t === ARMOR_ENUM.Boots) return 7;
  if (t === ARMOR_ENUM.Gauntlets) return 8;
  return 12;
}

export const WEREWOLF_ROBE_ID = 'werewolfrobe';
export function werewolfRobeOf(clothes) {
  let robe = null;
  for (const c of clothes ?? []) if (c.id === WEREWOLF_ROBE_ID) robe = c;
  return robe;
}

const FP_FALLBACK_PARTS = new Set(ARM_PARTS);

/** @returns {Array<{ref: object, row: object, body: object|null}>} */
function partGroupPicks(rec, bodyById, female, firstPerson) {
  const ext = firstPerson ? '.1st' : '';
  const pick = (id) => {
    if (!id) return null;
    const found = bodyById.get(`${id}${ext}`);
    if (found) return found;
    if (!firstPerson) return null;
    const plain = bodyById.get(id);
    return plain && FP_FALLBACK_PARTS.has(plain.slot) ? plain : null;
  };
  const out = [];
  for (const ref of rec?.parts ?? []) {
    const row = ARMO_PART[ref.part];
    if (!row || row.name === 'weapon') continue;
    const body = (female && ref.female ? pick(ref.female) : null) ?? pick(ref.male);
    out.push({ ref, row, body: body && body.model ? body : null });
  }
  return out;
}

/** @returns {{adds: object[], reserved: number[]}} */
export function firstPersonPartGroup(rec, bodyPool, female = false) {
  const bodyById = new Map((bodyPool ?? []).map((b) => [String(b.id || '').toLowerCase(), b]));
  const adds = [];
  const reserved = [];
  const held = new Set();
  for (const { ref, row, body } of partGroupPicks(rec, bodyById, female, true)) {
    if (held.has(ref.part)) continue;
    held.add(ref.part);
    if (!body) { reserved.push(ref.part); continue; }
    adds.push({ slot: `${row.name} (${rec.id})`, partName: row.name, bones: row.bones, model: body.model, recordId: String(body.id || '').toLowerCase() });
  }
  return { adds, reserved };
}

const FP_WORN_BONES = new Set([
  'left hand', 'right hand', 'left wrist', 'right wrist',
  'left forearm', 'right forearm', 'left upper arm', 'right upper arm',
  'shield bone',
]);
export function fpWornAdds(adds) {
  return (adds ?? []).filter((a) => (a.bones ?? []).some((b) => FP_WORN_BONES.has(b)));
}

export function shadowSkinRows(rows, shadows) {
  const whole = new Set();
  const sided = new Map();
  for (const s of shadows ?? []) {
    const [slot, side] = String(s).split(':');
    if (side) { if (!sided.has(slot)) sided.set(slot, new Set()); sided.get(slot).add(side); }
    else whole.add(slot);
  }
  const out = [];
  for (const row of rows ?? []) {
    if (whole.has(row.slot)) continue;
    const sides = sided.get(row.slot);
    if (!sides) { out.push(row); continue; }
    const bones = (row.bones ?? []).filter((b) => ![...sides].some((sd) => b.startsWith(`${sd} `)));
    if (bones.length) out.push({ ...row, bones });
  }
  return out;
}
