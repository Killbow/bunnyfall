#!/usr/bin/env node
// Extracts Low Poly Trees geometry and atlas specs from the mod bundle (default out: vendor/low-poly-trees).
// No picture ships: each atlas is a spec of classic record blits and fills that the runtime paints from ARENA2.
// Run: node tools/lowPolyTreesExtract.mjs "<path>/lowpolytrees.dfmod" --arena2 <ARENA2> [outDir].
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openScene, bundleContainer, UCLASS, decodeMesh } from './lib/unityScene.mjs';
import { TextureFile } from '../src/formats/textureFile.js';
import { DFPalette } from '../src/formats/dfPalette.js';
import { classicRecordRgba } from '../src/formats/derivedTexture.js';
import { orientedSize, orientedSource, composeAtlas, fillPicture, LPT_FILL_CELL, LPT_ORIENTATIONS, LPT_ARCHIVES } from '../src/world/lowPolyTrees.js';
import { isMain } from './lib/isMain.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PATCH = 3, TOLERANCE = 6, MIN_BLIT = 40, FILL_MIN = 40, FILL_MIN_OPAQUE = 4, REACH = 2, USE_CELL = 8;

const hexOf = (cells) => {
  let hex = '';
  for (let i = 0; i < cells.length; i += 4) hex += ((cells[i] << 3) | ((cells[i + 1] ?? 0) << 2) | ((cells[i + 2] ?? 0) << 1) | (cells[i + 3] ?? 0)).toString(16);
  return hex;
};

export function textureRgba(scene, t) {
  const v = t.v;
  let data = v['image data'];
  if ((!data || !data.length) && v.m_StreamData?.size) data = scene.resource(v.m_StreamData.path, Number(v.m_StreamData.offset), Number(v.m_StreamData.size));
  const w = v.m_Width, h = v.m_Height;
  const bpp = v.m_TextureFormat === 4 ? 4 : v.m_TextureFormat === 3 ? 3 : 0;
  if (!bpp) throw new Error(`${v.m_Name}: texture format ${v.m_TextureFormat} (this tool reads RGBA32 and RGB24)`);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((h - 1 - y) * w + x) * bpp, d = (y * w + x) * 4;
      out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = bpp === 4 ? data[s + 3] : 255;
    }
  }
  return { width: w, height: h, data: out, alpha: bpp === 4 };
}

export function sourceRecords(arena2) {
  const palette = new DFPalette();
  palette.load(new Uint8Array(readFileSync(join(arena2, 'ART_PAL.COL'))));
  const recs = new Map();
  for (const a of LPT_ARCHIVES) {
    const name = `TEXTURE.${a}`;
    const path = [name, name.toLowerCase()].map((n) => join(arena2, n)).find((p) => existsSync(p));
    if (!path) throw new Error(`${name} is not in ${arena2}`);
    const t = new TextureFile();
    if (!t.load(new Uint8Array(readFileSync(path)), name, palette)) throw new Error(`${name} would not load`);
    for (let r = 0; r < t.recordCount; r++) {
      const frames = Math.max(1, t.getFrameCount(r));
      for (let f = 0; f < frames; f++) {
        const bm = t.getDFBitmap(r, f);
        if (bm?.width) recs.set(`${a}_${r}_${f}`, { a, r, f, rgba: classicRecordRgba(bm, palette) });
      }
    }
  }
  return recs;
}

const colour = (d, i) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
const near = (a, i, b, j) => Math.abs(a[i] - b[j]) + Math.abs(a[i + 1] - b[j + 1]) + Math.abs(a[i + 2] - b[j + 2]) <= TOLERANCE;

function orient(rgba, o) {
  const [ow, oh] = orientedSize(rgba.width, rgba.height, o);
  const d = new Uint8Array(ow * oh * 4);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const [sx, sy] = orientedSource(o, rgba.width, rgba.height, x, y);
    d.set(rgba.data.subarray((sy * rgba.width + sx) * 4, (sy * rgba.width + sx) * 4 + 4), (y * ow + x) * 4);
  }
  return { width: ow, height: oh, data: d };
}

const patchKey = (d, w, x, y) => {
  let h = 2166136261;
  for (let j = 0; j < PATCH; j++) for (let i = 0; i < PATCH; i++) h = Math.imul(h ^ colour(d, ((y + j) * w + x + i) * 4), 16777619);
  return h >>> 0;
};

/**
 * @param {{width:number,height:number,data:Uint8Array,alpha:boolean}} pic
 * @param {Map<string, {a:number,r:number,f:number,rgba:any}>} records
 * @param {{snow?: boolean}} [opts]
 */
export function atlasSpec(pic, records, { snow = false, uses = [] } = {}) {
  const W = pic.width, H = pic.height;
  // A texel is drawn when its alpha is set on an alpha picture, or when it is not black on an opaque one.
  const drawn = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) drawn[i] = pic.alpha ? (pic.data[i * 4 + 3] > 127 ? 1 : 0) : (pic.data[i * 4] + pic.data[i * 4 + 1] + pic.data[i * 4 + 2] > 6 ? 1 : 0);
  const srcs = [];
  for (const rec of records.values()) for (let o = 0; o < LPT_ORIENTATIONS; o++) srcs.push({ ...rec, o, img: orient(rec.rgba, o) });
  const index = new Map();
  srcs.forEach((src, si) => {
    const { img } = src;
    for (let y = 0; y + PATCH <= img.height; y++) {
      for (let x = 0; x + PATCH <= img.width; x++) {
        let full = true, uniform = true;
        const c0 = colour(img.data, (y * img.width + x) * 4);
        for (let j = 0; j < PATCH && full; j++) for (let i = 0; i < PATCH; i++) {
          const p = ((y + j) * img.width + x + i) * 4;
          if (!img.data[p + 3]) { full = false; break; }
          if (colour(img.data, p) !== c0) uniform = false;
        }
        if (!full || uniform) continue;
        const k = patchKey(img.data, img.width, x, y);
        let l = index.get(k);
        if (!l) index.set(k, (l = []));
        if (l.length < 24) l.push(si, x, y);
      }
    }
  });
  const votes = new Map();
  for (let y = 0; y + PATCH <= H; y += 2) for (let x = 0; x + PATCH <= W; x += 2) {
    if (!drawn[y * W + x]) continue;
    const l = index.get(patchKey(pic.data, W, x, y));
    if (!l) continue;
    for (let i = 0; i < l.length; i += 3) { const k = `${l[i]}|${x - l[i + 1]}|${y - l[i + 2]}`; votes.set(k, (votes.get(k) ?? 0) + 1); }
  }
  const cands = [...votes].filter(([, v]) => v >= 6).map(([k, v]) => { const [si, ox, oy] = k.split('|').map(Number); return { si, ox, oy, v }; })
    .sort((a, b) => b.v - a.v || a.si - b.si || a.oy - b.oy || a.ox - b.ox);
  const owner = new Int32Array(W * H).fill(-1);
  const blits = [];
  for (const c of cands) {
    const { img } = srcs[c.si];
    const px = [];
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const s4 = (y * img.width + x) * 4;
      if (!img.data[s4 + 3]) continue;
      const ax = c.ox + x, ay = c.oy + y;
      if (ax < 0 || ay < 0 || ax >= W || ay >= H) continue;
      const i = ay * W + ax;
      if (!drawn[i] || owner[i] >= 0 || !near(img.data, s4, pic.data, i * 4)) continue;
      px.push(i);
      x0 = Math.min(x0, ax); y0 = Math.min(y0, ay); x1 = Math.max(x1, ax); y1 = Math.max(y1, ay);
    }
    if (px.length < MIN_BLIT) continue;
    let under = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const sx = x - c.ox, sy = y - c.oy;
      if (sx >= 0 && sy >= 0 && sx < img.width && sy < img.height && img.data[(sy * img.width + sx) * 4 + 3]) under++;
    }
    for (const i of px) owner[i] = blits.length;
    blits.push({ ...c, n: px.length, clip: [x0, y0, x1 + 1, y1 + 1], clean: px.length / Math.max(1, under) });
  }
  const kept = blits.map(() => true);
  const keptIndex = new Int32Array(blits.length).fill(-1);
  const keptBlits = [];
  blits.forEach((b, bi) => {
    if (!kept[bi]) return;
    keptIndex[bi] = keptBlits.length;
    const { img } = srcs[b.si];
    const erase = [];
    for (let y = b.clip[1]; y < b.clip[3]; y++) {
      let gap = b.clip[0], cut = false;
      for (let x = b.clip[0]; x <= b.clip[2]; x++) {
        const i = y * W + x;
        if (x < b.clip[2] && owner[i] !== bi) {
          const sx = x - b.ox, sy = y - b.oy;
          if (sx >= 0 && sy >= 0 && sx < img.width && sy < img.height && img.data[(sy * img.width + sx) * 4 + 3] && !(owner[i] >= 0 && owner[i] < bi)) cut = true;
          continue;
        }
        if (cut) erase.push(y, gap, x);
        gap = x + 1; cut = false;
      }
    }
    const s0 = srcs[b.si];
    keptBlits.push([s0.a, s0.r, s0.f, s0.o, b.ox, b.oy, ...b.clip, ...(erase.length ? [erase] : [])]);
  });
  const claimedBy = (i) => owner[i] >= 0 && kept[owner[i]];
  const left = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) left[i] = drawn[i] && !claimedBy(i) ? 1 : 0;
  const group = new Int32Array(W * H).fill(-1);
  const groups = [];
  for (let i = 0; i < W * H; i++) {
    if (!left[i] || group[i] >= 0) continue;
    const g = { n: 0, x0: W, y0: H, x1: -1, y1: -1, id: groups.length };
    const stack = [i];
    group[i] = g.id;
    while (stack.length) {
      const j = stack.pop();
      const x = j % W, y = (j / W) | 0;
      g.n++; g.x0 = Math.min(g.x0, x); g.y0 = Math.min(g.y0, y); g.x1 = Math.max(g.x1, x); g.y1 = Math.max(g.y1, y);
      for (let dy = -REACH; dy <= REACH; dy++) for (let dx = -REACH; dx <= REACH; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const k = yy * W + xx;
        if (left[k] && group[k] < 0) { group[k] = g.id; stack.push(k); }
      }
    }
    groups.push(g);
  }
  const fills = [];
  let fillErr = 0, fillTexels = 0;
  for (const g of groups) {
    if (g.n < (pic.alpha ? FILL_MIN : FILL_MIN_OPAQUE)) continue;
    const gw = g.x1 - g.x0 + 1, gh = g.y1 - g.y0 + 1;
    const cols = Math.ceil(gw / LPT_FILL_CELL), rows = Math.ceil(gh / LPT_FILL_CELL);
    const cellOn = new Uint8Array(cols * rows);
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      let n = 0, all = 0;
      for (let y = cy * LPT_FILL_CELL; y < Math.min(gh, (cy + 1) * LPT_FILL_CELL); y++) for (let x = cx * LPT_FILL_CELL; x < Math.min(gw, (cx + 1) * LPT_FILL_CELL); x++) {
        all++;
        if (group[(g.y0 + y) * W + g.x0 + x] === g.id) n++;
      }
      cellOn[cy * cols + cx] = n >= 0.25 * all ? 1 : 0;
    }
    const hex = hexOf(cellOn);
    const outside = g.n;
    const tally = new Map();
    const pad = 8;
    blits.forEach((b) => {
      const ix = Math.max(0, Math.min(b.clip[2], g.x1 + 1 + pad) - Math.max(b.clip[0], g.x0 - pad));
      const iy = Math.max(0, Math.min(b.clip[3], g.y1 + 1 + pad) - Math.max(b.clip[1], g.y0 - pad));
      if (!ix || !iy) return;
      const s0 = srcs[b.si], k = `${s0.a}_${s0.r}`;
      tally.set(k, (tally.get(k) ?? 0) + Math.min(b.n, ix * iy));
    });
    const tops = [...tally].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
    const mine = new Map();
    for (const u of uses) {
      let n = 0;
      for (let y = Math.floor(g.y0 / USE_CELL); y <= Math.floor(g.y1 / USE_CELL); y++) for (let x = Math.floor(g.x0 / USE_CELL); x <= Math.floor(g.x1 / USE_CELL); x++) if (u.cells.has(y * 4096 + x)) n++;
      if (n) mine.set(u.key, (mine.get(u.key) ?? 0) + n);
    }
    for (const [k] of [...mine].sort((a, b) => b[1] - a[1]).slice(0, 4).reverse()) if (records.has(`${k}_0`) && !tops.includes(k)) tops.unshift(k);
    if (!tops.length) {
      let nearest = null;
      blits.forEach((b) => {
        const dx = Math.max(0, b.clip[0] - g.x1, g.x0 - b.clip[2]), dy = Math.max(0, b.clip[1] - g.y1, g.y0 - b.clip[3]);
        const d = dx * dx + dy * dy;
        if (!nearest || d < nearest.d) nearest = { d, k: `${srcs[b.si].a}_${srcs[b.si].r}` };
      });
      if (nearest) tops.push(nearest.k);
    }
    if (snow) for (const k of [...tops]) { const [a, r] = k.split('_').map(Number); if (!(a & 1) && records.has(`${a + 1}_${r}_0`) && !tops.includes(`${a + 1}_${r}`)) tops.push(`${a + 1}_${r}`); }
    if (!tops.length) continue;
    let mr = 0, mg = 0, mb = 0;
    for (let y = g.y0; y <= g.y1; y++) for (let x = g.x0; x <= g.x1; x++) {
      const i = y * W + x;
      if (group[i] !== g.id) continue;
      mr += pic.data[i * 4]; mg += pic.data[i * 4 + 1]; mb += pic.data[i * 4 + 2];
    }
    mr /= g.n; mg /= g.n; mb /= g.n;
    const score = (fillPic) => {
      let err = 0;
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
        const i = (g.y0 + y) * W + g.x0 + x;
        if (group[i] !== g.id) continue;
        const s4 = (y * gw + x) * 4;
        err += fillPic.data[s4 + 3] ? Math.abs(fillPic.data[s4] - pic.data[i * 4]) + Math.abs(fillPic.data[s4 + 1] - pic.data[i * 4 + 1]) + Math.abs(fillPic.data[s4 + 2] - pic.data[i * 4 + 2]) : 765;
      }
      return err / outside;
    };
    let best = null;
    for (const k of tops) {
      const [a, r] = k.split('_').map(Number);
      const src = records.get(`${a}_${r}_0`)?.rgba;
      if (!src) continue;
      for (const sn of snow ? [0, 1] : [0]) {
        const f = ['top', a, r, g.x0, g.y0, gw, gh, sn, hex];
        const e = score(fillPicture(f, src));
        if (!best || e < best.e) best = { f, e };
      }
      for (const mir of [0, 1]) {
        const f = ['fit', a, r, g.x0, g.y0, gw, gh, mir, hex];
        const e = score(fillPicture(f, src));
        if (!best || e < best.e) best = { f, e };
      }
      const cw = Math.min(gw, src.width), ch = Math.min(gh, src.height);
      const sat = new Float64Array((src.width + 1) * (src.height + 1) * 4);
      const at = (x, y, c) => sat[((y * (src.width + 1)) + x) * 4 + c];
      for (let y = 1; y <= src.height; y++) for (let x = 1; x <= src.width; x++) {
        const s4 = ((y - 1) * src.width + x - 1) * 4, o = src.data[s4 + 3] ? 1 : 0;
        const vals = [src.data[s4] * o, src.data[s4 + 1] * o, src.data[s4 + 2] * o, o];
        for (let c = 0; c < 4; c++) sat[((y * (src.width + 1)) + x) * 4 + c] = vals[c] + at(x - 1, y, c) + at(x, y - 1, c) - at(x - 1, y - 1, c);
      }
      let crop = null;
      for (let cy = 0; cy + ch <= src.height; cy += 2) for (let cx = 0; cx + cw <= src.width; cx += 2) {
        const sum = (c) => at(cx + cw, cy + ch, c) - at(cx, cy + ch, c) - at(cx + cw, cy, c) + at(cx, cy, c);
        const n = sum(3);
        if (n < 0.6 * cw * ch) continue;
        const d = Math.abs(sum(0) / n - mr) + Math.abs(sum(1) / n - mg) + Math.abs(sum(2) / n - mb) + (1 - n / (cw * ch)) * 120;
        if (!crop || d < crop.d) crop = { cx, cy, d };
      }
      if (crop) {
        const f = ['tile', a, r, g.x0, g.y0, gw, gh, crop.cx, crop.cy, cw, ch, hex];
        const e = score(fillPicture(f, src));
        if (!best || e < best.e) best = { f, e };
      }
    }
    if (!best) continue;
    if (!pic.alpha) {
      // An opaque card samples black wherever nothing is painted, so a cell is painted only when it brings back
      // more of the author's color than black.
      const fp = fillPicture(best.f, records.get(`${best.f[1]}_${best.f[2]}_0`).rgba);
      const on = new Uint8Array(cols * rows);
      for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
        let gain = 0, loss = 0;
        for (let y = cy * LPT_FILL_CELL; y < Math.min(gh, (cy + 1) * LPT_FILL_CELL); y++) for (let x = cx * LPT_FILL_CELL; x < Math.min(gw, (cx + 1) * LPT_FILL_CELL); x++) {
          const i = (g.y0 + y) * W + g.x0 + x;
          if (!fp.data[(y * gw + x) * 4 + 3] || claimedBy(i)) continue;
          if (drawn[i]) gain++; else loss++;
        }
        on[cy * cols + cx] = gain > loss ? 1 : 0;
      }
      best.f[best.f[0] === 'tile' ? 11 : 8] = hexOf(on);
    }
    fills.push(best.f);
    fillErr += best.e * outside; fillTexels += outside;
  }
  let drawnCount = 0, claimed = 0;
  for (let i = 0; i < W * H; i++) { if (drawn[i]) drawnCount++; if (drawn[i] && claimedBy(i)) claimed++; }
  return {
    size: [W, H], blits: keptBlits, fills,
    stats: { drawn: drawnCount, claimed, filled: fillTexels, fillError: fillTexels ? fillErr / fillTexels : 0, kept: keptBlits.length, fills: fills.length, tops: fills.filter((f) => f[0] === 'top').length, fits: fills.filter((f) => f[0] === 'fit').length },
  };
}

export function verifySpec(spec, pic, records, eraseBytes = null) {
  const back = composeAtlas({ size: spec.size, blits: spec.blits }, (a, r, f) => records.get(`${a}_${r}_${f}`)?.rgba ?? null, eraseBytes);
  let painted = 0, exact = 0;
  for (let i = 0; i < spec.size[0] * spec.size[1]; i++) {
    if (!back.data[i * 4 + 3]) continue;
    painted++;
    if (near(back.data, i * 4, pic.data, i * 4)) exact++;
  }
  return { painted, exact };
}

export function packErase(erase, clipX0, clipY0) {
  const out = [];
  const put = (v) => { do { let b = v & 0x7f; v = Math.floor(v / 128); if (v) b |= 0x80; out.push(b); } while (v); };
  let y = clipY0;
  for (let i = 0; i < erase.length; i += 3) {
    if (erase[i] < y || erase[i + 1] < clipX0 || erase[i + 2] <= erase[i + 1]) throw new Error('packErase: spans out of order');
    put(erase[i] - y); put(erase[i + 1] - clipX0); put(erase[i + 2] - erase[i + 1]);
    y = erase[i];
  }
  return out;
}

export function readBundle(bytes) {
  const scene = openScene(bytes);
  const container = bundleContainer(scene);
  const manifestPath = [...container.keys()].find((k) => k.endsWith('.dfmod.json'));
  const manifest = Buffer.from(scene.get(container.get(manifestPath)).v.m_Script);
  const meshes = [], meshIndex = new Map();
  const materials = {}, materialKey = new Map();
  const textures = {}, textureKey = new Map();
  const unique = (base, taken) => { let k = base, n = 1; while (k in taken) k = `${base}#${++n}`; return k; };
  const textureOf = (ptr) => {
    const t = scene.get(ptr);
    if (!t) return null;
    if (!textureKey.has(t.pathId)) { const k = unique(t.v.m_Name, textures); textureKey.set(t.pathId, k); textures[k] = t; }
    return textureKey.get(t.pathId);
  };
  const materialOf = (ptr) => {
    const m = scene.get(ptr);
    if (!materialKey.has(m.pathId)) {
      const env = (m.v.m_SavedProperties?.m_TexEnvs ?? []).find((e) => e.first === '_MainTex');
      const tex = env ? textureOf(env.second.m_Texture) : null;
      const floats = m.v.m_SavedProperties?.m_Floats ?? [];
      const float = (n) => floats.find((f) => f.first === n)?.second;
      const cut = float('_Cutoff') ?? 0.5;
      const shader = scene.get(m.v.m_Shader)?.v?.m_ParsedForm?.m_Name ?? '';
      const cull = shader === 'Standard' ? 2 : (shader === 'Nature/SpeedTree8' ? float('_TwoSided') : float('_Cull')) ?? 2;
      const c = (m.v.m_SavedProperties?.m_Colors ?? []).find((e) => e.first === '_Color')?.second;
      const color = c && (c.r !== 1 || c.g !== 1 || c.b !== 1) ? [c.r, c.g, c.b].map((v) => Math.round(v * 1000) / 1000) : undefined;
      const k = unique(m.v.m_Name, materials);
      materialKey.set(m.pathId, k);
      materials[k] = { tex, cutoff: Math.round(cut * 1000) / 1000, cull, ...(color ? { color } : {}) };
    }
    return materialKey.get(m.pathId);
  };
  const prefabs = {};
  for (const [path, ptr] of container) {
    if (!path.endsWith('.prefab')) continue;
    const go = scene.get(ptr);
    const comps = go.v.m_Component.map((c) => scene.get(c.component));
    const tr = comps.find((c) => c.classId === UCLASS.Transform).v;
    const mf = comps.find((c) => c.classId === UCLASS.MeshFilter).v;
    const mr = comps.find((c) => c.classId === UCLASS.MeshRenderer).v;
    if (tr.m_Children.length) throw new Error(`${go.v.m_Name}: a prefab with children (this tool reads one mesh a prefab)`);
    const q = tr.m_LocalRotation;
    if (Math.abs(q.x) > 1e-6 || Math.abs(q.y) > 1e-6 || Math.abs(q.z) > 1e-6) throw new Error(`${go.v.m_Name}: a turned root (${JSON.stringify(q)})`);
    const meshObj = scene.get(mf.m_Mesh);
    if (!meshIndex.has(meshObj.pathId)) {
      const m = decodeMesh(meshObj.v, scene.resource);
      meshIndex.set(meshObj.pathId, meshes.length);
      meshes.push(m);
    }
    const name = go.v.m_Name;
    if (!/^5(0\d|1[01])_\d+$/.test(name)) throw new Error(`${name}: not an ARCHIVE_RECORD flat replacement`);
    const s = tr.m_LocalScale;
    prefabs[name] = { mesh: meshIndex.get(meshObj.pathId), scale: [s.x, s.y, s.z].map((v) => Math.round(v * 1e6) / 1e6), materials: mr.m_Materials.map(materialOf) };
  }
  return { scene, manifest, meshes, materials, textures, prefabs };
}

export function packMeshes(meshes) {
  let vCount = 0, iCount = 0;
  for (const m of meshes) { vCount += m.vertexCount; iCount += m.submeshes.reduce((a, s) => a + s.count, 0); }
  const vBytes = vCount * 32, iBytes = iCount * 2;
  const bin = new Uint8Array(vBytes + iBytes + (iBytes % 4 ? 2 : 0));
  const f32 = new Float32Array(bin.buffer, 0, vCount * 8);
  const u16 = new Uint16Array(bin.buffer, vBytes, iCount);
  const index = [];
  let v = 0, i = 0;
  for (const m of meshes) {
    const pos = m.channels.position.data, nor = m.channels.normal?.data, uv = m.channels.uv0?.data;
    if (!nor || !uv) throw new Error(`${m.name}: a mesh without normals or uv0`);
    if (m.vertexCount > 65535) throw new Error(`${m.name}: ${m.vertexCount} vertices - past a 16-bit index`);
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < m.vertexCount; k++) {
      f32.set([pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2], nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2], uv[k * 2], uv[k * 2 + 1]], (v + k) * 8);
      for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], pos[k * 3 + c]); max[c] = Math.max(max[c], pos[k * 3 + c]); }
    }
    const subs = [];
    let at = i;
    for (const s of m.submeshes) {
      for (let k = 0; k < s.count; k++) u16[i + k] = m.indices[s.start + k] + s.baseVertex;
      subs.push([i - at, s.count]);
      i += s.count;
    }
    const r6 = (x) => Math.round(x * 1e6) / 1e6;
    index.push({ name: m.name, vertex: v, vertices: m.vertexCount, index: at, subs, min: min.map(r6), max: max.map(r6) });
    v += m.vertexCount;
  }
  return { bin, index, vertexBytes: vBytes };
}

function usesOfAll(meshes, materials, prefabs) {
  const out = new Map();
  for (const [key, pf] of Object.entries(prefabs)) {
    const m = meshes[pf.mesh];
    const uv = m.channels.uv0?.data;
    if (!uv) continue;
    m.submeshes.forEach((sm, si) => {
      const tex = materials[pf.materials[Math.min(si, pf.materials.length - 1)]]?.tex;
      if (!tex) return;
      if (!out.has(tex)) out.set(tex, new Map());
      const byKey = out.get(tex);
      if (!byKey.has(key)) byKey.set(key, []);
      const tris = byKey.get(key);
      for (let t = 0; t < sm.count; t += 3) {
        const v = [0, 1, 2].map((k) => m.indices[sm.start + t + k] + sm.baseVertex);
        tris.push(v.map((i) => [uv[i * 2], uv[i * 2 + 1]]));
      }
    });
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const ai = args.indexOf('--arena2');
  const arena2 = ai >= 0 ? args.splice(ai, 2)[1] : process.env.ARENA2_PATH;
  const [bundlePath, outDir = join(ROOT, 'vendor/low-poly-trees')] = args;
  if (!bundlePath || !arena2) { console.error('usage: node tools/lowPolyTreesExtract.mjs <lowpolytrees.dfmod> --arena2 <ARENA2> [outDir]'); process.exit(2); }
  const { scene, manifest, meshes, materials, textures, prefabs } = readBundle(new Uint8Array(readFileSync(bundlePath)));
  const records = sourceRecords(arena2);
  const atlases = {}, pics = {};
  const allUses = usesOfAll(meshes, materials, prefabs);
  const usesOf = (name, pic) => [...(allUses.get(name) ?? new Map())].map(([key, tris]) => {
    const cells = new Set();
    for (const tri of tris) {
      const xs = tri.map(([u]) => (u - Math.floor(Math.min(...tri.map((q) => q[0])))) * pic.width);
      const ys = tri.map(([, v]) => (1 - (v - Math.floor(Math.min(...tri.map((q) => q[1]))))) * pic.height);
      for (let y = Math.floor(Math.max(0, Math.min(...ys)) / USE_CELL); y <= Math.floor(Math.min(pic.height - 1, Math.max(...ys)) / USE_CELL); y++) {
        for (let x = Math.floor(Math.max(0, Math.min(...xs)) / USE_CELL); x <= Math.floor(Math.min(pic.width - 1, Math.max(...xs)) / USE_CELL); x++) cells.add(y * 4096 + x);
      }
    }
    return { key, cells };
  });
  for (const [name, t] of Object.entries(textures)) {
    const pic = textureRgba(scene, t);
    pics[name] = pic;
    const spec = atlasSpec(pic, records, { snow: /^5(05|07|09|11)/.test(name), uses: usesOf(name, pic) });
    const check = verifySpec(spec, pic, records);
    if (check.exact !== check.painted) throw new Error(`${name}: ${check.painted - check.exact} of ${check.painted} painted texels do not come back`);
    if (check.painted !== spec.stats.claimed) throw new Error(`${name}: the copies claim ${spec.stats.claimed} texels and paint ${check.painted}`);
    const { stats } = spec;
    console.log(`${name.padEnd(22)} ${pic.width}x${pic.height}  copied ${(100 * stats.claimed / stats.drawn).toFixed(1)}% of ${stats.drawn} (${stats.kept} blits, every texel back exact), filled ${(100 * stats.filled / stats.drawn).toFixed(1)}% (${stats.fills} fills: ${stats.tops} crowns, ${stats.fits} fitted; mean error ${stats.fillError.toFixed(0)}/765)`);
    atlases[name] = { size: spec.size, alpha: pic.alpha, blits: spec.blits, fills: spec.fills };
  }
  const eraseBytes = [];
  const seen = new Map();
  for (const [name, a] of Object.entries(atlases)) {
    const key = JSON.stringify([a.size, a.blits, a.fills]);
    if (seen.has(key)) { atlases[name] = { same: seen.get(key), alpha: a.alpha }; continue; }
    seen.set(key, name);
    a.blits = a.blits.map((b) => {
      if (!b[10]) return b;
      const at = eraseBytes.length;
      eraseBytes.push(...packErase(b[10], b[6], b[7]));
      return [...b.slice(0, 10), at, b[10].length / 3];
    });
  }
  const packed = Uint8Array.from(eraseBytes);
  for (const [name, a] of Object.entries(atlases)) {
    if (a.same) continue;
    const check = verifySpec(a, pics[name], records, packed);
    if (check.exact !== check.painted) throw new Error(`${name}: packed, ${check.painted - check.exact} painted texels do not come back`);
  }
  const { bin, index, vertexBytes } = packMeshes(meshes);
  mkdirSync(join(outDir, 'Trees'), { recursive: true });
  writeFileSync(join(outDir, 'lowpolytrees.dfmod.json'), manifest);
  writeFileSync(join(outDir, 'Trees/trees.bin'), bin);
  writeFileSync(join(outDir, 'Trees/atlases.bin'), Uint8Array.from(eraseBytes));
  const sorted = Object.fromEntries(Object.entries(prefabs).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })));
  const json = { version: 1, vertexBytes, meshes: index, materials, atlases, prefabs: sorted };
  writeFileSync(join(outDir, 'Trees/trees.json'), `${JSON.stringify(json)}\n`);
  console.log(`${Object.keys(sorted).length} prefabs, ${index.length} meshes, ${Object.keys(materials).length} materials, ${Object.keys(atlases).length} atlases (${seen.size} distinct); trees.bin ${bin.length} bytes, atlases.bin ${eraseBytes.length} bytes`);
}

if (isMain(import.meta.url)) main();
