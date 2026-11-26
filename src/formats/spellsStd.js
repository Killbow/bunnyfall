
export const SPELL_RECORD_SIZE = 0x59;

function parseSpellRecordAt(v, o) {
  const effects = [];
  for (let i = 0; i < 3; i++) {
    const type = v.getInt8(o++);
    const subType = v.getInt8(o++);
    effects.push({ type, subType });
  }
  const element = v.getUint8(o++);
  const rangeType = v.getUint8(o++);
  const cost = v.getUint16(o, true); o += 2;
  o += 4;
  for (const e of effects) { e.durationBase = v.getUint8(o++); e.durationMod = v.getUint8(o++); e.durationPerLevel = v.getUint8(o++); }
  for (const e of effects) { e.chanceBase = v.getUint8(o++); e.chanceMod = v.getUint8(o++); e.chancePerLevel = v.getUint8(o++); }
  for (const e of effects) {
    e.magnitudeBaseLow = v.getUint8(o++); e.magnitudeBaseHigh = v.getUint8(o++);
    e.magnitudeLevelBase = v.getUint8(o++); e.magnitudeLevelHigh = v.getUint8(o++);
    e.magnitudePerLevel = v.getUint8(o++);
  }
  let name = '';
  for (let i = 0; i < 25; i++) name += String.fromCharCode(v.getUint8(o++));
  name = name.split('\0')[0];
  const icon = v.getUint8(o++);
  const index = v.getUint8(o++);
  return { effects, element, rangeType, cost, name, icon, index };
}

/**
 * Classic save spell records use this parse, which skips the Free Action and Jumping patches that `readSpellsStd`
 * applies.
 * @param {Uint8Array} bytes
 * @param {number} [offset]
 */
export function readSpellRecord(bytes, offset = 0) {
  if (offset + SPELL_RECORD_SIZE > bytes.byteLength) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rec = parseSpellRecordAt(v, offset);
  if (!(rec.effects[0].type > -1 || rec.effects[1].type > -1 || rec.effects[2].type > -1)) return null;
  return rec;
}

export function readSpellsStd(bytes) {
  const spells = [];
  for (let o = 0; o + SPELL_RECORD_SIZE <= bytes.byteLength; o += SPELL_RECORD_SIZE) {
    const rec = readSpellRecord(bytes, o);
    if (!rec) continue;
    // SPELLS.STD gives spell 10 effect 0 as Cure Paralyzation (3,2) where classic intends Free Action, so it is
    // patched to 26,-1.
    if (rec.index === 10 && rec.effects[0].type === 3 && rec.effects[0].subType === 2) {
      rec.effects[0].type = 26;
      rec.effects[0].subType = -1;
    }
    // SPELLS.STD gives Jumping (index 38) effect 32,-1, which matches no effect; the game's Jumping is 27,255.
    if (rec.index === 38 && rec.effects[0].type === 32 && rec.effects[0].subType === -1) rec.effects[0].type = 27;
    spells.push(rec);
  }
  return spells;
}

/**
 * A duplicate `index` keeps the first record in file order, as classic does; Holy Word and Holy Touch both use
 * index 58.
 * @param {Array<{index:number}>} records
 * @returns {Map<number, object>}
 */
export function spellsByIndexMap(records) {
  const map = new Map();
  for (const sp of records) {
    if (map.has(sp.index)) continue;
    map.set(sp.index, sp);
  }
  return map;
}
