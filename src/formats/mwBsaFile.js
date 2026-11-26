
export function normalizeBsaPath(path) {
  return String(path).toLowerCase().replace(/\\/g, '/');
}

export class MwBsaFile {
  /** @param {Uint8Array} bytes */
  constructor(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      throw new TypeError('MwBsaFile expects a Uint8Array');
    }
    this._bytes = bytes;
    this._blob = null;
    this._loaded = new Map();
    this._loading = new Map();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.byteLength < 12) throw new Error('MwBsaFile: too small to be a BSA');
    const { dirSize, fileCount } = MwBsaFile._header(view);
    if (12 + dirSize + 8 * fileCount > bytes.byteLength || dirSize < 12 * fileCount) {
      throw new Error('MwBsaFile: directory larger than archive');
    }
    this._readDirectory(bytes, view, dirSize, fileCount);
  }

  static _header(view) {
    const magic = view.getUint32(0, true);
    if (magic !== 0x100) {
      throw new Error(`MwBsaFile: bad magic 0x${magic.toString(16)} (want 0x100)`);
    }
    return { dirSize: view.getUint32(4, true), fileCount: view.getUint32(8, true) };
  }

  /**
   * @param {Blob} blob
   * @returns {Promise<MwBsaFile>}
   */
  static async open(blob) {
    if (!blob || typeof blob.slice !== 'function' || typeof blob.size !== 'number') {
      throw new TypeError('MwBsaFile.open expects a Blob');
    }
    if (blob.size < 12) throw new Error('MwBsaFile: too small to be a BSA');
    const head = new DataView(await blob.slice(0, 12).arrayBuffer());
    const { dirSize, fileCount } = MwBsaFile._header(head);
    if (12 + dirSize + 8 * fileCount > blob.size || dirSize < 12 * fileCount) {
      throw new Error('MwBsaFile: directory larger than archive');
    }
    const dirBytes = new Uint8Array(await blob.slice(0, 12 + dirSize + 8 * fileCount).arrayBuffer());
    const a = Object.create(MwBsaFile.prototype);
    a._bytes = null;
    a._blob = blob;
    a._loaded = new Map();
    a._loading = new Map();
    a._readDirectory(dirBytes, new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength), dirSize, fileCount);
    return a;
  }

  _readDirectory(bytes, view, dirSize, fileCount) {

    const nameTableStart = 12 + 8 * fileCount + 4 * fileCount;
    const nameBufSize = dirSize - 12 * fileCount;
    this._dataStart = 12 + dirSize + 8 * fileCount;

    /** @type {Map<string, {size:number, offset:number, name:string}>} */
    this._entries = new Map();
    /** @type {string[]} */
    this._names = [];
    for (let i = 0; i < fileCount; i++) {
      const size = view.getUint32(12 + i * 8, true);
      const offset = view.getUint32(12 + i * 8 + 4, true);
      const nameOff = view.getUint32(12 + 8 * fileCount + i * 4, true);
      if (nameOff >= nameBufSize) throw new Error(`MwBsaFile: name offset out of range (file ${i})`);
      let end = nameTableStart + nameOff;
      const hardEnd = nameTableStart + nameBufSize;
      while (end < hardEnd && bytes[end] !== 0) end++;
      const raw = String.fromCharCode(...bytes.subarray(nameTableStart + nameOff, end));
      const name = normalizeBsaPath(raw);
      this._names.push(name);
      this._entries.set(name, { size, offset, name });
    }
  }

  /** @returns {number} */
  get fileCount() {
    return this._names.length;
  }

  /** @returns {string[]} */
  list() {
    return this._names.slice();
  }

  /**
   * @param {string} path
   * @returns {boolean}
   */
  has(path) {
    return this._entries.has(normalizeBsaPath(path));
  }

  get lazy() {
    return this._blob !== null;
  }

  loaded(path) {
    if (this._bytes) return this._entries.has(normalizeBsaPath(path));
    return this._loaded.has(normalizeBsaPath(path));
  }

  /**
   * @param {string} path
   * @returns {Uint8Array}
   */
  get(path) {
    const key = normalizeBsaPath(path);
    const entry = this._entries.get(key);
    if (!entry) throw new Error(`MwBsaFile: no such file: ${path}`);
    if (!this._bytes) {
      const hit = this._loaded.get(key);
      if (!hit) throw new Error(`MwBsaFile: ${path} is not loaded - await load(path) first (MW-LOAD)`);
      return hit;
    }
    const start = this._dataStart + entry.offset;
    if (start + entry.size > this._bytes.byteLength) {
      throw new Error(`MwBsaFile: entry overruns archive: ${path}`);
    }
    return this._bytes.subarray(start, start + entry.size);
  }

  /**
   * A load for an entry whose read is still in flight returns that same read, so a shared mesh or texture is
   * fetched once.
   * @param {string} path
   * @returns {Promise<Uint8Array>}
   */
  async load(path) {
    const key = normalizeBsaPath(path);
    const entry = this._entries.get(key);
    if (!entry) throw new Error(`MwBsaFile: no such file: ${path}`);
    if (this._bytes) return this.get(path);
    const hit = this._loaded.get(key);
    if (hit) return hit;
    const flying = this._loading.get(key);
    if (flying) return flying;
    const start = this._dataStart + entry.offset;
    if (start + entry.size > this._blob.size) {
      throw new Error(`MwBsaFile: entry overruns archive: ${path}`);
    }
    const read = this._blob.slice(start, start + entry.size).arrayBuffer().then((buf) => {
      const bytes = new Uint8Array(buf);
      this._loaded.set(key, bytes);
      return bytes;
    }).finally(() => { this._loading.delete(key); });
    this._loading.set(key, read);
    return read;
  }

  async loadAll(paths) {
    for (const p of paths) if (this.has(p)) await this.load(p);
  }

  release() {
    this._loaded.clear();
  }
}
