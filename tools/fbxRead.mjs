// Reads binary FBX (versions 7000 to 7999) into a tree of { name, props, children }; ASCII FBX is refused by name.
import { inflateSync } from 'node:zlib';

const SCALAR = {
  Y: [2, (b, o) => b.readInt16LE(o)],
  C: [1, (b, o) => !!b.readUInt8(o)],
  I: [4, (b, o) => b.readInt32LE(o)],
  F: [4, (b, o) => b.readFloatLE(o)],
  D: [8, (b, o) => b.readDoubleLE(o)],
  L: [8, (b, o) => b.readBigInt64LE(o)],
};

const ARRAY = {
  f: [4, (b, o) => b.readFloatLE(o)],
  d: [8, (b, o) => b.readDoubleLE(o)],
  l: [8, (b, o) => b.readBigInt64LE(o)],
  i: [4, (b, o) => b.readInt32LE(o)],
  b: [1, (b, o) => !!b.readUInt8(o)],
  c: [1, (b, o) => b.readUInt8(o)],
};

export const FBX_MAGIC = 'Kaydara FBX Binary  ';

export function readFbx(buf) {
  const magic = buf.toString('latin1', 0, FBX_MAGIC.length);
  if (magic !== FBX_MAGIC) {
    const ascii = buf.toString('latin1', 0, 64);
    throw new Error(/^;\s*FBX/.test(ascii)
      ? 'this is an ASCII FBX; re-export from Blender with "Binary" format (this reader is the binary container only)'
      : `not an FBX: expected ${JSON.stringify(FBX_MAGIC)}, got ${JSON.stringify(magic)}`);
  }
  const version = buf.readUInt32LE(23);
  // Version 7500 and later widen the three record-header integers from uint32 to uint64.
  const wide = version >= 7500;
  const HEAD = wide ? 25 : 13;
  const u = (o, i) => (wide ? Number(buf.readBigUInt64LE(o + i * 8)) : buf.readUInt32LE(o + i * 4));

  function readNode(off) {
    const end = u(off, 0);
    // A null record (13 or 25 zero bytes, end offset 0) ends a child list.
    if (end === 0) return null;
    const nProps = u(off, 1);
    let p = off + HEAD;
    const nameLen = buf.readUInt8(p - 1);
    const name = buf.toString('latin1', p, p + nameLen);
    p += nameLen;

    const props = [];
    for (let i = 0; i < nProps; i++) {
      const t = String.fromCharCode(buf.readUInt8(p));
      p += 1;
      if (SCALAR[t]) {
        const [w, rd] = SCALAR[t];
        props.push(rd(buf, p));
        p += w;
      } else if (t === 'S' || t === 'R') {
        const n = buf.readUInt32LE(p);
        p += 4;
        // S strings keep their embedded NULs: FBX writes a qualified name as "Name\0\x01Class".
        props.push(t === 'S' ? buf.toString('latin1', p, p + n) : Buffer.from(buf.subarray(p, p + n)));
        p += n;
      } else if (ARRAY[t]) {
        const count = buf.readUInt32LE(p);
        const encoding = buf.readUInt32LE(p + 4);
        const compressedLength = buf.readUInt32LE(p + 8);
        p += 12;
        let raw = buf.subarray(p, p + compressedLength);
        p += compressedLength;
        if (encoding === 1) raw = inflateSync(raw);
        else if (encoding !== 0) throw new Error(`FBX array encoding ${encoding} is not 0 (raw) or 1 (deflate)`);
        const [w, rd] = ARRAY[t];
        if (raw.length < count * w) throw new Error(`FBX array ${t} claims ${count} elements but carries ${raw.length} bytes`);
        const out = new Array(count);
        for (let k = 0; k < count; k++) out[k] = rd(raw, k * w);
        props.push(out);
      } else {
        // An unknown property type throws: records are a length-prefixed stream, so its width cannot be skipped.
        throw new Error(`unknown FBX property type ${JSON.stringify(t)} at byte ${p - 1}`);
      }
    }

    const children = [];
    while (p < end) {
      const child = readNode(p);
      if (!child) { p += HEAD; break; }
      children.push(child);
      p = child.__end;
    }
    return { name, props, children, __end: end };
  }

  const nodes = [];
  let p = 27;
  while (p < buf.length) {
    const n = readNode(p);
    if (!n) break;
    nodes.push(n);
    p = n.__end;
  }
  return { version, nodes };
}

export const childrenNamed = (node, name) =>
  (Array.isArray(node) ? node : node?.children ?? []).filter((c) => c.name === name);

export const childNamed = (node, name) => childrenNamed(node, name)[0] ?? null;

export function nodeAt(from, ...path) {
  let at = from;
  for (const name of path) {
    at = childNamed(at, name);
    if (!at) return null;
  }
  return at;
}

export const objectName = (s) => String(s ?? '').split('\0')[0];

export function property70(node, name) {
  const p70 = childNamed(node, 'Properties70');
  for (const row of childrenNamed(p70, 'P')) {
    if (row.props[0] === name) return row.props.slice(4);
  }
  return null;
}
