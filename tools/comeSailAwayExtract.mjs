#!/usr/bin/env node
// Extracts Come Sail Away's own pictures, sounds, and models from the shipped bundle into vendor/come-sail-away.
// Every picture is measured against the game data first, and one that matches it is never written.
// Run: node tools/comeSailAwayExtract.mjs "<path>/come sail away.dfmod" [outDir] --arena2 <ARENA2>.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { isMain } from './lib/isMain.mjs';
import { readUnityFs, readSerializedFile, decodeTexture2D, CLASS_ID } from '../src/formats/unityBundle.js';
import { DFPalette } from '../src/formats/dfPalette.js';
import { TextureFile } from '../src/formats/textureFile.js';
import { ImgFile } from '../src/formats/imgFile.js';
import { classicRecordRgba, composeTiledPicture, deriveTiledPaint } from '../src/formats/derivedTexture.js';
import { classicRecords, findClassicSource } from './detailedShipsAssets.mjs';
import { bestClassicBlock, isDerivedBlock, cropToVisible } from './lib/classicBlocks.mjs';
import { encodeIndexedPng, pictureColours } from './lib/indexedPng.mjs';
import { fsb5ToOgg } from './lib/fsb5Vorbis.mjs';
import { openScene, prefabTree, assetRefs, bundleContainer, decodeMesh, decodeClip, decodeController, pathHash, UCLASS } from './lib/unityScene.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLASS_AUDIO_CLIP = 83;

export const CSA_ARCHIVE = 112395;
export const WAVE_SOURCE = Object.freeze([303, 1, 0]);
export const WAVE_KEY = 'ff00ffff';
export const PREFABS = Object.freeze([112400, 112401, 112402, 112403, 112404, 112405, 112406, 112410, 112411, 112412, 112413, 112414]);
export const MESH_WRITTEN = Object.freeze(['position', 'normal', 'uv0', 'blendIndices']);

export const NAMED_MATERIALS = Object.freeze(['CurrentMaterial']);

export const PLAYED_CLIPS = Object.freeze(['SmallShipAmbience', 'ShipExteriorAmbience2', 'Oars_In', 'Oars_Sweep', 'Oars_Out']);

export function openBundle(bytes) {
  const fs = readUnityFs(bytes);
  const main = fs.files.find((f) => !/\.res(S|ource)$/.test(f.path));
  const sf = readSerializedFile(main, main.path);
  const resource = (path, offset, size) => {
    const base = path.slice(path.lastIndexOf('/') + 1);
    const f = fs.files.find((x) => x.path === base || x.path === path);
    if (!f) throw new Error(`the bundle has no stream ${path}`);
    return f.read(offset, size);
  };
  return { sf, resource };
}

function tilePhase(pic, src) {
  let best = null;
  for (let py = 0; py < src.height; py++) {
    for (let px = 0; px < src.width; px++) {
      let same = 0;
      for (let y = 0; y < pic.height; y += 4) {
        const sy = (y + py) % src.height;
        for (let x = 0; x < pic.width; x += 4) {
          const i = (y * pic.width + x) * 4;
          if (pic.data[i + 3] !== 255) continue;
          const s = (sy * src.width + (x + px) % src.width) * 4;
          if (pic.data[i] === src.data[s] && pic.data[i + 1] === src.data[s + 1] && pic.data[i + 2] === src.data[s + 2]) same++;
        }
      }
      if (!best || same > best.same) best = { tile: [px, py], same };
    }
  }
  return best.tile;
}

function travelMapDistance(pic, arena2) {
  const img = new ImgFile();
  img.load(new Uint8Array(readFileSync(join(arena2, 'TRAV0I00.IMG'))), 'TRAV0I00.IMG');
  const pal = new DFPalette();
  pal.load(new Uint8Array(readFileSync(join(arena2, img.paletteName))));
  img.load(new Uint8Array(readFileSync(join(arena2, 'TRAV0I00.IMG'))), 'TRAV0I00.IMG', pal);
  const bm = img.getDFBitmap(0, 0);
  let err = 0, n = 0;
  for (let y = 0; y < pic.height; y++) {
    for (let x = 0; x < pic.width; x++) {
      const sx = Math.min(319, Math.round((x + 0.5) * 320 / pic.width - 0.5));
      const sy = Math.min(159, Math.round((y + 0.5) * 160 / pic.height - 0.5));
      const c = pal.get(bm.data[(sy + 12) * bm.width + sx]);
      const i = (y * pic.width + x) * 4;
      err += Math.abs(pic.data[i] - c.r) + Math.abs(pic.data[i + 1] - c.g) + Math.abs(pic.data[i + 2] - c.b);
      n++;
    }
  }
  return err / n;
}

const byFrame = (a, b) => a.frame - b.frame;

function verticalScroll(pic, base) {
  const { width: w, height: h } = pic;
  if (base.width !== w || base.height !== h) return null;
  const same = (i, j) => (pic.data[i + 3] === 0 && base.data[j + 3] === 0)
    || (pic.data[i] === base.data[j] && pic.data[i + 1] === base.data[j + 1] && pic.data[i + 2] === base.data[j + 2] && pic.data[i + 3] === base.data[j + 3]);
  for (let n = 0; n < h; n++) {
    let ok = true;
    for (let y = 0; y < h && ok; y++) {
      const by = (y + n) % h;
      for (let x = 0; x < w; x++) if (!same((y * w + x) * 4, (by * w + x) * 4)) { ok = false; break; }
    }
    if (ok) return n;
  }
  return null;
}

/**
 * @param {Uint8Array} bundleBytes
 * @param {string} arena2
 */
export function comeSailAwayAssets(bundleBytes, arena2) {
  const { sf, resource } = openBundle(bundleBytes);
  const palette = new DFPalette();
  palette.load(new Uint8Array(readFileSync(join(arena2, 'ART_PAL.COL'))));
  const records = [...classicRecords(arena2, palette)];
  const out = {};
  const report = [];
  const meta = [];

  const textures = [];
  for (const o of sf.objects) {
    if (o.classId !== CLASS_ID.Texture2D) continue;
    const t = o.read();
    const m = /^(\d+)_(\d+)-(\d+)$/.exec(t.m_Name);
    if (!m || Number(m[1]) !== CSA_ARCHIVE) { report.push(`${t.m_Name}: Unity's own, not carried`); continue; }
    textures.push({ record: Number(m[2]), frame: Number(m[3]), name: t.m_Name, tex: t, pic: decodeTexture2D(t, resource) });
  }
  const settings = (t) => ({ filterMode: t.m_TextureSettings.m_FilterMode, wrapU: t.m_TextureSettings.m_WrapU, wrapV: t.m_TextureSettings.m_WrapV, mipCount: t.m_MipCount });

  for (const e of textures.filter((x) => x.record === 0 || x.record === 1).sort((a, b) => a.record - b.record || byFrame(a, b))) {
    const crop = cropToVisible(e.pic);
    for (const pic of [e.pic, crop]) {
      const src = findClassicSource(pic, records);
      if (src) throw new Error(`${e.name}: TEXTURE.${src.archive} record ${src.record} covers it - not the author's own picture`);
    }
    const block = bestClassicBlock(e.pic, records);
    if (isDerivedBlock(block)) throw new Error(`${e.name}: TEXTURE.${block.archive} record ${block.record} matches ${(block.share * 100).toFixed(1)}% of a block`);
    out[`Textures/${e.name}.png`] = encodeIndexedPng(e.pic);
    meta.push({ name: e.name, kind: 'own', width: e.pic.width, height: e.pic.height, ...settings(e.tex) });
    report.push(`${e.name}: the author's (${e.pic.width}x${e.pic.height}; best block ${block ? `${(block.share * 100).toFixed(1)}% TEXTURE.${block.archive} r${block.record}` : 'none'})`);
  }

  const [sa, sr, sfr] = WAVE_SOURCE;
  const tf = new TextureFile();
  if (!tf.load(new Uint8Array(readFileSync(join(arena2, `TEXTURE.${String(sa).padStart(3, '0')}`))), `TEXTURE.${sa}`, palette)) throw new Error(`TEXTURE.${sa} did not load`);
  const snow = classicRecordRgba(tf.getDFBitmap(sr, sfr), palette);
  const waves = textures.filter((x) => x.record === 2).sort(byFrame);
  const bases = [];
  const frames = [];
  for (const e of waves) {
    let hit = null;
    for (let b = 0; b < bases.length && !hit; b++) {
      const scroll = verticalScroll(e.pic, bases[b].pic);
      if (scroll != null) hit = { base: b, scroll };
    }
    if (!hit) { bases.push({ name: `${e.name.replace(/-\d+$/, '')}-base${bases.length}`, pic: e.pic }); hit = { base: bases.length - 1, scroll: 0 }; }
    frames.push({ e, ...hit });
  }
  for (const base of bases) {
    base.tile = tilePhase(base.pic, snow);
    const d = deriveTiledPaint(base.pic, snow, base.tile, WAVE_KEY);
    base.paint = d.paint;
    const own = { width: d.paint.width, height: d.paint.height, data: new Uint8Array(d.paint.data) };
    for (let i = 0; i < own.data.length; i += 4) if (own.data[i] === 0xff && own.data[i + 1] === 0 && own.data[i + 2] === 0xff) own.data.fill(0, i, i + 4);
    const block = bestClassicBlock(own, records);
    if (isDerivedBlock(block)) throw new Error(`${base.name}: the paint still matches TEXTURE.${block.archive} record ${block.record} over ${(block.share * 100).toFixed(1)}% of a block`);
    const vis = d.fromRecord + d.own;
    report.push(`${base.name}: TEXTURE.${sa} record ${sr} tiled at ${base.tile} under ${d.fromRecord} of ${vis} opaque pixels (${(100 * d.fromRecord / vis).toFixed(1)}%), the author's ${d.own}; the paint's best block ${block ? `${(block.share * 100).toFixed(1)}% TEXTURE.${block.archive} r${block.record}` : 'none'}`);
  }
  const derived = {};
  for (const { e, base, scroll } of frames) {
    const b = bases[base];
    const spec = { from: sfr ? [sa, sr, sfr] : [sa, sr], size: [e.pic.width, e.pic.height], paint: `${b.name}.paint.png`, scroll, tile: [b.tile[0], (b.tile[1] + scroll) % snow.height], key: WAVE_KEY };
    const back = composeTiledPicture(spec, snow, b.paint);
    for (let i = 0; i < e.pic.width * e.pic.height; i++) {
      if (e.pic.data[i * 4 + 3] === 0 && back.data[i * 4 + 3] === 0) continue;
      for (let k = 0; k < 4; k++) if (back.data[i * 4 + k] !== e.pic.data[i * 4 + k]) throw new Error(`${e.name}: the rebuild differs at pixel ${i}`);
    }
    derived[e.name] = spec;
    report.push(`${e.name}: ${b.name} scrolled ${scroll} rows - rebuilt exact`);
    meta.push({ name: e.name, kind: 'derived', width: e.pic.width, height: e.pic.height, ...settings(e.tex) });
  }
  const shared = [...new Set(bases.flatMap((b) => pictureColours(b.paint)))].sort((x, y) => x - y);
  for (const b of bases) out[`Textures/${b.name}.paint.png`] = encodeIndexedPng(b.paint, shared);
  out['Textures/derived.json'] = `{\n${Object.entries(derived).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`;

  for (const e of textures.filter((x) => x.record === 3)) {
    report.push(`${e.name}: TRAV0I00.IMG's interior scaled (mean |RGB| ${travelMapDistance(e.pic, arena2).toFixed(1)} of 765) - Daggerfall's own, not carried`);
  }
  const unknown = textures.filter((x) => x.record > 3);
  if (unknown.length) throw new Error(`records the tool has not measured: ${unknown.map((x) => x.name).join(', ')}`);
  out['Textures/textures.json'] = `[\n${meta.map((m) => `  ${JSON.stringify(m)}`).join(',\n')}\n]\n`;
  const pictures = Object.keys(out).filter((p) => /^Textures\//.test(p)).map((p) => p.slice('Textures/'.length)).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  out['come-sail-away.files.json'] = `${JSON.stringify({
    ModTitle: 'Come Sail Away', ModVersion: '2.1', ModAuthor: 'RedRoryOTheGlen',
    Source: 'https://www.nexusmods.com/daggerfallunity/mods/1131',
    Bundle: 'Mods/come sail away.dfmod', BundleSha256: createHash('sha256').update(bundleBytes).digest('hex'),
    Note: 'Every file tools/comeSailAwayExtract.mjs writes under Textures/ - the pictures it carries out of the shipped bundle, by their vendored names, and the two indexes beside them: the author\'s own (archive 112395, records 0 and 1) and the waves\' two paints (record 2 - the author\'s pixels, the Daggerfall snow under the crests replaced by the key colour, rebuilt from the player\'s own TEXTURE.303). Generated by the tool, not written by hand - the authority test/tooling/doctrine.test.js reads for what may stand under vendor/come-sail-away/Textures/. The bundle\'s own manifest (come-sail-away.dfmod.json) names pictures the port does not carry: record 3 (Daggerfall\'s travel map), the 32 wave frames as the bundle holds them, and Unity\'s own.',
    Files: pictures,
  }, null, 2)}\n`;

  const setups = new Map();
  for (const f of readdirSync(join(ROOT, 'vendor/vorbis-fsb-setups')).filter((n) => /^setup_[0-9a-f]{8}\.bin$/.test(n))) {
    const b = new Uint8Array(readFileSync(join(ROOT, 'vendor/vorbis-fsb-setups', f)));
    const crc = zlib.crc32(b) >>> 0;
    if (f !== `setup_${crc.toString(16).padStart(8, '0')}.bin`) throw new Error(`${f} is not the header its name says (CRC32 ${crc.toString(16)})`);
    setups.set(crc, b);
  }
  const clips = [];
  for (const o of sf.objects) {
    if (o.classId !== CLASS_AUDIO_CLIP) continue;
    const c = o.read();
    if (!PLAYED_CLIPS.includes(c.m_Name)) { report.push(`${c.m_Name}: never played by the assembly, not carried`); continue; }
    const fsb = resource(c.m_Resource.m_Source, Number(c.m_Resource.m_Offset), Number(c.m_Resource.m_Size));
    const r = fsb5ToOgg(fsb, (crc) => setups.get(crc) ?? null);
    out[`Sounds/${c.m_Name}.ogg`] = r.ogg;
    clips.push({ name: c.m_Name, channels: r.channels, frequency: r.rate, samples: r.numSamples, length: Math.fround(c.m_Length), loadType: c.m_LoadType, setup: r.crc.toString(16).padStart(8, '0') });
    report.push(`${c.m_Name}: ${r.channels} ch ${r.rate} Hz, ${r.numSamples} samples, ${r.packets} packets, setup ${r.crc.toString(16)}`);
  }
  const missing = PLAYED_CLIPS.filter((n) => !clips.some((c) => c.name === n));
  if (missing.length) throw new Error(`the bundle lacks ${missing.join(', ')}`);
  clips.sort((a, b) => PLAYED_CLIPS.indexOf(a.name) - PLAYED_CLIPS.indexOf(b.name));
  out['Sounds/sounds.json'] = `[\n${clips.map((c) => `  ${JSON.stringify(c)}`).join(',\n')}\n]\n`;
  return { out, report };
}

const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? String(x) : x instanceof Uint8Array ? Buffer.from(x).toString('base64') : x)));

export function comeSailAwayModels(bundleBytes) {
  const scene = openScene(bundleBytes);
  const refs = assetRefs(scene);
  const cont = bundleContainer(scene);
  const report = [];
  const trees = {};
  for (const id of PREFABS) {
    const ptr = cont.get(`assets/game/mods/comesailaway/prefabs/${id}.prefab`);
    if (!ptr) throw new Error(`the bundle has no prefab ${id}`);
    trees[id] = prefabTree(scene, ptr, refs);
  }
  const components = [];
  const seen = new Map();
  const share = (n) => ({
    ...n,
    components: n.components.map((c) => {
      const k = JSON.stringify(c);
      if (!seen.has(k)) { seen.set(k, components.length); components.push(c); }
      return seen.get(k);
    }),
    children: n.children.map(share),
  });
  const prefabs = Object.fromEntries(Object.entries(trees).map(([id, t]) => [id, share(t)]));
  for (const name of NAMED_MATERIALS) {
    const ptr = cont.get(`assets/game/mods/comesailaway/material/${name.toLowerCase()}.mat`);
    if (!ptr) throw new Error(`the bundle has no material ${name}`);
    refs.ref(ptr);
  }
  const nodeCount = (n) => 1 + n.children.reduce((a, c) => a + nodeCount(c), 0);
  report.push(`prefabs: ${Object.values(trees).reduce((a, t) => a + nodeCount(t), 0)} nodes, ${seen.size} distinct components`);

  const clipKey = (pptr) => refs.ref(pptr)?.clip ?? null;
  const controllers = {};
  const overrides = {};
  for (let changed = true; changed;) {
    changed = false;
    for (const [k, t] of refs.used('controller')) {
      if (controllers[k] || overrides[k]) continue;
      changed = true;
      if (t.classId === UCLASS.AnimatorController) controllers[k] = decodeController(t.v, (i) => clipKey(t.v.m_AnimationClips[i]));
      else overrides[k] = { base: refs.ref(t.v.m_Controller)?.controller ?? null, clips: t.v.m_Clips.map((c) => [clipKey(c.m_OriginalClip), clipKey(c.m_OverrideClip)]) };
    }
  }
  const clips = {};
  for (const [k, t] of refs.used('clip')) clips[k] = decodeClip(t.v);
  const clipsOf = (ctlKey) => {
    const o = overrides[ctlKey];
    if (!o) return controllers[ctlKey].clips;
    const map = new Map(o.clips);
    return controllers[o.base].clips.map((c) => map.get(c) ?? c);
  };
  let checked = 0;
  const unresolved = new Set();
  const visit = (n, id) => {
    for (const ci of n.components) {
      const c = components[ci];
      if (c.type !== 'Animator' || !c.m_Controller?.controller) continue;
      const hashes = new Set();
      const add = (m, prefix) => { hashes.add(pathHash(prefix)); for (const ch of m.children) add(ch, prefix ? `${prefix}/${ch.name}` : ch.name); };
      add({ children: n.children }, '');
      for (const clip of clipsOf(c.m_Controller.controller)) {
        for (const cv of clips[clip].curves) { checked++; if (!hashes.has(cv.path)) unresolved.add(`${id}/${n.name}: ${clip} ${cv.path}`); }
      }
    }
    n.children.forEach((ch) => visit(ch, id));
  };
  for (const [id, t] of Object.entries(prefabs)) visit(t, id);
  report.push(`animation: ${Object.keys(controllers).length} controllers, ${Object.keys(overrides).length} overrides, ${Object.keys(clips).length} clips; ${checked} bindings checked, ${unresolved.size} unresolved`);
  if (unresolved.size) report.push(...[...unresolved].slice(0, 20).map((u) => `  unresolved: ${u}`));

  const materials = {};
  for (const [k, t] of refs.used('material')) {
    const m = t.v;
    const shader = scene.get(m.m_Shader)?.v?.m_ParsedForm?.m_Name ?? null;
    const sp = m.m_SavedProperties;
    const textures = {};
    for (const e of sp.m_TexEnvs) {
      const tex = refs.ref(e.second.m_Texture)?.texture ?? null;
      if (tex) textures[e.first] = { texture: tex, scale: [e.second.m_Scale.x, e.second.m_Scale.y], offset: [e.second.m_Offset.x, e.second.m_Offset.y] };
    }
    materials[k] = {
      shader, keywords: m.m_ShaderKeywords, renderQueue: m.m_CustomRenderQueue, textures,
      floats: Object.fromEntries(sp.m_Floats.map((e) => [e.first, e.second])),
      colors: Object.fromEntries(sp.m_Colors.map((e) => [e.first, [e.second.r, e.second.g, e.second.b, e.second.a]])),
    };
  }
  report.push(`materials: ${Object.keys(materials).length} (${[...new Set(Object.values(materials).map((m) => m.shader))].join(', ')}); pictures they name: ${[...refs.used('texture').keys()].join(', ') || 'none'}`);

  const parts = [];
  let size = 0;
  const put = (arr) => {
    const at = size;
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    parts.push(bytes);
    size += bytes.length;
    const pad = (4 - (size % 4)) % 4;
    if (pad) { parts.push(new Uint8Array(pad)); size += pad; }
    return at;
  };
  const meshes = {};
  let verts = 0, tris = 0;
  for (const [k, t] of [...refs.used('mesh')].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const d = decodeMesh(t.v, (path, offset, sz) => scene.resource(path, offset, sz));
    const attrs = {};
    for (const ch of MESH_WRITTEN) {
      const c = d.channels[ch];
      if (!c) continue;
      if (ch === 'blendIndices') {
        const b = new Uint16Array(d.vertexCount);
        for (let v = 0; v < d.vertexCount; v++) { const x = c.data[v * c.dim]; if (x > 0xffff) throw new Error(`${k}: bone index ${x}`); b[v] = x; }
        attrs[ch] = { offset: put(b), type: 'u16', dim: 1 };
      } else {
        attrs[ch] = { offset: put(Float32Array.from(c.data)), type: 'f32', dim: c.dim };
      }
    }
    const idx = d.indices;
    meshes[k] = {
      vertexCount: d.vertexCount, attributes: attrs,
      indices: { offset: put(idx), type: idx instanceof Uint32Array ? 'u32' : 'u16', count: idx.length },
      submeshes: d.submeshes.map(({ start, count, baseVertex }) => ({ start, count, baseVertex })),
      aabb: d.aabb,
      ...(d.bindPoses.length ? { bindPoses: d.bindPoses, boneNameHashes: d.boneNameHashes, rootBoneNameHash: d.rootBoneNameHash } : {}),
      notWritten: Object.keys(d.channels).filter((ch) => !MESH_WRITTEN.includes(ch)),
    };
    verts += d.vertexCount;
    tris += idx.length / 3;
  }
  const bin = new Uint8Array(size);
  let o = 0;
  for (const p of parts) { bin.set(p, o); o += p.length; }
  report.push(`meshes: ${Object.keys(meshes).length}, ${verts} vertices, ${tris} triangles, ${bin.length} bytes`);

  const json = (v) => `${JSON.stringify(plain(v))}\n`;
  return {
    out: {
      'Models/prefabs.json': json({ prefabs, components }),
      'Models/animation.json': json({ controllers, overrides, clips }),
      'Models/materials.json': json(materials),
      'Models/meshes.json': json(meshes),
      'Models/meshes.bin': bin,
    },
    report,
    unresolved: [...unresolved],
  };
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--arena2');
  const arena2 = at >= 0 ? args.splice(at, 2)[1] : process.env.ARENA2_PATH;
  const [bundlePath, outDir = join(ROOT, 'vendor/come-sail-away')] = args;
  if (!bundlePath || !arena2) {
    console.error('usage: node tools/comeSailAwayExtract.mjs "<come sail away.dfmod>" [outDir] --arena2 <ARENA2>');
    process.exit(2);
  }
  const bytes = new Uint8Array(readFileSync(bundlePath));
  const { out, report } = comeSailAwayAssets(bytes, arena2);
  const models = comeSailAwayModels(bytes);
  Object.assign(out, models.out);
  for (const line of [...report, ...models.report]) console.log(`  ${line}`);
  for (const [path, body] of Object.entries(out)) {
    const full = join(outDir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  console.log(`wrote ${Object.keys(out).length} files to ${outDir}`);
}
