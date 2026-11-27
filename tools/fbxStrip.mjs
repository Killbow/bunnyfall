// Copies an FBX without the named objects (--drop) or one material's polygons (--cut), keeping every other byte.
// Run: node tools/fbxStrip.mjs <in.fbx> <out.fbx> [--drop=<Model>[,...]] [--cut=<Model>:<material>[,...]]
// Records are copied as raw bytes because decoded values lose their type codes. Only end offsets, Connections,
// Definitions counts, footer padding, and cut Geometry arrays are rewritten.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';
import { readFbx, childrenNamed, nodeAt, objectName } from './fbxRead.mjs';
import { isMain } from './lib/isMain.mjs';

export const FOOT_ID = Buffer.from('fabcab09d0c8d466b176fb831cf7267e', 'hex');
export const FOOT_MAGIC = Buffer.from('f85a8c6adef5d97eece90ce3758f290b', 'hex');

function rawRecords(buf) {
  const version = buf.readUInt32LE(23);
  const wide = version >= 7500;
  const HEAD = wide ? 25 : 13;
  const u = (o, i) => (wide ? Number(buf.readBigUInt64LE(o + i * 8)) : buf.readUInt32LE(o + i * 4));
  const isNull = (o) => { for (let k = 0; k < HEAD; k++) if (buf[o + k] !== 0) return false; return true; };
  function record(off) {
    const end = u(off, 0);
    const numProps = u(off, 1);
    const propLen = u(off, 2);
    const nameLen = buf.readUInt8(off + HEAD - 1);
    const name = buf.toString('latin1', off + HEAD, off + HEAD + nameLen);
    const pStart = off + HEAD + nameLen;
    const props = buf.subarray(pStart, pStart + propLen);
    const children = [];
    let p = pStart + propLen;
    let sentinel = false;
    while (p < end) {
      if (isNull(p)) { sentinel = true; p += HEAD; break; }
      const child = record(p);
      children.push(child);
      p = child.end;
    }
    if (p !== end) throw new Error(`record "${name}" at byte ${off} ends at ${end} but its contents end at ${p}`);
    return { name, numProps, props, children, sentinel, end };
  }
  const top = [];
  let p = 27;
  for (;;) {
    if (isNull(p)) { p += HEAD; break; }
    const r = record(p);
    top.push(r);
    p = r.end;
  }
  return { version, wide, HEAD, top, footerAt: p };
}

function pair(raw, decoded, path = '') {
  if (raw.length !== decoded.length) throw new Error(`${path || 'the file'}: ${raw.length} records read raw, ${decoded.length} decoded`);
  raw.forEach((r, i) => {
    const d = decoded[i];
    if (r.name !== d.name) throw new Error(`${path}/${i}: raw "${r.name}" against decoded "${d.name}"`);
    r.decoded = d;
    pair(r.children, d.children, `${path}/${r.name}`);
  });
}

const idKey = (v) => String(v);

const ARRAY_WRITE = {
  d: [8, (b, v, o) => b.writeDoubleLE(v, o)],
  f: [4, (b, v, o) => b.writeFloatLE(v, o)],
  i: [4, (b, v, o) => b.writeInt32LE(v, o)],
  l: [8, (b, v, o) => b.writeBigInt64LE(BigInt(v), o)],
};

function arrayProps(rec, values) {
  const t = String.fromCharCode(rec.props[0]);
  const w = ARRAY_WRITE[t];
  if (!w || rec.numProps !== 1) throw new Error(`"${rec.name}" is not one array of a type a cut re-writes`);
  const encoding = rec.props.readUInt32LE(5);
  const data = Buffer.alloc(values.length * w[0]);
  values.forEach((v, k) => w[1](data, v, k * w[0]));
  const body = encoding === 1 ? deflateSync(data) : data;
  const head = Buffer.alloc(13);
  head[0] = rec.props[0];
  head.writeUInt32LE(values.length, 1);
  head.writeUInt32LE(encoding, 5);
  head.writeUInt32LE(body.length, 9);
  return Buffer.concat([head, body]);
}

const CUT_GEOMETRY = new Set(['Properties70', 'GeometryVersion', 'Vertices', 'PolygonVertexIndex', 'Edges', 'LayerElementNormal', 'LayerElementUV', 'LayerElementMaterial', 'Layer']);
const CUT_LAYER = new Set(['Version', 'Name', 'MappingInformationType', 'ReferenceInformationType']);

function cutGeometry(geo, materials, label) {
  for (const c of geo.children) if (!CUT_GEOMETRY.has(c.name)) throw new Error(`${label}: its Geometry holds "${c.name}", which a cut does not know - refused rather than half cut`);
  const one = (parent, name) => {
    const r = parent.children.filter((c) => c.name === name);
    if (r.length !== 1) throw new Error(`${label}: ${r.length} "${name}" records where a cut reads one`);
    return r[0];
  };
  const value = (parent, name) => one(parent, name).decoded.props[0];
  const vertsRec = one(geo, 'Vertices');
  const pviRec = one(geo, 'PolygonVertexIndex');
  const verts = vertsRec.decoded.props[0];
  const pvi = pviRec.decoded.props[0];
  const polys = [];
  const polyOf = new Int32Array(pvi.length);
  for (let k = 0, s = 0; k < pvi.length; k++) {
    polyOf[k] = polys.length;
    if (pvi[k] < 0) { polys.push([s, k]); s = k + 1; }
  }
  if (!polys.length || polys.at(-1)[1] !== pvi.length - 1) throw new Error(`${label}: its PolygonVertexIndex does not close its last polygon`);

  const matEl = one(geo, 'LayerElementMaterial');
  for (const c of matEl.children) if (!CUT_LAYER.has(c.name) && c.name !== 'Materials') throw new Error(`${label}: its LayerElementMaterial holds "${c.name}"`);
  const matsRec = one(matEl, 'Materials');
  const mats = matsRec.decoded.props[0];
  if (value(matEl, 'MappingInformationType') === 'AllSame') {
    for (const m of materials) if (mats[0] === m) throw new Error(`${label}: every polygon wears material ${m} - drop the object instead`);
    throw new Error(`${label}: no polygon wears material ${materials[0]} - nothing to cut`);
  }
  if (value(matEl, 'MappingInformationType') !== 'ByPolygon' || value(matEl, 'ReferenceInformationType') !== 'IndexToDirect') {
    throw new Error(`${label}: its materials are not mapped ByPolygon, IndexToDirect - a cut reads no other`);
  }
  if (mats.length !== polys.length) throw new Error(`${label}: ${mats.length} material indices for ${polys.length} polygons`);
  const polygons = materials.map((m) => mats.filter((x) => x === m).length);
  materials.forEach((m, i) => { if (!polygons[i]) throw new Error(`${label}: no polygon wears material ${m} - nothing to cut`); });
  const slots = new Set(materials);
  const keep = mats.map((m) => !slots.has(m));
  if (keep.every((k) => !k)) throw new Error(`${label}: every polygon wears material ${materials.join(' or ')} - drop the object instead`);
  const keptPV = polys.flatMap(([s, e], p) => (keep[p] ? Array.from({ length: e - s + 1 }, (_, i) => s + i) : []));
  const newPV = new Map(keptPV.map((k, n) => [k, n]));

  const vOf = (k) => (pvi[k] < 0 ? ~pvi[k] : pvi[k]);
  const theirs = new Set(polys.flatMap(([s, e], p) => (keep[p] ? [] : Array.from({ length: e - s + 1 }, (_, i) => vOf(s + i)))));
  for (const k of keptPV) theirs.delete(vOf(k));
  const keptV = Array.from({ length: verts.length / 3 }, (_, u) => u).filter((u) => !theirs.has(u));
  const vTo = new Map(keptV.map((u, n) => [u, n]));
  vertsRec.props = arrayProps(vertsRec, keptV.flatMap((u) => verts.slice(u * 3, u * 3 + 3)));
  pviRec.props = arrayProps(pviRec, keptPV.map((k) => (pvi[k] < 0 ? ~vTo.get(~pvi[k]) : vTo.get(pvi[k]))));
  matsRec.props = arrayProps(matsRec, mats.filter((_, p) => keep[p]));

  const edgesRec = geo.children.find((c) => c.name === 'Edges');
  if (edgesRec) {
    const next = (k) => { const [s, e] = polys[polyOf[k]]; return k === e ? s : k + 1; };
    const key = (k) => { const a = vOf(k), b = vOf(next(k)); return a < b ? `${a},${b}` : `${b},${a}`; };
    const firstKept = new Map();
    for (const k of keptPV) if (!firstKept.has(key(k))) firstKept.set(key(k), k);
    const out = [];
    for (const e of edgesRec.decoded.props[0]) {
      const k = newPV.has(e) ? e : firstKept.get(key(e));
      if (k !== undefined) out.push(newPV.get(k));
    }
    if (new Set(out).size !== out.length) throw new Error(`${label}: an edge listed twice once cut - its Edges are not one a cut understands`);
    edgesRec.props = arrayProps(edgesRec, out);
  }

  const corners = (el, valueName, width, wName) => {
    for (const c of el.children) if (!CUT_LAYER.has(c.name) && ![valueName, `${valueName}Index`, wName].includes(c.name)) throw new Error(`${label}: its ${el.name} holds "${c.name}"`);
    if (value(el, 'MappingInformationType') !== 'ByPolygonVertex') throw new Error(`${label}: its ${el.name} is not mapped ByPolygonVertex - a cut reads no other`);
    const ref = value(el, 'ReferenceInformationType');
    const valuesRec = one(el, valueName);
    const values = valuesRec.decoded.props[0];
    const wRec = wName ? el.children.find((c) => c.name === wName) : null;
    let keepAt;
    if (ref === 'Direct') {
      if (el.children.some((c) => c.name === `${valueName}Index`)) throw new Error(`${label}: its ${el.name} is referenced Direct yet carries a ${valueName}Index`);
      if (values.length !== pvi.length * width) throw new Error(`${label}: its ${valueName} is not one value a corner`);
      keepAt = keptPV;
    } else if (ref === 'IndexToDirect') {
      const idxRec = one(el, `${valueName}Index`);
      const idx = idxRec.decoded.props[0];
      if (idx.length !== pvi.length || idx.some((i) => i < 0)) throw new Error(`${label}: its ${valueName}Index is not one entry a corner`);
      const cutCorner = new Set(polys.flatMap(([s, e], p) => (keep[p] ? [] : Array.from({ length: e - s + 1 }, (_, i) => s + i))));
      const only = new Set([...cutCorner].map((k) => idx[k]));
      for (const k of keptPV) only.delete(idx[k]);
      keepAt = Array.from({ length: values.length / width }, (_, u) => u).filter((u) => !only.has(u));
      const to = new Map(keepAt.map((u, n) => [u, n]));
      idxRec.props = arrayProps(idxRec, keptPV.map((k) => to.get(idx[k])));
    } else throw new Error(`${label}: its ${el.name} is referenced ${ref} - a cut reads Direct or IndexToDirect`);
    valuesRec.props = arrayProps(valuesRec, keepAt.flatMap((u) => values.slice(u * width, u * width + width)));
    if (wRec) wRec.props = arrayProps(wRec, keepAt.map((u) => wRec.decoded.props[0][u]));
  };
  for (const el of geo.children.filter((c) => c.name === 'LayerElementNormal')) corners(el, 'Normals', 3, 'NormalsW');
  for (const el of geo.children.filter((c) => c.name === 'LayerElementUV')) corners(el, 'UV', 2, null);
  return { polygons, vertices: theirs.size };
}

export function stripFbx(bytes, { drop = [], cut = [] } = {}) {
  const buf = Buffer.from(bytes);
  const tree = readFbx(buf);
  const raw = rawRecords(buf);
  pair(raw.top, tree.nodes);

  const objectsRaw = raw.top.find((r) => r.name === 'Objects');
  const connRaw = raw.top.find((r) => r.name === 'Connections');
  if (!objectsRaw || !connRaw) throw new Error('this FBX has no Objects or no Connections section');
  const byId = new Map(objectsRaw.children.map((r) => [idKey(r.decoded.props[0]), r]));
  const links = connRaw.children.filter((r) => r.name === 'C').map((r) => ({ r, child: idKey(r.decoded.props[1]), parent: idKey(r.decoded.props[2]) }));

  const gone = new Set();
  for (const name of drop) {
    const model = objectsRaw.children.find((r) => r.name === 'Model' && objectName(r.decoded.props[1]) === name);
    if (!model) throw new Error(`no Model named "${name}" in this FBX`);
    gone.add(idKey(model.decoded.props[0]));
  }
  for (const l of links) {
    const child = byId.get(l.child);
    if (gone.has(l.parent) && child?.name === 'Model' && !gone.has(l.child)) {
      throw new Error(`${objectName(child.decoded.props[1])} is parented under a removed object - remove it too, or keep its parent`);
    }
  }
  for (let grew = true; grew;) {
    grew = false;
    for (const [id, r] of byId) {
      if (gone.has(id) || r.name === 'Model') continue;
      const parents = links.filter((l) => l.child === id).map((l) => l.parent);
      if (parents.length && parents.every((p) => gone.has(p))) { gone.add(id); grew = true; }
    }
  }
  const dropped = objectsRaw.children.filter((r) => gone.has(idKey(r.decoded.props[0])))
    .map((r) => ({ kind: r.name, name: objectName(r.decoded.props[1]), id: idKey(r.decoded.props[0]) }));

  objectsRaw.children = objectsRaw.children.filter((r) => !gone.has(idKey(r.decoded.props[0])));
  connRaw.children = connRaw.children.filter((r) => r.name !== 'C' || !(gone.has(idKey(r.decoded.props[1])) || gone.has(idKey(r.decoded.props[2]))));

  const slotsOf = new Map();
  for (const { object, material } of cut) {
    const list = slotsOf.get(object) ?? [];
    if (list.includes(material)) throw new Error(`"${object}": material ${material} named twice`);
    slotsOf.set(object, [...list, material]);
  }
  const cuts = [...slotsOf].map(([object, materials]) => {
    const label = `"${object}"`;
    const model = objectsRaw.children.find((r) => r.name === 'Model' && objectName(r.decoded.props[1]) === object);
    if (!model) throw new Error(`no Model named ${label} in this FBX${drop.includes(object) ? ' once its drop is made - a dropped object has nothing to cut' : ''}`);
    const id = idKey(model.decoded.props[0]);
    const geos = links.filter((l) => l.parent === id && byId.get(l.child)?.name === 'Geometry').map((l) => l.child);
    if (geos.length !== 1) throw new Error(`${label} has ${geos.length} Geometry records - a cut reads one`);
    if (links.some((l) => l.child === geos[0] && l.parent !== id && byId.get(l.parent)?.name === 'Model')) throw new Error(`${label}'s Geometry is another object's too - a cut would cut both`);
    // A skin deformer or blend shape names vertices by index, so a cut of a Geometry that carries one is refused.
    const hung = links.find((l) => l.parent === geos[0]);
    if (hung) throw new Error(`${label}'s Geometry carries a ${byId.get(hung.child)?.name ?? 'record'} that names its vertices by their index - a cut would leave it on the old numbering: refused`);
    return { object, materials, ...cutGeometry(byId.get(geos[0]), materials, label) };
  });

  const definitions = raw.top.find((r) => r.name === 'Definitions');
  if (definitions) {
    const lessBy = new Map();
    for (const d of dropped) lessBy.set(d.kind, (lessBy.get(d.kind) ?? 0) + 1);
    const setCount = (countRec, value) => {
      if (countRec.props[0] !== 'I'.charCodeAt(0) || countRec.props.length !== 5) throw new Error('a Definitions Count that is not one int32');
      const p = Buffer.alloc(5); p[0] = countRec.props[0]; p.writeInt32LE(value, 1);
      countRec.props = p;
    };
    for (const ot of definitions.children.filter((r) => r.name === 'ObjectType')) {
      const less = lessBy.get(ot.decoded.props[0]) ?? 0;
      if (!less) continue;
      const count = ot.children.find((r) => r.name === 'Count');
      if (count) setCount(count, count.decoded.props[0] - less);
    }
    const total = definitions.children.find((r) => r.name === 'Count');
    if (total && dropped.length) setCount(total, total.decoded.props[0] - dropped.length);
  }

  // The footer as Blender writes it: id, four zeros, zeros to the next 16 (a full 16 when aligned), version,
  // 120 zeros, and the closing magic.
  const foot = buf.subarray(raw.footerAt);
  if (!foot.subarray(0, 16).equals(FOOT_ID) || !foot.subarray(foot.length - 16).equals(FOOT_MAGIC)) {
    throw new Error('the footer is not the one Blender writes - this tool re-pads only that one');
  }

  const out = [];
  let at = 0;
  const push = (b) => { out.push(b); at += b.length; };
  const header = (end, numProps, propLen, name) => {
    const h = Buffer.alloc(raw.HEAD + name.length);
    if (raw.wide) { h.writeBigUInt64LE(BigInt(end), 0); h.writeBigUInt64LE(BigInt(numProps), 8); h.writeBigUInt64LE(BigInt(propLen), 16); }
    else { h.writeUInt32LE(end, 0); h.writeUInt32LE(numProps, 4); h.writeUInt32LE(propLen, 8); }
    h.writeUInt8(name.length, raw.HEAD - 1);
    h.write(name, raw.HEAD, 'latin1');
    return h;
  };
  const emit = (r) => {
    const slot = out.length;
    out.push(null);
    at += raw.HEAD + Buffer.byteLength(r.name, 'latin1');
    push(r.props);
    for (const c of r.children) emit(c);
    if (r.sentinel) push(Buffer.alloc(raw.HEAD));
    out[slot] = header(at, r.numProps, r.props.length, r.name);
  };
  push(buf.subarray(0, 27));
  for (const r of raw.top) emit(r);
  push(Buffer.alloc(raw.HEAD));
  push(FOOT_ID);
  push(Buffer.alloc(4));
  let pad = ((at + 15) & ~15) - at;
  if (pad === 0) pad = 16;
  push(Buffer.alloc(pad));
  const v = Buffer.alloc(4); v.writeUInt32LE(raw.version, 0); push(v);
  push(Buffer.alloc(120));
  push(FOOT_MAGIC);
  return { bytes: Buffer.concat(out), dropped, cut: cuts };
}

export function meshModelNames(bytes) {
  const objects = nodeAt(readFbx(Buffer.from(bytes)).nodes, 'Objects');
  return childrenNamed(objects, 'Model').filter((m) => m.props[2] === 'Mesh').map((m) => objectName(m.props[1]));
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith('--'));
  const dropArg = args.find((a) => a.startsWith('--drop='))?.slice('--drop='.length) ?? '';
  const cutArg = args.find((a) => a.startsWith('--cut='))?.slice('--cut='.length) ?? '';
  const cut = cutArg.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const at = s.lastIndexOf(':');
    return { object: s.slice(0, at), material: Number(s.slice(at + 1)) };
  });
  if (files.length !== 2 || (!dropArg && !cut.length) || cut.some((c) => !c.object || !Number.isInteger(c.material))) {
    console.error('usage: node tools/fbxStrip.mjs <in.fbx> <out.fbx> [--drop=<Model>[,<Model>...]] [--cut=<Model>:<material>[,...]]');
    process.exit(2);
  }
  const r = stripFbx(readFileSync(files[0]), { drop: dropArg.split(',').map((s) => s.trim()).filter(Boolean), cut });
  mkdirSync(dirname(files[1]), { recursive: true });
  writeFileSync(files[1], r.bytes);
  console.log(`${files[0]} -> ${files[1]}  ${r.bytes.length} bytes`);
  for (const d of r.dropped) console.log(`  dropped ${d.kind} "${d.name}"`);
  for (const c of r.cut) console.log(`  cut "${c.object}" ${c.materials.map((m, i) => `material ${m}: ${c.polygons[i]} polygons`).join(', ')}; ${c.vertices} vertices`);
  console.log(`  kept: ${meshModelNames(r.bytes).join(', ')}`);
}
