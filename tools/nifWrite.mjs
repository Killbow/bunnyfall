// Writes a Morrowind 4.0.0.2 NIF from a baked mesh; src/formats/mwNifFile.js reads it back.
// Usage: node tools/nifWrite.mjs <mesh.json> <out.nif> [--texture=NAME.dds] [--node=NAME] [--keep-v].
// A 4.0.0.2 stream has no record sizes, so one wrong byte desynchronizes the rest of the file.
// V is written as 1 - v unless --keep-v is given, because FBX puts v = 0 at the bottom of the image.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { isMain } from './lib/isMain.mjs';

export const MW_NIF_VERSION = 0x04000002;
export const NIF_HEADER_LINE = 'NetImmerse File Format, Version 4.0.0.2\n';

export class NifOut {
  constructor() { this.parts = []; this.length = 0; }
  _push(buf) { this.parts.push(buf); this.length += buf.length; return this; }
  _num(size, fn, v) { const b = Buffer.alloc(size); fn.call(b, v, 0); return this._push(b); }
  u8(v) { return this._num(1, Buffer.prototype.writeUInt8, v); }
  u16(v) { return this._num(2, Buffer.prototype.writeUInt16LE, v); }
  i16(v) { return this._num(2, Buffer.prototype.writeInt16LE, v); }
  u32(v) { return this._num(4, Buffer.prototype.writeUInt32LE, v); }
  i32(v) { return this._num(4, Buffer.prototype.writeInt32LE, v); }
  f32(v) { return this._num(4, Buffer.prototype.writeFloatLE, v); }
  bool(v) { return this.u32(v ? 1 : 0); }
  string(s) { const b = Buffer.from(String(s ?? ''), 'latin1'); return this.u32(b.length)._push(b); }
  vec3(v) { return this.f32(v[0]).f32(v[1]).f32(v[2]); }
  mat33(m) { for (let i = 0; i < 9; i++) this.f32(m[i]); return this; }
  ref(v) { return this.i32(v ?? -1); }
  refList(list) { this.u32(list.length); for (const r of list) this.ref(r); return this; }
  f32Array(a) { for (const v of a) this.f32(v); return this; }
  u16Array(a) { for (const v of a) this.u16(v); return this; }
  toBuffer() { return Buffer.concat(this.parts, this.length); }
}

const IDENTITY3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const objectNET = (o, { name = '', extra = -1, controller = -1 }) =>
  o.string(name).ref(extra).ref(controller);

function avObject(o, rec) {
  objectNET(o, rec);
  o.u16(rec.flags ?? 0);
  o.vec3(rec.translation ?? [0, 0, 0]);
  o.mat33(rec.rotation ?? IDENTITY3);
  o.f32(rec.scale ?? 1);
  o.vec3(rec.velocity ?? [0, 0, 0]);
  o.refList(rec.properties ?? []);
  o.bool(false);
}

export const WRITERS = {
  NiNode(o, rec) {
    avObject(o, rec);
    o.refList(rec.children ?? []);
    o.refList(rec.effects ?? []);
  },

  NiTriShape(o, rec) {
    avObject(o, rec);
    o.ref(rec.data);
    o.ref(rec.skin ?? -1);
  },

  NiTriShapeData(o, rec) {
    const n = rec.positions.length / 3;
    if (n > 0xffff) throw new Error(`${n} vertices will not fit NiTriShapeData's uint16 count`);
    o.u16(n);
    o.bool(true).f32Array(rec.positions);
    if (rec.normals) o.bool(true).f32Array(rec.normals); else o.bool(false);
    const { center, radius } = boundingSphere(rec.positions);
    o.vec3(center).f32(radius);
    o.bool(false);
    // At 4.0.0.2 the uv set count is a uint16, followed by a bool that says whether any are written.
    o.u16(rec.uvs ? 1 : 0).bool(!!rec.uvs);
    if (rec.uvs) o.f32Array(rec.uvs);
    const tris = rec.indices.length / 3;
    if (tris > 0xffff) throw new Error(`${tris} triangles will not fit the uint16 count`);
    o.u16(tris);
    o.u32(rec.indices.length);
    o.u16Array(rec.indices);
    o.u16(0);
  },

  NiMaterialProperty(o, rec) {
    objectNET(o, rec);
    o.u16(rec.flags ?? 1);
    o.vec3(rec.ambient ?? [1, 1, 1]);
    o.vec3(rec.diffuse ?? [1, 1, 1]);
    o.vec3(rec.specular ?? [0, 0, 0]);
    o.vec3(rec.emissive ?? [0, 0, 0]);
    o.f32(rec.glossiness ?? 0);
    o.f32(rec.alpha ?? 1);
  },

  NiTexturingProperty(o, rec) {
    objectNET(o, rec);
    o.u16(rec.flags ?? 0);
    // Apply mode 2 is APPLY_MODULATE.
    o.u32(rec.applyMode ?? 2);
    const slots = rec.textures ?? [];
    o.u32(slots.length);
    slots.forEach((tex, i) => {
      if (!tex) { o.bool(false); return; }
      o.bool(true);
      o.ref(tex.source).u32(tex.clampMode ?? 3).u32(tex.filterMode ?? 2).u32(tex.uvSet ?? 0);
      // ps2L, ps2K, and an unknown field, at the exporter's constants.
      // The bump slot alone adds the luma pair and a 2x2 matrix.
      o.i16(0).i16(-75).u16(0);
      if (i === 5) o.f32(1).f32(0).f32Array([1, 0, 0, 1]);
    });
  },

  NiSourceTexture(o, rec) {
    objectNET(o, rec);
    o.u8(1);
    o.string(rec.fileName);
    o.u32(rec.pixelLayout ?? 5).u32(rec.useMipmaps ?? 2).u32(rec.alphaFormat ?? 3).u8(rec.isStatic ?? 1);
  },

  NiStencilProperty(o, rec) {
    objectNET(o, rec);
    o.u16(rec.flags ?? 0);
    o.u8(rec.enabled ?? 0);
    o.u32(rec.compareFunc ?? 0).u32(rec.stencilRef ?? 0).u32(rec.mask ?? 0xffffffff);
    o.u32(rec.failAction ?? 0).u32(rec.zfailAction ?? 0).u32(rec.zpassAction ?? 0);
    o.u32(rec.drawMode ?? 0);
  },

  NiSkinInstance(o, rec) {
    o.ref(rec.data);
    o.ref(rec.skeletonRoot ?? -1);
    o.refList(rec.bones ?? []);
  },

  NiSequenceStreamHelper(o, rec) {
    objectNET(o, rec);
  },

  NiStringExtraData(o, rec) {
    o.ref(rec.next ?? -1);
    o.u32(rec.recordSize ?? 4 + Buffer.byteLength(String(rec.string ?? ''), 'latin1'));
    o.string(rec.string);
  },

  NiTextKeyExtraData(o, rec) {
    o.ref(rec.next ?? -1);
    o.u32(rec.recordSize ?? 0);
    o.u32(rec.keys.length);
    for (const k of rec.keys) o.f32(k.time).string(k.text);
  },

  NiKeyframeController(o, rec) {
    o.ref(rec.next ?? -1).u16(rec.flags ?? 8).f32(rec.frequency ?? 1).f32(rec.phase ?? 0);
    o.f32(rec.startTime ?? 0).f32(rec.stopTime ?? 0).ref(rec.target ?? -1);
    o.ref(rec.data);
  },

  NiKeyframeData(o, rec) {
    const rot = rec.rotationKeys ?? [];
    o.u32(rot.length);
    if (rot.length) {
      if ((rec.rotationType ?? 1) === 4) throw new Error('NiKeyframeData: XYZ rotation keys are not written');
      o.u32(rec.rotationType ?? 1);
      for (const k of rot) {
        o.f32(k.time).f32Array(k.value);
        if ((rec.rotationType ?? 1) === 3) o.f32Array(k.tbc);
      }
    }
    keyGroup(o, rec.translations, 3);
    keyGroup(o, rec.scales, 1);
  },

  NiGeomMorpherController(o, rec) {
    o.ref(rec.next ?? -1).u16(rec.flags ?? 8).f32(rec.frequency ?? 1).f32(rec.phase ?? 0);
    o.f32(rec.startTime ?? 0).f32(rec.stopTime ?? 0).ref(rec.target ?? -1);
    o.ref(rec.data).u8(rec.alwaysUpdate ?? 0);
  },

  NiMorphData(o, rec) {
    o.u32(rec.morphs.length).u32(rec.numVertices).u8(rec.relativeTargets ?? 1);
    for (const m of rec.morphs) {
      const keys = m.keys?.keys ?? [];
      const type = m.keys?.type ?? 1;
      o.u32(keys.length).u32(type);
      for (const k of keys) {
        o.f32(k.time).f32(k.value);
        if (type === 2) o.f32(k.inTan).f32(k.outTan);
        else if (type === 3) o.f32Array(k.tbc);
      }
      o.f32Array(m.vectors);
    }
  },

  NiSkinData(o, rec) {
    const tr = rec.transform ?? {};
    o.mat33(tr.rotation ?? IDENTITY3).vec3(tr.translation ?? [0, 0, 0]).f32(tr.scale ?? 1);
    o.u32(rec.bones.length);
    o.ref(rec.partitions ?? -1);
    for (const b of rec.bones) {
      const t = b.transform ?? {};
      o.mat33(t.rotation ?? IDENTITY3).vec3(t.translation ?? [0, 0, 0]).f32(t.scale ?? 1);
      o.vec3(b.center ?? [0, 0, 0]).f32(b.radius ?? 0);
      o.u16(b.indices.length);
      for (let v = 0; v < b.indices.length; v++) o.u16(b.indices[v]).f32(b.weights[v]);
    }
  },
};

function keyGroup(o, group, dim) {
  const keys = group?.keys ?? [];
  o.u32(keys.length);
  if (!keys.length) return;
  const type = group.type ?? 1;
  o.u32(type);
  const val = (v) => (dim === 1 ? o.f32(v) : o.f32Array(v));
  for (const k of keys) {
    o.f32(k.time);
    val(k.value);
    if (type === 2) { val(k.inTan); val(k.outTan); }
    else if (type === 3) o.f32Array(k.tbc);
  }
}

export function boundingSphere(positions) {
  const n = positions.length / 3;
  if (!n) return { center: [0, 0, 0], radius: 0 };
  const min = [Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], positions[i + k]); max[k] = Math.max(max[k], positions[i + k]); }
  }
  const center = [0, 1, 2].map((k) => (min[k] + max[k]) / 2);
  let radius = 0;
  for (let i = 0; i < positions.length; i += 3) {
    radius = Math.max(radius, Math.hypot(positions[i] - center[0], positions[i + 1] - center[1], positions[i + 2] - center[2]));
  }
  return { center, radius };
}

export function writeNif(records, roots = [0]) {
  const o = new NifOut();
  o._push(Buffer.from(NIF_HEADER_LINE, 'latin1'));
  o.u32(MW_NIF_VERSION);
  o.u32(records.length);
  for (const rec of records) {
    const writer = WRITERS[rec.type];
    if (!writer) throw new Error(`no NIF writer for record type "${rec.type}"`);
    o.string(rec.type);
    writer(o, rec);
  }
  o.u32(roots.length);
  for (const r of roots) o.ref(r);
  return o.toBuffer();
}

export function meshToNif(mesh, { texture = null, node = null, keepV = false } = {}) {
  return meshesToNif([{ mesh, texture }], { node, keepV });
}

export function meshesToNif(shapes, { node = null, keepV = false } = {}) {
  if (!shapes?.length) throw new Error('no meshes to write');
  // The parser discards record 0's transform, so the root carries none.
  const records = [{ type: 'NiNode', name: node ?? shapes[0].mesh?.name ?? 'Root', children: [] }];
  for (const shape of shapes) shapeRecords(records, shape, keepV);
  return writeNif(records, [0]);
}

function shapeRecords(records, { mesh, texture = null, name = '', skin = null }, keepV) {
  if (!mesh?.positions?.length) throw new Error('this mesh has no positions');
  if (!mesh.indices?.length) throw new Error('this mesh has no triangles');
  const uvs = mesh.uvs
    ? mesh.uvs.map((v, i) => (i % 2 === 1 && !keepV ? 1 - v : v))
    : null;
  const at = records.length;
  records[0].children.push(at);
  const skinAt = at + (texture ? 6 : 5);
  records.push(
    { type: 'NiTriShape', name, data: at + 1, properties: [at + 2, at + 3, at + 4], ...(skin ? { skin: skinAt } : {}) },
    { type: 'NiTriShapeData', positions: mesh.positions, normals: mesh.normals, uvs, indices: mesh.indices },
    { type: 'NiMaterialProperty', name: `${mesh.name ?? 'mesh'}Material` },
    { type: 'NiTexturingProperty', textures: [texture ? { source: at + 5 } : null] },
    // Stencil draw mode 3 draws both sides.
    { type: 'NiStencilProperty', drawMode: 3 },
  );
  if (texture) records.push({ type: 'NiSourceTexture', fileName: texture });
  if (skin) records.push({ type: 'NiSkinInstance', data: skinAt + 1, skeletonRoot: 0, bones: skin.bones }, { type: 'NiSkinData', bones: skin.data });
}

function rigidInverse({ a, t }) {
  const r = [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
  return { a: r, t: [-(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]), -(r[3] * t[0] + r[4] * t[1] + r[5] * t[2]), -(r[6] * t[0] + r[7] * t[1] + r[8] * t[2])] };
}

export function skinnedMeshesToNif(shapes, { node, bones, keepV = false }) {
  if (!shapes?.length) throw new Error('no meshes to write');
  if (!bones?.length) throw new Error('a skinned part needs its bones');
  const records = [{ type: 'NiNode', name: node ?? 'Root', children: [] }];
  const boneAt = new Map();
  const nodeOf = new Map(bones.map((b, i) => [b.name, i]));
  const shapeSkins = shapes.map(({ mesh, weights }) => {
    const n = mesh.positions.length / 3;
    if (weights?.length !== n) throw new Error(`${n} vertices and ${weights?.length ?? 0} weight lists`);
    const per = new Map();
    weights.forEach((list, v) => {
      if (!list.length) throw new Error(`vertex ${v} carries no weight`);
      for (const [name, w] of list) {
        if (!nodeOf.has(name)) throw new Error(`vertex ${v} is weighted to "${name}", which is not one of the part's bones`);
        if (!per.has(name)) per.set(name, { indices: [], weights: [] });
        per.get(name).indices.push(v);
        per.get(name).weights.push(w);
      }
    });
    return bones.filter((b) => per.has(b.name)).map((b) => {
      const inv = rigidInverse(b.bind);
      const { indices, weights: ws } = per.get(b.name);
      const local = [];
      for (const v of indices) {
        const x = mesh.positions[v * 3], y = mesh.positions[v * 3 + 1], z = mesh.positions[v * 3 + 2];
        local.push(inv.a[0] * x + inv.a[1] * y + inv.a[2] * z + inv.t[0], inv.a[3] * x + inv.a[4] * y + inv.a[5] * z + inv.t[1], inv.a[6] * x + inv.a[7] * y + inv.a[8] * z + inv.t[2]);
      }
      const sphere = boundingSphere(local);
      return { name: b.name, data: { transform: { rotation: inv.a, translation: inv.t, scale: 1 }, center: sphere.center, radius: sphere.radius, indices, weights: ws } };
    });
  });
  // The bones' records come after every shape's, so their indices are known once the shapes are laid out.
  let next = 1;
  for (const s of shapes) next += (s.texture ? 6 : 5) + 2;
  for (const b of bones) if (shapeSkins.some((list) => list.some((x) => x.name === b.name))) boneAt.set(b.name, next++);
  shapes.forEach((shape, i) => shapeRecords(records, {
    mesh: shape.mesh, texture: shape.texture ?? null, name: shape.name ?? '',
    skin: { bones: shapeSkins[i].map((x) => boneAt.get(x.name)), data: shapeSkins[i].map((x) => x.data) },
  }, keepV));
  for (const b of bones) {
    if (!boneAt.has(b.name)) continue;
    records[0].children.push(records.length);
    records.push({ type: 'NiNode', name: b.name, translation: [...b.bind.t], rotation: [...b.bind.a], scale: 1, children: [] });
  }
  return writeNif(records, [0]);
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d = null) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
  const files = args.filter((a) => !a.startsWith('--'));
  if (files.length !== 2) {
    console.error('usage: node tools/nifWrite.mjs <mesh.json> <out.nif> [--texture=NAME.dds] [--node=NAME] [--keep-v]');
    process.exit(2);
  }
  const mesh = JSON.parse(readFileSync(files[0], 'utf8'));
  const bytes = meshToNif(mesh, { texture: opt('texture'), node: opt('node'), keepV: args.includes('--keep-v') });
  mkdirSync(dirname(files[1]), { recursive: true });
  writeFileSync(files[1], bytes);
  console.log(`${files[0]} -> ${files[1]}  ${bytes.length} bytes`);
  console.log(`  ${mesh.positions.length / 3} vertices, ${mesh.indices.length / 3} triangles, texture ${opt('texture') ?? '(none)'}`);
}
