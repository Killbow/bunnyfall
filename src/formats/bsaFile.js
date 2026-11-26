
export const DIRECTORY_TYPES = Object.freeze({
  NameRecord: 0x0100,
  NumberRecord: 0x0200,
});

const NAME_ENTRY_SIZE = 18;
const NAME_FIELD_SIZE = 14;
const NUMBER_ENTRY_SIZE = 8;

export class BsaFile {
  /** @param {Uint8Array} bytes */
  constructor(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      throw new TypeError('BsaFile expects a Uint8Array');
    }
    this._bytes = bytes;
    this._view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    this._directoryCount = this._view.getInt16(0, true);
    this._directoryType = this._view.getUint16(2, true);
    this._firstRecordPosition = 4;

    this._directory = [];
    if (this._directoryType === DIRECTORY_TYPES.NameRecord) {
      let recordPosition = this._firstRecordPosition;
      let pos = bytes.byteLength - NAME_ENTRY_SIZE * this._directoryCount;
      this._directoryStart = pos;
      for (let i = 0; i < this._directoryCount; i++) {
        // Names stop at the 14-byte field, where DFU's `ReadCString` scans on into the size field; the two differ
        // only for a name that fills all 14 bytes with no NUL.
        const name = this._readCString(pos, NAME_FIELD_SIZE);
        const size = this._view.getInt32(pos + NAME_FIELD_SIZE, true);
        this._directory.push({ name, id: null, size, position: recordPosition });
        recordPosition += size;
        pos += NAME_ENTRY_SIZE;
      }
    } else if (this._directoryType === DIRECTORY_TYPES.NumberRecord) {
      let recordPosition = this._firstRecordPosition;
      let pos = bytes.byteLength - NUMBER_ENTRY_SIZE * this._directoryCount;
      this._directoryStart = pos;
      for (let i = 0; i < this._directoryCount; i++) {
        const id = this._view.getUint32(pos, true);
        const size = this._view.getInt32(pos + 4, true);
        this._directory.push({ name: String(id), id, size, position: recordPosition });
        recordPosition += size;
        pos += NUMBER_ENTRY_SIZE;
      }
    } else {
      throw new Error('BSA file has an invalid DirectoryType.');
    }
  }

  get count() {
    return this._directoryCount;
  }

  get directoryType() {
    return this._directoryType;
  }

  get directoryStart() {
    return this._directoryStart;
  }

  /** @returns {number} */
  getRecordIndex(name) {
    if (this._directoryType !== DIRECTORY_TYPES.NameRecord) return -1;
    for (let i = 0; i < this._directoryCount; i++) {
      if (this._directory[i].name === name) return i;
    }
    return -1;
  }

  getRecordLength(record) {
    if (record < 0 || record >= this._directoryCount) return 0;
    return this._directory[record].size;
  }

  getRecordName(record) {
    if (record < 0 || record >= this._directoryCount) return '';
    return this._directory[record].name;
  }

  getRecordId(record) {
    if (
      record < 0 ||
      record >= this._directoryCount ||
      this._directoryType !== DIRECTORY_TYPES.NumberRecord
    ) {
      return 0;
    }
    return this._directory[record].id;
  }

  getRecordPosition(record) {
    if (record < 0 || record >= this._directoryCount) return -1;
    return this._directory[record].position;
  }

  // Returns a copy; arch3dFile.js patches this copy in place.
  getRecordBytes(record) {
    if (record < 0 || record >= this._directoryCount) return null;
    const { position, size } = this._directory[record];
    return this._bytes.slice(position, position + size);
  }

  // Returns a view into the archive bytes, so callers must not write to it; use `getRecordBytes` to edit a record.
  getRecordView(record) {
    if (record < 0 || record >= this._directoryCount) return null;
    const { position, size } = this._directory[record];
    return this._bytes.subarray(position, position + size);
  }

  _readCString(offset, maxLength) {
    let end = offset;
    const limit = offset + maxLength;
    while (end < limit && this._bytes[end] !== 0) end++;
    let s = '';
    for (let i = offset; i < end; i++) s += String.fromCharCode(this._bytes[i]);
    return s;
  }
}
