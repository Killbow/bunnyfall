
import { readCStringFixed } from './fileProxy.js';

export const CLASSIC_RUMOR_TYPES = Object.freeze({
  Plague: 4, Famine: 7, WitchBurnings: 10, CrimeWave: 11, NewRuler: 12,
  PersecutedTemple: 18, AllianceSignMessage: 26, EnemySignMessage: 27,
  WarSignMessage: 28, FactionRumor: 100,
});

export class RumorFile {
  constructor() {
    this.rumors = [];
  }

  load(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.rumors = [];
    let pos = 0;
    while (pos < bytes.length) {
      const faction1 = v.getUint16(pos, true); pos += 2;
      const faction2 = v.getUint16(pos, true); pos += 2;
      const type = v.getUint32(pos, true); pos += 4;
      const regionID = bytes[pos]; pos += 1;
      const flags = bytes[pos]; pos += 1;
      const questID = bytes[pos]; pos += 1;
      // As in DFU's FileProxy, all nine bytes are decoded and only trailing NULs are trimmed, so an embedded NUL
      // and the bytes after it stay in the name.
      const questName = readCStringFixed(bytes, pos, 9);
      pos += 9;
      const unknown = v.getUint16(pos, true); pos += 2;
      const npcID = v.getUint32(pos, true); pos += 4;
      const textLength = v.getUint32(pos, true); pos += 4;
      const timeLimit = v.getUint32(pos, true); pos += 4;
      const rumorText = bytes.slice(pos, pos + textLength); pos += textLength;
      this.rumors.push({ faction1, faction2, type, regionID, flags, questID, questName, unknown, npcID, textLength, timeLimit, rumorText });
    }
    return this;
  }
}
