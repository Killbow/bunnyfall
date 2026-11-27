// Reads one 74-byte CLASS*.CFG record in DFU ClassFile order, little-endian. The weapon, armor, and shield bitfield
// is built from bytes a, b, c as (a << 16) | (c << 8) | b, matching DFU.

/**
 * @typedef {object} ClassCareer
 * @property {string} name
 * @property {number} resistanceFlags
 * @property {number} immunityFlags
 * @property {number} lowToleranceFlags
 * @property {number} criticalWeaknessFlags
 * @property {number} abilityFlagsAndSpellPointsBitfield
 * @property {number} rapidHealing
 * @property {number} regeneration
 * @property {number} unknown1
 * @property {number} spellAbsorptionFlags
 * @property {number} attackModifierFlags
 * @property {number} forbiddenMaterialsFlags
 * @property {number} weaponArmorShieldsBitfield
 * @property {number[]} primarySkills
 * @property {number[]} majorSkills
 * @property {number[]} minorSkills
 * @property {number} hitPointsPerLevel
 * @property {number} advancementMultiplierRaw
 * @property {number} advancementMultiplier
 * @property {number} strength
 * @property {number} intelligence
 * @property {number} willpower
 * @property {number} agility
 * @property {number} endurance
 * @property {number} personality
 * @property {number} speed
 * @property {number} luck
 */

export class ClassFile {
  /** @type {ClassCareer|null} */
  career = null;

  /** @param {Uint8Array} bytes */
  load(bytes) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let o = 0;
    const u8 = () => v.getUint8(o++);
    const u16 = () => { const x = v.getUint16(o, true); o += 2; return x; };
    const u32 = () => { const x = v.getUint32(o, true); o += 4; return x; };
    const c = /** @type {ClassCareer} */ ({});
    c.resistanceFlags = u8();
    c.immunityFlags = u8();
    c.lowToleranceFlags = u8();
    c.criticalWeaknessFlags = u8();
    c.abilityFlagsAndSpellPointsBitfield = u16();
    c.rapidHealing = u8();
    c.regeneration = u8();
    c.unknown1 = u8();
    c.spellAbsorptionFlags = u8();
    c.attackModifierFlags = u8();
    c.forbiddenMaterialsFlags = u16();
    const a = u8(), b = u8(), cc = u8();
    c.weaponArmorShieldsBitfield = ((a << 16) | (cc << 8) | b) >>> 0;
    c.primarySkills = [u8(), u8(), u8()];
    c.majorSkills = [u8(), u8(), u8()];
    c.minorSkills = [u8(), u8(), u8(), u8(), u8(), u8()];
    let name = '';
    for (let i = 0; i < 16; i++) name += String.fromCharCode(u8());
    c.name = name.split('\0')[0];
    o += 8;
    c.hitPointsPerLevel = u16();
    // Stored as 16.16 fixed-point and rounded to two decimals as DFU formats it. The raw value stays alongside for
    // byte comparisons.
    c.advancementMultiplierRaw = u32();
    {
      const v = (c.advancementMultiplierRaw >>> 16) + (c.advancementMultiplierRaw & 0xffff) / 65536;
      c.advancementMultiplier = Math.round(v * 100) / 100;
    }
    c.strength = u16();
    c.intelligence = u16();
    c.willpower = u16();
    c.agility = u16();
    c.endurance = u16();
    c.personality = u16();
    c.speed = u16();
    c.luck = u16();
    this.career = c;
    return true;
  }
}
