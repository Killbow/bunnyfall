
export const flatId = (archive, record) => (archive << 7) + record;

export const reverseFlatId = (id) => ({ archive: id >> 7, record: id & 0x7f });

export class FlatsFile {
  constructor() {
    /** @type {Map<number, {archive, record, caption, gender, unknown2, unknown3, faceIndex}>} */
    this.flats = new Map();
  }

  /**
   * @param {Uint8Array|string} bytes
   * @param {string} [name]
   */
  load(bytes, name = 'FLATS.CFG') {
    if (!String(name).toUpperCase().endsWith('FLATS.CFG')) return this;
    const txt = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
    this.flats.clear();

    const blocks = [];
    let current = [];
    for (const raw of txt.split(/\r\n|\n|\r/)) {
      // Tests the raw line, so a line of spaces is not a block separator. It becomes an empty line inside the block
      // and shifts the fields below it, as in DFU.
      if (raw === '') {
        if (current.length) blocks.push(current);
        current = [];
        continue;
      }
      current.push(raw.trim());
    }
    if (current.length) blocks.push(current);

    for (const block of blocks) {
      const flat = parseFlatBlock(block);
      const id = flatId(flat.archive, flat.record);
      if (!this.flats.has(id)) this.flats.set(id, flat);
    }
    return this;
  }

  getFlatData(archive, record) {
    return this.flats.get(flatId(archive, record)) ?? null;
  }

  caption(archive, record) {
    return this.getFlatData(archive, record)?.caption ?? null;
  }

  faceIndex(archive, record) {
    return this.getFlatData(archive, record)?.faceIndex ?? -1;
  }

  get count() { return this.flats.size; }
}

function parseFlatBlock(block) {
  const parts = block[0].split(' ');
  if (parts.length !== 2) {
    throw new Error(`Invalid flat format for data ${block[0]}`);
  }
  if (block.length < 6) {
    throw new Error(`Invalid flat block for ${block[0]}: ${block.length} lines, expected 6`);
  }
  return {
    archive: parseIntStrict(parts[0]),
    record: parseIntStrict(parts[1]),
    caption: block[1],
    gender: block[2],
    unknown2: parseIntStrict(block[3]),
    unknown3: parseIntStrict(block[4]),
    faceIndex: parseIntStrict(block[5]),
  };
}

function parseIntStrict(value) {
  const s = String(value).trim();
  if (!/^[+-]?\d+$/.test(s)) throw new Error(`FLATS.CFG: "${value}" is not an integer`);
  return Number(s);
}

export const flatGender = (gender) => {
  const g = String(gender ?? '').replace(/^\?/, '');
  return g === '2' ? 'female' : g === '1' ? 'male' : null;
};
export const flatCensored = (gender) => String(gender ?? '').startsWith('?');
