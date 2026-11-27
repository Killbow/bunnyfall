// Mod archives can be hundreds of megabytes, so neither reader loads one whole. Zip entries are read by range, and
// a 7z folder is decoded a window at a time and cut into the wanted files.

import { lzmaDecoder, lzma2Decoder } from './lzma.js';

const u16 = (dv, o) => dv.getUint16(o, true);
const u32 = (dv, o) => dv.getUint32(o, true);
const u64 = (dv, o) => dv.getUint32(o, true) + dv.getUint32(o + 4, true) * 2 ** 32;
const bytesOf = async (blob, start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer());
const nextFrame = () => new Promise((r) => setTimeout(r, 0));

export async function archiveKind(blob) {
  const h = await bytesOf(blob, 0, 6);
  if (h[0] === 0x50 && h[1] === 0x4B) return 'zip';
  if (h[0] === 0x37 && h[1] === 0x7A && h[2] === 0xBC && h[3] === 0xAF && h[4] === 0x27 && h[5] === 0x1C) return '7z';
  return null;
}

export async function readArchive(blob, { onProgress = null } = {}) {
  const kind = await archiveKind(blob);
  if (kind === 'zip') return readZipArchive(blob);
  if (kind === '7z') return read7zArchive(blob, { onProgress });
  throw new Error('that is not a .zip or a .7z file');
}

export async function readZipArchive(blob) {
  const tailLen = Math.min(blob.size, 22 + 65535);
  const tailStart = blob.size - tailLen;
  const tail = await bytesOf(blob, tailStart, blob.size);
  const tdv = new DataView(tail.buffer);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (u32(tdv, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('that zip is damaged (no directory at its end)');
  let count = u16(tdv, eocd + 10);
  let dirSize = u32(tdv, eocd + 12);
  let dirOff = u32(tdv, eocd + 16);
  if ((count === 0xFFFF || dirOff === 0xFFFFFFFF || dirSize === 0xFFFFFFFF) && eocd >= 20 && u32(tdv, eocd - 20) === 0x07064b50) {
    const z64 = u64(tdv, eocd - 20 + 8);
    const rec = await bytesOf(blob, z64, z64 + 56);
    const rdv = new DataView(rec.buffer);
    if (u32(rdv, 0) !== 0x06064b50) throw new Error('that zip is damaged (bad zip64 record)');
    count = u64(rdv, 32);
    dirSize = u64(rdv, 40);
    dirOff = u64(rdv, 48);
  }
  const dir = await bytesOf(blob, dirOff, dirOff + dirSize);
  const dv = new DataView(dir.buffer);
  const out = [];
  let off = 0;
  for (let i = 0; i < count; i++) {
    if (u32(dv, off) !== 0x02014b50) throw new Error('that zip is damaged (bad directory)');
    const flags = u16(dv, off + 8);
    const method = u16(dv, off + 10);
    let compSize = u32(dv, off + 20);
    let size = u32(dv, off + 24);
    const nameLen = u16(dv, off + 28);
    const extraLen = u16(dv, off + 30);
    const commentLen = u16(dv, off + 32);
    let localOff = u32(dv, off + 42);
    const name = new TextDecoder(flags & 0x800 ? 'utf-8' : 'latin1').decode(dir.subarray(off + 46, off + 46 + nameLen)).replace(/\\/g, '/');
    let e = off + 46 + nameLen;
    const eEnd = e + extraLen;
    while (e + 4 <= eEnd) {
      const id = u16(dv, e), len = u16(dv, e + 2);
      if (id === 0x0001) {
        let p = e + 4;
        if (size === 0xFFFFFFFF) { size = u64(dv, p); p += 8; }
        if (compSize === 0xFFFFFFFF) { compSize = u64(dv, p); p += 8; }
        if (localOff === 0xFFFFFFFF) { localOff = u64(dv, p); p += 8; }
      }
      e += 4 + len;
    }
    off += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    out.push({
      name, size,
      blob: async () => {
        if (flags & 1) throw new Error(`${name} is encrypted in the zip`);
        const lh = await bytesOf(blob, localOff, localOff + 30);
        const ldv = new DataView(lh.buffer);
        if (u32(ldv, 0) !== 0x04034b50) throw new Error(`${name}: the zip is damaged`);
        const start = localOff + 30 + u16(ldv, 26) + u16(ldv, 28);
        const raw = blob.slice(start, start + compSize);
        if (method === 0) return raw;
        if (method === 8) return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
        throw new Error(`${name} uses a zip compression this game cannot open (method ${method}) - re-zip it with normal settings`);
      },
    });
  }
  return out;
}

const K = Object.freeze({
  End: 0x00, Header: 0x01, ArchiveProperties: 0x02, AdditionalStreamsInfo: 0x03, MainStreamsInfo: 0x04, FilesInfo: 0x05,
  PackInfo: 0x06, UnPackInfo: 0x07, SubStreamsInfo: 0x08, Size: 0x09, CRC: 0x0A, Folder: 0x0B, CodersUnPackSize: 0x0C,
  NumUnPackStream: 0x0D, EmptyStream: 0x0E, EmptyFile: 0x0F, Name: 0x11, Dummy: 0x19, EncodedHeader: 0x17,
});
const METHOD = Object.freeze({ Copy: '00', LZMA: '030101', LZMA2: '21' });

class Bytes {
  constructor(buf) { this.buf = buf; this.pos = 0; }
  byte() { if (this.pos >= this.buf.length) throw new Error('that 7z is damaged (header ends early)'); return this.buf[this.pos++]; }
  number() {
    const first = this.byte();
    let mask = 0x80, value = 0;
    for (let i = 0; i < 8; i++) {
      if ((first & mask) === 0) return value + (first & (mask - 1)) * 2 ** (8 * i);
      value += this.byte() * 2 ** (8 * i);
      mask >>>= 1;
    }
    return value;
  }
  u32() { const b = this.buf, p = this.pos; this.pos += 4; return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0; }
  take(n) { const s = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return s; }
  bits(n) {
    const out = new Array(n);
    let mask = 0, b = 0;
    for (let i = 0; i < n; i++) {
      if (mask === 0) { b = this.byte(); mask = 0x80; }
      out[i] = (b & mask) !== 0;
      mask >>>= 1;
    }
    return out;
  }
  defined(n) { const all = this.byte(); return all ? new Array(n).fill(true) : this.bits(n); }
}

function readDigests(r, n) {
  const def = r.defined(n);
  for (let i = 0; i < n; i++) if (def[i]) r.u32();
  return def;
}

function readFolder(r) {
  const coders = [];
  const numCoders = r.number();
  let totalIn = 0, totalOut = 0;
  for (let i = 0; i < numCoders; i++) {
    const flags = r.byte();
    const id = [...r.take(flags & 0x0F)].map((x) => x.toString(16).padStart(2, '0')).join('');
    let nIn = 1, nOut = 1;
    if (flags & 0x10) { nIn = r.number(); nOut = r.number(); }
    const props = (flags & 0x20) ? r.take(r.number()).slice() : new Uint8Array(0);
    coders.push({ id, nIn, nOut, props });
    totalIn += nIn; totalOut += nOut;
  }
  const bindPairs = totalOut - 1;
  for (let i = 0; i < bindPairs; i++) { r.number(); r.number(); }
  const packed = totalIn - bindPairs;
  if (packed > 1) for (let i = 0; i < packed; i++) r.number();
  return { coders, totalOut, packedStreams: packed, unpackSizes: [] };
}

function readStreamsInfo(r) {
  const info = { packPos: 0, packSizes: [], folders: [], folderCrc: null, subCounts: null, subSizes: null };
  for (;;) {
    const id = r.byte();
    if (id === K.End) break;
    if (id === K.PackInfo) {
      info.packPos = r.number();
      const n = r.number();
      for (;;) {
        const t = r.byte();
        if (t === K.End) break;
        if (t === K.Size) for (let i = 0; i < n; i++) info.packSizes.push(r.number());
        else if (t === K.CRC) readDigests(r, n);
        else throw new Error('that 7z is damaged (pack info)');
      }
    } else if (id === K.UnPackInfo) {
      if (r.byte() !== K.Folder) throw new Error('that 7z is damaged (no folders)');
      const n = r.number();
      if (r.byte() !== 0) throw new Error('that 7z keeps its folders elsewhere, which this game cannot read');
      for (let i = 0; i < n; i++) info.folders.push(readFolder(r));
      if (r.byte() !== K.CodersUnPackSize) throw new Error('that 7z is damaged (no sizes)');
      for (const f of info.folders) for (let i = 0; i < f.totalOut; i++) f.unpackSizes.push(r.number());
      for (;;) {
        const t = r.byte();
        if (t === K.End) break;
        if (t === K.CRC) info.folderCrc = readDigests(r, info.folders.length);
        else throw new Error('that 7z is damaged (unpack info)');
      }
    } else if (id === K.SubStreamsInfo) {
      const counts = info.folders.map(() => 1);
      let t = r.byte();
      if (t === K.NumUnPackStream) { for (let i = 0; i < counts.length; i++) counts[i] = r.number(); t = r.byte(); }
      const sizes = [];
      const hasSizes = t === K.Size;
      info.folders.forEach((f, fi) => {
        const total = f.unpackSizes[f.unpackSizes.length - 1];
        const n = counts[fi];
        if (n === 0) return;
        let sum = 0;
        const own = [];
        for (let i = 0; i < n - 1; i++) { const s = hasSizes ? r.number() : 0; own.push(s); sum += s; }
        own.push(total - sum);
        sizes.push(own);
      });
      if (hasSizes) t = r.byte();
      while (t !== K.End) {
        if (t === K.CRC) {
          // A folder with one stream whose CRC the folder record already gives has no digest here.
          let unknown = 0;
          counts.forEach((n, i) => { if (!(n === 1 && info.folderCrc?.[i])) unknown += n; });
          readDigests(r, unknown);
        } else throw new Error('that 7z is damaged (substreams)');
        t = r.byte();
      }
      info.subCounts = counts;
      info.subSizes = sizes;
    } else throw new Error('that 7z is damaged (streams info)');
  }
  if (!info.subCounts) {
    info.subCounts = info.folders.map(() => 1);
    info.subSizes = info.folders.map((f) => [f.unpackSizes[f.unpackSizes.length - 1]]);
  }
  return info;
}

export function bcjX86Decode(buf) {
  const allowed = [true, true, true, false, true, false, false, false];
  const bitNum = [0, 1, 2, 2, 3, 3, 3, 3];
  const msb = (b) => b === 0x00 || b === 0xFF;
  if (buf.length <= 4) return buf;
  const size = buf.length - 4;
  let prevPos = -1, prevMask = 0;
  for (let i = 0; i < size; i++) {
    if ((buf[i] & 0xFE) !== 0xE8) continue;
    const gap = i - prevPos;
    if (gap > 3) prevMask = 0;
    else {
      prevMask = (prevMask << (gap - 1)) & 7;
      if (prevMask !== 0) {
        const b = buf[i + 4 - bitNum[prevMask]];
        if (!allowed[prevMask] || msb(b)) { prevPos = i; prevMask = (prevMask << 1) | 1; continue; }
      }
    }
    prevPos = i;
    if (msb(buf[i + 4])) {
      let src = (buf[i + 1] | (buf[i + 2] << 8) | (buf[i + 3] << 16) | (buf[i + 4] << 24)) >>> 0;
      let dest;
      for (;;) {
        dest = (src - (i + 5)) >>> 0;
        if (prevMask === 0) break;
        const j = bitNum[prevMask] * 8;
        if (!msb((dest >>> (24 - j)) & 0xFF)) break;
        src = (dest ^ (2 ** (32 - j) - 1)) >>> 0;
      }
      dest &= 0x01FFFFFF;
      if (dest & 0x01000000) dest |= 0xFE000000;
      buf[i + 1] = dest & 0xFF; buf[i + 2] = (dest >>> 8) & 0xFF; buf[i + 3] = (dest >>> 16) & 0xFF; buf[i + 4] = (dest >>> 24) & 0xFF;
      i += 4;
    } else prevMask = (prevMask << 1) | 1;
  }
  return buf;
}
const BCJ_X86 = '03030103';

async function decodeFolder(blob, folder, packStart, packSize, sink, onStep = null) {
  const coders = folder.coders;
  const bcj = coders.length === 2 && coders.some((c) => c.id === BCJ_X86);
  if (coders.length !== 1 && !bcj) throw new Error('that 7z uses a filter chain this game cannot read (re-pack it as plain LZMA2)');
  const coder = bcj ? coders.find((c) => c.id !== BCJ_X86) : coders[0];
  const size = folder.unpackSizes[coders.indexOf(coder)];
  const packed = await bytesOf(blob, packStart, packStart + packSize);
  if (bcj) {
    const parts = [];
    await decodeFolder(blob, { coders: [coder], unpackSizes: [size] }, packStart, packSize, (b) => parts.push(b), onStep);
    const whole = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { whole.set(p, at); at += p.length; }
    sink(bcjX86Decode(whole));
    return;
  }
  if (coder.id === METHOD.Copy) { sink(packed); return; }
  let dec;
  if (coder.id === METHOD.LZMA2) dec = lzma2Decoder(coder.props, packed, size, sink);
  else if (coder.id === METHOD.LZMA) dec = lzmaDecoder(coder.props, packed, size, sink);
  else if (coder.id.startsWith('06f107')) throw new Error('that 7z is password-protected');
  else throw new Error(`that 7z uses a compression this game cannot read (${coder.id}) - re-pack it as LZMA2 or zip it`);
  while (!dec.done) {
    dec.step(4 << 20);
    onStep?.(dec.total, size);
    await nextFrame();
  }
}

function folderPackStarts(info) {
  const starts = [];
  let at = 32 + info.packPos, s = 0;
  for (const f of info.folders) {
    starts.push({ start: at, size: info.packSizes[s] });
    for (let i = 0; i < f.packedStreams; i++) at += info.packSizes[s++];
  }
  return starts;
}

async function readFolderWhole(blob, info, fi) {
  const parts = [];
  const { start, size } = folderPackStarts(info)[fi];
  await decodeFolder(blob, info.folders[fi], start, size, (b) => parts.push(b));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export async function read7zArchive(blob, { onProgress = null } = {}) {
  const sig = await bytesOf(blob, 0, 32);
  const sdv = new DataView(sig.buffer);
  const nextOff = u64(sdv, 12), nextSize = u64(sdv, 20);
  if (!nextSize) return [];
  let header = await bytesOf(blob, 32 + nextOff, 32 + nextOff + nextSize);
  let r = new Bytes(header);
  let id = r.byte();
  while (id === K.EncodedHeader) {
    const info = readStreamsInfo(r);
    header = await readFolderWhole(blob, info, 0);
    r = new Bytes(header);
    id = r.byte();
  }
  if (id !== K.Header) throw new Error('that 7z is damaged (no header)');
  let streams = null;
  let files = [];
  for (;;) {
    const t = r.byte();
    if (t === K.End) break;
    if (t === K.ArchiveProperties) { for (let p = r.byte(); p !== 0; p = r.byte()) r.take(r.number()); continue; }
    if (t === K.AdditionalStreamsInfo) { readStreamsInfo(r); continue; }
    if (t === K.MainStreamsInfo) { streams = readStreamsInfo(r); continue; }
    if (t === K.FilesInfo) { files = readFilesInfo(r); continue; }
    throw new Error('that 7z is damaged (header)');
  }
  const out = [];
  const byFolder = new Map();
  let fi = 0, sub = 0;
  for (const f of files) {
    if (f.dir) continue;
    if (!f.hasStream) { out.push({ name: f.name, size: 0, blob: async () => new Blob([]) }); continue; }
    if (!streams) throw new Error('that 7z is damaged (files without data)');
    while (fi < streams.folders.length && sub >= streams.subCounts[fi]) { fi++; sub = 0; }
    if (fi >= streams.folders.length) throw new Error('that 7z is damaged (more files than data)');
    const sizes = streams.subSizes[fi];
    const offset = sizes.slice(0, sub).reduce((a, b) => a + b, 0);
    const size = sizes[sub];
    const entry = { name: f.name, size, folder: fi, offset };
    if (!byFolder.has(fi)) byFolder.set(fi, []);
    byFolder.get(fi).push(entry);
    out.push(entry);
    sub++;
  }
  const starts = streams ? folderPackStarts(streams) : [];
  const wanted = new Set();
  const decoded = new Map();
  const decode = (folder) => {
    if (!decoded.has(folder)) {
      decoded.set(folder, (async () => {
        const list = byFolder.get(folder).filter((e) => wanted.has(e));
        const parts = new Map(list.map((e) => [e, []]));
        let at = 0;
        const sink = (bytes) => {
          const end = at + bytes.length;
          for (const e of list) {
            const s = Math.max(at, e.offset), t = Math.min(end, e.offset + e.size);
            if (s < t) parts.get(e).push(bytes.slice(s - at, t - at));
          }
          at = end;
        };
        const { start, size } = starts[folder];
        await decodeFolder(blob, streams.folders[folder], start, size, sink, onProgress);
        return new Map(list.map((e) => [e, new Blob(parts.get(e))]));
      })());
    }
    return decoded.get(folder);
  };
  for (const e of out) {
    if (e.blob) continue;
    e.blob = async () => {
      if (!wanted.has(e)) {
        wanted.add(e);
        if (decoded.has(e.folder)) decoded.delete(e.folder);
      }
      const got = (await decode(e.folder)).get(e);
      if (!got) { decoded.delete(e.folder); return (await decode(e.folder)).get(e); }
      return got;
    };
    // Call `want` for every needed file before the first `blob()`; a file asked for after its folder decoded forces
    // a second decode.
    e.want = () => wanted.add(e);
  }
  return out.map(({ name, size, blob: b, want }) => ({ name, size, blob: b, want }));
}

function readFilesInfo(r) {
  const n = r.number();
  const files = Array.from({ length: n }, () => ({ name: '', hasStream: true, dir: false }));
  let empty = null, emptyFile = null;
  for (;;) {
    const t = r.byte();
    if (t === K.End) break;
    const size = r.number();
    const end = r.pos + size;
    if (t === K.EmptyStream) empty = r.bits(n);
    else if (t === K.EmptyFile) emptyFile = r.bits(empty ? empty.filter(Boolean).length : 0);
    else if (t === K.Name) {
      if (r.byte() !== 0) throw new Error('that 7z keeps its file names elsewhere, which this game cannot read');
      const bytes = r.buf.subarray(r.pos, end);
      let i = 0;
      for (const f of files) {
        let s = '';
        for (;;) {
          const c = bytes[i] | (bytes[i + 1] << 8);
          i += 2;
          if (c === 0) break;
          s += String.fromCharCode(c);
        }
        f.name = s.replace(/\\/g, '/');
      }
    }
    r.pos = end;
  }
  if (empty) {
    let k = 0;
    files.forEach((f, i) => {
      if (!empty[i]) return;
      f.hasStream = false;
      f.dir = !(emptyFile?.[k] ?? false);
      k++;
    });
  }
  return files;
}
