// @ts-check
// Reads the jungle tree OBJ and MTL files into the Low Poly Trees mesh shape. OBJ is right-handed and game meshes
// are left-handed, so each tree is mirrored in x as the Unity importer does. Its root, the middle of its lowest 2.5
// m, becomes the origin.

export const JUNGLE_ARCHIVE = 500;

export const JUNGLE_SPECIES = Object.freeze([
  Object.freeze({ key: 'banyan', file: 'jungle_tree', record: 12 }),
  Object.freeze({ key: 'kapok', file: 'jungle_tree2', record: 13 }),
  Object.freeze({ key: 'fig', file: 'jungle_tree3', record: 14 }),
  Object.freeze({ key: 'flame', file: 'jungle_tree4', record: 15 }),
  Object.freeze({ key: 'mahogany', file: 'jungle_tree5', record: 16 }),
]);

export const jungleFiles = (s) => ({ obj: `${s.file}.obj`, mtl: `${s.file}.mtl` });

export const jungleRecord = (s) => `jungle-${s.key}`;

export const JUNGLE_ROOT_BAND = 2.5;

/** @param {string} text */
export function parseObj(text) {
  const positions = [], uvs = [], normals = [], faces = [];
  let material = null, mtllib = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const p = line.split(/\s+/);
    switch (p[0]) {
      case 'v': positions.push(+p[1], +p[2], +p[3]); break;
      case 'vt': uvs.push(+p[1], +(p[2] ?? 0)); break;
      case 'vn': normals.push(+p[1], +p[2], +p[3]); break;
      case 'usemtl': material = p[1] ?? null; break;
      case 'mtllib': mtllib = p[1] ?? null; break;
      case 'f': {
        const at = (s, count) => {
          if (s == null || s === '') return -1;
          const n = Number.parseInt(s, 10);
          return n < 0 ? count + n : n - 1;
        };
        const corners = p.slice(1).map((c) => {
          const [v, vt, vn] = c.split('/');
          return [at(v, positions.length / 3), at(vt, uvs.length / 2), at(vn, normals.length / 3)];
        });
        if (corners.length >= 3) faces.push({ corners, material });
        break;
      }
      default: break;
    }
  }
  return { positions, uvs, normals, faces, mtllib };
}

// The file name is everything after the options, spaces included, because names such as `bark tree.png` contain
// spaces.
function mapName(words) {
  let i = 0;
  while (i < words.length && words[i][0] === '-') { i++; while (i < words.length && /^(?:-?[\d.]+|on|off)$/.test(words[i])) i++; }
  return i < words.length ? words.slice(i).join(' ') : null;
}
export function parseMtl(text) {
  const out = new Map();
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const [k, ...rest] = line.split(/\s+/);
    if (k === 'newmtl') { cur = { mapKd: null, mapD: null }; out.set(rest.join(' '), cur); } else if (cur && k === 'map_Kd') cur.mapKd = mapName(rest);
    else if (cur && k === 'map_d') cur.mapD = mapName(rest);
  }
  return out;
}

/** @param {ReturnType<typeof parseObj>} obj */
export function jungleMesh(obj) {
  const materials = new Set(obj.faces.map((f) => f.material));
  if (materials.size > 1) throw new Error(`jungle: a tree is one picture - this one names ${materials.size} materials`);
  const P = obj.positions;
  let minY = Infinity;
  for (let i = 1; i < P.length; i += 3) minY = Math.min(minY, P[i]);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < P.length; i += 3) {
    if (P[i + 1] > minY + JUNGLE_ROOT_BAND) continue;
    x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); z0 = Math.min(z0, P[i + 2]); z1 = Math.max(z1, P[i + 2]);
  }
  const rx = (x0 + x1) / 2, rz = (z0 + z1) / 2;
  const m = objMesh(obj, rx, rz);
  return { vertices: m.vertices, indices: m.indices, root: [rx, rz], min: m.min, max: m.max, material: obj.faces[0]?.material ?? null };
}

/**
 * @param {ReturnType<typeof parseObj>} obj
 * @param {number} rx
 * @param {number} rz
 */
export function objMesh(obj, rx, rz) {
  const P = obj.positions;
  const verts = [], idx = [], seen = new Map(), subs = [];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const vertexOf = (c, fn) => {
    const key = `${c[0]}/${c[1]}/${c[2]}`;
    let i = seen.get(key);
    if (i != null) return i;
    i = verts.length / 8;
    seen.set(key, i);
    const x = -(P[c[0] * 3] - rx), y = P[c[0] * 3 + 1], z = P[c[0] * 3 + 2] - rz;
    const n = c[2] >= 0 ? [-obj.normals[c[2] * 3], obj.normals[c[2] * 3 + 1], obj.normals[c[2] * 3 + 2]] : fn;
    const u = c[1] >= 0 ? obj.uvs[c[1] * 2] : 0, v = c[1] >= 0 ? obj.uvs[c[1] * 2 + 1] : 0;
    verts.push(x, y, z, n[0], n[1], n[2], u, v);
    if (x < min[0]) min[0] = x; if (y < min[1]) min[1] = y; if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x; if (y > max[1]) max[1] = y; if (z > max[2]) max[2] = z;
    return i;
  };
  for (const material of new Set(obj.faces.map((f) => f.material))) {
    const at = idx.length;
    for (const f of obj.faces) {
      if (f.material !== material) continue;
      const a = f.corners[0][0] * 3, b = f.corners[1][0] * 3, c = f.corners[2][0] * 3;
      const e1 = [-(P[b] - P[a]), P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [-(P[c] - P[a]), P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
      const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const fl = Math.hypot(fn[0], fn[1], fn[2]) || 1;
      fn[0] /= fl; fn[1] /= fl; fn[2] /= fl;
      const ids = f.corners.map((k) => vertexOf(k, fn));
      // Mirroring reverses each polygon turn, so the fan runs the other way. A polygon whose corner normals point
      // against its turn is reversed again, because some exports flip faces against their normals.
      let nx = 0, ny = 0, nz = 0;
      for (const id of ids) { nx += verts[id * 8 + 3]; ny += verts[id * 8 + 4]; nz += verts[id * 8 + 5]; }
      const turned = -(fn[0] * nx + fn[1] * ny + fn[2] * nz) < 0;
      for (let k = 1; k + 1 < ids.length; k++) {
        if (turned) idx.push(ids[0], ids[k], ids[k + 1]); else idx.push(ids[0], ids[k + 1], ids[k]);
      }
    }
    subs.push({ material, at, count: idx.length - at });
  }
  if (verts.length / 8 > 65535) throw new Error('jungle: a tree over 65535 vertices cannot ride the u16 index run');
  return { vertices: Float32Array.from(verts), indices: Uint16Array.from(idx), subs, min, max };
}

/**
 * @param {{vertices: Float32Array, indices: Uint16Array}} mesh
 * @param {{width: number, height: number, data: Uint8Array}} pic
 * @param {number} step
 * @param {(x: number, y: number, z: number) => void} each
 * @param {number} [at]
 * @param {number} [count]
 */
export function eachDrawn(mesh, pic, step, each, at = 0, count = mesh.indices.length) {
  const V = mesh.vertices, I = mesh.indices;
  for (let t = at; t + 2 < at + count; t += 3) {
    const a = I[t] * 8, b = I[t + 1] * 8, c = I[t + 2] * 8;
    const l1 = Math.hypot(V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2]);
    const l2 = Math.hypot(V[c] - V[a], V[c + 1] - V[a + 1], V[c + 2] - V[a + 2]);
    const n1 = Math.max(1, Math.ceil(l1 / step)), n2 = Math.max(1, Math.ceil(l2 / step));
    for (let i = 0; i <= n1; i++) {
      for (let j = 0; j <= n2; j++) {
        const s = i / n1, r = j / n2;
        if (s + r > 1) continue;
        const w0 = 1 - s - r;
        const u = w0 * V[a + 6] + s * V[b + 6] + r * V[c + 6], v = w0 * V[a + 7] + s * V[b + 7] + r * V[c + 7];
        const tx = Math.min(pic.width - 1, Math.max(0, Math.floor((u - Math.floor(u)) * pic.width)));
        const ty = Math.min(pic.height - 1, Math.max(0, Math.floor((1 - (v - Math.floor(v))) * pic.height)));
        if (pic.data[(ty * pic.width + tx) * 4 + 3] < 128) continue;
        each(w0 * V[a] + s * V[b] + r * V[c], w0 * V[a + 1] + s * V[b + 1] + r * V[c + 1], w0 * V[a + 2] + s * V[b + 2] + r * V[c + 2]);
      }
    }
  }
}

/**
 * @param {{vertices: Float32Array, indices: Uint16Array}} mesh
 * @param {{width: number, height: number, data: Uint8Array}} pic
 * @param {number} [step]
 */
export function measureTree(mesh, pic, step = 0.1) {
  const samples = [];
  eachDrawn(mesh, pic, step, (x, y, z) => samples.push(y, Math.hypot(x, z)));
  let crown = 0, foot = 0, top = 0;
  for (let i = 0; i < samples.length; i += 2) {
    crown = Math.max(crown, samples[i + 1]);
    top = Math.max(top, samples[i]);
    if (samples[i] < FOOT_TOP) foot = Math.max(foot, samples[i + 1]);
  }
  const bands = new Float32Array(Math.ceil(top / 0.5) + 1);
  for (let i = 0; i < samples.length; i += 2) {
    const k = Math.max(0, Math.floor(samples[i] / 0.5));
    if (k < bands.length) bands[k] = Math.max(bands[k], samples[i + 1]);
  }
  let crownFrom = top;
  for (let k = Math.ceil(FOOT_TOP / 0.5); k < bands.length; k++) if (bands[k] >= crown * 0.5) { crownFrom = k * 0.5; break; }
  const trunkTo = crownFrom > FOOT_TOP ? crownFrom : FOOT_TOP + TRUNK_BAND;
  const trunkRadii = [];
  for (let i = 0; i < samples.length; i += 2) if (samples[i] >= FOOT_TOP && samples[i] < trunkTo) trunkRadii.push(samples[i + 1]);
  trunkRadii.sort((p, q) => p - q);
  const trunk = trunkRadii.length ? trunkRadii[Math.floor(trunkRadii.length * TRUNK_QUANTILE)] : 0.5;
  return { foot, crown, crownFrom, trunk: Math.min(TRUNK_MAX, Math.max(TRUNK_MIN, trunk)), height: top };
}
export const FOOT_TOP = 3;
export const TRUNK_BAND = 3;
export const TRUNK_QUANTILE = 0.3;
export const TRUNK_MIN = 0.35;
export const TRUNK_MAX = 1.6;

// Precomputed `measureTree` results at 0.1 m, so the stream can place trees and cover before any picture is
// decoded. Remeasure when a tree file changes.
export const JUNGLE_MEASURES = Object.freeze([
  Object.freeze({ foot: 8.3, crown: 8.73, crownFrom: 3, trunk: 1.44, height: 22.54 }),
  Object.freeze({ foot: 8.53, crown: 9.63, crownFrom: 9, trunk: 0.99, height: 21.41 }),
  Object.freeze({ foot: 7.58, crown: 9.42, crownFrom: 8, trunk: 1.1, height: 22.53 }),
  Object.freeze({ foot: 5.6, crown: 7.8, crownFrom: 3, trunk: 0.43, height: 16.23 }),
  Object.freeze({ foot: 6.37, crown: 9.48, crownFrom: 8, trunk: 1.33, height: 22.54 }),
]);

/**
 * @param {number[]} base
 * @param {number} species
 * @param {number} scale
 */
export function jungleCover(base, species, scale) {
  const m = JUNGLE_MEASURES[species];
  return [
    { c: base, r: m.trunk * scale, h: m.crownFrom * scale, lift: 0, _mark: 0 },
    { c: base, r: m.crown * JUNGLE_CROWN_COVER * scale, h: (m.height - m.crownFrom) * scale, lift: m.crownFrom * scale, _mark: 0 },
  ];
}
// Must equal twice `COVER_RADIUS_FRAC` in `ai/cover.js`. It is not imported because this module also runs in the
// terrain worker.
export const JUNGLE_CROWN_COVER = 0.7;

/** @param {{ obj: string, mtl: string }[]} sources */
export function readJungleTrees(sources) {
  return packJungleTrees(readJungleSpecies(sources));
}

/** @param {{ obj: string, mtl: string }[]} sources */
export function readJungleSpecies(sources) {
  if (sources.length !== JUNGLE_SPECIES.length) throw new Error(`jungle: ${JUNGLE_SPECIES.length} trees expected, ${sources.length} handed`);
  const meshes = sources.map((s) => jungleMesh(parseObj(s.obj)));
  const pictures = meshes.map((m, k) => {
    const mtl = parseMtl(sources[k].mtl);
    const mat = mtl.get(m.material ?? '') ?? [...mtl.values()][0];
    if (!mat?.mapKd) throw new Error(`jungle: ${JUNGLE_SPECIES[k].file}.mtl names no picture`);
    return mat.mapKd;
  });
  return { meshes, pictures };
}

/**
 * @param {ReturnType<typeof readJungleSpecies>} species
 * @param {{ record: string, mesh: { vertices: Float32Array, indices: Uint16Array, subs: { at: number, count: number, picture: string }[], min: number[], max: number[] } }[]} [pairs]
 */
export function packJungleTrees({ meshes, pictures }, pairs = []) {
  const all = [...meshes.map((m) => ({ ...m, subs: [{ at: 0, count: m.indices.length, picture: '' }] })), ...pairs.map((p) => p.mesh)];
  let vCount = 0, iCount = 0;
  for (const m of all) { vCount += m.vertices.length / 8; iCount += m.indices.length; }
  const vertexBytes = vCount * 32;
  const treesBin = new Uint8Array(vertexBytes + iCount * 2);
  const vf = new Float32Array(treesBin.buffer, 0, vCount * 8);
  const iv = new Uint16Array(treesBin.buffer, vertexBytes, iCount);
  const json = { version: 1, vertexBytes, meshes: [], materials: {}, atlases: {}, prefabs: {} };
  const atlases = {}, protos = new Map();
  let vAt = 0, iAt = 0;
  all.forEach((m, k) => {
    vf.set(m.vertices, vAt * 8);
    iv.set(m.indices, iAt);
    json.meshes.push({ name: k < meshes.length ? JUNGLE_SPECIES[k].file : pairs[k - meshes.length].record, vertex: vAt, vertices: m.vertices.length / 8, index: iAt, subs: m.subs.map((s) => [s.at, s.count]), min: m.min, max: m.max });
    vAt += m.vertices.length / 8; iAt += m.indices.length;
  });
  meshes.forEach((m, k) => {
    const s = JUNGLE_SPECIES[k];
    atlases[s.key] = { alpha: true, picture: pictures[k] };
    json.materials[s.key] = { tex: s.key, cutoff: 0.5, cull: 0 };
    const record = jungleRecord(s), key = `${JUNGLE_ARCHIVE}_${record}`;
    json.prefabs[key] = { mesh: k, scale: [1, 1, 1], materials: [s.key] };
    const reach = Math.max(Math.abs(m.min[0]), Math.abs(m.max[0]), Math.abs(m.min[2]), Math.abs(m.max[2]));
    protos.set(key, {
      key, archive: JUNGLE_ARCHIVE, record, species: k, mesh: k, scale: [1, 1, 1],
      subs: [{ atlas: s.key, opaque: false, cutoff: 0.5, cull: 0, color: [1, 1, 1] }],
      size: { w: reach * 2, h: Math.max(0.5, m.max[1]) },
    });
  });
  pairs.forEach((p, n) => {
    const m = p.mesh, k = meshes.length + n, key = `${JUNGLE_ARCHIVE}_${p.record}`;
    const atlasOf = (picture) => {
      const s = pictures.indexOf(picture);
      if (s < 0) throw new Error(`jungle pair: ${p.record} wears ${picture}, which no tree of the jungle wears`);
      return JUNGLE_SPECIES[s].key;
    };
    json.prefabs[key] = { mesh: k, scale: [1, 1, 1], materials: m.subs.map((s) => atlasOf(s.picture)) };
    const reach = Math.max(Math.abs(m.min[0]), Math.abs(m.max[0]), Math.abs(m.min[2]), Math.abs(m.max[2]));
    protos.set(key, {
      key, archive: JUNGLE_ARCHIVE, record: p.record, mesh: k, scale: [1, 1, 1], nearOnly: true,
      subs: m.subs.map((s) => ({ atlas: atlasOf(s.picture), opaque: false, cutoff: 0.5, cull: 0, color: [1, 1, 1] })),
      size: { w: reach * 2, h: Math.max(0.5, m.max[1]) },
    });
  });
  json.atlases = atlases;
  return { json, treesBin, atlasesBin: null, atlases, protos, meshes: json.meshes, pictures, models: meshes, pairs };
}
