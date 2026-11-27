
import { readCStringFixed } from './saveTreeFile.js';

export const MAGIC_ITEM_NAME_LENGTH = 32;
export const MAGIC_ITEM_RECORD_SIZE = 62;
export const MAGIC_ITEM_TYPES = Object.freeze({ RegularMagicItem: 0, ArtifactClass1: 1, ArtifactClass2: 2 });

// Defined here so the artifact registry can use it without an import cycle through the enchantment system.
export const ENCHANTMENT_TYPES = Object.freeze({
  None: -1,
  CastWhenUsed: 0, CastWhenHeld: 1, CastWhenStrikes: 2, ExtraSpellPts: 3,
  PotentVs: 4, RegensHealth: 5, VampiricEffect: 6, IncreasedWeightAllowance: 7,
  RepairsObjects: 8, AbsorbsSpells: 9, EnhancesSkill: 10, FeatherWeight: 11,
  StrengthensArmor: 12, ImprovesTalents: 13, GoodRepWith: 14, SoulBound: 15,
  ItemDeteriorates: 16, UserTakesDamage: 17, VisionProblems: 18,
  WalkingProblems: 19, LowDamageVs: 20, HealthLeech: 21, BadReactionsFrom: 22,
  ExtraWeight: 23, WeakensArmor: 24, BadRepWith: 25, SpecialArtifactEffect: 26,
});

export function readMagicDef(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = v.getInt32(0, true);
  const items = [];
  let o = 4;
  for (let r = 0; r < count && o + MAGIC_ITEM_RECORD_SIZE <= bytes.byteLength; r++) {
    // The record index is its byte position in the file, which DFU uses as the identity key.
    const index = o;
    const name = readCStringFixed(bytes, o, MAGIC_ITEM_NAME_LENGTH);
    o += MAGIC_ITEM_NAME_LENGTH;
    const type = v.getUint8(o++);
    const group = v.getUint8(o++);
    const groupIndex = v.getUint8(o++);
    const enchantments = [];
    for (let i = 0; i < 10; i++) enchantments.push({ type: v.getInt8(o++), param: v.getInt8(o++) });
    const uses = v.getInt16(o, true); o += 2;
    const value = v.getInt32(o, true); o += 4;
    const material = v.getUint8(o++);
    items.push({ index, name, type, group, groupIndex, enchantments, uses, value, material });
  }
  return items;
}
