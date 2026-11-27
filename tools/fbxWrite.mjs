// Writes binary FBX from { name, props, children } nodes; arrays are written raw, so the bytes depend only on the
// numbers.

import { FBX_MAGIC } from './fbxRead.mjs';
import { FOOT_ID, FOOT_MAGIC } from './fbxStrip.mjs';

export const S = (v) => ({ t: 'S', v });
export const D = (v) => ({ t: 'D', v });
export const I = (v) => ({ t: 'I', v });
export const L = (v) => ({ t: 'L', v });
export const dArr = (v) => ({ t: 'd', v });
export const iArr = (v) => ({ t: 'i', v });

export function encodeProp(p) {
  const head = Buffer.from(p.t, 'latin1');
  if (p.t === 'S') {
    const s = Buffer.from(p.v, 'latin1');
    const n = Buffer.alloc(4); n.writeUInt32LE(s.length);
    return Buffer.concat([head, n, s]);
  }
  if (p.t === 'D') { const b = Buffer.alloc(8); b.writeDoubleLE(p.v); return Buffer.concat([head, b]); }
  if (p.t === 'I') { const b = Buffer.alloc(4); b.writeInt32LE(p.v); return Buffer.concat([head, b]); }
  if (p.t === 'L') { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(p.v)); return Buffer.concat([head, b]); }
  if (p.t !== 'd' && p.t !== 'i') throw new Error(`fbxWrite: no writer for property type ${JSON.stringify(p.t)}`);
  const wide = p.t === 'd';
  const body = Buffer.alloc(p.v.length * (wide ? 8 : 4));
  p.v.forEach((x, i) => (wide ? body.writeDoubleLE(x, i * 8) : body.writeInt32LE(x, i * 4)));
  const meta = Buffer.alloc(12);
  meta.writeUInt32LE(p.v.length, 0); meta.writeUInt32LE(0, 4); meta.writeUInt32LE(body.length, 8);
  return Buffer.concat([head, meta, body]);
}

// endOffset is absolute, so each node is written at a known start offset rather than bottom-up.
export function encodeNode(node, start) {
  const name = Buffer.from(node.name, 'latin1');
  const props = (node.props ?? []).map(encodeProp);
  const propBytes = Buffer.concat(props);
  const headLen = 13 + name.length;
  let at = start + headLen + propBytes.length;
  const kids = [];
  for (const c of node.children ?? []) { const b = encodeNode(c, at); kids.push(b); at += b.length; }
  if (kids.length) at += 13;
  const head = Buffer.alloc(headLen);
  head.writeUInt32LE(at, 0);
  head.writeUInt32LE(props.length, 4);
  head.writeUInt32LE(propBytes.length, 8);
  head.writeUInt8(name.length, 12);
  name.copy(head, 13);
  return Buffer.concat([head, propBytes, ...kids, ...(kids.length ? [Buffer.alloc(13)] : [])]);
}

export function writeFbx(roots, version = 7400, { blender = false } = {}) {
  const header = Buffer.alloc(27);
  header.write(FBX_MAGIC, 0, 'latin1');
  header.writeUInt8(0x1a, 20); header.writeUInt8(0x00, 21);
  header.writeUInt32LE(version, 23);
  const out = [header];
  let at = header.length;
  for (const r of roots) { const b = encodeNode(r, at); out.push(b); at += b.length; }
  out.push(Buffer.alloc(13));
  at += 13;
  if (blender) {
    out.push(FOOT_ID, Buffer.alloc(4));
    at += 20;
    let pad = ((at + 15) & ~15) - at;
    if (pad === 0) pad = 16;
    const v = Buffer.alloc(4); v.writeUInt32LE(version, 0);
    out.push(Buffer.alloc(pad), v, Buffer.alloc(120), FOOT_MAGIC);
  }
  return Buffer.concat(out);
}
