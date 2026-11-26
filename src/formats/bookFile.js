
import { RSC, readTokens } from './textRsc.js';
import { srand, randomRangeInclusive } from './dfRandom.js';

const NAUGHTY = 'naughty';

export function messageToBookFilename(message) {
  const decodedValue = message & 0xff;
  return 'BOK' + String(decodedValue).padStart(5, '0') + '.TXT';
}

function readCString(bytes, offset, length) {
  let end = offset;
  const stop = Math.min(offset + length, bytes.length);
  while (end < stop && bytes[end] !== 0) end++;
  let s = '';
  for (let i = offset; i < end; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

export class BookFile {
  constructor() {
    this.title = '';
    this.author = '';
    this.isNaughty = false;
    this.price = 0;
    this.pageCount = 0;
    this.pageOffsets = [];
    this._bytes = null;
  }

  load(bytes, name = 'BOK00000.TXT') {
    this._bytes = bytes;
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const need = (pos, n, what) => {
      if (pos + n > bytes.length) throw new Error(`BookFile: truncated reading ${what}`);
    };
    need(0, 64 + 64 + 8 + 88 + 4 + 6 + 2, 'the header');
    this.title = readCString(bytes, 0, 64);
    this.author = readCString(bytes, 64, 64);
    this.isNaughty = readCString(bytes, 128, 8) === NAUGHTY;
    this.price = v.getUint32(224, true);
    this.pageCount = v.getUint16(234, true);
    this.pageOffsets = [];
    let pos = 236;
    for (let i = 0; i < this.pageCount; i++) {
      need(pos, 4, `page offset ${i} of ${this.pageCount}`);
      this.pageOffsets.push(v.getUint32(pos, true));
      pos += 4;
    }
    if (/^BOK/i.test(name)) {
      // Classic books ignore the header price: DFRandom is seeded with the first u32 (the start of the title) and
      // rolls 300 to 800 inclusive, as DFU does.
      srand(v.getUint32(0, true));
      this.price = randomRangeInclusive(300, 800);
    }
    return true;
  }

  getPageTokens(page) {
    if (page < 0 || page >= this.pageCount) throw new Error('BookFile: Invalid page index.');
    return readTokens(this._bytes, this.pageOffsets[page], RSC.EndOfPage);
  }
}
