
import { BsaFile, DIRECTORY_TYPES } from './bsaFile.js';

export const SAMPLE_RATE = 11025;

export class SndFile {
  constructor() {
    this._bsa = null;
    this._sounds = null;
  }

  static get filename() {
    return 'DAGGER.SND';
  }

  get count() {
    return this._bsa ? this._bsa.count : 0;
  }

  get bsaFile() {
    return this._bsa;
  }

  /**
   * @param {Uint8Array} bytes
   * @returns {boolean}
   */
  load(bytes) {
    this._bsa = new BsaFile(bytes);
    if (this._bsa.directoryType !== DIRECTORY_TYPES.NumberRecord) return false;
    this._sounds = new Array(this._bsa.count).fill(null);
    return true;
  }

  getRecordIndex(id) {
    for (let i = 0; i < this.count; i++) {
      if (this._bsa.getRecordId(i) === id) return i;
    }
    return -1;
  }

  isValidIndex(sound) {
    return sound >= 0 && sound < this.count;
  }

  getSound(sound) {
    if (!this.isValidIndex(sound)) return null;
    if (this._sounds[sound] !== null) return this._sounds[sound];

    const waveData = this._bsa.getRecordBytes(sound);
    const dfSound = {
      name: this._bsa.getRecordName(sound),
      waveHeader: this._createPcmHeader(waveData.length),
      waveData,
    };
    this._sounds[sound] = dfSound;
    return dfSound;
  }

  getStream(sound) {
    const dfSound = this.getSound(sound);
    if (!dfSound) return null;
    const data = new Uint8Array(dfSound.waveHeader.length + dfSound.waveData.length);
    data.set(dfSound.waveHeader, 0);
    data.set(dfSound.waveData, dfSound.waveHeader.length);
    return data;
  }

  discardSound(sound) {
    if (sound < 0 || sound >= this.count) return;
    this._sounds[sound] = null;
  }

  _createPcmHeader(dataLength) {
    const header = new Uint8Array(44);
    const v = new DataView(header.buffer);
    const writeTag = (offset, tag) => {
      for (let i = 0; i < 4; i++) header[offset + i] = tag.charCodeAt(i);
    };

    writeTag(0, 'RIFF');
    v.setInt32(4, dataLength + 36, true);
    writeTag(8, 'WAVE');
    writeTag(12, 'fmt ');
    v.setInt32(16, 16, true);
    v.setInt16(20, 1, true);
    v.setInt16(22, 1, true);
    v.setInt32(24, SAMPLE_RATE, true);
    v.setInt32(28, SAMPLE_RATE, true);
    v.setInt16(32, 1, true);
    v.setInt16(34, 8, true);
    writeTag(36, 'data');
    v.setInt32(40, dataLength, true);

    return header;
  }
}
