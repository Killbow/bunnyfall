
import { rand } from './dfRandom.js';
import { INTERNAL_RSC } from './rscTable.js';
import { tryGetLocalizedText, currentLocale, TextCollections, BASE_LOCALE } from '../ui/textManager.js';

export const RSC = Object.freeze({
  NewLine: 0x00, EndOfPage: 0xf6, InputCursorPositioner: 0xf8,
  FontPrefix: 0xf9, PositionPrefix: 0xfb, JustifyLeft: 0xfc,
  JustifyCenter: 0xfd, EndOfRecord: 0xfe, SubrecordSeparator: 0xff,
  FirstCharacter: 0x20, LastCharacter: 0x7f,
});

// A `dfRand` pick draws from the classic random stream and consumes a value later draws depend on; readers use its
// integer result directly to avoid float rounding.
export function dfRandPick(n) { return rand() % n; }
dfRandPick.dfRand = true;

function variantIndex(pick, n) {
  if (pick?.dfRand) return ((pick(n) % n) + n) % n;
  return Math.min(n - 1, Math.floor(pick() * n));
}

export function encodeRscRecord(variants) {
  const out = [];
  (variants ?? []).forEach((v, i) => {
    if (i > 0) out.push(RSC.SubrecordSeparator);
    for (const ch of String(v ?? '')) {
      if (ch === '\n') { out.push(RSC.NewLine); continue; }
      const c = ch.charCodeAt(0);
      out.push(c >= RSC.FirstCharacter && c <= RSC.LastCharacter ? c : 0x3f);
    }
  });
  out.push(RSC.EndOfRecord);
  return Uint8Array.from(out);
}

export function rscTableBytes(table = INTERNAL_RSC) {
  const m = new Map();
  if (!table) return m;
  for (const [id, variants] of Object.entries(table)) m.set(Number(id), encodeRscRecord(variants));
  return m;
}

export const TOKEN_TEXT = -1;
const BREAKS = new Set([RSC.NewLine, RSC.JustifyLeft, RSC.JustifyCenter]);
export function readTokens(buffer, position, endToken) {
  if (!buffer || buffer.length === 0) return null;
  const tokens = [];
  while (position < buffer.length) {
    const nextByte = buffer[position];
    if (nextByte === endToken) break;
    if (nextByte >= RSC.FirstCharacter && nextByte <= RSC.LastCharacter) {
      const start = position;
      let count = 0;
      while (position < buffer.length) {
        const b = buffer[position++];
        if (b >= RSC.FirstCharacter && b <= RSC.LastCharacter) count++;
        else break;
      }
      tokens.push({ formatting: TOKEN_TEXT, text: latin1(buffer, start, count), x: 0, y: 0 });
      position = start + count;
    } else {
      const formatting = buffer[position++];
      let x = 0;
      if (formatting === RSC.FontPrefix) {
        x = buffer[position++];
      } else if (formatting === RSC.PositionPrefix) {
        if (position < buffer.length) { x = buffer[position]; position++; }
      }
      tokens.push({ formatting, text: '', x, y: 0 });
    }
  }
  return tokens;
}

const latin1 = (buf, start, count) => {
  let s = '';
  for (let i = 0; i < count; i++) s += String.fromCharCode(buf[start + i]);
  return s;
};

// Operand bytes after FontPrefix and PositionPrefix are skipped, so an 0xFF operand is not read as a separator.
function variantRanges(raw) {
  const ranges = [];
  let start = 0;
  let i = 0;
  for (; i < raw.length; i++) {
    const b = raw[i];
    if (b === RSC.EndOfRecord) break;
    if (b === RSC.SubrecordSeparator) { ranges.push([start, i]); start = i + 1; continue; }
    if (b === RSC.FontPrefix || b === RSC.PositionPrefix) i++;
  }
  ranges.push([start, i]);
  return ranges;
}

// Translated `Internal_RSC` rows are markup text read into tokens, because letters such as 'ü' (0xFC) collide with
// control bytes. English reads only the file and rscTable.js.

const IMPORT_FORMAT = Object.freeze({ '[/left]': RSC.JustifyLeft, '[/center]': RSC.JustifyCenter, '[/newline]': RSC.NewLine, '[/record]': RSC.SubrecordSeparator, '[/input]': RSC.InputCursorPositioner, '[/end]': RSC.EndOfRecord });
export const RSC_CUSTOM = Object.freeze({ Color: 0x100, Scale: 0x101, Image: 0x102 });
const token = (formatting, text = '', x = 0, y = 0) => ({ formatting, text, x, y });
function prefixedToken(m) {
  let g;
  if (m.startsWith('[/pos')) return (g = /pos:x=(\d+),y=(\d+)/.exec(m)) ? token(RSC.PositionPrefix, '', Number(g[1]), Number(g[2])) : token(TOKEN_TEXT, m);
  if (m.startsWith('[/font')) return (g = /font=(\d+)/.exec(m)) ? token(RSC.FontPrefix, '', Number(g[1])) : token(TOKEN_TEXT, m);
  if (m.startsWith('[/color')) return (g = /color=([0-9a-f]{6})/.exec(m)) ? token(RSC_CUSTOM.Color, g[1]) : token(TOKEN_TEXT, m);
  if (m.startsWith('[/scale')) return (g = /scale=([+-]?([0-9]*[.])?[0-9]+)/.exec(m)) ? token(RSC_CUSTOM.Scale, g[1]) : token(TOKEN_TEXT, m);
  if (m.startsWith('[/image')) return (g = /\[\/image=(.*)\]/.exec(m)) ? token(RSC_CUSTOM.Image, g[1]) : token(TOKEN_TEXT, m);
  return token(TOKEN_TEXT, m);
}
export function markupTokens(input) {
  const s = String(input ?? '');
  const tokens = [];
  let text = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\n') continue;
    if (s[i] === '[' && s[i + 1] === '/') {
      const end = s.indexOf(']', i + 2);
      if (end > i) {
        if (text) { tokens.push(token(TOKEN_TEXT, text)); text = ''; }
        const m = s.slice(i, end + 1);
        tokens.push(Object.hasOwn(IMPORT_FORMAT, m) ? token(IMPORT_FORMAT[m]) : prefixedToken(m));
        i = end;
        continue;
      }
    }
    text += s[i];
  }
  if (text) tokens.push(token(TOKEN_TEXT, text));
  return tokens;
}

export function localeRscRow(key) {
  return currentLocale() === BASE_LOCALE ? undefined : tryGetLocalizedText(TextCollections.TextRSC, String(key));
}

function tokenVariants(tokens) {
  const out = [[]];
  for (const t of tokens) {
    if (t.formatting === RSC.EndOfRecord) break;
    if (t.formatting === RSC.SubrecordSeparator) { out.push([]); continue; }
    out[out.length - 1].push(t);
  }
  return out;
}

export class TextRsc {
  // Rows in `table` override TEXT.RSC records with the same id; pass `{ table: null }` to read the file alone.
  load(bytes, { table = INTERNAL_RSC } = {}) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const headerLength = v.getUint16(0, true);
    const count = Math.floor(headerLength / 6) - 1;
    this._bytes = bytes;
    this._byId = new Map();
    this._table = rscTableBytes(table);
    let o = 2;
    for (let i = 0; i < count; i++) {
      const id = v.getUint16(o, true);
      const offset = v.getUint32(o + 2, true);
      o += 6;
      this._byId.set(id, offset);
    }
    return this;
  }

  get recordCount() { return this._byId.size; }
  hasRecord(id) { return localeRscRow(id) !== undefined || this._table.has(id) || this._byId.has(id); }

  _localeTokens(key) {
    const row = localeRscRow(key);
    return row === undefined ? null : markupTokens(row);
  }
  localeTokensByKey(key) { return this._localeTokens(key); }

  bytesById(id) {
    const row = this._table.get(id);
    if (row) return row;
    const offset = this._byId.get(id);
    if (offset === undefined) return null;
    let end = offset;
    while (end < this._bytes.length && this._bytes[end] !== RSC.EndOfRecord) end++;
    return this._bytes.subarray(offset, Math.min(end + 1, this._bytes.length));
  }

  plainText(id) {
    const loc = this._localeTokens(id);
    if (loc) return tokenVariants(loc).map((v) => v.map((t) => (t.formatting === TOKEN_TEXT ? t.text : BREAKS.has(t.formatting) ? '\n' : '')).join(''));
    const raw = this.bytesById(id);
    if (!raw) return null;
    return variantRanges(raw).map(([start, end]) => {
      let cur = '';
      for (let i = start; i < end; i++) {
        const b = raw[i];
        if (b === RSC.NewLine || b === RSC.JustifyLeft || b === RSC.JustifyCenter) { cur += '\n'; continue; }
        if (b === RSC.FontPrefix || b === RSC.PositionPrefix) { i++; continue; }
        if (b >= RSC.FirstCharacter && b <= RSC.LastCharacter) { cur += String.fromCharCode(b); continue; }
      }
      return cur;
    });
  }

  // Unlike the variant readers, this picks one Text token from the whole record, so all variants and lines form one
  // pool.
  randomTextById(id, pick = Math.random) {
    const loc = this._localeTokens(id);
    const raw = loc ? null : this.bytesById(id);
    if (!loc && !raw) return '';
    const tokens = loc ? tokenVariants(loc).flat() : readTokens(raw, 0, RSC.EndOfRecord) ?? [];
    const items = tokens.filter((t) => t.formatting === TOKEN_TEXT).map((t) => t.text);
    if (items.length === 0) return '';
    return items[Math.floor(pick() * items.length)];
  }

  variantLinesById(id, pick = Math.random) {
    const n = this.variantCount(id);
    if (n === 0) return [];
    // A one-variant record still draws from `pick`, as classic does, so the classic random stream stays in step.
    const want = variantIndex(pick, n);
    // When the picked variant has no tokens, the previous variant is shown, as classic does. The check counts
    // tokens, not the trimmed rows from `linesById`.
    if (want > 0 && !this._variantTokens(id, want).length) return this.linesById(id, want - 1);
    return this.linesById(id, want);
  }

  variantCount(id) {
    const loc = this._localeTokens(id);
    if (loc) return tokenVariants(loc).length;
    const raw = this.bytesById(id);
    return raw ? variantRanges(raw).length : 0;
  }

  variantTokensById(id, pick = Math.random) {
    const loc = this._localeTokens(id);
    if (loc) {
      const variants = tokenVariants(loc);
      const want = variantIndex(pick, variants.length);
      return !variants[want].length && want > 0 ? variants[want - 1] : variants[want];
    }
    const raw = this.bytesById(id);
    if (!raw) return [];
    const ranges = variantRanges(raw);
    const want = variantIndex(pick, ranges.length);
    let tokens = readTokens(raw.slice(ranges[want][0], ranges[want][1]), 0, RSC.EndOfRecord) ?? [];
    if (!tokens.length && want > 0) tokens = readTokens(raw.slice(ranges[want - 1][0], ranges[want - 1][1]), 0, RSC.EndOfRecord) ?? [];
    return tokens;
  }

  // Returns the whole record with no variant draw, so it consumes no random value.
  tokensById(id) {
    const loc = this._localeTokens(id);
    if (loc) { const end = loc.findIndex((t) => t.formatting === RSC.EndOfRecord); return end < 0 ? loc : loc.slice(0, end); }
    const raw = this.bytesById(id);
    if (!raw) return [];
    return readTokens(raw, 0, RSC.EndOfRecord) ?? [];
  }

  _variantTokens(id, index) {
    const loc = this._localeTokens(id);
    if (loc) return tokenVariants(loc)[index] ?? [];
    const raw = this.bytesById(id);
    if (!raw) return [];
    const ranges = variantRanges(raw);
    const r = ranges[index];
    if (!r) return [];
    return readTokens(raw.slice(r[0], r[1]), 0, RSC.EndOfRecord) ?? [];
  }

  linesById(id, variant = 0) {
    const loc = this._localeTokens(id);
    if (loc) {
      const v = tokenVariants(loc)[variant];
      if (!v) return [];
      const rows = [];
      let cur = '';
      for (const t of v) {
        if (BREAKS.has(t.formatting)) { rows.push({ text: cur, center: t.formatting === RSC.JustifyCenter }); cur = ''; continue; }
        if (t.formatting === TOKEN_TEXT) cur += t.text;
      }
      if (cur) rows.push({ text: cur, center: false });
      while (rows.length && rows[rows.length - 1].text === '') rows.pop();
      return rows;
    }
    const raw = this.bytesById(id);
    if (!raw) return [];
    const r = variantRanges(raw)[variant];
    if (!r) return [];
    const rows = [];
    let cur = '';
    for (let i = r[0]; i < r[1]; i++) {
      const b = raw[i];
      if (b === RSC.NewLine || b === RSC.JustifyLeft || b === RSC.JustifyCenter) {
        rows.push({ text: cur, center: b === RSC.JustifyCenter });
        cur = '';
        continue;
      }
      if (b === RSC.FontPrefix || b === RSC.PositionPrefix) { i++; continue; }
      if (b >= RSC.FirstCharacter && b <= RSC.LastCharacter) cur += String.fromCharCode(b);
    }
    if (cur) rows.push({ text: cur, center: false });
    while (rows.length && rows[rows.length - 1].text === '') rows.pop();
    return rows;
  }
}
