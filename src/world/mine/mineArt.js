// @ts-check
// Unpacks the bake of tools/mineArtBake.mjs: positions are 16-bit across each model box and normals are 8-bit, so
// the baker and `unpackMineModel` must change together.
import { APP_ROOT } from '../../platform/appRoot.js';

// Registered in pseudoArchives.js, which keeps every pseudo-archive number unique.
export const MINE_ART_ARCHIVE = 38341;
export const MINE_ART_FILES = Object.freeze({ manifest: 'art/bunnyfall-mine/mine-art.json', bin: 'art/bunnyfall-mine/mine-art.bin' });

const url = (/** @type {string} */ file) => new URL(file, APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/').href;

/**
 * @param {any} m
 * @param {ArrayBuffer} bin
 */
export function unpackMineModel(m, bin) {
  const q = new Int16Array(bin, m.positions.at, m.vertices * 3);
  const positions = new Float32Array(m.vertices * 3);
  for (let i = 0; i < positions.length; i++) { const k = i % 3; positions[i] = m.box[k] + ((q[i] + 32768) / 65535) * (m.box[k + 3] - m.box[k]); }
  const n8 = new Int8Array(bin, m.normals.at, m.vertices * 3), normals = new Float32Array(m.vertices * 3);
  for (let i = 0; i < normals.length; i++) normals[i] = n8[i] / 127;
  const uvs = m.uvs ? new Float32Array(bin.slice(m.uvs.at, m.uvs.at + m.uvs.bytes)) : new Float32Array(m.vertices * 2);
  const indices = new Uint32Array(bin.slice(m.index.at, m.index.at + m.index.bytes));
  const subMeshes = m.subMeshes.map((/** @type {any} */ s) => ({ textureArchive: MINE_ART_ARCHIVE, textureRecord: s.record, startIndex: s.start, primitiveCount: s.count }));
  return { model: { positions, normals, uvs, indices, subMeshes }, box: m.box };
}

export const MINE_ORE_GLOW = 0.7;
export const MINE_ORE_TINT = Object.freeze({
  'metal:iron': [150, 152, 158], 'metal:copper': [200, 112, 62], 'metal:tin': [196, 200, 204], 'metal:silver': [222, 226, 236],
  'metal:gold': [240, 196, 64], 'metal:platinum': [204, 218, 226], 'ore:mithril': [150, 204, 240], 'ore:ebony': [62, 50, 70],
  'ore:orichalcum': [160, 196, 92], 'ore:adamantium': [156, 122, 178],
});
export const MINE_ORE_KEYS = Object.freeze(Object.keys(MINE_ORE_TINT));
const MINE_ORE_TINT_FROM = 1000;

export function tintPicture(/** @type {{ width: number, height: number, colors: Uint8Array }} */ p, /** @type {number[]} */ rgb) {
  const colors = new Uint8Array(p.colors.length), glow = new Uint8Array(p.colors.length);
  for (let i = 0; i < colors.length; i += 4) {
    const lum = (0.3 * p.colors[i] + 0.59 * p.colors[i + 1] + 0.11 * p.colors[i + 2]) / 255, k = 0.35 + 0.9 * lum;
    for (let c = 0; c < 3; c++) { colors[i + c] = Math.min(255, Math.round(rgb[c] * k)); glow[i + c] = Math.round(colors[i + c] * MINE_ORE_GLOW * 0.6); }
    colors[i + 3] = 255; glow[i + 3] = 255;
  }
  return { picture: { width: p.width, height: p.height, colors }, glow: { width: p.width, height: p.height, colors: glow } };
}

export const MINE_DARK = Object.freeze({ in: 0.35, w: 2.7, h: 2.6 });

export function mineDarkCorners(/** @type {{ at: number[], into: number[] }} */ door) {
  const [ix, , iz] = door.into, sx = -iz, sz = ix;
  const cx = door.at[0] + ix * MINE_DARK.in, cz = door.at[2] + iz * MINE_DARK.in, y0 = door.at[1], hw = MINE_DARK.w / 2;
  return [[cx - sx * hw, y0, cz - sz * hw], [cx + sx * hw, y0, cz + sz * hw], [cx + sx * hw, y0 + MINE_DARK.h, cz + sz * hw], [cx - sx * hw, y0 + MINE_DARK.h, cz - sz * hw]];
}

export function mineDarkModel(/** @type {{ at: number[], into: number[] }} */ door, /** @type {number} */ record) {
  const c = mineDarkCorners(door), [ix, , iz] = door.into;
  const positions = new Float32Array([...c.flat(), ...c.flat()]);
  const normals = new Float32Array(24);
  for (let i = 0; i < 8; i++) { const s = i < 4 ? -1 : 1; normals[i * 3] = ix * s; normals[i * 3 + 2] = iz * s; }
  const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
  return { positions, normals, uvs, indices, subMeshes: [{ textureArchive: MINE_ART_ARCHIVE, textureRecord: record, startIndex: 0, primitiveCount: 4 }] };
}

let _art = /** @type {Promise<any>|null} */ (null);

/**
 * @param {any} renderer
 * @param {{ fetchBytes?: ((file: string) => Promise<ArrayBuffer>) | null }} [o]
 */
export function loadMineArt(renderer, { fetchBytes = null } = {}) {
  _art ??= (async () => {
    const get = fetchBytes ?? (async (/** @type {string} */ file) => { const r = await fetch(url(file)); if (!r.ok) throw new Error(`${file}: ${r.status}`); return r.arrayBuffer(); });
    const manifest = JSON.parse(new TextDecoder().decode(await get(MINE_ART_FILES.manifest)));
    const bin = await get(MINE_ART_FILES.bin);
    for (const t of manifest.textures) renderer.uploadTexture(MINE_ART_ARCHIVE, t.record, { width: t.width, height: t.height, colors: new Uint8Array(bin, t.at, t.bytes) });
    const oreRecords = new Set(manifest.ores.flatMap((/** @type {any} */ o) => o.subMeshes.map((/** @type {any} */ s) => s.record)));
    for (const t of manifest.textures) {
      if (!oreRecords.has(t.record)) continue;
      const src = new Uint8Array(bin, t.at, t.bytes), glow = new Uint8Array(src.length);
      for (let i = 0; i < src.length; i += 4) { glow[i] = src[i] * MINE_ORE_GLOW; glow[i + 1] = src[i + 1] * MINE_ORE_GLOW; glow[i + 2] = src[i + 2] * MINE_ORE_GLOW; glow[i + 3] = 255; }
      renderer.uploadEmissionTexture?.(MINE_ART_ARCHIVE, t.record, { width: t.width, height: t.height, colors: glow }, { white: true });
    }
    const make = (/** @type {any} */ m) => { const u = unpackMineModel(m, bin); return { gpu: renderer.createMesh(u.model), box: u.box, name: m.name, positions: u.model.positions, indices: u.model.indices, model: u.model }; };
    const entrance = { ...make(manifest.entrance), door: manifest.entrance.door, dark: /** @type {any} */ (null) };
    const black = manifest.textures.length;
    renderer.uploadTexture(MINE_ART_ARCHIVE, black, { width: 4, height: 4, colors: new Uint8Array(64).fill(0).map((_, i) => (i % 4 === 3 ? 255 : 0)) });
    entrance.dark = { gpu: renderer.createMesh(mineDarkModel(entrance.door, black)), corners: mineDarkCorners(entrance.door) };
    const ores = manifest.ores.map(make);
    const pics = new Map(manifest.textures.map((/** @type {any} */ t) => [t.record, { width: t.width, height: t.height, colors: new Uint8Array(bin, t.at, t.bytes) }]));
    const tinted = new Map(), meshes = new Map();
    const recordOf = (/** @type {number} */ rec, /** @type {string} */ ore) => {
      const ti = MINE_ORE_KEYS.indexOf(ore), out = MINE_ORE_TINT_FROM + ti * 100 + rec;
      if (ti < 0) return rec;
      if (!tinted.has(out)) {
        const p = pics.get(rec);
        if (!p) return rec;
        const { picture, glow } = tintPicture(p, MINE_ORE_TINT[/** @type {keyof typeof MINE_ORE_TINT} */ (ore)]);
        renderer.uploadTexture(MINE_ART_ARCHIVE, out, picture);
        renderer.uploadEmissionTexture?.(MINE_ART_ARCHIVE, out, glow, { white: true });
        tinted.set(out, true);
      }
      return out;
    };
    const oreMesh = (/** @type {number} */ i, /** @type {string} */ ore) => {
      const key = `${i}|${ore}`;
      if (!meshes.has(key)) {
        const m = ores[i]?.model;
        meshes.set(key, m ? renderer.createMesh({ ...m, subMeshes: m.subMeshes.map((/** @type {any} */ s) => ({ ...s, textureRecord: recordOf(s.textureRecord, ore) })) }) : null);
      }
      return meshes.get(key);
    };
    return { entrance, ores, oreMesh };
  })().catch((e) => { console.warn('[mine] the mines\' models', e?.message ?? e); return null; });
  return _art;
}
